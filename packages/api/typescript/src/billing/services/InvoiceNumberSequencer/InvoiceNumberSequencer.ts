import type { Transaction } from '@template/core-typescript'

/**
 * Allocates monotonic, gap-free document numbers per prefix (e.g. `INV-000001`, `CN-000001`),
 * backed by `billing_invoice_sequences`. Used by InvoiceService (`'INV'`) and CreditNoteService
 * (`'CN'`) — the caller owns the default prefix; this service never hardcodes one.
 *
 * GAP-FREE INVARIANT: allocation runs inside the CALLER's transaction (`tx`), the SAME transaction
 * as the invoice/credit-note INSERT it numbers. Because the number is claimed (row locked +
 * incremented) in that transaction, rolling the caller's transaction back rolls back the increment
 * too — so a failed insert never burns a number, and the next allocation reuses it. Callers MUST
 * therefore allocate and insert within one transaction; passing a `tx` that is committed
 * independently of the row it numbers would defeat the guarantee.
 */
export abstract class InvoiceNumberSequencer {
	/** Allocate the next number for `prefix` within the caller's transaction `tx`. */
	abstract next(prefix: string, tx: Transaction): Promise<string>
}
