import { sql } from 'drizzle-orm'
import { pgSchema, text, integer, jsonb, timestamp, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core'

/**
 * `shared_*` no dialeto **pg** — o KERNEL: event store, outbox-as-transport, ledger de idempotência
 * e a fila de comandos.
 *
 * ESTE É O ÚNICO ARQUIVO DO TRONCO CLOUD QUE TEM GÊMEO EXATO no tronco SQLite
 * (`db/schema/infrastructure.ts`), e o ADR 0005 explica por quê: estas quatro tabelas não pertencem
 * a um contexto de negócio, e sim à mecânica da transação. Todo deployment que roda um `UnitOfWork`
 * e um `OutboxDispatcher` precisa delas — que é a mesma razão pela qual `shared` é o único contexto
 * DUAL na `PLACEMENT` do ADR 0002.
 *
 * Não é duplicação: é a mesma declaração emitida em dois dialetos. E é exatamente por isso que ela
 * ganha gate — `tests/architecture/trunk-parity.test.ts` compara as duas formas lógicas, porque a
 * primeira coluna acrescentada de um lado só apareceria em produção.
 *
 * Mapa de tipos, inverso do que o gêmeo documenta: text→text · integer{timestamp_ms}→timestamptz ·
 * text{json}→jsonb · integer{boolean}→boolean.
 *
 * `$defaultFn(() => new Date())` é mantido em vez de `defaultNow()` DE PROPÓSITO: o default é da
 * aplicação nos dois troncos, então o valor escrito tem a mesma origem. Um `defaultNow()` aqui
 * moveria o default para o banco de um lado só e faria as duas tabelas divergirem justamente na
 * coluna que o gate compara.
 */
/** O namespace nativo do kernel — ver o docblock de `auth.ts` para o porquê da T1.9. */
export const sharedSchema = pgSchema('shared')

export const events = sharedSchema.table(
	'events',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		// TEXT (not uuid) — entity ids are whatever the owning aggregate mints.
		entityId: text('entity_id'),
		ownerId: text('owner_id'),
		payload: jsonb('payload').notNull(),
		source: text('source').notNull(),
		occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => [
		index('events_entity_idx').on(t.entityId, t.occurredAt),
		index('events_name_idx').on(t.name, t.occurredAt),
		// Webhook-arrival idempotency: at most one billing.webhook.received row per entity_id.
		uniqueIndex('events_billing_webhook_received_entity_unq').on(t.entityId).where(sql`name = 'billing.webhook.received'`),
	],
)

export const outbox = sharedSchema.table(
	'outbox',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		entityId: text('entity_id'),
		ownerId: text('owner_id'),
		payload: jsonb('payload').notNull(),
		source: text('source').notNull(),
		processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
		attempts: integer('attempts').notNull().default(0),
		lastError: text('last_error'),
		// QUANDO o evento MORREU — ver o docblock gêmeo em `db/schema/infrastructure.ts` (sqlite) para
		// o porquê. Mesmo nome, mesmo papel, mesma semântica que `scheduled_commands.dead_at` acima.
		deadAt: timestamp('dead_at', { withTimezone: true, mode: 'date' }),
		// Lease-based claim (NO consumer-groups): a consumer claims a batch by stamping claimedBy (an
		// opaque per-claim token) and leaseUntil (now + lease). A row is (re)claimable while
		// processedAt IS NULL AND (leaseUntil IS NULL OR leaseUntil < now) — so a crashed consumer's
		// lease simply expires and the row is redelivered. at-least-once transport + idempotent
		// handler + dedup UNIQUE at destination = exactly-once.
		claimedBy: text('claimed_by'),
		leaseUntil: timestamp('lease_until', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => [
		index('outbox_unprocessed_idx').on(t.source, t.processedAt, t.createdAt),
		// Serves the claim scan (source + unprocessed + lease).
		index('outbox_claim_idx').on(t.source, t.processedAt, t.leaseUntil),
	],
)

export const idempotencyKeys = sharedSchema.table(
	'idempotency_keys',
	{
		key: text('key').notNull(),
		scope: text('scope').notNull(),
		responseBody: jsonb('response_body'),
		responseStatus: integer('response_status'),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => [primaryKey({ columns: [t.key, t.scope] }), index('idempotency_expires_idx').on(t.expiresAt)],
)

/**
 * `scheduled_commands` — DB-backed CommandQueue. `id` doubles as the dedup key
 * (semantic text ids); `run_at` is the alarm; `lease_until` is the crash-safe
 * claim; `repeat_every_ms` marks a re-armed periodic job.
 */
export const scheduledCommands = sharedSchema.table(
	'scheduled_commands',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		input: jsonb('input').notNull(),
		runAt: timestamp('run_at', { withTimezone: true, mode: 'date' }).notNull(),
		attempts: integer('attempts').notNull().default(0),
		maxAttempts: integer('max_attempts').notNull().default(3),
		leaseUntil: timestamp('lease_until', { withTimezone: true, mode: 'date' }),
		repeatEveryMs: integer('repeat_every_ms'),
		deadAt: timestamp('dead_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => [index('scheduled_commands_due_idx').on(t.runAt).where(sql`dead_at IS NULL`)],
)
