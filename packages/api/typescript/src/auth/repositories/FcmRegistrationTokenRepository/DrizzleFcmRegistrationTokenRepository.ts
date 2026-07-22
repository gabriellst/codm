import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import { fcmRegistrationTokens } from '@template/contracts/db'
import { FcmRegistrationToken } from '../../entities/FcmRegistrationToken'
import { FcmRegistrationTokenRepository } from './FcmRegistrationTokenRepository'

@injectable()
export class DrizzleFcmRegistrationTokenRepository extends FcmRegistrationTokenRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findByToken(token: string, tx?: DrizzleClient): Promise<FcmRegistrationToken | undefined> {
		const dbClient = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(fcmRegistrationTokens).where(eq(fcmRegistrationTokens.token, token)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async listByUserId(userId: string, tx?: DrizzleClient): Promise<FcmRegistrationToken[]> {
		const dbClient = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			return dbClient.select().from(fcmRegistrationTokens).where(eq(fcmRegistrationTokens.userId, userId))
		})
		if (!result.success || !result.data) return []
		return result.data.map(r => this.toDomain(r))
	}

	async save(entity: FcmRegistrationToken, tx?: DrizzleClient): Promise<FcmRegistrationToken> {
		entity.incrementVersion()
		const dbClient = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbClient
				.insert(fcmRegistrationTokens)
				.values(data)
				.onConflictDoUpdate({
					target: fcmRegistrationTokens.id,
					set: {
						userId: data.userId,
						token: data.token,
						platform: data.platform,
						lastSeenAt: data.lastSeenAt,
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
			await dbClient.delete(fcmRegistrationTokens).where(eq(fcmRegistrationTokens.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof fcmRegistrationTokens.$inferSelect): FcmRegistrationToken {
		const parsed = FcmRegistrationToken.schema.parse({
			userId: row.userId,
			token: row.token,
			platform: row.platform,
			lastSeenAt: row.lastSeenAt,
		})
		return new FcmRegistrationToken({
			...parsed,
			id: row.id,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: FcmRegistrationToken): typeof fcmRegistrationTokens.$inferInsert {
		return {
			id: entity.id.value,
			userId: entity.userId.value,
			token: entity.token,
			platform: entity.platform,
			lastSeenAt: entity.lastSeenAt,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
