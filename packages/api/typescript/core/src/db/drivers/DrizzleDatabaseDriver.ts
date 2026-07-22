import type { UnitOfWorkFactory } from '../../services/UnitOfWork/UnitOfWork'
import type { DrizzleClient } from '../client'

export interface MigrationJournal {
	entries: Array<{
		tag: string
	}>
}

export abstract class DrizzleDatabaseDriver {
	abstract readonly db: DrizzleClient
	abstract readonly unitOfWorkFactory: UnitOfWorkFactory

	abstract create(): Promise<DrizzleDatabaseDriver>
	abstract reset(): Promise<void>
	abstract runMigrations(): Promise<void>
	abstract readMigrations(): Promise<MigrationJournal>
	abstract close(): Promise<void>
}
