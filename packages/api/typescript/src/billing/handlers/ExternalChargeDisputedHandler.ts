import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { ExternalChargeDisputedEvent } from '@billing/events/ExternalChargeDisputedEvent'
import { InvoiceRepository, CreditNoteRepository, ChargeRepository, DisputeRepository } from '@billing/repositories'
import { CreditNoteService } from '@billing/services'

import { Dispute } from '@billing/entities'
import { LoggingService } from '@template/core-typescript'
import { CreditNoteReason } from '@template/contracts-typescript/wire/enums'

/**
 * Records a CONFIRMED gateway dispute (chargeback) as an immutable CHARGEBACK credit note against
 * the invoice (append-only ledger fact) — the bank-initiated counterpart to a merchant REFUND.
 *
 * There is NO status flip and NO dunning bridge: the CHARGEBACK note credits the invoice, so
 * `InvoiceStatusDeriver` sums it (Σ credit notes ≥ total → REFUNDED, backsAccess false) and
 * `SubscriptionAccessDeriver` therefore REVOKES access purely by DERIVATION (Phase D). If the
 * dispute is later won, `ExternalChargeDisputeWonHandler` reverses this note and access returns.
 *
 * The event's `externalId` (the webhook event id) is the per-fact idempotency key, so a re-delivered
 * dispute webhook records no second credit note.
 *
 * Alongside the credit note, every CONFIRMED dispute also creates a `Dispute` aggregate — the
 * PROCESS record (open→won|lost) that outlives the credit note (won reverses it; the process itself
 * stays). Its identity (`gatewayDisputeRef`) is the real gateway-native ref when the mapper can
 * supply one (Stripe `dp_…`), else a synthetic `evt:{externalId}` key — and that same ref becomes the
 * credit note's `gatewayRef` (replacing the old `externalId`), so the two records line up 1:1.
 */
@injectable()
export class ExternalChargeDisputedHandler extends EventHandler<typeof ExternalChargeDisputedEvent> {
	readonly event = ExternalChargeDisputedEvent

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private invoiceRepository: InvoiceRepository,
		private creditNoteRepository: CreditNoteRepository,
		private creditNoteService: CreditNoteService,
		private chargeRepository: ChargeRepository,
		private disputeRepository: DisputeRepository,
		private loggingService: LoggingService,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const { externalId, engineInvoiceId, amountCents, gatewayTxId, gatewayDisputeRef } = event.payload

		await this.withTransaction(undefined, async (tx: Transaction) => {
			// Guard so outbox retries don't re-issue the chargeback credit note.
			// Per-EVENT claim: a NEW dispute on an already-once-disputed invoice (previous one won and
			// reversed) must issue its own CHARGEBACK note; only a redelivery of the same webhook no-ops.
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_EVENT, `disputed:${externalId}`, tx))) return

			const invoice = await this.invoiceRepository.findByEngineInvoiceId(engineInvoiceId, tx)
			if (!invoice) return

			// The dispute's identity: the real ref the mapper supplied (Stripe `dp_…`), else the synthetic
			// key derived from the webhook-event id — aligned with the `disputed:{externalId}` claim above,
			// so a redelivery never reaches here with a repeated synthetic ref.
			const disputeRef = gatewayDisputeRef ?? `evt:${externalId}`

			// Platform: not carried on Invoice or on this event (adding it here would mean touching every
			// mapper — see the handlers registry). The canonical source is the invoice's own charge:
			// `findByGatewayTxId` isn't usable here — for Stripe, `gatewayTxId` on THIS event is the
			// Dispute object's own id (see StripeWebhookMapper), not the original charge's gateway id, so
			// it wouldn't resolve the charge on that platform.
			//
			// Resolution order (finding [3]): prefer the SUCCEEDED charge (the common case — a dispute
			// against money that actually settled), but do NOT require it. A dispute can arrive while the
			// charge is still PENDING gateway-side (async capture, provider lag) or in some other
			// non-SUCCEEDED state — refusing to resolve platform in that case meant the Dispute PROCESS
			// record was silently and PERMANENTLY unrecordable for that invoice (the claim above is
			// already consumed by the time this runs, so no redelivery ever retries it). Fall back to the
			// most recent charge attempt of ANY status. Only when the invoice has NO charge at all
			// (never attempted) is platform genuinely unresolvable — a real anomaly, logged loud.
			const resolvedCharge =
				(await this.chargeRepository.findSucceededByInvoiceId(engineInvoiceId, tx)) ??
				(await this.chargeRepository.findLatestByInvoiceId(engineInvoiceId, tx))

			if (!resolvedCharge) {
				this.loggingService.error({
					content: {
						message:
							'ExternalChargeDisputedHandler: invoice has NO charge at all (succeeded or otherwise) — cannot resolve platform for dispute; Dispute PROCESS record skipped (anomaly)',
						engineInvoiceId,
						disputeRef,
					},
				})
			} else {
				// Registers the PROCESS even when the credit note below gets clamped to zero (Decision: the
				// process is real regardless of how much money is still creditable). `insertIfNew` (finding
				// [8]) makes this idempotent by construction — no separate findByRef probe needed.
				await this.disputeRepository.insertIfNew(
					Dispute.create({
						gatewayDisputeRef: disputeRef,
						platform: resolvedCharge.platform,
						ownerId: invoice.ownerId.value,
						gatewayTxId,
						invoiceId: engineInvoiceId,
						amountCents,
					}),
					tx,
				)
			}

			// Clamp to what is still creditable (mirrors ExternalChargeRefundedHandler): if a prior REFUND
			// already credited part of the invoice, a full-amount chargeback note would push Σ credit notes
			// over the invoice total — a fiscal/reconciliation defect. Access is revoked either way (any
			// active CHARGEBACK note revokes, regardless of amount — see InvoiceStatusDeriver).
			const alreadyCredited = await this.creditNoteRepository.sumByInvoiceId(engineInvoiceId, tx)
			const creditable = Math.min(amountCents, invoice.amountCents - alreadyCredited)
			if (creditable <= 0) return

			await this.creditNoteService.issue(
				{ invoiceId: engineInvoiceId, amountCents: creditable, reason: CreditNoteReason.CHARGEBACK, gatewayRef: disputeRef },
				tx,
			)
		})
	}
}
