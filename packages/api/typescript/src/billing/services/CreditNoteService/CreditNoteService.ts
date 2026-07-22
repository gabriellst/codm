import { injectable } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { CreditNote } from '@billing/entities'

import { CreditNoteRepository, InvoiceRepository } from '@billing/repositories'
import { InvoiceNumberSequencer } from '@billing/services/InvoiceNumberSequencer'
import { CreditNoteReason } from '@template/contracts-typescript/wire/enums'

/** Everything needed to record a credit note against an invoice. */
export interface IssueCreditNoteInput {
	/** The engine invoice id — the credit note's parent, resolved to owner/currency here. */
	invoiceId: string
	/** Positive credited amount in cents (a partial or full slice of the invoice). */
	amountCents: number
	reason: CreditNoteReason
	/** The gateway fact id (webhook event id) — the idempotency key alongside invoiceId. */
	gatewayRef: string
}

/**
 * Records an immutable credit note into the ledger (`billing_credit_notes`), allocating a
 * gap-free `CN` document number. Issued ONLY from a CONFIRMED gateway fact (a refund webhook),
 * never speculatively.
 *
 * IDEMPOTENT per `(invoiceId, gatewayRef)`: an existing credit note for that pair wins and NO
 * new number is allocated. Existence is checked (in the tx) BEFORE the sequencer runs — following
 * `InvoiceService.issue` — so a duplicate signal never burns a `CN` number; and because the number
 * is allocated in the SAME tx as the insert, a rollback rolls the allocation back too (gap-free).
 *
 * The derived invoice status (`InvoiceStatusDeriver`) then reads Σ credit-note amounts and yields
 * PARTIALLY_REFUNDED / REFUNDED automatically — "derive, don't flip".
 *
 * Self-bound across every profile (like RefundPolicy/BillingClock): pure orchestration whose only
 * I/O flows through the injected abstract repos — the profile swap happens THERE, so an abstract
 * contract + per-env impl here would be indirection with nothing to vary.
 */
@injectable()
export class CreditNoteService {
	constructor(
		private creditNoteRepository: CreditNoteRepository,
		private invoiceRepository: InvoiceRepository,
		private sequencer: InvoiceNumberSequencer,
	) {}

	async issue(input: IssueCreditNoteInput, tx: Transaction): Promise<CreditNote> {
		// Idempotent: an already-recorded credit note for this (invoiceId, gatewayRef) wins. Check
		// FIRST so a duplicate signal never advances the CN sequencer.
		const existing = await this.creditNoteRepository.findByInvoiceAndGatewayRef(input.invoiceId, input.gatewayRef, tx)
		if (existing) return existing

		// ownerId + currency come from the parent invoice (the invoice is the source of truth).
		const invoice = await this.invoiceRepository.findByInvoiceId(input.invoiceId, tx)
		if (!invoice) throw new BaseError('CREDIT_NOTE_INVOICE_NOT_FOUND')

		// Allocate the gap-free document number in the SAME tx as the insert (see class doc).
		const number = await this.sequencer.next('CN', tx)

		const creditNote = CreditNote.create({
			ownerId: invoice.ownerId.value,
			invoiceId: input.invoiceId,
			number,
			amountCents: input.amountCents,
			currency: invoice.currency,
			reason: input.reason,
			gatewayRef: input.gatewayRef,
			// A confirmed refund is a finalized document at record time.
			finalizedAt: new Date(),
		})

		await this.creditNoteRepository.insert(creditNote, tx)
		return creditNote
	}
}
