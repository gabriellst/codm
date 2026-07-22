import { PGlite } from '@electric-sql/pglite'
import { UnitOfWork, UnitOfWorkFactory } from '../../services/UnitOfWork/UnitOfWork'
import type { DrizzleTransaction } from '../../services/UnitOfWork/DrizzleUnitOfWork'
import type { DrizzleClient } from '../client'
import { DrizzleDatabaseDriver, type MigrationJournal } from './DrizzleDatabaseDriver'
import { readMigrationJournal, readMigrationSql, truncateAllTables } from './utils'
import { acquireDataDirLock } from './DataDirLock'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

/**
 * PGlite is single-connection: running a query via `this.db` inside a `db.transaction()`
 * callback deadlocks. This UoW bypasses the real transaction and passes the db client
 * directly so that all operations share the same connection without locking.
 */
class PGliteUnitOfWork extends UnitOfWork<DrizzleTransaction> {
	constructor(private db: DrizzleClient) {
		super()
	}

	async transaction<Return>(fn: (tx: DrizzleTransaction) => Promise<Return>): Promise<Return> {
		return fn(this.db as DrizzleTransaction)
	}
}

class PGliteUnitOfWorkFactory extends UnitOfWorkFactory {
	constructor(private db: DrizzleClient) {
		super()
	}

	create(): UnitOfWork<DrizzleTransaction> {
		return new PGliteUnitOfWork(this.db)
	}
}

export interface PGliteDriverOptions {
	// biome-ignore lint/suspicious/noExplicitAny: schema record is app-defined
	schema: Record<string, any>
	/** Absolute path to the migrations directory (Drizzle output). */
	migrationsDir: string
	/**
	 * When set, PGlite is FILE-BACKED at this absolute path — the real daemon's embedded, persistent
	 * store (founder decision 3). Absent → in-memory (`memory://`), the ephemeral test/integration
	 * store reset per suite. The two modes also pick different migration strategies (see
	 * `runMigrations`): file-backed uses the idempotent drizzle migrator, in-memory execs all once.
	 */
	dataDir?: string
}

export class PGliteDriver extends DrizzleDatabaseDriver {
	readonly db: DrizzleClient
	readonly unitOfWorkFactory: UnitOfWorkFactory
	private readonly pg: PGlite
	// Raw drizzle/pglite handle (statically typed) — the migrator needs the concrete PgliteDatabase,
	// not the app-facing DrizzleClient cast. `this.db` is the same object; kept separately to avoid
	// an `as any` at the migrate call site.
	private readonly migratorDb: ReturnType<typeof drizzle>
	private readonly migrationsDir: string
	private readonly dataDir?: string

	constructor(options: PGliteDriverOptions) {
		super()
		this.migrationsDir = options.migrationsDir
		this.dataDir = options.dataDir
		// A plain path selects PGlite's node filesystem backend (persistent); no arg is in-memory.
		// File-backed only: acquire a single-instance lock BEFORE opening. `new PGlite(dataDir)` takes
		// no OS advisory lock, so two daemons on one data dir would silently diverge — this fails the
		// second one loudly with DataDirLockedError. In-memory (tests) skip it.
		if (options.dataDir) acquireDataDirLock(options.dataDir)
		this.pg = options.dataDir ? new PGlite(options.dataDir) : new PGlite()
		const db = drizzle({ client: this.pg, schema: options.schema })
		this.migratorDb = db
		this.db = db as unknown as DrizzleClient
		this.unitOfWorkFactory = new PGliteUnitOfWorkFactory(this.db)
	}

	async create(): Promise<DrizzleDatabaseDriver> {
		return this
	}

	async reset(): Promise<void> {
		await truncateAllTables(this.db)
	}

	async runMigrations(): Promise<void> {
		// File-backed (real daemon boot): idempotent + ordered. The drizzle migrator tracks applied
		// migrations in `drizzle.__drizzle_migrations` and runs ONLY the pending ones, so re-running on
		// every boot over a populated data dir is a no-op. PGlite is single-connection; the pglite-
		// specific migrator drives it correctly (no pool assumptions).
		if (this.dataDir) {
			await migrate(this.migratorDb, { migrationsFolder: this.migrationsDir })
			return
		}

		// In-memory (tests): the DB is fresh every process, so exec each migration once — no tracking
		// table needed. `pg.exec` runs the whole multi-statement file (statement-breakpoint markers are
		// plain SQL comments).
		const journal = await this.readMigrations()

		for (const entry of journal.entries) {
			await this.pg.exec(await readMigrationSql(this.migrationsDir, entry.tag))
		}
	}

	async readMigrations(): Promise<MigrationJournal> {
		return readMigrationJournal(this.migrationsDir)
	}

	async close(): Promise<void> {
		// no-op: singleton lifecycle is process-scoped, not per-suite
	}
}
