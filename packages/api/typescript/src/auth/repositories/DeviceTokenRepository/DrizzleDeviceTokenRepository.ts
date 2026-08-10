import { injectable } from 'tsyringe-neo'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { DrizzleDatabaseDriver, tryCatchAsync, DrizzleTransaction } from '@codm/core-typescript'
import { deviceCodes, deviceTokens } from '@codm/contracts/db'
import { DeviceToken } from '../../entities/DeviceToken'
import { DeviceTokenRepository, type ConsumedDeviceCode } from './DeviceTokenRepository'

@injectable()
export class DrizzleDeviceTokenRepository extends DeviceTokenRepository {
	constructor(private driver: DrizzleDatabaseDriver) {
		super()
	}

	async findById(id: string, tx?: DrizzleTransaction): Promise<DeviceToken | undefined> {
		const dbClient = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(deviceTokens).where(eq(deviceTokens.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByHash(tokenHash: string, tx?: DrizzleTransaction): Promise<DeviceToken | undefined> {
		const dbClient = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(deviceTokens).where(eq(deviceTokens.tokenHash, tokenHash)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async save(entity: DeviceToken, tx?: DrizzleTransaction): Promise<DeviceToken> {
		entity.incrementVersion()
		const dbClient = tx ?? this.driver.db
		const data = this.toPersistence(entity)
		const result = await tryCatchAsync(async () => {
			await dbClient
				.insert(deviceTokens)
				.values(data)
				.onConflictDoUpdate({
					target: deviceTokens.id,
					set: {
						label: data.label,
						revokedAt: data.revokedAt,
						updatedAt: data.updatedAt,
						version: data.version,
					},
				})
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: DrizzleTransaction): Promise<void> {
		const dbClient = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			await dbClient.delete(deviceTokens).where(eq(deviceTokens.id, id))
		})
		if (!result.success) throw result.error
	}

	async issueCode(code: string, userId: string, expiresAt: Date, tx?: DrizzleTransaction): Promise<void> {
		const dbClient = tx ?? this.driver.db
		await dbClient.insert(deviceCodes).values({ code, userId, expiresAt })
	}

	/**
	 * The atomic claim (repository canon: house `claimNext` idiom). The predicate does BOTH jobs the
	 * outer use case needs — "not already consumed" AND "not expired" — in the SAME statement, so a
	 * race between two exchanges of the same code and a slow exchange of an expired code both resolve
	 * to zero rows updated, never a false claim.
	 */
	async consumeCode(code: string, now: Date, tx?: DrizzleTransaction): Promise<ConsumedDeviceCode | undefined> {
		const dbClient = tx ?? this.driver.db
		const claimed = await dbClient
			.update(deviceCodes)
			.set({ consumedAt: now })
			.where(and(eq(deviceCodes.code, code), isNull(deviceCodes.consumedAt), gt(deviceCodes.expiresAt, now)))
			.returning({ userId: deviceCodes.userId })
		return claimed[0]
	}

	private toDomain(row: typeof deviceTokens.$inferSelect): DeviceToken {
		return new DeviceToken({
			id: row.id,
			userId: row.userId,
			tokenHash: row.tokenHash,
			label: row.label,
			revokedAt: row.revokedAt ?? undefined,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: DeviceToken): typeof deviceTokens.$inferInsert {
		return {
			id: entity.id.value,
			userId: entity.userId.value,
			tokenHash: entity.tokenHash,
			label: entity.label,
			revokedAt: entity.revokedAt ?? null,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
