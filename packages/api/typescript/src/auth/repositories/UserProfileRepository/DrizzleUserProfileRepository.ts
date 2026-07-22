import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import { userProfiles } from '@template/contracts/db'
import { UserProfile } from '../../entities/UserProfile'
import { UserProfileRepository } from './UserProfileRepository'

@injectable()
export class DrizzleUserProfileRepository extends UserProfileRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findByUserId(userId: string, tx?: DrizzleClient): Promise<UserProfile | undefined> {
		const dbClient = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(userProfiles).where(eq(userProfiles.id, userId)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async save(entity: UserProfile, tx?: DrizzleClient): Promise<UserProfile> {
		entity.incrementVersion()
		const dbClient = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbClient
				.insert(userProfiles)
				.values(data)
				.onConflictDoUpdate({
					target: userProfiles.id,
					set: {
						timezone: data.timezone,
						language: data.language,
						updatedAt: new Date(),
						version: data.version,
					},
				})
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: DrizzleClient): Promise<void> {
		const dbClient = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			await dbClient.delete(userProfiles).where(eq(userProfiles.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof userProfiles.$inferSelect): UserProfile {
		return new UserProfile({
			id: row.id,
			userId: row.id,
			// Raw primitives — the entity schema's z.instance(...) transform constructs the VOs.
			timezone: row.timezone ?? undefined,
			language: row.language ?? undefined,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: UserProfile): typeof userProfiles.$inferInsert {
		return {
			id: entity.userId.value,
			timezone: entity.timezone?.toString() ?? null,
			language: entity.language?.toString() ?? null,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
