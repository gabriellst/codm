import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { ExternalChargeDisputeWonEvent } from '@billing/events/ExternalChargeDisputeWonEvent'
import { CreditNoteRepository, ChargeRepository, DisputeRepository } from '@billing/repositories'

import { LoggingService } from '@template/core-typescript'
import { CreditNoteReason, DisputeStatus } from '@template/contracts-typescript/wire/enums'

/**
 * A chargeback dispute closed in the merchant's favor — the funds are restored. The CHARGEBACK
 * credit note that `ExternalChargeDisputedHandler` issued must stop crediting the invoice so it
 * backs access again. Credit notes are append-only value records, so this is modeled as the ONE
 * allowed CN mutation: a status transition to REVERSED (`CreditNote.reverse()`). Once reversed the
 * derivation's Σ (which EXCLUDES REVERSED notes) drops back below the invoice total, so
 * `InvoiceStatusDeriver` yields PAID again and `SubscriptionAccessDeriver` RESTORES access — no
 * status flip, no bridge (Phase D — derive, don't flip).
 *
 * When the event carries the dispute's own ref (Stripe: `gatewayDisputeRef`), we locate THAT
 * dispute's note precisely via `findActiveByGatewayRef` — required for invoices with more than one
 * dispute, where the old (invoice, reason) lookup could reverse the wrong one. When the ref is
 * absent (older event shape / a platform without one), we fall back to the prior lookup by
 * (invoice, reason = CHARGEBACK). If no active CHARGEBACK note exists either way (never disputed,
 * or already reversed), this is a no-op.
 *
 * Task T4: won also transitions the Dispute PROCESS record to WON — located by the SAME ref the
 * credit note was found with (`chargebackNote.gatewayRef`, stamped at creation time to the
 * dispute's identity — see `ExternalChargeDisputedHandler`). Reusing the FOUND note's own
 * gatewayRef works uniformly for both the ref-carrying and the fallback path. The Dispute
 * transition is best-effort and runs AFTER the CN reversal (money): a missing Dispute (data
 * predating T2, or a lookup miss) only logs — the reversal above must never wait on it.
 */
@injectable()
export class ExternalChargeDisputeWonHandler extends EventHandler<typeof ExternalChargeDisputeWonEvent> {
	readonly event = ExternalChargeDisputeWonEvent

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private creditNoteRepository: CreditNoteRepository,
		private chargeRepository: ChargeRepository,
		private disputeRepository: DisputeRepository,
		private loggingService: LoggingService,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const { externalId, engineInvoiceId, gatewayDisputeRef } = event.payload

		await this.withTransaction(undefined, async (tx: Transaction) => {
			// Look up the active CHARGEBACK note BEFORE claiming. A dispute.closed(won) can arrive out of
			// order — before dispute.created has issued the note (or while its handler is still retrying).
			// If we claimed first and then found nothing, the claim would be consumed on that no-op, and the
			// at-least-once REDELIVERY of this won event (which is what would finally reverse the note) would
			// be blocked → the chargeback stays forever, revoking access to a customer whose dispute they WON.
			// Returning without claiming lets the redelivery retry once the note exists.
			//
			// finding [1]: a ref-carrying lookup that finds NOTHING is not necessarily "no note exists yet"
			// — it can also be a mismatch (a legacy CN keyed by the old externalId convention, or a ref
			// convention drift between platforms). Falling all the way through to no-op here would strand
			// the reversal FOREVER (same failure mode the out-of-order comment above already guards against),
			// revoking access to a customer who actually WON. So a ref-lookup miss falls back to the
			// (invoice, reason) lookup instead of giving up — same fallback already used when the payload
			// carries no ref at all. NOTE: on an invoice with MORE THAN ONE open dispute, this fallback is
			// ambiguous (picks the oldest active CHARGEBACK note, per `findByInvoiceAndReason`'s own doc) —
			// a pre-existing limitation of the fallback itself, not new here.
			let chargebackNote = gatewayDisputeRef
				? await this.creditNoteRepository.findActiveByGatewayRef(engineInvoiceId, gatewayDisputeRef, tx)
				: undefined
			if (!chargebackNote) {
				if (gatewayDisputeRef) {
					this.loggingService.warn({
						content: {
							message:
								'ExternalChargeDisputeWonHandler: ref found no active CHARGEBACK note on invoice — falling back to the (invoice, reason) lookup (legacy CN keyed differently, or a ref convention mismatch)',
							gatewayDisputeRef,
							engineInvoiceId,
						},
					})
				}
				chargebackNote = await this.creditNoteRepository.findByInvoiceAndReason(engineInvoiceId, CreditNoteReason.CHARGEBACK, tx)
			}
			if (!chargebackNote) return

			// Now dedup the reversal itself (a redelivery once reversed is also a no-op — both lookups
			// above skip REVERSED notes — but the claim keeps the per-event semantics explicit).
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_EVENT, `dispute_won:${externalId}`, tx))) return

			chargebackNote.reverse()
			await this.creditNoteRepository.reverse(chargebackNote, tx)

			// Best-effort: transition the Dispute PROCESS record too, located by the note's OWN
			// gatewayRef (the exact identity it was created/found with above). The money already moved —
			// a missing Dispute (pre-T2 data, or a lookup miss) must never block or undo the reversal.
			const disputeRef = chargebackNote.gatewayRef
			const succeededCharge = disputeRef ? await this.chargeRepository.findSucceededByInvoiceId(engineInvoiceId, tx) : undefined
			const dispute =
				succeededCharge && disputeRef ? await this.disputeRepository.findByRef(disputeRef, succeededCharge.platform, tx) : undefined
			if (!dispute) {
				this.loggingService.warn({
					content: {
						message: 'ExternalChargeDisputeWonHandler: no Dispute found for ref — CN reversed, process untouched',
						disputeRef: String(disputeRef),
						engineInvoiceId,
					},
				})
				return
			}

			// finding [2]: a Dispute already CLOSED (WON or LOST) must NEVER reach `dispute.won()` — the
			// entity's own invariant (WON/LOST are absorbing, see VALID_TRANSITIONS) throws
			// INVALID_DISPUTE_TRANSITION for that, and an uncaught throw HERE would abort the whole tx —
			// including the CN reversal a few lines above, which is money that has ALREADY moved. That
			// would be a poison-pill outbox event: every redelivery re-enters this same throw forever. The
			// guard belongs at the call site (not the entity — its invariant stays exactly as strict as
			// it is); a contradiction (already LOST) or an out-of-order/duplicate redelivery (already WON)
			// both just log and leave the Dispute record untouched — the CN reversal above already
			// committed and is never undone by this branch.
			if (dispute.status !== DisputeStatus.OPEN) {
				this.loggingService.warn({
					content: {
						message:
							'ExternalChargeDisputeWonHandler: Dispute already closed — won() skipped (contradiction or out-of-order/duplicate redelivery); CN reversal above already applied, Dispute record left untouched',
						gatewayDisputeRef: dispute.gatewayDisputeRef,
						engineInvoiceId,
						status: dispute.status,
					},
				})
				return
			}

			dispute.won()
			await this.disputeRepository.save(dispute, tx)
		})
	}
}
