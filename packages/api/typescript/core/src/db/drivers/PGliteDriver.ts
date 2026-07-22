import { PGlite } from '@electric-sql/pglite'
import { UnitOfWork, UnitOfWorkFactory } from '../../services/UnitOfWork/UnitOfWork'
import type { DrizzleTransaction } from '../../services/UnitOfWork/DrizzleUnitOfWork'
import type { DrizzleClient } from '../client'
import { DrizzleDatabaseDriver, type MigrationJournal } from './DrizzleDatabaseDriver'
import { readMigrationJournal, readMigrationSql, truncateAllTables } from './utils'
import { drizzle } from 'drizzle-orm/pglite'

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
}

export class PGliteDriver extends DrizzleDatabaseDriver {
	readonly db: DrizzleClient
	readonly unitOfWorkFactory: UnitOfWorkFactory
	private readonly pg: PGlite
	private readonly migrationsDir: string

	constructor(options: PGliteDriverOptions) {
		super()
		this.migrationsDir = options.migrationsDir
		this.pg = new PGlite()
		const db = drizzle({ client: this.pg, schema: options.schema })
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
