import { pgSchema, text, integer, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core'
// QuotaKey column type — single-sourced from the generated wire binding (type-only import: erased at
// compile, no package cycle). The closed set lives in packages/contracts wire enums, never mirrored here.
import type { QuotaKey } from '../../generated/typescript/src/wire/enums'

// The `quota` bounded context owns its own pgSchema (NOT folded into billing): @quota owns the
// override ledger + pending-selection map end to end (entity, repo, usecase, table). Ported from
// medscall@f04e8a0f (`packages/api/src/shared/db/drizzle/schema/quota.ts`).
export const quotaSchema = pgSchema('quota')

// quota_overrides — the NATIVE, effective quota-override ledger (owned by @quota). Each row is one
// operator-applied grant; `delta` is signed. QuotaEntitlement SUMs `delta` per owner+meter to RAISE
// the effective included/limit, so an override actually loosens enforcement. `idem_key` is UNIQUE →
// apply is idempotent (onConflictDoNothing). `meter` is the QuotaKey enum stringified.
export const quotaOverride = quotaSchema.table('quota_overrides', {
	id: text('id').primaryKey(),
	ownerId: text('owner_id').notNull(),
	meter: text('meter').$type<QuotaKey>().notNull(),
	delta: integer('delta').notNull(),
	idemKey: text('idem_key').notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// pending_selections — the generic per-quota-key "keep" selection captured atomically at downgrade
// request time (opaque resource ids, keyed by QuotaKey). The mechanism is generic (any
// `ResourceGovernorRegistry`-registered key), not resource-specific. PK (owner_id, quota_key).
export const pendingSelections = quotaSchema.table(
	'pending_selections',
	{
		ownerId: text('owner_id').notNull(),
		quotaKey: text('quota_key').$type<QuotaKey>().notNull(),
		keptIds: jsonb('kept_ids').$type<string[]>().default([]).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	},
	table => [primaryKey({ columns: [table.ownerId, table.quotaKey] })],
)
