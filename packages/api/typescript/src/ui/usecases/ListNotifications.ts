import { injectable } from 'tsyringe-neo'
import { and, count, desc, eq, ilike, isNull, or } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@template/core-typescript'
import { NotificationCategory, NotificationOrigin } from '@template/contracts-typescript/wire/enums'
import { notifications, notificationDeliveries } from '@template/contracts/db'

// ---------------------------------------------------------------------------
// Input — user-scoped paginated list. Optional `unreadOnly` filters to unread
// notifications; page/limit/search follow the standard contract.
// ---------------------------------------------------------------------------
export const ListNotificationsInputSchema = z.object({
	userId: z.string(),
	unreadOnly: z.boolean().optional(),
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(100).default(20),
	search: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Output — paginated list of notification items.
// ---------------------------------------------------------------------------
export const NotificationItemSchema = z.object({
	id: z.uuid(),
	title: z.string(),
	message: z.string(),
	category: z.enum(NotificationCategory),
	origin: z.enum(NotificationOrigin),
	read: z.boolean(),
	createdAt: z.iso.datetime({ offset: true }),
})

export const ListNotificationsOutputSchema = z.paginatedResponse({
	...NotificationItemSchema.shape,
})

/**
 * `ListNotifications` — header notifications list for the authenticated user.
 *
 * Reads `notify.notification_deliveries` (the per-recipient fan-out row that
 * carries `readAt`) joined to its source `notify.notifications` row. The
 * delivery is the user-scoped anchor; `read` is `readAt IS NOT NULL`.
 * `unreadOnly` filters to deliveries with no `readAt`; `search` does a
 * case-insensitive match on the notification title/content; newest first.
 */
@injectable()
export class ListNotifications extends Handler<typeof ListNotificationsInputSchema, typeof ListNotificationsOutputSchema> {
	readonly name = 'list_notifications' as const
	readonly inputSchema = ListNotificationsInputSchema
	readonly outputSchema = ListNotificationsOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const filters = [eq(notificationDeliveries.userId, input.userId)]
		if (input.unreadOnly) filters.push(isNull(notificationDeliveries.readAt))
		if (input.search) {
			const term = `%${input.search}%`
			const match = or(ilike(notifications.title, term), ilike(notifications.content, term))
			if (match) filters.push(match)
		}
		const where = and(...filters)

		const [{ value: total } = { value: 0 }] = await this.db
			.select({ value: count() })
			.from(notificationDeliveries)
			.innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
			.where(where)

		const rows = await this.db
			.select({
				// The inbox row IS the per-recipient DELIVERY — its id is what MarkNotificationRead
				// consumes (notificationDeliveryIds). Returning the source notification id here made
				// every mark-read a NOTIFICATION_DELIVERY_NOT_FOUND (caught by canonical e2e flow 5).
				id: notificationDeliveries.id,
				title: notifications.title,
				message: notifications.content,
				category: notifications.category,
				origin: notifications.origin,
				readAt: notificationDeliveries.readAt,
				createdAt: notifications.createdAt,
			})
			.from(notificationDeliveries)
			.innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
			.where(where)
			.orderBy(desc(notifications.createdAt))
			.limit(input.limit)
			.offset((input.page - 1) * input.limit)

		const items = rows.map(row => ({
			id: row.id,
			title: row.title,
			message: row.message,
			// `category`/`origin` are text columns holding the enum value verbatim.
			category: row.category as NotificationCategory,
			origin: row.origin as NotificationOrigin,
			read: row.readAt !== null,
			createdAt: row.createdAt.toISOString(),
		}))

		return { items, total, totalPages: Math.ceil(total / input.limit) }
	}
}
