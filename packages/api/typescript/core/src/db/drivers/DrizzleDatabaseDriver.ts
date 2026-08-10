import type { DrizzleTransaction, DrizzleUnitOfWorkFactory } from '../../services/UnitOfWork/DrizzleUnitOfWork'

/**
 * What `readMigrations()` answers, read from the shared `_sqlite_migrations` ledger plus the
 * migrations directory listing.
 *
 * It replaces a shape that mirrored drizzle-kit's `meta/_journal.json`. That file is BUILD-TIME
 * bookkeeping and is deliberately out of the runtime now: both appliers (TS here, Go in
 * `core/db/sqlite/store.go`) derive the set to apply from `readdir → filter .sql → sort`, which is
 * why the Go `//go:embed` copy legitimately has no `meta/` at all.
 */
export interface MigrationStatus {
	/** Ledger rows, i.e. migration filenames (with `.sql`) already applied to this file. */
	applied: string[]
	/** Filenames present on disk and absent from the ledger, in apply order. */
	pending: string[]
}

export abstract class DrizzleDatabaseDriver {
	/**
	 * The READ handle. Consumers inject `DrizzleDatabaseDriver` itself and read `.db` off it, so
	 * every query use case and repository read goes through it. It is NOT a write handle — see
	 * `transaction`.
	 */
	abstract readonly db: DrizzleTransaction
	abstract readonly unitOfWorkFactory: DrizzleUnitOfWorkFactory

	/**
	 * The ONLY write path. Runs `fn` inside a real write transaction on a dedicated write
	 * connection; the handle it hands the callback is the only legitimate way to emit
	 * INSERT/UPDATE/DELETE. Writing through `db` is forbidden (it does not hold the write lock).
	 */
	abstract transaction<Return>(fn: (tx: DrizzleTransaction) => Promise<Return>): Promise<Return>

	abstract create(): Promise<DrizzleDatabaseDriver>
	abstract reset(): Promise<void>
	abstract runMigrations(): Promise<void>
	abstract readMigrations(): Promise<MigrationStatus>
	abstract close(): Promise<void>
}
