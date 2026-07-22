import { sql } from 'drizzle-orm'
import {
	pgSchema,
	uuid,
	text,
	timestamp,
	index,
	uniqueIndex,
	boolean,
	integer,
	bigint,
	jsonb,
	primaryKey,
	foreignKey,
} from 'drizzle-orm/pg-core'
// Enum column types — single-sourced from the generated wire binding (type-only, erased at compile).
import type { ContactKind, ChannelKind, Direction } from '../../generated/typescript/src/wire/enums'

/**
 * `gateway` — the Channel Gateway (BC1) schema (Go-owned read model).
 *
 * Tables:
 *   - `channels` — one row per platform session (WhatsApp today), materialized
 *     from the gateway's domain lifecycle events by the Go status projectors
 *     (packages/api/go/internal/channel/). It is the source of truth for
 *     reconnection (`account_detail` = the paired account's canonical remote id)
 *     and backs the gateway's own list/get read endpoints.
 *   - `remotes` — the contact / group / broadcast projection, one row per remote
 *     per channel. Driven by remote_created/updated/deleted + the message/receipt
 *     lifecycle (unread + preview pointers). Ports medscall channel migrations
 *     011/014/015.
 *   - `remote_memberships` — group-member edges (channel_id, group_id, member_id),
 *     FK-cascaded off `remotes`. Ports medscall migration 011.
 *   - `messages` — the FULL message projection (founder mandate: it returns).
 *     One row per platform message; content is opaque JSONB; receipt watermarks
 *     (delivered_at/seen_at) + edit/delete tombstones ride the same row. It
 *     COEXISTS with BC4's thread.consumed_messages dedup ledger — that ledger
 *     stays authoritative for exactly-once ingestion; this table is the read model.
 *     Ports medscall channel migrations 012/014/015.
 *
 * **Scoping:** faithful to medscall, the child projections are scoped by
 * `channel_id` (the tenant/session axis), NOT by a denormalized owner_id — the
 * owner lives on the parent `channels` row and is reached by join. The source
 * never carried owner_id on remotes/messages, and "medscall shapes win".
 *
 * **Ownership:** written ONLY by the Go gateway worker. The whatsmeow session
 * store (the `whatsmeow_*` tables) is created and owned by the whatsmeow
 * sqlstore itself — deliberately NOT modeled here.
 *
 * The migration lives in packages/contracts because Drizzle is the canonical
 * migration source for the whole monorepo; the Go embedded migrations dir is
 * reserved for test fixtures.
 */
export const gatewaySchema = pgSchema('gateway')

export const channels = gatewaySchema.table(
	'channels',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		// Single-operator daemon: the ownerId axis is collapsed to one constant.
		ownerId: uuid('owner_id').notNull(),

		// wire.ChannelKind — WHATSAPP | INSTAGRAM_DM | TELEGRAM. Stored as the raw
		// frozen enum value, not a local pgEnum mirror (cross-boundary enum canon).
		kind: text('kind').notNull(),

		// wire.ChannelStatus — DISCONNECTED | PAIRING | CONNECTED.
		status: text('status').notNull().default('DISCONNECTED'),

		// The paired account's canonical remote id (phone JID for WhatsApp), used
		// to rebuild the whatsmeow device on reconnect. Empty until first pairing.
		accountDetail: text('account_detail').notNull().default(''),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	t => ({
		// Get-or-create keys off (owner, kind): one session per platform per operator.
		ownerKindIdx: index('channels_owner_kind_idx').on(t.ownerId, t.kind),
	}),
)

/**
 * `remotes` — the contact / group / broadcast projection. One row per remote per
 * channel, keyed (channel_id, remote_id). Ports medscall channel migrations
 * 011/014/015. Written by the Go remoteProjector from remote_created/updated/deleted
 * plus the message + receipt lifecycle (unread counter + preview pointers).
 */
