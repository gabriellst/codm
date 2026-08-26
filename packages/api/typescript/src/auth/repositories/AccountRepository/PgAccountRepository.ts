// Recipe: dev:packages/api/src/auth/repositories/AccountRepository/PgAccountRepository.ts
// Adapted: uses contracts/db schema; accounts table has no version column.
import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { PgDatabaseDriver, tryCatchAsync, PgTransaction } from '@codm/core-typescript'
import { accounts } from '@codm/contracts/db/pg'
import { Account } from '../../entities/Account'
import { AccountRepository } from './AccountRepository'

@injectable()
export class PgAccountRepository extends AccountRepository {
	constructor(private driver: PgDatabaseDriver) {
		super()
	}

	async findById(id: string, tx?: PgTransaction): Promise<Account | undefined> {
		const dbClient = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(accounts).where(eq(accounts.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByAccountId(accountId: string, tx?: PgTransaction): Promise<Account[]> {
		const dbClient = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			return dbClient.select().from(accounts).where(eq(accounts.accountId, accountId))
		})
		if (!result.success) throw result.error
		return result.data.map(row => this.toDomain(row))
	}

	async findByUserId(userId: string, tx?: PgTransaction): Promise<Account[]> {
		const dbClient = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			return dbClient.select().from(accounts).where(eq(accounts.userId, userId))
		})
		if (!result.success) throw result.error
		return result.data.map(row => this.toDomain(row))
	}

	async save(entity: Account, tx?: PgTransaction): Promise<Account> {
		entity.incrementVersion()
		const dbClient = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbClient
				.insert(accounts)
				.values(data)
				.onConflictDoUpdate({
					target: accounts.id,
					set: {
						accountId: data.accountId,
						providerId: data.providerId,
						userId: data.userId,
						updatedAt: new Date(),
					},
				})
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: PgTransaction): Promise<void> {
		const dbClient = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			await dbClient.delete(accounts).where(eq(accounts.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof accounts.$inferSelect): Account {
		return new Account({
			id: row.id,
			accountId: row.accountId,
			providerId: row.providerId,
			userId: row.userId,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: 1,
		})
	}

	private toPersistence(entity: Account): typeof accounts.$inferInsert {
		return {
			id: entity.id.value,
			accountId: entity.accountId,
			providerId: entity.providerId,
			userId: entity.userId.value,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
		}
	}
}
