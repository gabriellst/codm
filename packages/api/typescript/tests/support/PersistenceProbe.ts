import { and, getTableColumns, is, sql, type SQL } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { DrizzleClient } from '@codedm/core-typescript'
import * as schema from '@codedm/contracts/db'

export type PersistedEventRow = typeof schema.events.$inferSelect
export type OutboxRow = typeof schema.outbox.$inferSelect

export interface EventRowFilter {
	name?: string
	ownerId?: string
	entityId?: string
}

export interface OutboxRowFilter {
	name?: string
	ownerId?: string
}

type SchemaBarrel = typeof schema

/**
 * The Postgres schema a Drizzle table lives in, read straight off its type. Drizzle encodes the
 * `pgSchema(...)` name in the table's phantom `_.schema` (a string literal); a bare `pgTable(...)`
 * has none, so it collapses to `'public'`. This is the type-level twin of the runtime
 * `getTableConfig(table).schema ?? 'public'` used to build `PROBE_TABLES` — the two MUST agree, and
 * a `@ts-expect-error` test proves the union they produce is exact.
 */
type SchemaOf<T> = T extends { _: { schema: infer S } } ? ([S] extends [string] ? S : 'public') : 'public'

/**
 * Central table registry — TEST-INFRA ONLY. Every `PgTable` exported by the `@codedm/contracts/db`
 * barrel is a valid probe key, namespaced `<pgSchema>.<export>` (`'shared.events'`,
 * `'billing.subscription'`, `'sales.orders'`...) so tables in different Postgres schemas can
 * never collide on export name. This is a LITERAL union (not `string`) derived from the barrel's own
 * type — a typo'd key is a compile error, not a silently-`undefined` runtime lookup. A new bounded
 * context that adds tables to a schema module (re-exported through the barrel) grows `ProbeTable` —
 * and therefore `count()`/`snapshot()` — for free; no change to this file.
 *
 * Why the barrel and not one `import * as` per schema module (as the medscall origin did): in this
 * template the schema lives in a SEPARATE package (`@codedm/contracts`) while `api/typescript` is a
 * `composite` TS project. A relative import into `packages/contracts/db/schema/*.ts` pulls those
 * source files into this composite project and trips `TS6307` (file not in the project's `include`),
 * and the package only publishes the flat `./db` barrel in its `exports` map — so per-module imports
 * aren't reachable by specifier either. The barrel is the one seam that resolves as an external
 * dependency; the module namespace medscall got from the folder layout, we recover from each table's
 * own `pgSchema` name (which is the more precise boundary anyway — `shared.events` here matches the
 * origin's key exactly, even though the file was renamed `infrastructure.ts`).
 */
export type ProbeTable = {
	[K in keyof SchemaBarrel]: SchemaBarrel[K] extends PgTable ? `${SchemaOf<SchemaBarrel[K]>}.${K & string}` : never
}[keyof SchemaBarrel]

/**
 * Runtime counterpart of `ProbeTable` — flattens the barrel into `{ 'shared.events': events,
 * 'billing.subscription': subscription, ... }`, filtering out every non-table export
 * (pgSchema handles, pgEnum handles, `relations()` results) via `is(x, PgTable)` and reading each
 * table's schema with `getTableConfig(...).schema`. The cast on the final assignment is the SINGLE,
 * DOCUMENTED, unavoidable boundary cast in this file: `Object.entries`/`flatMap` widen the key back
 * to `string` at the runtime level even though the `is()` filter guarantees every value is a
 * `PgTable` and the key is provably one of the `ProbeTable` literals computed above — TypeScript has
 * no way to carry a per-entry literal key through a dynamic `flatMap` without this. No `as any`
 * anywhere in this file.
 */
const PROBE_TABLES = Object.fromEntries(
	// Widen to `[string, unknown][]` up front: the barrel's value union includes pgSchema handles,
	// pgEnums and `relations()` results, none assignable to `PgTable`, which would make the
	// `entry is [string, PgTable]` guard's asserted type non-assignable to the parameter. `unknown`
	// is the honest input type for a runtime `is()` narrowing.
	(Object.entries(schema) as [string, unknown][])
		.filter((entry): entry is [string, PgTable] => is(entry[1], PgTable))
		.map(([exportName, table]) => [`${getTableConfig(table).schema ?? 'public'}.${exportName}`, table] as const),
) as Record<ProbeTable, PgTable>