export const remotes = gatewaySchema.table(
	'remotes',
	{
		channelId: uuid('channel_id').notNull(),
		// Channel-native remote id (phone JID / group id / broadcast id) — opaque TEXT, not a uuid.
		remoteId: text('remote_id').notNull(),

		// wire.ContactKind — CONTACT | GROUP | BROADCAST (harmonized from medscall RemoteType).
		type: text('type').$type<ContactKind>().notNull(),
		// wire.ChannelKind — the platform this remote lives on.
		platform: text('platform').$type<ChannelKind>().notNull(),

		name: text('name').notNull().default(''),
		// NULL/absent avatar is modeled by NULL (source uses empty string in Go; column is nullable).
		avatarUrl: text('avatar_url'),
		isBlocked: boolean('is_blocked').notNull().default(false),

		// Sidebar/control-plane state (mirrors medscall Remote projection).
		pinnedAt: timestamp('pinned_at', { withTimezone: true }),
		archived: boolean('archived').notNull().default(false),
		muteExpiration: timestamp('mute_expiration', { withTimezone: true }),
		markedAsUnread: boolean('marked_as_unread').notNull().default(false),
		unreadMessageCount: integer('unread_message_count').notNull().default(0),

		// Latest-message preview pointers (only ever move forward). last_message_id anchors the
		// sidebar preview to a messages.id (no enforced FK — source added it as a bare uuid in 014).
		lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
		lastMessageId: uuid('last_message_id'),

		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		// created_at/updated_at are projector-set (no DB default — faithful to medscall 011).
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
		// Optimistic-concurrency counter for the find -> applyEvent -> save path.
		version: bigint('version', { mode: 'number' }).notNull().default(0),
	},
	t => ({
		pk: primaryKey({ columns: [t.channelId, t.remoteId] }),
		lastMessageAtIdx: index('idx_remotes_last_message_at').on(t.channelId, t.lastMessageAt.desc().nullsLast()),
		typeIdx: index('idx_remotes_type').on(t.channelId, t.type),
		pinnedIdx: index('idx_remotes_pinned')
			.on(t.channelId, t.pinnedAt.desc().nullsLast())
			.where(sql`${t.pinnedAt} IS NOT NULL`),
		avatarMissingIdx: index('idx_remotes_avatar_missing')
			.on(t.channelId, t.remoteId)
			.where(sql`${t.avatarUrl} IS NULL AND ${t.deletedAt} IS NULL`),
	}),
)

/**
 * `remote_memberships` — group-member edges. Keyed (channel_id, group_id, member_id),
 * FK-cascaded off the group's `remotes` row. Ports medscall channel migration 011.
 * Written by the Go membershipProjector from membership_added/removed.
 */
export const remoteMemberships = gatewaySchema.table(
	'remote_memberships',
	{
		channelId: uuid('channel_id').notNull(),
		groupId: text('group_id').notNull(),
		memberId: text('member_id').notNull(),
		isAdmin: boolean('is_admin').notNull().default(false),
		joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
	},
	t => ({
		pk: primaryKey({ columns: [t.channelId, t.groupId, t.memberId] }),
		// (channel_id, group_id) references the group remote; deleting the group cascades its members.
		groupFk: foreignKey({
			columns: [t.channelId, t.groupId],
			foreignColumns: [remotes.channelId, remotes.remoteId],
		}).onDelete('cascade'),
	}),
)

/**
 * `messages` — the FULL message projection (founder mandate: it returns). One row
 * per platform message, keyed by a synthetic `id` (uuid) with a UNIQUE (channel_id,
 * platform_message_id) idempotency latch. Content is opaque JSONB; receipt watermarks
 * (delivered_at / seen_at) and edit/delete tombstones ride the same row. Ports
 * medscall channel migrations 012/014/015. COEXISTS with thread.consumed_messages —
 * that ledger stays authoritative for exactly-once ingestion; this is the read model.
 */
export const messages = gatewaySchema.table(
	'messages',
	{
		id: uuid('id').primaryKey(),
		channelId: uuid('channel_id').notNull(),
		remoteId: text('remote_id').notNull(),
		// Platform-native message id (WhatsApp message id, etc.) — opaque TEXT.
		platformMessageId: text('platform_message_id').notNull(),
		// wire.Direction — SENT | RECEIVED (derived by the projector from the driving event).
		direction: text('direction').$type<Direction>().notNull(),
		// wire.ChannelKind — the platform this message rode on.
		platform: text('platform').$type<ChannelKind>().notNull(),
		// Channel-native sender id (source column renamed from sender_jid in medscall 015).
		senderRemoteId: text('sender_remote_id').notNull(),
		// The MessageType-discriminated content union, stored opaque (carried as contentJson on the wire).
		content: jsonb('content').notNull(),

		occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
		observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
		// Receipt watermarks — advanced by delivered/seen events; NULL until the receipt arrives.
		deliveredAt: timestamp('delivered_at', { withTimezone: true }),
		seenAt: timestamp('seen_at', { withTimezone: true }),
		// Edit overlay + soft-delete tombstone.
		editedAt: timestamp('edited_at', { withTimezone: true }),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		version: bigint('version', { mode: 'number' }).notNull().default(0),
	},
	t => ({
		channelPlatformUnq: uniqueIndex('idx_messages_channel_platform').on(t.channelId, t.platformMessageId),
		remoteIdx: index('idx_messages_remote').on(t.channelId, t.remoteId, t.occurredAt.desc()),
		channelIdx: index('idx_messages_channel').on(t.channelId, t.occurredAt.desc()),
		// Live-preview lookup: latest non-deleted message per remote (medscall 014).
		channelRemoteOccurredIdx: index('idx_messages_channel_remote_occurred')
			.on(t.channelId, t.remoteId, t.occurredAt.desc())
			.where(sql`${t.deletedAt} IS NULL`),
	}),
)
