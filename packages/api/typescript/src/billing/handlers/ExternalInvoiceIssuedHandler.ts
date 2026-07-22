import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { BILLING_MESSAGES } from '@billing/i18n'
import { ExternalInvoiceIssuedEvent } from '@billing/events/ExternalInvoiceIssuedEvent'
import { InvoicePaymentFailedEvent } from '@billing/events/InvoicePaymentFailedEvent'
import { InvoiceService, SubscriptionCharger, ChargeSettler } from '@billing/services'
import type { InvoiceLine } from '@billing/objects'
import { InvoiceLineKind } from '@billing/enums/InvoiceLineKind'
import { PaymentMethodRepository, SubscriptionRepository, BillingProfileRepository } from '@billing/repositories'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

@injectable()
export class ExternalInvoiceIssuedHandler extends EventHandler<typeof ExternalInvoiceIssuedEvent> {
	readonly event = ExternalInvoiceIssuedEvent

	constructor(
		private paymentMethodRepository: PaymentMethodRepository,
		private subscriptionRepository: SubscriptionRepository,
		private invoiceService: InvoiceService,
		private idempotencyGuard: IdempotencyGuard,
		private billingProfiles: BillingProfileRepository,
		private charger: SubscriptionCharger,
		private chargeSettler: ChargeSettler,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.payload.ownerId
		const {
			engineInvoiceId,
			amountCents,
			number,
			dueDate,
			periodStart,
			periodEnd,
			overageCents,
			overageQty,
			attemptNo,
			upgradedFromPlan,
			upgradedToPlan,
		} = event.payload

		// The renewal charge is the plan base PLUS any metered overage priced at period close
		// (Phase E). The saga charges this total; a base-only (non-overage) invoice keeps totalCents
		// === amountCents, so the existing paths are unchanged.
		const totalCents = amountCents + overageCents

		// PDFs are deferred in v1 — the native engine issues no PDF, so the record always stores
		// pdfUrl: null (the invoice column stays nullable).
		const pdfUrl = null

		// Phase 1: issue OUR invoice + (if eligible) claim the one-charge-per-attempt slot and
		// resolve the payment method to charge — all local, committed BEFORE any external call.
		const chargePlan = await this.withTransaction(undefined, async (tx: Transaction) => {
			// Resolve the subscription first: it drives BOTH the invoice's plan/currency (issue reads
			// planName → PlanRegistry currency) AND the charge branch below. If none exists yet, issue
			// falls back to BRL.
			const subscription = await this.subscriptionRepository.findByOwnerId(ownerId, tx)
			const planName = subscription?.planName ?? null
			// Stored line descriptions are the presentation FALLBACK (the app translates from the
			// structured kind/meter/planName) — still, freeze them in the owner's language at issue
			// time so provider/PDF surfaces that only see the string read naturally.
			const owner = await this.billingProfiles.findByOwnerId(ownerId, tx)
			const description = planName
				? BILLING_MESSAGES.subscriptionLineTitle(owner?.language, { planName })
				: BILLING_MESSAGES.invoiceFallbackTitle(owner?.language, { invoiceId: engineInvoiceId })

			// `baseCents` is the SUBSCRIPTION line (plan base). When the period closed with metered
			// overage (Phase E), a second OVERAGE line is added and the invoice total becomes
			// base + overage; with no overage this is exactly the prior one-line SUBSCRIPTION invoice.
			const issue = (baseCents: number) => {
				// An optimistic-upgrade proration is its own (purely descriptive) line kind; the
				// revert marker travels event→event, never into the ledger row.
				const lines: InvoiceLine[] = upgradedFromPlan
					? [
							{
								kind: InvoiceLineKind.PRORATION,
								description: BILLING_MESSAGES.upgradeLineTitle(owner?.language, { planName: planName ?? upgradedFromPlan }),
								amountCents: baseCents,
							},
						]
					: [{ kind: InvoiceLineKind.SUBSCRIPTION, description, amountCents: baseCents }]
				if (overageCents > 0) {
					lines.push({
						kind: InvoiceLineKind.OVERAGE,
						description: BILLING_MESSAGES.overageLineDescription(owner?.language),
						// Placeholder meter — the real per-product QuotaKey arrives with @quota (deferred).
						// This branch is dead until the usage pipeline sets overageCents > 0.
						meter: QuotaKey.EXAMPLE_KEY,
						quantity: overageQty,
						amountCents: overageCents,
						periodStart: periodStart ? new Date(periodStart) : undefined,
						periodEnd: periodEnd ? new Date(periodEnd) : undefined,
					})
				}
				return this.invoiceService.issue(
					{
						correlationId: engineInvoiceId,
						ownerId,
						amountCents: baseCents + overageCents,
						currency: CurrencyCode.BRL, // fallback only — issue prefers the plan's currency
						dueDate: dueDate ? new Date(dueDate) : null,
						planName,
						description,
						lines,
						number,
						pdfUrl,
						periodStart: periodStart ? new Date(periodStart) : null,
						periodEnd: periodEnd ? new Date(periodEnd) : null,
					},
					tx,
				)
			}

			// A zero-TOTAL invoice has nothing to charge — the engine auto-marks it paid (pay-in-advance
			// termination close-outs and fully-prorated/credited lines both come through as R$0). We
			// still issue OUR ledger row so it appears in the invoice list (a 0-cent charge is invalid
			// at the gateway, so there is no charge). Gate on totalCents, not the base alone: a
			// zero-base invoice CARRYING overage has real money to collect below.
			if (totalCents === 0) {
				await issue(0)
				return null
			}

			// Always issue the invoice first — the payment-history listing
			// must reflect it whether or not a renewal charge is attempted below.
			await issue(amountCents)

			// Vault-first: the FIRST real invoice is charged here as a CIT on the stored credential
			// (recurrence_cycle 'first') — the user's subscribe click was the customer initiation, and
			// CreateSubscription guaranteed a default card. This covers both a non-trial subscribe
			// (INCOMPLETE, invoice at subscribe time) AND a trial converting at its end (TRIALING —
			// the native BillingClock issues the first invoice at trialEnd; the successful CIT charge
			// settles it and the settlement handler flips the sub to ACTIVE). PAST_DUE is excluded (a
			// dunning state, not a first charge).
			if (subscription?.awaitsFirstCharge()) {
				// Strictly the wallet default (what CreateSubscription's PAYMENT_METHOD_REQUIRED guard
				// checked). If it vanished in the tiny window since subscribing (card removed before the
				// invoice arrived), skip silently — no NO_PAYMENT_METHOD failed event.
				// Checkout-first: no stored default means the FIRST invoice is being collected inside a
				// hosted checkout session (CreateSubscription minted it) — skip silently; settlement
				// arrives via checkout.session.completed. The manual pay-invoice fallback also still
				// settles it.
				const paymentMethod = await this.paymentMethodRepository.findDefaultByOwnerId(ownerId, tx)
				if (!paymentMethod) return null

				// One charge per (invoiceId, attemptNo) — same scope as the renewal claim below.
				const claimed = await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_CHARGE, `${engineInvoiceId}:${attemptNo}`, tx)
				if (!claimed) return null

				return { paymentMethod, cycle: 'first' as const }
			}

			// A renewal MIT charge only applies once the owner already has an ACTIVE
			// subscription (implying a vaulted, off-session-capable card).
			if (!subscription?.isActive()) return null

			// One MIT charge per (invoiceId, attemptNo).
			const claimed = await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_CHARGE, `${engineInvoiceId}:${attemptNo}`, tx)
			if (!claimed) return null

			// The wallet's default is what renewals charge; newest ACTIVE is the defensive fallback
			// (vault + setDefault guarantee a default exists in practice).
			const paymentMethod =
				(await this.paymentMethodRepository.findDefaultByOwnerId(ownerId, tx)) ??
				(await this.paymentMethodRepository.findActiveByOwnerId(ownerId, tx))
			if (!paymentMethod) {
				// A renewal with no default payment method emits InvoicePaymentFailedEvent but records
				// NO FAILED Charge (the charger is never reached) — so dunning never triggers
				// (DunningLifecycle sees 0 FAILED → no DunningStarted email; listDunningCandidates
				// never picks it up). Record the FIRST failure here (attemptNo 0) so the owner is
				// dunned to add a card. This branch already holds the INVOICE_CHARGE:${invoice}:0 claim
				// (reserved above to gate the renewal charge), so `ChargeSettler.failCharge` records into
				// that slot directly (slotAlreadyClaimed). Upgrade prorations are excluded (Decision 8).
				const isUpgrade = Boolean(upgradedFromPlan || upgradedToPlan)
				const recordedFailure = await this.chargeSettler.failCharge(
					{
						ownerId,
						engineInvoiceId,
						amountCents: totalCents,
						// NO_PAYMENT_METHOD carries no acquirer decline code — generic dunning copy.
						isUpgrade,
						slotAlreadyClaimed: true,
					},
					tx,
				)
				// Same consistency rule as the webhook path: emit when a FAILED fact was actually
				// recorded (recordedFailure — genuine no-card renewal, drives markPastDue + dunning) OR
				// this is the optimistic-upgrade pair (isUpgrade — Decision 8 requires the revert to run
				// even though `ChargeSettler.failCharge` short-circuited to false for it).
				if (recordedFailure || isUpgrade) {
					await this.domainEventRepository.save(
						new InvoicePaymentFailedEvent({
							entityId: engineInvoiceId,
							ownerId,
							// FORWARD the optimistic-upgrade pair (exactly as the synchronous charge path does)
							// so InvoicePaymentFailedHandler.revertOptimisticUpgrade runs: an un-payable upgrade
							// is reverted to the prior plan and its proration invoice voided (Decision 8 — a
							// declined upgrade is reverted, never dunned, never left PAST_DUE). Without the pair
							// the handler would fall through to markPastDue, stranding the owner on the upgraded
							// plan with an unpaid proration and no notification.
							payload: {
								ownerId,
								invoiceId: engineInvoiceId,
								reason: 'NO_PAYMENT_METHOD',
								upgradedFromPlan,
								upgradedToPlan,
							},
						}),
						tx,
					)
				}
				return null
			}

			return { paymentMethod, cycle: 'subsequent' as const }
		})
		if (!chargePlan) return

		// Charge the full invoice total (plan base + any period-close overage), matching the issued
		// ledger row's amountCents — the gateway idempotency key stays engineInvoiceId. The claim
		// above already reserved this (invoiceId, attemptNo) slot; SubscriptionCharger owns the
		// provider call + Charge ledger + InvoicePaymentFailedEvent on a synchronous decline (shared
		// with the DunningRetryJob's re-tries).
		await this.charger.charge({
			ownerId,
			engineInvoiceId,
			amountCents: totalCents,
			attemptNo,
			paymentMethod: chargePlan.paymentMethod,
			cycle: chargePlan.cycle,
			upgrade: upgradedFromPlan && upgradedToPlan ? { fromPlan: upgradedFromPlan, toPlan: upgradedToPlan } : undefined,
		})
	}
}
