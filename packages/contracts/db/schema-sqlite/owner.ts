import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { OwnerKind } from '../../generated/typescript/src/wire/enums'
import { enumCheck } from './_enum'

/**
 * `owner` (pgSchema namespace) → `owner_*` table prefix. The generic tenancy axis:
 * every canonical row is scoped to an `owner_id`. SQLite-dialect mirror of
 * db/schema/owner.ts. Type map (decision (a)): uuid→text, timestamptz→integer
 * timestamp_ms, enum→text + CHECK.
 */
export const owners = sqliteTable(
	'owner_owners',
	{
		id: text('id').primaryKey(),

		name: text('name').notNull(),

		// OwnerKind wire enum (ORGANIZATION | INDIVIDUAL). text + CHECK.
		kind: text('kind').$type<OwnerKind>().notNull(),

		responsibleUserId: text('responsible_user_id').notNull(),
		pictureUrl: text('picture_url'),
		timezone: text('timezone'),

		isDisabled: integer('is_disabled', { mode: 'boolean' }).notNull().default(false),
		disabledReason: text('disabled_reason'),

		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		kindCheck: enumCheck('owner_owners_kind_check', t.kind, Object.values(OwnerKind)),
		isDisabledIdx: index('owners_is_disabled_idx').on(t.isDisabled),
		responsibleUserIdx: index('owners_responsible_user_id_idx').on(t.responsibleUserId),
	}),
)
