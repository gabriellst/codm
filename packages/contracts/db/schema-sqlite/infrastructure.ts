import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core'

/**
 * `shared` (pgSchema namespace) → `shared_*` table prefix. SQLite-dialect mirror of
 * db/schema/infrastructure.ts — the event store, outbox-as-transport, idempotency
 * ledger, and DB-backed command queue that `core-go` builds the SqlExternalMediator
 * on. Type map: uuid→text, jsonb→text json, timestamptz→integer timestamp_ms.
 */
export const events = sqliteTable(
	'shared_events',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		// TEXT (not uuid) — entity ids are whatever the owning aggregate mints.
		entityId: text('entity_id'),
		ownerId: text('owner_id'),
		payload: text('payload', { mode: 'json' }).notNull(),
		source: text('source').notNull(),
		occurredAt: integer('occurred_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => ({
		entityIdx: index('events_entity_idx').on(t.entityId, t.occurredAt),
		nameIdx: index('events_name_idx').on(t.name, t.occurredAt),
		// Webhook-arrival idempotency: at most one billing.webhook.received row per entity_id.
		billingWebhookReceivedUnq: uniqueIndex('events_billing_webhook_received_entity_unq')
			.on(t.entityId)
			.where(sql`name = 'billing.webhook.received'`),
	}),
)

export const outbox = sqliteTable(
	'shared_outbox',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		entityId: text('entity_id'),
		ownerId: text('owner_id'),
		payload: text('payload', { mode: 'json' }).notNull(),
		source: text('source').notNull(),
		processedAt: integer('processed_at', { mode: 'timestamp_ms' }),
		attempts: integer('attempts').notNull().default(0),
		lastError: text('last_error'),
		// Lease-based claim (go-domain-design.md §3(c), NO consumer-groups): a
		// consumer claims a batch by stamping claimedBy (an opaque per-claim token)
		// and leaseUntil (now + lease). A row is (re)claimable while processedAt IS
		// NULL AND (leaseUntil IS NULL OR leaseUntil < now) — so a crashed consumer's
		// lease simply expires and the row is redelivered. at-least-once transport +
		// idempotent handler + dedup UNIQUE at destination = exactly-once.
		claimedBy: text('claimed_by'),
		leaseUntil: integer('lease_until', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => ({
		unprocessedIdx: index('outbox_unprocessed_idx').on(t.source, t.processedAt, t.createdAt),
		// Serves the SqlExternalMediator claim scan (source + unprocessed + lease).
		claimIdx: index('outbox_claim_idx').on(t.source, t.processedAt, t.leaseUntil),
	}),
)

export const idempotencyKeys = sqliteTable(
	'shared_idempotency_keys',
	{
		key: text('key').notNull(),
		scope: text('scope').notNull(),
		responseBody: text('response_body', { mode: 'json' }),
		responseStatus: integer('response_status'),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => ({
		pk: primaryKey({ columns: [t.key, t.scope] }),
		expiresIdx: index('idempotency_expires_idx').on(t.expiresAt),
	}),
)

/**
 * `scheduled_commands` — DB-backed CommandQueue. `id` doubles as the dedup key
 * (semantic text ids); `run_at` is the alarm; `lease_until` is the crash-safe
 * claim; `repeat_every_ms` marks a re-armed periodic job.
 */
export const scheduledCommands = sqliteTable(
	'shared_scheduled_commands',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		input: text('input', { mode: 'json' }).notNull(),
		runAt: integer('run_at', { mode: 'timestamp_ms' }).notNull(),
		attempts: integer('attempts').notNull().default(0),
		maxAttempts: integer('max_attempts').notNull().default(3),
		leaseUntil: integer('lease_until', { mode: 'timestamp_ms' }),
		repeatEveryMs: integer('repeat_every_ms'),
		deadAt: integer('dead_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => ({
		dueIdx: index('scheduled_commands_due_idx').on(t.runAt).where(sql`dead_at IS NULL`),
	}),
)
