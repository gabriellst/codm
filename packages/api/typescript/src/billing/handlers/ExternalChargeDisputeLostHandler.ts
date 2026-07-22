import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { ExternalChargeDisputeLostEvent } from '@billing/events/ExternalChargeDisputeLostEvent'
import { ChargeRepository, DisputeRepository } from '@billing/repositories'

import { LoggingService } from '@template/core-typescript'
import { DisputeStatus } from '@template/contracts-typescript/wire/enums'

/**
 * A chargeback dispute closed in the CARDHOLDER's favor — the funds stay reversed. The CHARGEBACK
 * credit note that `ExternalChargeDisputedHandler` issued keeps crediting the invoice (access stays
 * revoked by derivation), unchanged. This handler ONLY closes the Dispute PROCESS record
 * (OPEN → LOST) — it NEVER reads or writes a credit note (spec Decision 4: losing has zero money
 * effect, only the process ends). Emitted only by Stripe today (`charge.dispute.closed`, status
 * lost — previously dropped by the mapper; the Dispute entity gave the fact a consumer).
 *
 * Same out-of-order protection as `ExternalChargeDisputeWonHandler`: the Dispute lookup happens
 * BEFORE the idempotency claim. A lost event can arrive before the created event has inserted the
 * Dispute row (or while its handler is still retrying) — claiming first would burn the claim on
 * that no-op and block the redelivery that would finally close it.
 *
 * finding [9]: unlike `ExternalChargeDisputedHandler`, there is NO synthetic-ref fallback when the
 * payload carries no `gatewayDisputeRef` — this event's OWN `externalId` belongs to a DIFFERENT
 * webhook delivery than the one that created the Dispute, so `evt:{thisExternalId}` can never equal
 * the `evt:{createdExternalId}` ref the Dispute was actually inserted under. A missing ref here is a
 * pure no-op (logged, claim not consumed) rather than a lookup guaranteed to miss.
 */
@injectable()
export class ExternalChargeDisputeLostHandler extends EventHandler<typeof ExternalChargeDisputeLostEvent> {
	readonly event = ExternalChargeDisputeLostEvent

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private chargeRepository: ChargeRepository,
		private disputeRepository: DisputeRepository,
		private loggingService: LoggingService,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const { externalId, engineInvoiceId, gatewayDisputeRef } = event.payload

		await this.withTransaction(undefined, async (tx: Transaction) => {
			// finding [9]: the dispute's identity requires the REAL gateway ref. There is no valid
			// synthetic fallback here — unlike ExternalChargeDisputedHandler (which derives `evt:{externalId}`
			// from the SAME event that created the Dispute, so the two `externalId`s trivially match), a
			// LOST event's own `externalId` is a DIFFERENT webhook delivery than the one that created the
			// Dispute — `evt:{lostEvent.externalId}` would never equal the `evt:{createdEvent.externalId}`
			// ref the Dispute was actually inserted under, so deriving a synthetic key here can only ever
			// miss. Only Stripe emits this event today, and Stripe always supplies the real ref, so this is
			// a defensive guard against a malformed/legacy payload, not an expected live path.
			if (!gatewayDisputeRef) {
				this.loggingService.warn({
					content: {
						message:
							"ExternalChargeDisputeLostHandler: no gatewayDisputeRef in payload — cannot derive the dispute's identity from this event alone; no-op, claim not consumed",
						engineInvoiceId,
						externalId,
					},
				})
				return
			}
			const disputeRef = gatewayDisputeRef

			// Platform resolution mirrors ExternalChargeDisputeWonHandler: the invoice's own SUCCEEDED
			// charge is the canonical source (a dispute only exists against a charge that already succeeded).
			const succeededCharge = await this.chargeRepository.findSucceededByInvoiceId(engineInvoiceId, tx)
			const dispute = succeededCharge ? await this.disputeRepository.findByRef(disputeRef, succeededCharge.platform, tx) : undefined
			if (!dispute) {
				this.loggingService.warn({
					content: { message: 'ExternalChargeDisputeLostHandler: no Dispute found for ref — no-op', disputeRef, engineInvoiceId },
				})
				return
			}

			// Dedup BEFORE transitioning — a redelivery of the SAME externalId must never re-run
			// dispute.lose() (LOST is absorbing: a second call would throw INVALID_DISPUTE_TRANSITION).
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_EVENT, `dispute_lost:${externalId}`, tx))) return

			// finding [2]: a Dispute already CLOSED (WON or LOST) must never reach `dispute.lose()` — same
			// rationale as ExternalChargeDisputeWonHandler's mirror guard (the entity's absorbing-transition
			// invariant stays intact; the call site is what must not re-enter it). Unlike won(), lose() has
			// no money side-effect to protect (Decision 4: losing never touches the credit note) — but an
			// uncaught throw here would still abort the tx and re-consume the SAME claim key forever
			// (poison-pill outbox retry), so the guard is required regardless.
			if (dispute.status !== DisputeStatus.OPEN) {
				this.loggingService.warn({
					content: {
						message:
							'ExternalChargeDisputeLostHandler: Dispute already closed — lose() skipped (contradiction or out-of-order/duplicate redelivery), no-op',
						gatewayDisputeRef: dispute.gatewayDisputeRef,
						engineInvoiceId,
						status: dispute.status,
					},
				})
				return
			}

			dispute.lose()
			await this.disputeRepository.save(dispute, tx)
		})
	}
}
