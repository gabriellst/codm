import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { ExternalInvoiceRefundedEvent } from '@billing/events/ExternalInvoiceRefundedEvent'
import { InvoiceRepository } from '@billing/repositories'
import { CreditNoteService } from '@billing/services'
import { CreditNoteReason } from '@template/contracts-typescript/wire/enums'

/**
 * Records the engine-confirmed invoice refund/void as an immutable REFUND credit note against the
 * invoice (append-only ledger fact) — replacing the old read-model `markRefunded` PAID→REFUNDED flip.
 * The derived status (InvoiceStatusDeriver) then reads the credit-note sum and yields REFUNDED
 * automatically — "derive, don't flip".
 *
 * The event carries no amount (an invoice-level refund is the WHOLE invoice), so the credit note is
 * for the invoice's full `amountCents`; its `externalId` (the engine event id) is the per-fact
 * idempotency key. Parallels ExternalChargeRefundedHandler's gateway-side counterpart.
 *
 * LIVE (B3): the invoice-level refund/void sources are AsaasWebhookMapper (PAYMENT_DELETED — the
 * cobrança was voided at the gateway; PAYMENT_RECEIVED_IN_CASH_UNDONE — an out-of-band receipt was
 * reversed) and StripeWebhookMapper (invoice.voided, Stripe Billing). Charge-level refunds keep
 * flowing through ExternalChargeRefundedHandler.
 */
@injectable()
export class ExternalInvoiceRefundedHandler extends EventHandler<typeof ExternalInvoiceRefundedEvent> {
	readonly event = ExternalInvoiceRefundedEvent

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private invoiceRepository: InvoiceRepository,
		private creditNoteService: CreditNoteService,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const { externalId, engineInvoiceId } = event.payload

		await this.withTransaction(undefined, async (tx: Transaction) => {
			// Guard so outbox retries don't re-issue the credit note.
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_EVENT, `${engineInvoiceId}:refunded`, tx))) return

			const invoice = await this.invoiceRepository.findByEngineInvoiceId(engineInvoiceId, tx)
			if (!invoice) return

			// Invoice-level refund = the full invoice amount (the event carries no partial amount).
			await this.creditNoteService.issue(
				{ invoiceId: engineInvoiceId, amountCents: invoice.amountCents, reason: CreditNoteReason.REFUND, gatewayRef: externalId },
				tx,
			)
		})
	}
}
