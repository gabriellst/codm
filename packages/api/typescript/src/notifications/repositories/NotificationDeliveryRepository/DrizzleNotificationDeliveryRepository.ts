import { injectable } from 'tsyringe-neo'
import { and, count, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import { notifications, notificationDeliveries } from '@template/contracts/db'
import { type NotificationCategory, type NotificationOrigin } from '@template/contracts-typescript/wire/enums'
import { NotificationDelivery } from '../../entities/NotificationDelivery'
import { NotificationDeliveryRepository, type InboxJoinedRow, type InboxQuery, type InboxResult } from './NotificationDeliveryRepository'

/**
 * Drizzle-backed NotificationDeliveryRepository (iter 313 —
 * paired with the 0025 schema migration that introduced
 * `notifications.notification_deliveries`).
 *
 * `inbox` joins deliveries to notifications, optionally filters by
 * category + unread, paginates newest-first by deliveredAt. Returns
 * total (filtered match count) + unreadCount (computed before the
 * unreadOnly filter for the unread badge) + the paginated items.
 */
@injectable()
export class DrizzleNotificationDeliveryRepository extends NotificationDeliveryRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(id: string, tx?: DrizzleClient): Promise<NotificationDelivery | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async inbox(query: InboxQuery, tx?: DrizzleClient): Promise<InboxResult> {
		const dbc = tx ?? this.db
		const baseFilters: SQL[] = [eq(notificationDeliveries.userId, query.userId)]
		if (query.categories !== undefined && query.categories.length > 0) {
			baseFilters.push(inArray(notifications.category, query.categories))
		}
		const baseWhere = baseFilters.length === 1 ? baseFilters[0] : and(...baseFilters)
		const filteredWhere = query.unreadOnly ? and(baseWhere, isNull(notificationDeliveries.readAt)) : baseWhere

		const result = await tryCatchAsync(async () => {
			const offset = Math.max(0, (query.page - 1) * query.limit)
			const [items, totalRows, unreadRows] = await Promise.all([
				dbc
					.select({
						delivery: notificationDeliveries,
						notification: notifications,
					})
					.from(notificationDeliveries)
					.innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
					.where(filteredWhere ?? sql`true`)
					.orderBy(desc(notificationDeliveries.deliveredAt))
					.limit(query.limit)
					.offset(offset),
				dbc
					.select({ value: count() })
					.from(notificationDeliveries)
					.innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
					.where(filteredWhere ?? sql`true`),
				dbc
					.select({ value: count() })
					.from(notificationDeliveries)
					.innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
					.where(and(baseWhere, isNull(notificationDeliveries.readAt))),
			])
			return {
				items,
				total: Number(totalRows[0]?.value ?? 0),
				unreadCount: Number(unreadRows[0]?.value ?? 0),
			}
		})
		if (!result.success) throw result.error

		const items: InboxJoinedRow[] = result.data.items.map(r => ({
			delivery: this.toDomain(r.delivery),
			notification: {
				notificationId: r.notification.id,
				title: r.notification.title,
				content: r.notification.content,
				category: r.notification.category as NotificationCategory,
				important: r.notification.important,
				origin: r.notification.origin as NotificationOrigin,
				payload: (r.notification.payload as Record<string, unknown>) ?? {},
			},
		}))
		return { total: result.data.total, unreadCount: result.data.unreadCount, items }
	}

	async save(entity: NotificationDelivery, tx?: DrizzleClient): Promise<NotificationDelivery> {
		entity.incrementVersion()
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(notificationDeliveries)
				.values(data)
				.onConflictDoUpdate({
					target: notificationDeliveries.id,
					set: {
						notificationId: data.notificationId,
						userId: data.userId,
						channel: data.channel,
						deliveredAt: data.deliveredAt,
						readAt: data.readAt,
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
			await dbc.delete(notificationDeliveries).where(eq(notificationDeliveries.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof notificationDeliveries.$inferSelect): NotificationDelivery {
		const parsed = NotificationDelivery.schema.parse({
			notificationId: row.notificationId,
			userId: row.userId,
			channel: row.channel,
			deliveredAt: row.deliveredAt,
			readAt: row.readAt,
		})
		return new NotificationDelivery({
			...parsed,
			id: row.id,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: NotificationDelivery): typeof notificationDeliveries.$inferInsert {
		return {
			id: entity.id.value,
			notificationId: entity.notificationId.value,
			userId: entity.userId.value,
			channel: entity.channel,
			deliveredAt: entity.deliveredAt,
			readAt: entity.readAt,
			version: entity.version,
		}
	}
}
