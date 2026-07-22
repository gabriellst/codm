import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { DrizzleUnitOfWorkFactory } from '../../services/UnitOfWork/DrizzleUnitOfWork'
import type { DrizzleClient } from '../client'
import { DrizzleDatabaseDriver, type MigrationJournal } from './DrizzleDatabaseDriver'
import { BaseError } from '../../types/BaseError'
import type { BaseInfrastructureErrors } from '../../errors/codes'
import { truncateAllTables } from './utils'

export interface NodePgDriverOptions {
	connectionString: string
	// biome-ignore lint/suspicious/noExplicitAny: schema record is app-defined
	schema: Record<string, any>
	poolMax?: number
	idleTimeoutMillis?: number
	maxLifetimeSeconds?: number
	connectionTimeoutMillis?: number
}

export class NodePgDriver extends DrizzleDatabaseDriver {
	readonly db: DrizzleClient
	readonly unitOfWorkFactory: DrizzleUnitOfWorkFactory

	private readonly pool: Pool
	private readonly options: NodePgDriverOptions

	constructor(options: NodePgDriverOptions) {
		super()
		this.options = options

		this.pool = new Pool({
			connectionString: options.connectionString,
			max: options.poolMax ?? 5,
			idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
			maxLifetimeSeconds: options.maxLifetimeSeconds ?? 3600,
			connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10_000,
		})

		this.db = drizzle({ client: this.pool, schema: options.schema }) as unknown as DrizzleClient
		this.unitOfWorkFactory = new DrizzleUnitOfWorkFactory(this.db)
	}

	async create(): Promise<DrizzleDatabaseDriver> {
		return new NodePgDriver(this.options)
	}

	async reset(): Promise<void> {
		await truncateAllTables(this.db)
	}

	async runMigrations(): Promise<void> {
		throw new BaseError<BaseInfrastructureErrors>('NOT_IMPLEMENTED')
	}

	async readMigrations(): Promise<MigrationJournal> {
		throw new BaseError<BaseInfrastructureErrors>('NOT_IMPLEMENTED')
	}

	async close(): Promise<void> {
		await this.pool.end()
	}
}
