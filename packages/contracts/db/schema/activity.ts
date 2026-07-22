import { pgSchema, uuid, text, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * `activity` — the Activity context schema (Go-owned read model).
 *
 * One table:
 *   - `activity_entries` — owner-scoped activity-feed projection maintained by the Go
 *     `ActivityEntryProjector` (packages/api/go/internal/activity/). Each row is one logical
 *     fact — `(ownerId, eventName, entityId)` — deduplicated on redelivery; repeated
 *     occurrences of the same fact advance `lastOccurredAt` (forward-only) and bump
 *     `occurrenceCount` instead of inserting a new row.
 *
 * **Ownership:** written ONLY by the Go worker (projection canon: InsertIfNew /
 * find → ApplyOccurrence → save). The migration lives here because Drizzle
 * (packages/contracts) is the canonical migration source for the whole monorepo —
 * the Go embedded migrations dir is reserved for test fixtures.
 */
export const activitySchema = pgSchema('activity')

export const activityEntries = activitySchema.table(
	'activity_entries',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		// Owner scope — every read is filtered by the session-resolved owner.
		ownerId: uuid('owner_id').notNull(),

		// Wire discriminator of the integration event that produced this entry
		// (e.g. `integration.billing.subscription_changed`). Stored as the raw
		// wire name — NOT a local enum mirror of the cross-boundary event set.
		eventName: text('event_name').notNull(),

		// Envelope entityId of the source aggregate (opaque to this context).
		entityId: uuid('entity_id').notNull(),

		// First and latest time the fact occurred (from the event envelope).
		// `lastOccurredAt` only moves forward — out-of-order deliveries are ignored.
		firstOccurredAt: timestamp('first_occurred_at', { withTimezone: true }).notNull(),
		lastOccurredAt: timestamp('last_occurred_at', { withTimezone: true }).notNull(),

		// How many distinct occurrences collapsed into this row.
		occurrenceCount: integer('occurrence_count').notNull().default(1),

		// When the projector first materialized the row.
		recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),

		version: integer('version').notNull().default(1),
	},
	t => ({
		// Dedupe: one row per logical fact. InsertIfNew conflicts on this index.
		ownerEventEntityUnq: uniqueIndex('activity_entries_owner_event_entity_unq').on(
			t.ownerId,
			t.eventName,
			t.entityId,
		),
		// Owner-scoped newest-first listings (GET /activity/entries).
		ownerLastOccurredAtIdx: index('activity_entries_owner_last_occurred_at_idx').on(t.ownerId, t.lastOccurredAt),
	}),
)
