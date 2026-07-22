import { pgSchema, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'

/**
 * `gateway` — the Channel Gateway (BC1) schema (Go-owned read model).
 *
 * One table:
 *   - `channels` — one row per platform session (WhatsApp today), materialized
 *     from the gateway's domain lifecycle events by the Go status projectors
 *     (packages/api/go/internal/channel/). It is the source of truth for
 *     reconnection (`account_detail` = the paired account's canonical remote id)
 *     and backs the gateway's own list/get read endpoints.
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
