import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { z } from '@template/core-typescript'

import { InvoiceRepository } from '@billing/repositories'
import { ExternalChargeFailedEvent } from '@billing/events/ExternalChargeFailedEvent'
import { ExternalInvoiceIssuedEvent } from '@billing/events/ExternalInvoiceIssuedEvent'
import { InvoicePaymentFailedEvent } from '@billing/events/InvoicePaymentFailedEvent'
import { ChargeSettler } from '@billing/services'
import { PlanName } from '@template/contracts-typescript/wire/enums'

// The optimistic-upgrade pair as it may appear on the persisted issued event — both members
// parsed through PlanName so raw JSON never leaks an unvalidated string onto the failure event.
const UpgradePairSchema = z.object({ upgradedFromPlan: z.enum(PlanName), upgradedToPlan: z.enum(PlanName) })

@injectable()
export class ExternalChargeFailedHandler extends EventHandler<typeof ExternalChargeFailedEvent> {
	readonly event = ExternalChargeFailedEvent

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private invoiceRepository: InvoiceRepository,
		private chargeSettler: ChargeSettler,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.payload.ownerId
		const { engineInvoiceId, gatewayTxId, amountCents } = event.payload

		await this.withTransaction(undefined, async (tx: Transaction) => {
			// Guard so outbox retries don't append duplicate failure events.
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_FAILED, engineInvoiceId, tx))) return

			// Rehydrate the optimistic-upgrade pair from the invoice's OWN issued event (its
			// entityId IS the engineInvoiceId). The synchronous charge path (ExternalInvoiceIssuedHandler)
			// forwards this pair directly because it has it in scope; the webhook path doesn't, so
			// without this the declined-upgrade revert would never run when the failure lands via
			// webhook (leaving the owner on the upgraded plan with an unpaid proration invoice).
			// One source of truth (the issued event), two delivery paths.
			const issued = await this.domainEventRepository.findLatestByEntityIdAndName(engineInvoiceId, ExternalInvoiceIssuedEvent.name, tx)
			const pair = UpgradePairSchema.safeParse(issued?.payload)
			const upgradePair = pair.success ? pair.data : {}

			// A webhook-only decline emits InvoicePaymentFailedEvent but records NO FAILED Charge —
			// SubscriptionCharger is the sole writer of one, and only on a SYNCHRONOUS decline. Without a
			// FAILED ledger row, DunningLifecycle.onChargeFailed sees 0 FAILED (no DunningStarted email)
			// and listDunningCandidates never picks the invoice up (no retry/cancel). Record the FIRST
			// failure here (race-safe, via the shared helper) so the invoice enters dunning. Optimistic-
			// upgrade prorations are excluded (Decision 8: a declined upgrade is reverted, not dunned) —
			// the rehydrated pair being present is exactly that signal.
			const invoice = pair.success ? undefined : await this.invoiceRepository.findByEngineInvoiceId(engineInvoiceId, tx)
			const recordedFailure = await this.chargeSettler.failCharge(
				{
					ownerId,
					engineInvoiceId,
					amountCents: invoice?.amountCents ?? amountCents,
					// ExternalChargeFailedEvent carries no acquirer decline code — generic dunning copy.
					isUpgrade: pair.success,
					// Disambiguates a stray/duplicate/out-of-order charge.failed from THIS webhook's own
					// PENDING attempt (see ChargeSettler.failCharge's PENDING-in-place guard).
					gatewayTxId,
				},
				tx,
			)

			// Only emit when there is something real for InvoicePaymentFailedHandler to act on: either a
			// genuine FAILED fact was just recorded (recordedFailure — drives markPastDue + dunning), or
			// this is the optimistic-upgrade pair (pair.success — Decision 8 requires the revert to run
			// even though NO FAILED charge is recorded for an upgrade proration). A STRAY/duplicate/
			// out-of-order webhook that matched neither (recordedFailure=false, no upgrade pair) must NOT
			// emit — emitting here is exactly what used to flip a paying customer's subscription to
			// PAST_DUE with no FAILED charge and no dunning email.
			if (recordedFailure || pair.success) {
				await this.domainEventRepository.save(
					new InvoicePaymentFailedEvent({
						entityId: engineInvoiceId,
						ownerId,
						// No declineCode on the webhook path: ExternalChargeFailedEvent carries no failure
						// detail (the mappers don't extract acquirer codes) — dunning falls back to generic
						// copy. Classifying webhook declines means widening that event's payload first.
						payload: { ownerId, invoiceId: engineInvoiceId, reason: `GATEWAY_CHARGE_FAILED:${gatewayTxId}`, ...upgradePair },
					}),
					tx,
				)
			} else {
				// Nothing recorded and no upgrade to revert — this was a stray/duplicate/out-of-order
				// charge.failed that matched no PENDING attempt on the invoice. RELEASE the INVOICE_FAILED
				// latch (claimed up-front to serialize the failCharge transition) WITHIN this tx, so the
				// invoice's GENUINE charge.failed — arriving later with the PENDING attempt's own
				// gatewayTxId — can still claim it and enter dunning. Without this the stray webhook
				// permanently burned the latch, and the real failure was silently never dunned/retried/
				// canceled (the charge sat PENDING until the reconciler terminalized it, still un-dunned).
				await this.idempotencyGuard.release(IdempotencyScope.INVOICE_FAILED, engineInvoiceId, tx)
			}
		})
	}
}
