import { injectable } from 'tsyringe-neo'
import { and, eq, ne, sql } from 'drizzle-orm'
import { DrizzleClient } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { creditNote } from '@template/contracts/db'

import { ChargeRepository } from '../../repositories/ChargeRepository'
import { InvoiceStatusDeriver, type DerivableInvoice, type DerivedInvoiceStatus } from './InvoiceStatusDeriver'
import { CreditNoteReason, CreditNoteStatus } from '@template/contracts-typescript/wire/enums'

@injectable()
export class DrizzleInvoiceStatusDeriver extends InvoiceStatusDeriver {
	constructor(
		private db: DrizzleClient,
		private chargeRepository: ChargeRepository,
	) {
		super()
	}

	async derive(invoice: DerivableInvoice, now: Date, tx?: Transaction): Promise<DerivedInvoiceStatus> {
		// On a tx these three reads serialize on its single connection (the pg client queues) — fine;
		// the Promise.all only buys parallelism on the pool path.
		const [succeeded, creditedCents, hasActiveChargeback] = await Promise.all([
			this.chargeRepository.findSucceededByInvoiceId(invoice.invoiceId, tx),
			this.creditedCentsFor(invoice.invoiceId, tx),
			this.hasActiveChargebackFor(invoice.invoiceId, tx),
		])
		return this.assemble(invoice, succeeded?.createdAt ?? null, creditedCents, now, hasActiveChargeback)
	}

	async deriveMany(invoices: DerivableInvoice[], now: Date, tx?: Transaction): Promise<Map<string, DerivedInvoiceStatus>> {
		const entries = await Promise.all(invoices.map(async invoice => [invoice.invoiceId, await this.derive(invoice, now, tx)] as const))
		return new Map(entries)
	}

	// Sum billing_credit_notes directly (this deriver owns its own scan, not the CN repo). REVERSED
	// notes — a dispute-won chargeback that was voided — no longer credit the invoice, so they are
	// EXCLUDED here exactly as in CreditNoteRepository.sumByInvoiceId, and the invoice backs access
	// again. An empty set sums to 0, so this is correct before any credit note is ever written.
	private async creditedCentsFor(invoiceId: string, tx?: Transaction): Promise<number> {
		const dbClient = (tx as DrizzleClient | undefined) ?? this.db
		const rows = await dbClient
			.select({ total: sql<number>`coalesce(sum(${creditNote.amountCents}), 0)::int` })
			.from(creditNote)
			.where(and(eq(creditNote.invoiceId, invoiceId), ne(creditNote.status, CreditNoteStatus.REVERSED)))
		return rows[0]?.total ?? 0
	}

	// An active (non-reversed) CHARGEBACK note = the bank pulled the funds → the invoice must not back
	// access even if only partially charged back. A dispute-won reverses the note, so this reads false
	// again and access returns. (A merchant REFUND is different: a partial refund keeps access.)
	private async hasActiveChargebackFor(invoiceId: string, tx?: Transaction): Promise<boolean> {
		const dbClient = (tx as DrizzleClient | undefined) ?? this.db
		const rows = await dbClient
			.select({ id: creditNote.id })
			.from(creditNote)
			.where(
				and(
					eq(creditNote.invoiceId, invoiceId),
					eq(creditNote.reason, CreditNoteReason.CHARGEBACK),
					ne(creditNote.status, CreditNoteStatus.REVERSED),
				),
			)
			.limit(1)
		return rows.length > 0
	}
}
