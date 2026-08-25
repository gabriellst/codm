import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, uniqueIndex, primaryKey, foreignKey } from 'drizzle-orm/sqlite-core'
import { ContactKind, ChannelKind, ChannelStatus, Direction, MessageType } from '../../../generated/typescript/src/wire/enums'
import { enumCheck } from './_enum'

/**
 * `gateway` (pgSchema namespace) → `gateway_*` table prefix. SQLite-dialect mirror
 * of db/schema/channel.ts — the Channel Gateway (BC1) read model, written ONLY by
 * the Go gateway worker. Child projections (remotes/messages/memberships) scope by
 * `channel_id`, not a denormalized owner_id (origin shape wins). Type map:
 * uuid→text, jsonb→text json, timestamptz→integer timestamp_ms, bigint→integer.
 */
export const channels = sqliteTable(
	'gateway_channels',
	{
		id: text('id').primaryKey(),

		// Already text on the pg side (Go domain authoritative; non-uuid test ids).
		ownerId: text('owner_id').notNull(),

		// ChannelKind (WHATSAPP | INTERNAL).
		platform: text('platform').$type<ChannelKind>().notNull(),
		name: text('name').notNull(),
		ownerRemoteId: text('owner_remote_id').notNull().default(''),
		// jsonb → sqlite json.
		credentials: text('credentials', { mode: 'json' }).notNull(),
		// ChannelStatus (CREATED | CONNECTING | CONNECTED | DISCONNECTED | DELETED).
		status: text('status').$type<ChannelStatus>().notNull(),

		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		// bigint → integer.
		version: integer('version').notNull().default(0),
	},
	t => [
		enumCheck('gateway_channels_platform_check', t.platform, Object.values(ChannelKind)),
		enumCheck('gateway_channels_status_check', t.status, Object.values(ChannelStatus)),
		index('idx_channels_owner_id').on(t.ownerId),
		index('idx_channels_owner_platform').on(t.ownerId, t.platform),
	],
)

export const remotes = sqliteTable(
	'gateway_remotes',
	{
		channelId: text('channel_id').notNull(),
		remoteId: text('remote_id').notNull(),

		// ContactKind (USER | GROUP | BROADCAST).
		type: text('type').$type<ContactKind>().notNull(),
		// ChannelKind — the platform this remote lives on.
		platform: text('platform').$type<ChannelKind>().notNull(),

		name: text('name').notNull().default(''),
		avatarUrl: text('avatar_url'),
		isBlocked: integer('is_blocked', { mode: 'boolean' }).notNull().default(false),

		pinnedAt: integer('pinned_at', { mode: 'timestamp_ms' }),
		archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
		muteExpiration: integer('mute_expiration', { mode: 'timestamp_ms' }),
		markedAsUnread: integer('marked_as_unread', { mode: 'boolean' }).notNull().default(false),
		unreadMessageCount: integer('unread_message_count').notNull().default(0),

		lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }),
		// uuid → text (bare pointer to messages.id, no enforced FK — faithful to source).
		lastMessageId: text('last_message_id'),

		deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
		// Projector-set (no default — faithful to origin migration 011).
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
		// bigint → integer.
		version: integer('version').notNull().default(0),
	},
	t => [
		primaryKey({ columns: [t.channelId, t.remoteId] }),
		enumCheck('gateway_remotes_type_check', t.type, Object.values(ContactKind)),
		enumCheck('gateway_remotes_platform_check', t.platform, Object.values(ChannelKind)),
		// sqlite-core has no column .desc()/.nullsLast(); order is expressed via raw SQL.
		// (pg used DESC NULLS LAST; on SQLite a NULL is smaller than any value, so DESC already
		// sorts NULLs last — the explicit clause is redundant and hurts older-SQLite portability.)
		index('idx_remotes_last_message_at').on(t.channelId, sql`${t.lastMessageAt} DESC`),
		index('idx_remotes_type').on(t.channelId, t.type),
		index('idx_remotes_pinned').on(t.channelId, sql`${t.pinnedAt} DESC`).where(sql`${t.pinnedAt} IS NOT NULL`),
		index('idx_remotes_avatar_missing').on(t.channelId, t.remoteId).where(sql`${t.avatarUrl} IS NULL AND ${t.deletedAt} IS NULL`),
	],
)

export const remoteMemberships = sqliteTable(
	'gateway_remote_memberships',
	{
		channelId: text('channel_id').notNull(),
		groupId: text('group_id').notNull(),
		memberId: text('member_id').notNull(),
		isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
		joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
	},
	t => [
		primaryKey({ columns: [t.channelId, t.groupId, t.memberId] }),
		// (channel_id, group_id) → remotes(channel_id, remote_id); deleting the group cascades members.
		foreignKey({
			columns: [t.channelId, t.groupId],
			foreignColumns: [remotes.channelId, remotes.remoteId],
		}).onDelete('cascade'),
	],
)

export const messages = sqliteTable(
	'gateway_messages',
	{
		id: text('id').primaryKey(),
		channelId: text('channel_id').notNull(),
		remoteId: text('remote_id').notNull(),
		platformMessageId: text('platform_message_id').notNull(),
		// Direction (SENT | RECEIVED).
		direction: text('direction').$type<Direction>().notNull(),
		// ChannelKind — the platform this message rode on.
		platform: text('platform').$type<ChannelKind>().notNull(),
		senderRemoteId: text('sender_remote_id').notNull(),
		// MessageType — discriminates the content union without parsing the JSON.
		// Nullable: rows projected before the column existed carry no type.
		messageType: text('message_type').$type<MessageType>(),
		// jsonb → sqlite json (opaque MessageType-discriminated content union).
		content: text('content', { mode: 'json' }).notNull(),

		occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
		observedAt: integer('observed_at', { mode: 'timestamp_ms' }).notNull(),
		deliveredAt: integer('delivered_at', { mode: 'timestamp_ms' }),
		seenAt: integer('seen_at', { mode: 'timestamp_ms' }),
		editedAt: integer('edited_at', { mode: 'timestamp_ms' }),
		deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
		// bigint → integer.
		version: integer('version').notNull().default(0),
	},
	t => [
		enumCheck('gateway_messages_direction_check', t.direction, Object.values(Direction)),
		enumCheck('gateway_messages_platform_check', t.platform, Object.values(ChannelKind)),
		enumCheck('gateway_messages_message_type_check', t.messageType, Object.values(MessageType)),
		uniqueIndex('idx_messages_channel_platform').on(t.channelId, t.platformMessageId),
		index('idx_messages_remote').on(t.channelId, t.remoteId, sql`${t.occurredAt} DESC`),
		index('idx_messages_channel').on(t.channelId, sql`${t.occurredAt} DESC`),
		index('idx_messages_channel_remote_occurred').on(t.channelId, t.remoteId, sql`${t.occurredAt} DESC`).where(sql`${t.deletedAt} IS NULL`),
	],
)