/**
 * The ONLY test-support seam authorized to resolve `DrizzleClient` for READS. Assertions on
 * persisted events, outbox rows, and cross-table invariant snapshots go through here instead of
 * every test file importing raw schema tables + `eq`/`and` itself.
 *
 * See `tests/architecture/README.md` — "Reading Persisted State" for the convention this enforces,
 * the 4-category taxonomy it belongs to, and the named exceptions (schema-drift tests,
 * `Drizzle*Repository.test.ts`, DB-transactional service tests).
 *
 * Integration-mode only (PGlite). Get one via `testBed.probe()` — the factory throws a clear error
 * in mock mode instead of handing back a probe that would blow up on first query.
 *
 * This class is deliberately generic across EVERY bounded context's schema (not billing-specific) —
 * see `PROBE_TABLES` above. There is no curated, hand-picked table list — callers that want a fixed
 * multi-table tuple declare it inline at the call site:
 * `probe.snapshot(['shared.events', 'shared.outbox'] as const)`.
 */
export class PersistenceProbe {
	constructor(private readonly db: DrizzleClient) {}

	/** Rows from the permanent `events` audit log, optionally filtered by name/owner/entity. */
	async persistedEvents(filter?: EventRowFilter): Promise<PersistedEventRow[]> {
		const conditions = PersistenceProbe.eventConditions(filter)
		return conditions ? this.db.select().from(schema.events).where(conditions) : this.db.select().from(schema.events)
	}

	/** Rows from the transient `outbox` dispatch queue, optionally filtered by name/owner. */
	async outboxRows(filter?: OutboxRowFilter): Promise<OutboxRow[]> {
		const conditions = PersistenceProbe.outboxConditions(filter)
		return conditions ? this.db.select().from(schema.outbox).where(conditions) : this.db.select().from(schema.outbox)
	}

	/**
	 * Row count for ANY registered `ProbeTable` (namespaced `<pgSchema>.<export>` key). Filtering is
	 * generic — not every table has a `name`/`ownerId` column, so both filter keys are applied only
	 * when the target table actually declares that column (checked dynamically via
	 * `getTableColumns()`; a filter key with no matching column on the table is silently a no-op,
	 * same as passing no filter for that key). For richer per-table filters (e.g. `entityId` on
	 * events), use the dedicated `persistedEvents()`/`outboxRows()` methods.
	 */
	async count(table: ProbeTable, filter?: { name?: string; ownerId?: string }): Promise<number> {
		const target = PROBE_TABLES[table]
		const columns = getTableColumns(target)
		const conditions: SQL[] = []

		const nameColumn = columns.name
		if (filter?.name != null && nameColumn) conditions.push(sql`${nameColumn} = ${filter.name}`)

		const ownerIdColumn = columns.ownerId
		if (filter?.ownerId != null && ownerIdColumn) conditions.push(sql`${ownerIdColumn} = ${filter.ownerId}`)

		const rows =
			conditions.length > 0
				? await this.db
						.select()
						.from(target)
						.where(and(...conditions))
				: await this.db.select().from(target)

		return rows.length
	}

	/**
	 * TYPED cross-table snapshot — the general form of the "prove the job never wrote table X"
	 * pattern. The return type is derived from the literal tuple passed in:
	 * `snapshot(['shared.events', 'shared.outbox'] as const)` resolves to
	 * `{ 'shared.events': number; 'shared.outbox': number }` — a typo'd key is a compile error, not a
	 * silently-`undefined` runtime lookup. Always unfiltered (full-table count); pass a `filter` to
	 * `count()` directly when a scoped comparison is needed.
	 *
	 * Comparable before/after a job run with `toEqual`. A job that must prove it never touched another
	 * table just adds it to the inline tuple:
	 * `probe.snapshot(['shared.events', 'shared.outbox', 'billing.subscription'] as const)`.
	 */
	async snapshot<T extends readonly ProbeTable[]>(tables: T): Promise<Record<T[number], number>> {
		const entries = await Promise.all(tables.map(async table => [table, await this.count(table)] as const))
		return Object.fromEntries(entries) as Record<T[number], number>
	}

	private static eventConditions(filter?: EventRowFilter) {
		if (!filter) return undefined
		const clauses = []
		if (filter.name != null) clauses.push(sql`${schema.events.name} = ${filter.name}`)
		if (filter.ownerId != null) clauses.push(sql`${schema.events.ownerId} = ${filter.ownerId}`)
		if (filter.entityId != null) clauses.push(sql`${schema.events.entityId} = ${filter.entityId}`)
		if (clauses.length === 0) return undefined
		return clauses.length === 1 ? clauses[0] : and(...clauses)
	}

	private static outboxConditions(filter?: OutboxRowFilter) {
		if (!filter) return undefined
		const clauses = []
		if (filter.name != null) clauses.push(sql`${schema.outbox.name} = ${filter.name}`)
		if (filter.ownerId != null) clauses.push(sql`${schema.outbox.ownerId} = ${filter.ownerId}`)
		if (clauses.length === 0) return undefined
		return clauses.length === 1 ? clauses[0] : and(...clauses)
	}
}
