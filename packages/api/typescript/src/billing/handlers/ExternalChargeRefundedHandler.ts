import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { ExternalChargeRefundedEvent } from '@billing/events/ExternalChargeRefundedEvent'
import { InvoiceRepository, CreditNoteRepository } from '@billing/repositories'
import { CreditNoteService } from '@billing/services'
import { CreditNoteReason } from '@template/contracts-typescript/wire/enums'

/**
 * Records the CONFIRMED gateway refund as an immutable REFUND credit note against the invoice
 * (append-only ledger fact) — replacing the old read-model `markRefunded` PAID→REFUNDED flip. The
 * derived status (InvoiceStatusDeriver) then reads the credit-note sum and yields PARTIALLY_REFUNDED
 * (partial) or REFUNDED (full) automatically — "derive, don't flip".
 *
 * The event's `amountCents` carries the refunded amount (incl. a Stripe/Pagar.me partial); its
 * `externalId` (the webhook event id) is the per-fact idempotency key, so a re-delivered webhook
 * records no second credit note. Downstream effects (access revocation, REFUNDED status) follow
 * purely from the DERIVATION over the credit note written here — the internal `InvoiceRefundedEvent`
 * the `RefundInvoice` operator command raises is an unconsumed audit fact, not a reaction driver.
 */
@injectable()
export class ExternalChargeRefundedHandler extends EventHandler<typeof ExternalChargeRefundedEvent> {
	readonly event = ExternalChargeRefundedEvent

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private invoiceRepository: InvoiceRepository,
		private creditNoteRepository: CreditNoteRepository,
		private creditNoteService: CreditNoteService,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const { externalId, engineInvoiceId, amountCents, gatewayRefundId } = event.payload

		await this.withTransaction(undefined, async (tx: Transaction) => {
			// Per-EVENT claim (externalId), not per-invoice: a second DISTINCT partial refund on the
			// same invoice must issue its own credit note — only a redelivery of the SAME webhook is
			// a no-op (belt: this claim; suspenders: CreditNoteService dedups by (invoice, gatewayRef),
			// keyed on the CANONICAL gatewayRefundId below — the true collision key across webhook AND
			// reconciliation-synthesized events, which never share an externalId).
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_EVENT, `refunded:${externalId}`, tx))) return

			const invoice = await this.invoiceRepository.findByEngineInvoiceId(engineInvoiceId, tx)
			if (!invoice) return

			// Gateways disagree on what `amountCents` means: Pagar.me sends the SPECIFIC refund,
			// Stripe's charge.refunded carries the CUMULATIVE amount_refunded to date. Clamping to
			// what is still creditable makes both read correctly — Σ credit notes never exceeds the
			// invoice, and a cumulative second event books exactly the delta.
			const alreadyCredited = await this.creditNoteRepository.sumByInvoiceId(engineInvoiceId, tx)
			const creditable = Math.min(amountCents, invoice.amountCents - alreadyCredited)
			if (creditable <= 0) return

			await this.creditNoteService.issue(
				{
					invoiceId: engineInvoiceId,
					amountCents: creditable,
					reason: CreditNoteReason.REFUND,
					// The canonical gateway refund id dedupes across webhook AND reconciliation; only
					// when a mapper/vendor can't populate it does the webhook event id stand in.
					gatewayRef: gatewayRefundId ?? externalId,
				},
				tx,
			)
		})
	}
}
