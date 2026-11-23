import { injectable } from 'tsyringe-neo'
import { eq, max } from 'drizzle-orm'
import { LibSqlDatabaseDriver, type LibSqlTransaction } from '@codm/core-typescript'
import { batches } from '@codm/contracts/db'
import { BatchSequence } from './BatchSequence'

/**
 * The conversation's last batch number plus one, read from `thread_batches` itself — no counter table: a batch is
 * never deleted, so the highest `seq` IS the counter, and reading it in the caller's write transaction is what
 * keeps two batches from drawing the same number.
 */
@injectable()
export class LibSqlBatchSequence extends BatchSequence {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async next(threadId: string, tx?: LibSqlTransaction): Promise<number> {
		const dbc = tx ?? this.driver.db
		const [row] = await dbc
			.select({ last: max(batches.seq) })
			.from(batches)
			.where(eq(batches.threadId, threadId))
		return (row?.last ?? 0) + 1
	}
}
