import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { invoiceSequence } from '@template/contracts/db'
import { InvoiceNumberSequencer } from './InvoiceNumberSequencer'

@injectable()
export class DrizzleInvoiceNumberSequencer extends InvoiceNumberSequencer {
	constructor(private db: DrizzleClient) {
		super()
	}

	async next(prefix: string, tx: Transaction): Promise<string> {
		// Run on the CALLER's transaction so the increment commits/rolls back with the invoice/CN
		// insert (the gap-free invariant on the abstract class).
		const dbClient = (tx as DrizzleClient | undefined) ?? this.db

		// Upsert-if-absent: create the counter starting at 1 on first use, without clobbering an
		// existing counter.
		await dbClient.insert(invoiceSequence).values({ prefix, nextNumber: 1 }).onConflictDoNothing()

		// Lock the prefix row FOR UPDATE: concurrent allocators serialize on this row within their
		// own caller transactions, so each reads a distinct `next_number`.
		const rows = await dbClient
			.select({ nextNumber: invoiceSequence.nextNumber })
			.from(invoiceSequence)
			.where(eq(invoiceSequence.prefix, prefix))
			.for('update')

		const row = rows[0]
		if (!row) {
			// Unreachable: the upsert above guarantees the row exists. Guarded so a schema/driver
			// regression fails loudly instead of minting a bad number.
			throw new Error(`InvoiceNumberSequencer: sequence row for prefix "${prefix}" missing after upsert`)
		}

		const n = row.nextNumber
		await dbClient
			.update(invoiceSequence)
			.set({ nextNumber: n + 1 })
			.where(eq(invoiceSequence.prefix, prefix))

		return `${prefix}-${String(n).padStart(6, '0')}`
	}
}
