// Recipe: dev:packages/api/src/auth/repositories/UserRepository/PgUserRepository.ts
// Adapted: uses @codm/contracts/db schema; auth.users has no version column so
// uses a plain upsert (no optimistic lock needed — better-auth owns this table).
import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { PgDatabaseDriver, tryCatchAsync, PgTransaction } from '@codm/core-typescript'
import { users } from '@codm/contracts/db/pg'
import { User } from '../../entities/User'
import { UserRepository } from './UserRepository'

@injectable()
export class PgUserRepository extends UserRepository {
	constructor(private driver: PgDatabaseDriver) {
		super()
	}

	async findById(userId: string, tx?: PgTransaction): Promise<User | undefined> {
		const dbClient = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(users).where(eq(users.id, userId)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByEmail(email: string, tx?: PgTransaction): Promise<User | undefined> {
		const dbClient = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(users).where(eq(users.email, email)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async save(entity: User, tx?: PgTransaction): Promise<User> {
		entity.incrementVersion()
		const dbClient = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbClient
				.insert(users)
				.values(data)
				.onConflictDoUpdate({
					target: users.id,
					set: {
						name: data.name,
						email: data.email,
						emailVerified: data.emailVerified,
						image: data.image,
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
			await dbClient.delete(users).where(eq(users.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof users.$inferSelect): User {
		return new User({
			id: row.id,
			name: row.name ?? null,
			email: row.email,
			emailVerified: row.emailVerified,
			image: row.image ?? null,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: 1,
		})
	}

	private toPersistence(entity: User): typeof users.$inferInsert {
		return {
			id: entity.id.value,
			name: entity.name ?? null,
			email: entity.email,
			emailVerified: entity.emailVerified ?? false,
			image: entity.image ?? null,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
		}
	}
}
