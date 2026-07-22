import crypto from 'node:crypto'
import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { Config } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { injectable } from 'tsyringe-neo'
import { BillingClock, SubscriptionAccessDeriver, CheckoutSessionRecorder } from '@billing/services'

import { PlanRegistry } from '@billing/objects'
import { BILLING_MESSAGES } from '@billing/i18n'
import { Subscription } from '@billing/entities'
import {
	PaymentMethodRepository,
	SubscriptionRepository,
	InvoiceRepository,
	ChargeRepository,
	BillingProfileRepository,
} from '@billing/repositories'
import { PaymentProviderFactory } from '@billing/services'
import { SubscriptionCreatedEvent } from '@billing/events'
import { ExternalInvoiceIssuedEvent } from '@billing/events/ExternalInvoiceIssuedEvent'
import type { DomainErrors, ApplicationErrors } from '@billing/errors'
import { CheckoutIntent, PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

export const CreateSubscriptionInputSchema = z.object({
	ownerId: z.string().min(1),
	planName: z.enum(PlanName),
	consentAccepted: z.boolean(),
})

export const CreateSubscriptionOutputSchema = z.object({
	subscriptionId: z.string(),
	// The FIRST invoice minted by this subscribe (absent on trials — the clock issues it at trial
	// end). The app tracks exactly this invoice to PAID during activation — no list-diffing.
	engineInvoiceId: z.string().optional(),
	// Present when the owner has no vaulted default: the hosted-checkout URL that pays the FIRST
	// invoice and vaults the card in the same session. Minted on-demand, never persisted.
	checkoutUrl: z.string().optional(),
})

@injectable()
export class CreateSubscription extends Handler<typeof CreateSubscriptionInputSchema, typeof CreateSubscriptionOutputSchema> {
	readonly name = 'create_subscription' as const
	readonly inputSchema = CreateSubscriptionInputSchema
	readonly outputSchema = CreateSubscriptionOutputSchema

	constructor(
		private subscriptionRepository: SubscriptionRepository,
		private paymentMethodRepository: PaymentMethodRepository,
		private invoiceRepository: InvoiceRepository,
		private chargeRepository: ChargeRepository,
		private providerFactory: PaymentProviderFactory,
		private billingProfiles: BillingProfileRepository,
		private clock: BillingClock,
		private checkoutSessionRecorder: CheckoutSessionRecorder,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// FREE is the virtual floor — it has no engine subscription, so there's nothing
		// to create. Reaching FREE is a downgrade, handled by ChangePlan.
		if (!PlanRegistry.isPaid(input.planName)) {
			throw new BaseError<DomainErrors>('FREE_PLAN_NOT_SUBSCRIBABLE', 'The free plan does not require a subscription')
		}

		if (!input.consentAccepted) {
			throw new BaseError<DomainErrors>('INVALID_MANDATE', 'Consent must be accepted to subscribe')
		}

		const plan = PlanRegistry.get(input.planName)

		// Checkout-first: subscribing no longer requires a card on file. With a vaulted default the
		// existing charge saga (ExternalInvoiceIssuedHandler, recurrence_cycle 'first') collects the
		// first invoice; without one, the subscription starts INCOMPLETE and the FIRST invoice is
		// paid inside a hosted checkout session (minted below, AFTER the tx commits). Read INSIDE
		// the tx (not a pre-tx snapshot) so the mint decision sees the same wallet state the
		// subscription write commits against.
		const minted = await this.withTransaction(tx, async tx => {
			const defaultPaymentMethod = await this.paymentMethodRepository.findDefaultByOwnerId(input.ownerId, tx)
			// Natural-key guard via a live subscription read: at most one non-terminal subscription
			// per owner. A terminal (or absent) subscription means there's nothing standing in the
			// way — re-subscribing after a cancellation is allowed. INCOMPLETE is also resumable:
			// nothing was ever paid (payment would have activated it), so an abandoned checkout must
			// present as "nothing happened".
			const existing = await this.subscriptionRepository.findByOwnerId(input.ownerId, tx)
			// An EFFECTIVELY-cancelled subscription is re-subscribable even before its stored status has
			// been finalized to CANCELED — a SCHEDULED cancel stays status=ACTIVE until BillingClockJob
			// finalizes it at the boundary sweep, which runs slightly after the period closes. Use the
			// SHARED SubscriptionAccessDeriver.isCanceledEffective (never a hand-copy — a copy drifted from
			// the deriver once by dropping the trial arm). "derive, don't flip" for the guard too.
			const effectivelyCanceled = existing != null && SubscriptionAccessDeriver.isCanceledEffective(existing, new Date())
			if (
				existing &&
				!Subscription.TERMINAL_STATUSES.has(existing.status) &&
				existing.status !== SubscriptionStatus.INCOMPLETE &&
				!effectivelyCanceled
			) {
				throw new BaseError<ApplicationErrors>('SUBSCRIPTION_ALREADY_EXISTS')
			}

			// Resuming an INCOMPLETE draft: the attempt's first invoice id derives from the draft's
			// period anchor (subscription state alone — no dependency on the ledger row, which lands
			// async via the outbox). REUSE vs SUPERSEDE — never mint a parallel open invoice per
			// click (that's how abandoned checkouts used to pile up PENDING rows). This block ALWAYS
			// runs for an INCOMPLETE draft so the money-already-moved guard and the draft VOID below
			// can't be skipped — only the REUSE shortcut itself is gated on `!effectivelyCanceled` (a
			// cancelled draft goes down the SUPERSEDE path: void + fresh re-seed, which clears the
			// draft's canceledAt/cancelAtPeriodEnd so the clock can't finalize the just-paid sub).
			if (existing?.status === SubscriptionStatus.INCOMPLETE && existing.currentPeriodStart) {
				const draftInvoiceId = BillingClock.nativeInvoiceId(input.ownerId, existing.currentPeriodStart.getTime())

				// Money already moved for the draft? The settlement webhook is in flight — this is
				// no longer an abandoned attempt, it's an activation racing this click.
				if (await this.chargeRepository.findSucceededByInvoiceId(draftInvoiceId, tx)) {
					throw new BaseError<ApplicationErrors>('SUBSCRIPTION_ALREADY_EXISTS')
				}

				// Same plan AND not effectively cancelled → REUSE the draft: same anchor, same invoice, no
				// new subscription write, no new events — only a fresh checkout session is minted below for
				// the SAME engineInvoiceId (per-attempt idemKey ⇒ new session; INVOICE_SETTLED dedups payment).
				if (existing.planName === input.planName && !effectivelyCanceled) {
					return {
						subscriptionId: existing.engineSubscriptionId,
						engineInvoiceId: draftInvoiceId,
						hadDefaultPaymentMethod: Boolean(defaultPaymentMethod),
					}
				}

				// Different plan OR an effectively-cancelled draft → SUPERSEDE: void the never-collected
				// draft (append-once fact → derived VOID, hidden from the listing; a no-op if the ledger
				// row hasn't landed yet) and fall through to a fresh re-seed (new plan and/or cleared
				// cancellation facts).
				await this.invoiceRepository.void(draftInvoiceId, tx)
			}

			// Phase D: the subscription record is authoritative — native (no external engine call). Seed it with a
			// native engineSubscriptionId (`native:{ownerId}`). The field is kept non-null but vestigial.
			// The FIRST invoice is minted natively below (a native pay-in-advance first invoice),
			// and renewals run through the native BillingClockJob.
			const engineSubscriptionId = `native:${input.ownerId}`

			// A plan with a trial starts the record in TRIALING rather than INCOMPLETE — the
			// owner gets access before payment is collected. Plans without a trial
			// (all four today) keep the existing INCOMPLETE start.
			const now = new Date()
			const isTrial = plan.trialDays > 0
			const initialStatus = isTrial ? SubscriptionStatus.TRIALING : SubscriptionStatus.INCOMPLETE
			const freshState = {
				engineSubscriptionId,
				planName: input.planName,
				status: initialStatus,
				// Non-trial: anchor the open period at `now` so exact proration has a start boundary.
				// TRIALING has no open paid period yet (it begins when the trial converts).
				currentPeriodStart: isTrial ? null : now,
				currentPeriodEnd: null,
				// TRIALING: the native clock (BillingClockJob) issues the first invoice once the trial
				// ends — anchor that boundary here. Non-trial subs carry no trial anchor.
				trialEnd: isTrial ? this.clock.trialEndFrom(now, plan.trialDays) : null,
			}

			// Re-subscribe over an existing (terminal / effectively-cancelled) record → RESTART the loaded
			// entity in place: it carries the row's optimistic-lock version, so the version-guarded save
			// overwrites exactly the row we read (a concurrent change since the read 409s) and the entity
			// clears the cancellation facts. A truly-first subscribe (no existing) seeds a fresh record.
			const sub = existing ?? Subscription.create({ ownerId: input.ownerId, ...freshState })
			if (existing) existing.resubscribe(freshState)
			await this.subscriptionRepository.save(sub, tx)
			const subscriptionId = engineSubscriptionId

			await this.domainEventRepository.save(
				new SubscriptionCreatedEvent({
					entityId: subscriptionId,
					ownerId: input.ownerId,
					payload: { ownerId: input.ownerId, planName: input.planName, subscriptionId },
				}),
				tx,
			)

			// Non-trial: mint the native FIRST invoice NOW, in this same tx. With a vaulted default the
			// existing charge saga (ExternalInvoiceIssuedHandler) collects it; without one the handler
			// skips silently (invoice stays PENDING) and the checkout minted below collects it.
			// Same deterministic id scheme as BillingClockJob so the write-once ledger +
			// INVOICE_CHARGE idempotency keys line up. Trials defer to the clock.
			let engineInvoiceId: string | undefined
			if (!isTrial) {
				engineInvoiceId = BillingClock.nativeInvoiceId(input.ownerId, now.getTime())
				await this.domainEventRepository.save(
					new ExternalInvoiceIssuedEvent({
						entityId: engineInvoiceId,
						ownerId: input.ownerId,
						payload: {
							externalId: `${engineInvoiceId}:issued`,
							ownerId: input.ownerId,
							engineInvoiceId,
							amountCents: plan.basePrice.amountCents,
							number: null,
							dueDate: null,
							periodStart: now.toISOString(),
							periodEnd: this.clock.nextPeriodEnd(now, 'monthly').toISOString(),
							// The FIRST invoice has no prior-period usage → never any overage.
							overageCents: 0,
							overageQty: 0,
							attemptNo: 0,
						},
					}),
					tx,
				)
			}

			return { subscriptionId, engineInvoiceId, hadDefaultPaymentMethod: Boolean(defaultPaymentMethod) }
		})

		// Checkout mint runs OUTSIDE the tx (provider calls never hold DB locks — same rule as
		// PayInvoice/ExternalInvoiceIssuedHandler). A mint failure leaves a consistent state:
		// subscription INCOMPLETE + invoice PENDING, recoverable via the manual PayInvoice path.
		if (!minted.hadDefaultPaymentMethod && minted.engineInvoiceId) {
			const provider = await this.providerFactory.decide({ ownerId: input.ownerId })
			const owner = await this.billingProfiles.findByOwnerId(input.ownerId)
			const session = await provider.createCheckoutSession({
				ownerId: input.ownerId,
				owner: owner ?? undefined,
				intent: CheckoutIntent.PAYMENT,
				engineInvoiceId: minted.engineInvoiceId,
				amountCents: plan.basePrice.amountCents,
				// Brand the hosted checkout with what is actually being bought — same catalog key the
				// invoice line uses (ExternalInvoiceIssuedHandler's SUBSCRIPTION line description),
				// localized to the owner's language; description + brand image complete the line item.
				presentation: {
					title: BILLING_MESSAGES.subscriptionLineTitle(owner?.language, { planName: input.planName }),
					description: BILLING_MESSAGES.checkoutSubscriptionDescription(owner?.language),
					...(ProductConfig.env.BILLING_CHECKOUT_IMAGE_URL ? { imageUrl: ProductConfig.env.BILLING_CHECKOUT_IMAGE_URL } : {}),
				},
				successUrl: `${Config.env.APP_URL}/account?checkout=success`,
				cancelUrl: `${Config.env.APP_URL}/account?checkout=canceled`,
				// Per-attempt key (see CardInvoicePaymentStrategy): an invoice-scoped key pins the
				// abandoned session's params at the gateway for 24h and bricks the manual-pay retry.
				idemKey: `checkout:${minted.engineInvoiceId}:${crypto.randomUUID()}`,
			})

			// Post-gateway, own tx (Decision 2 — molde da expectativa de refund): record the minted
			// session as a local CheckoutSession + arm its reconcile alarm so a lost completion webhook
			// still resolves in minutes.
			await this.checkoutSessionRecorder.record({
				sessionRef: session.sessionRef,
				ownerId: input.ownerId,
				platform: provider.platform,
				intent: CheckoutIntent.PAYMENT,
				engineInvoiceId: minted.engineInvoiceId,
				expiresAt: session.expiresAt,
			})

			return { subscriptionId: minted.subscriptionId, engineInvoiceId: minted.engineInvoiceId, checkoutUrl: session.url }
		}

		return { subscriptionId: minted.subscriptionId, engineInvoiceId: minted.engineInvoiceId }
	}
}
