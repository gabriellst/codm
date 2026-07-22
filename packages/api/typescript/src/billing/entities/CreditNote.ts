import { AggregateRoot, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { CreditNoteReason, CreditNoteStatus } from '@template/contracts-typescript/wire/enums'

// Append-only ledger fact — an immutable credit issued against an invoice (a
// confirmed REFUND or CHARGEBACK). VALUE fields are immutable; the ONE allowed
// mutation is a STATUS transition to REVERSED — the dispute-won case, where a
// CHARGEBACK credit note is voided so it stops crediting the invoice (like
// Charge's status-only transitions; the amount/reason/currency never change).
// `amountCents` is the positive credited amount; `InvoiceStatusDeriver` sums the
// non-REVERSED notes to derive PARTIALLY_REFUNDED / REFUNDED — "derive, don't flip".
const CreditNoteSchema = z.object({
	ownerId: z.instance(Id),
	invoiceId: z.instance(Id),
	number: z.string().min(1),
	amountCents: z.number().int().nonnegative(),
	currency: z.enum(CurrencyCode),
	reason: z.enum(CreditNoteReason),
	status: z.enum(CreditNoteStatus),
	gatewayRef: z.string().nullable(),
	finalizedAt: z.date().nullable(),
})

export type CreditNoteProps = Z.infer<typeof CreditNoteSchema>

export class CreditNote extends AggregateRoot<typeof CreditNoteSchema> {
	static override schema = CreditNoteSchema

	static create(data: {
		ownerId: string
		invoiceId: string
		number: string
		amountCents: number
		currency: CurrencyCode
		reason: CreditNoteReason
		gatewayRef: string | null
		finalizedAt?: Date | null
	}): CreditNote {
		return new CreditNote({
			ownerId: data.ownerId,
			invoiceId: data.invoiceId,
			number: data.number,
			amountCents: data.amountCents,
			currency: data.currency,
			reason: data.reason,
			// A confirmed gateway refund is recorded ISSUED — SETTLED is reserved for a later
			// reconciliation/payout step and is not wired in this phase.
			status: CreditNoteStatus.ISSUED,
			gatewayRef: data.gatewayRef,
			finalizedAt: data.finalizedAt ?? null,
		})
	}

	/**
	 * Void this credit note — the ONLY permitted CN mutation. Used when a chargeback dispute is won
	 * (funds restored): the CHARGEBACK note stops crediting the invoice, so the derivation's Σ (which
	 * excludes REVERSED) drops back and the invoice backs access again. Value fields are untouched —
	 * only status → REVERSED. Idempotent: reversing an already-REVERSED note is a no-op.
	 */
	reverse(): void {
		if (this.status === CreditNoteStatus.REVERSED) return
		this.status = CreditNoteStatus.REVERSED
		this.validate()
	}
}

// Declaration merging — interface BELOW class
export interface CreditNote extends CreditNoteProps {}
