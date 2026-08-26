import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { idempotencyKeys } from '@codm/contracts/db'
import { LibSqlDatabaseDriver } from '../../db'
import type { LibSqlTransaction } from '../../db/libsql/LibSqlDatabaseDriver'
import type { Transaction } from '../UnitOfWork/UnitOfWork'
import { IdempotencyGuard } from './IdempotencyGuard'

/** Resolve the query executor: the ambient transaction when threaded, else the base client.
 *  `Transaction` is intentionally `unknown` at the UnitOfWork layer; this is the one narrowed spot. */
function txClient(tx: Transaction | undefined, db: LibSqlTransaction): LibSqlTransaction {
	return (tx ?? db) as LibSqlTransaction
}

/**
 * Drizzle-backed claim latch on the dormant `shared.idempotency_keys` table (built ON it — no
 * billing/quota-local dedup store). Ported from origin-fork@f04e8a0f
 * (`packages/api/src/shared/services/IdempotencyGuard/LibSqlIdempotencyGuard.ts`). Two deltas from
 * the source, both mechanical: it binds to this template's `idempotencyKeys` table instead of
 * the origin fork's `dedupRecords`, and `scope` is `string` (the enum lives in the product). The claim
 * inserts only `{ scope, key }` — the table's other columns (`response_body`/`response_status`, the
 * now-nullable `expires_at`) belong to a future HTTP-idempotency-cache use and stay NULL for a bare
 * exactly-once latch, matching the origin fork's permanent (never-expiring) dedup semantics.
 */
@injectable()
export class LibSqlIdempotencyGuard extends IdempotencyGuard {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async claim(scope: string, key: string, tx?: Transaction): Promise<boolean> {
		const dbClient = txClient(tx, this.driver.db)
		const rows = await dbClient.insert(idempotencyKeys).values({ scope, key }).onConflictDoNothing().returning({ key: idempotencyKeys.key })
		return rows.length === 1
	}

	// Post-commit callers (an external effect failed after tx1 committed) omit `tx` → runs against the
	// pool. In-transaction callers (a handler releasing a latch it claimed earlier in the SAME tx, so it
	// doesn't persist past commit) pass `tx` so the delete commits atomically with the rest of that tx.
	async release(scope: string, key: string, tx?: Transaction): Promise<void> {
		const dbClient = txClient(tx, this.driver.db)
		await dbClient.delete(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
	}
}
