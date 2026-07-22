import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import { notifications } from '@template/contracts/db'
import { Notification } from '../../entities/Notification'
import { NotificationRepository } from './NotificationRepository'

/**
 * Drizzle-backed NotificationRepository (iter 313 — paired
 * with the 0025 schema migration that introduced
 * `notifications.notifications` and
 * `notifications.notification_deliveries` per BC10 spec).
 *
 * The DB table mirrors the entity shape 1-1; UPSERT on save keyed by
 * the deterministic id; `incrementVersion` bumps the
 * optimistic-concurrency counter.
 */
@injectable()
export class DrizzleNotificationRepository extends NotificationRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(id: string, tx?: DrizzleClient): Promise<Notification | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(notifications).where(eq(notifications.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async save(entity: Notification, tx?: DrizzleClient): Promise<Notification> {
		entity.incrementVersion()
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(notifications)
				.values(data)
				.onConflictDoUpdate({
					target: notifications.id,
					set: {
						title: data.title,
						content: data.content,
						category: data.category,
						origin: data.origin,
						important: data.important,
						contentType: data.contentType,
						payload: data.payload,
						ownerId: data.ownerId,
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
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(notifications).where(eq(notifications.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof notifications.$inferSelect): Notification {
		const parsed = Notification.schema.parse({
			title: row.title,
			content: row.content,
			category: row.category,
			origin: row.origin,
			important: row.important,
			contentType: row.contentType,
			payload: row.payload,
			ownerId: row.ownerId,
		})
		return new Notification({
			...parsed,
			id: row.id,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: Notification): typeof notifications.$inferInsert {
		return {
			id: entity.id.value,
			title: entity.title,
			content: entity.content,
			category: entity.category,
			origin: entity.origin,
			important: entity.important,
			contentType: entity.contentType,
			payload: entity.payload,
			ownerId: entity.ownerId?.value ?? null,
			version: entity.version,
		}
	}
}
