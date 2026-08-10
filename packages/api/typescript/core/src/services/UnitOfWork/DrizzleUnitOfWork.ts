import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '@codm/contracts/db'
import { UnitOfWork } from './UnitOfWork'
import { DrizzleDatabaseDriver } from '../../db/drivers/DrizzleDatabaseDriver'
import { injectable } from 'tsyringe-neo'

/**
 * The handle a write transaction hands its callback.
 *
 * It used to be DERIVED from the drizzle client's own transaction method
 * (`Parameters<Parameters<...>[0]>[0]`), which described the object drizzle built for us. Under
 * the SQLite mechanism there is no such object: the driver drives `BEGIN IMMEDIATE` itself on its
 * dedicated write connection, so the handle simply IS the write database.
 */
export type DrizzleTransaction = LibSQLDatabase<typeof schema>

/**
 * Unit of work over the driver's write seam.
 *
 * WHY IT TAKES THE DRIVER AND NOT A CLIENT. The obvious implementation — asking the injected
 * drizzle client to open a transaction for us — is BANNED repo-wide. Measured on the shipped
 * `@libsql/client@0.17.4` (`.plans/artifacts/2026-07-26-tx-concurrency-gate.md`): that path hands
 * its native connection to the transaction object and never takes it back, so 500 transactions
 * leave 1002 open file descriptors against a baseline of 4 — linear, no plateau, the GC does not
 * collect it. Worse and quieter: because the client silently opens a REPLACEMENT connection, the
 * pragmas we applied at open are gone — `busy_timeout` measured back at 0 (from 5000) and
 * `foreign_keys` back at 1 (from 0), with no error anywhere. The same measurement on the manual
 * `BEGIN IMMEDIATE` path gives 4 descriptors after 500 transactions and the pragmas intact.
 *
 * Hence: the driver owns the write connection and the BEGIN/COMMIT/ROLLBACK strings, and this
 * class is a thin adapter onto it. The driver's injected `.db` is the READ handle — the unit of
 * work must never write through it.
 */
@injectable()
export class DrizzleUnitOfWork extends UnitOfWork<DrizzleTransaction> {
	constructor(private driver: DrizzleDatabaseDriver) {
		super()
	}

	async transaction<Return>(fn: (tx: DrizzleTransaction) => Promise<Return>): Promise<Return> {
		return this.driver.transaction(fn)
	}
}

@injectable()
export class DrizzleUnitOfWorkFactory {
	constructor(private driver: DrizzleDatabaseDriver) {}

	create(): UnitOfWork<DrizzleTransaction> {
		return new DrizzleUnitOfWork(this.driver)
	}
}
