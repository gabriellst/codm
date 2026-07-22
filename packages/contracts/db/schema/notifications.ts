import { pgSchema, uuid, text, timestamp, integer, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * `notifications` — the Notifications context schema (in-app alerts, daily digests, operational
 * warnings). The former legacy `notifications` pgSchema (legacy push tables) was purged in W3
 * and the historical short-schema naming collapsed onto the plain names.
 *
 * Two tables:
 *   - `notifications`           — source notification rows
 *                                 (creator-bound; one per Send call).
 *   - `notification_deliveries` — per-recipient × channel fan-out rows
 *                                 (one per (notificationId, userId,
 *                                 channel) tuple — `readAt` stamped on
 *                                 mark-read).
 *
 * **Conceptual model:** the notifications row is creator-bound (one
 * per Send call) and carries the content + metadata once; deliveries
 * fan it out across recipients × channels — the Notification +
 * NotificationDelivery entity split.
 */
export const notificationsSchema = pgSchema('notifications')

export const notifications = notificationsSchema.table(
	'notifications',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		title: text('title').notNull(),
		content: text('content').notNull(),

		// NotificationCategory enum value.
		category: text('category').notNull(),
		// NotificationOrigin enum value.
		origin: text('origin').notNull(),

		important: boolean('important').notNull().default(false),
		// MIME-style content type; defaults to text/plain. Used by the
		// app shell to decide whether to render the body as markdown,
		// html, etc.
		contentType: text('content_type').notNull().default('text/plain'),

		// Free-form per-category metadata (e.g. {entityId, entityType}
		// for an order-event notification). The entity schema validates
		// it as `Record<string, unknown>`.
		payload: jsonb('payload').notNull().default({}),

		// Nullable for global notifications (system announcements with
		// no owner scope). Owner-scoped notifications carry the ownerId
		// here so list queries can filter by current-owner.
		ownerId: uuid('owner_id'),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		// Owner-scoped listings (T13 GetNotifications).
		ownerIdx: index('notifications_owner_id_idx').on(t.ownerId),
		// Newest-first scans for the global digest job.
		createdAtIdx: index('notifications_created_at_idx').on(t.createdAt),
		categoryIdx: index('notifications_category_idx').on(t.category),
		originIdx: index('notifications_origin_idx').on(t.origin),
	}),
)

export const notificationDeliveries = notificationsSchema.table(
	'notification_deliveries',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		notificationId: uuid('notification_id')
			.notNull()
			.references(() => notifications.id, { onDelete: 'cascade' }),

		// Recipient of this delivery (no FK to users — User table is
		// BetterAuth-owned and deliveries must survive user deletions).
		userId: text('user_id').notNull(),

		// NotificationChannel enum value (IN_APP | EMAIL | PUSH | …).
		channel: text('channel').notNull(),

		deliveredAt: timestamp('delivered_at', { withTimezone: true }).notNull(),
		readAt: timestamp('read_at', { withTimezone: true }),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		// Dedupe: at most one delivery per (notification, user, channel).
		notificationUserChannelUnq: uniqueIndex('notification_deliveries_notification_user_channel_unq').on(
			t.notificationId,
			t.userId,
			t.channel,
		),
		// Per-user inbox listings (T14 GetMyNotifications). Filter by
		// readAt IS NULL for the "unread" badge.
		userReadAtIdx: index('notification_deliveries_user_read_at_idx').on(t.userId, t.readAt),
		notificationIdx: index('notification_deliveries_notification_id_idx').on(t.notificationId),
	}),
)
