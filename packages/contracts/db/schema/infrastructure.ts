import { pgSchema, uuid, text, timestamp, integer, jsonb, index, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const sharedSchema = pgSchema('shared')

export const events = sharedSchema.table(
	'events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(),
		// Nullable — some events (BillingWebhookReceivedEvent etc.) carry a
		// computed entityId for indexing; others don't have a meaningful one.
		// TEXT, not uuid: entity ids are whatever the owning aggregate mints — the billing engine
		// uses deterministic text ids ('native:<owner>:<ms>'), and a uuid column 22P02s on them
		// (origin-faithful: medscall's column is text).
		entityId: text('entity_id'),
		// Nullable — pure "something happened" events may have no actor owner.
		ownerId: text('owner_id'),
		payload: jsonb('payload').notNull(),
		source: text('source').notNull(),
		occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
	},
	t => ({
		entityIdx: index('events_entity_idx').on(t.entityId, t.occurredAt),
		nameIdx: index('events_name_idx').on(t.name, t.occurredAt),
		// Webhook-arrival idempotency: at most one billing.webhook.received row per
		// entity_id (= deterministic hash of platform + externalEventId). The
		// HandleBillingWebhook use case catches the unique-violation as the
		// idempotent-ack signal. Partial index keeps the constraint scoped to the
		// one event name that needs it; other events (which legitimately repeat
		// per entity_id, e.g. SubscriptionPaid every billing cycle) are unaffected.
		// Generalizable: any "received from external system" event with a dedupable
		// external id can add a sibling partial index here.
		billingWebhookReceivedUnq: uniqueIndex('events_billing_webhook_received_entity_unq')
			.on(t.entityId)
			.where(sql`name = 'billing.webhook.received'`),
	}),
)

export const outbox = sharedSchema.table(
	'outbox',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(),
		// TEXT for the same reason as events.entity_id — engine-minted ids are not uuids.
		entityId: text('entity_id'),
		ownerId: text('owner_id'),
		payload: jsonb('payload').notNull(),
		source: text('source').notNull(),
		processedAt: timestamp('processed_at', { withTimezone: true }),
		attempts: integer('attempts').notNull().default(0),
		lastError: text('last_error'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	t => ({
		unprocessedIdx: index('outbox_unprocessed_idx').on(t.source, t.processedAt, t.createdAt),
	}),
)

export const idempotencyKeys = sharedSchema.table(
	'idempotency_keys',
	{
		key: text('key').notNull(),
		scope: text('scope').notNull(),
		responseBody: jsonb('response_body'),
		responseStatus: integer('response_status'),
		// Nullable: a bare exactly-once latch (IdempotencyGuard.claim) inserts only (scope, key) and
		// never expires — medscall's permanent-dedup semantics. The column stays for a future
		// HTTP-idempotency-cache use (response_body/response_status + TTL sweep via idempotency_expires_idx),
		// where that caller supplies expires_at.
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	t => ({
		pk: primaryKey({ columns: [t.key, t.scope] }),
		expiresIdx: index('idempotency_expires_idx').on(t.expiresAt),
	}),
)

// Transactional command scheduling — the backing store for PostgresCommandQueue (the DB-backed
// CommandQueue driver, an alternative to the Redis/BullMQ broker). One row per pending command:
//  - `id` doubles as the dedup key (a caller-supplied jobId → ON CONFLICT DO NOTHING). It is text,
//    not uuid, because callers mint semantic ids (`repeat:<name>`, `reconcile:<chargeId>`).
//  - `run_at` is the "alarm": the poller only claims rows past it (partial index below).
//  - `lease_until` is the crash-safe claim — a worker leases a row while executing; an expired lease
//    makes the row claimable again (idempotent handlers make re-runs safe).
//  - `repeat_every_ms` marks a repeatable job (the periodic sweeps): on completion the row is
//    RE-ARMED (run_at = now + every) instead of deleted.
//  - one-shot success → row DELETED (transient, mirrors the outbox); failure → exponential backoff
//    until `max_attempts`, then dead-lettered via `dead_at` (kept for forensics, never re-claimed).
export const scheduledCommands = sharedSchema.table(
	'scheduled_commands',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		input: jsonb('input').notNull(),
		runAt: timestamp('run_at', { withTimezone: true }).notNull(),
		attempts: integer('attempts').notNull().default(0),
		maxAttempts: integer('max_attempts').notNull().default(3),
		leaseUntil: timestamp('lease_until', { withTimezone: true }),
		repeatEveryMs: integer('repeat_every_ms'),
		deadAt: timestamp('dead_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	t => ({
		dueIdx: index('scheduled_commands_due_idx').on(t.runAt).where(sql`dead_at IS NULL`),
	}),
)
