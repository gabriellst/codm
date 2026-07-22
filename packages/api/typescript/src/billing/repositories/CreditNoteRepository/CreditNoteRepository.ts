import type { Transaction } from '@template/core-typescript'
import { CreditNote } from '../../entities'
import { CreditNoteReason } from '@template/contracts-typescript/wire/enums'

/**
 * Append-only store over `billing_credit_notes`. A credit note is an (almost) immutable ledger
 * fact — this surface exposes INSERT + reads and exactly ONE mutation, `reverse`, which flips a
 * CHARGEBACK note's status to REVERSED when a dispute is won (value fields never change). NO
 * value-field update/delete is permitted. `sumByInvoiceId` returns Σ amount_cents for an invoice
 * EXCLUDING reversed notes (0 when none) — what a caller needs to know how much STILL credits it.
 *
 * Note: `InvoiceStatusDeriver`'s Drizzle impl sums `billing_credit_notes` directly (also excluding
 * REVERSED) — this repo is what `CreditNoteService`/the dispute handlers need, not a replacement
 * for that sum.
 */
export abstract class CreditNoteRepository {
	/** Append-only write. There is deliberately no update/delete of value fields. */
	abstract insert(creditNote: CreditNote, tx?: Transaction): Promise<void>
	/** The credit note already recorded for `(invoiceId, gatewayRef)`, if any — the idempotency probe. */
	abstract findByInvoiceAndGatewayRef(invoiceId: string, gatewayRef: string, tx?: Transaction): Promise<CreditNote | undefined>
	/** The (non-reversed) credit note recorded against `(invoiceId, reason)`, if any — the dispute-won lookup. */
	abstract findByInvoiceAndReason(invoiceId: string, reason: CreditNoteReason, tx?: Transaction): Promise<CreditNote | undefined>
	/** The ACTIVE (non-reversed) credit note recorded against a specific `gatewayRef`, SCOPED to an
	 *  invoice — a dispute's own identity, set at creation time (see `ExternalChargeDisputedHandler`,
	 *  W2b). The precise dispute-won lookup for invoices with more than one dispute, where
	 *  `findByInvoiceAndReason` cannot tell which of several active CHARGEBACK notes to reverse.
	 *  Scoped by `engineInvoiceId` because `gatewayRef` is NOT globally unique across platforms — an
	 *  unscoped match could reverse a note on a DIFFERENT invoice whose gateway happens to reuse the
	 *  same ref shape. */
	abstract findActiveByGatewayRef(engineInvoiceId: string, gatewayRef: string, tx?: Transaction): Promise<CreditNote | undefined>
	/** Every `gatewayRef` recorded for `(invoiceId, reason)`, of ANY status (INCLUDING REVERSED) —
	 *  the CN-side half of the chargeback reconcile's "known refs" union: a dispute whose webhook
	 *  was processed (so its CN already exists) before the `Dispute` PROCESS row existed must still
	 *  read as "known" to the identity-regime detector — otherwise it alerts forever on a ref the
	 *  ledger actually already recorded. Nulls (CNs with no gatewayRef) are filtered out. */
	abstract listGatewayRefsByInvoiceIdAndReason(invoiceId: string, reason: CreditNoteReason, tx?: Transaction): Promise<string[]>
	/**
	 * The ONE permitted CN mutation: persist a status → REVERSED transition (a dispute-won void).
	 * Only the status column is written; value fields are untouched.
	 */
	abstract reverse(creditNote: CreditNote, tx?: Transaction): Promise<void>
	/** Σ amount_cents credited against an invoice, EXCLUDING REVERSED notes (0 when none). */
	abstract sumByInvoiceId(invoiceId: string, tx?: Transaction): Promise<number>
	/** Σ amount_cents of the NON-reversed credit notes of a `(invoiceId, reason)` — the refund
	 *  reconcile measures its delta only against REFUND (a chargeback is a different money origin,
	 *  it doesn't count). */
	abstract sumByInvoiceIdAndReason(invoiceId: string, reason: CreditNoteReason, tx?: Transaction): Promise<number>
	/** Whether ANY credit note (of any status, INCLUDING REVERSED) exists for `(invoiceId, reason)`
	 *  — the chargeback reconcile's predicate: a WON dispute (note already reversed) still counts as
	 *  "the ledger saw the dispute" and must not re-alert. Unlike
	 *  `findByInvoiceAndReason`/`sumByInvoiceIdAndReason`, which exclude REVERSED by design. */
	abstract existsByInvoiceIdAndReason(invoiceId: string, reason: CreditNoteReason, tx?: Transaction): Promise<boolean>
}
