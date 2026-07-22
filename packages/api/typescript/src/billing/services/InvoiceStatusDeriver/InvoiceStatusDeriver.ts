import type { Transaction } from '@template/core-typescript'
import { InvoiceStatus } from '../../enums/InvoiceStatus'

/** The minimal invoice fields the derivation reads — satisfied by an Invoice's props. */
export interface DerivableInvoice {
	invoiceId: string
	amountCents: number
	dueDate: Date | null
	/** Supersede fact (see Invoice.voidedAt). Optional so charge-fact-only call sites stay thin. */
	voidedAt?: Date | null
}

export interface DerivedInvoiceStatus {
	status: InvoiceStatus
	/** Earliest SUCCEEDED charge's createdAt, or null when unpaid. */
	paidAt: Date | null
	/** Whether this invoice currently backs access: paid AND not (fully) refunded. */
	backsAccess: boolean
}

/**
 * Derives an invoice's status from FACTS (SUCCEEDED charges + credit notes + its due date) instead
 * of reading a stored `status` flag — "derive, don't flip". `billing_invoices` carries NO status
 * column at all; every load-bearing read (listing, the failed-payment guard) comes through here.
 */
export abstract class InvoiceStatusDeriver {
	/** Thread `tx` when deriving inside a transaction, so the charge/credit-note facts read include
	 *  the caller's own uncommitted writes. */
	abstract derive(invoice: DerivableInvoice, now: Date, tx?: Transaction): Promise<DerivedInvoiceStatus>
	/** Batch form for list reads — keyed by invoiceId. */
	abstract deriveMany(invoices: DerivableInvoice[], now: Date, tx?: Transaction): Promise<Map<string, DerivedInvoiceStatus>>

	/**
	 * Pure predicate — the single source of the status ordering. `paid` = ∃ SUCCEEDED charge,
	 * `creditedCents` = Σ billing_credit_notes.amount_cents for the invoice (0 until credit-note
	 * issuance lands). Evaluated in this exact order:
	 *  - REFUNDED           if fully credited (creditedCents ≥ total, total > 0)
	 *  - PARTIALLY_REFUNDED if 0 < creditedCents < total
	 *  - PAID               if total == 0, or (paid and nothing credited)
	 *  - VOID               if unpaid and superseded (voidedAt set) — money always wins over a void
	 *  - OVERDUE            if unpaid and past a known due date
	 *  - PENDING            otherwise
	 */
	static deriveInvoiceStatus(args: {
		total: number
		paid: boolean
		creditedCents: number
		dueDate: Date | null
		voidedAt?: Date | null
		now: Date
	}): InvoiceStatus {
		const { total, paid, creditedCents, dueDate, voidedAt, now } = args
		if (creditedCents >= total && total > 0) return InvoiceStatus.REFUNDED
		if (creditedCents > 0 && creditedCents < total) return InvoiceStatus.PARTIALLY_REFUNDED
		if (total === 0 || (paid && creditedCents === 0)) return InvoiceStatus.PAID
		if (!paid && voidedAt) return InvoiceStatus.VOID
		if (!paid && dueDate !== null && now > dueDate) return InvoiceStatus.OVERDUE
		return InvoiceStatus.PENDING
	}

	/**
	 * Shared assembly used by both impls once `paidAt`/`creditedCents` are resolved. `hasActiveChargeback`
	 * — an active (non-reversed) CHARGEBACK credit note exists — revokes access REGARDLESS of amount: a
	 * chargeback means the bank pulled the funds, so even a PARTIAL one must not back access (unlike a
	 * partial merchant REFUND, where the customer still net-paid and keeps access). A dispute-won reverses
	 * the note → hasActiveChargeback is false again → access returns.
	 */
	protected assemble(
		invoice: DerivableInvoice,
		paidAt: Date | null,
		creditedCents: number,
		now: Date,
		hasActiveChargeback = false,
	): DerivedInvoiceStatus {
		const paid = paidAt !== null
		const status = InvoiceStatusDeriver.deriveInvoiceStatus({
			total: invoice.amountCents,
			paid,
			creditedCents,
			dueDate: invoice.dueDate,
			voidedAt: invoice.voidedAt,
			now,
		})
		return { status, paidAt, backsAccess: paid && creditedCents < invoice.amountCents && !hasActiveChargeback }
	}
}
