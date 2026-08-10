import { and, getTableColumns, is, sql, type SQL } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { DrizzleTransaction } from '@codm/core-typescript'
import * as schema from '@codm/contracts/db'

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
 * Central table registry — TEST-INFRA ONLY. Every `SQLiteTable` exported by the
 * `@codm/contracts/db` barrel is a valid probe key, and the key is simply the EXPORT NAME
 * (`'events'`, `'outbox'`, `'users'`...).
 *
 * The keys used to be namespaced `<pgSchema>.<export>`, because the pg schema put every table in a
 * named namespace and two contexts could legitimately export the same name. This dialect has no
 * namespaces at all: the nine former namespaces are now table-name PREFIXES (`shared_events`,
 * `owner_owners`, ...), so the export name is already unique and the namespace half of the key
 * described nothing. The union stays a LITERAL union (not `string`) derived from the barrel's own
 * type — a typo'd key is a compile error, not a silently-`undefined` runtime lookup. A new bounded
 * context that adds tables to a schema module (re-exported through the barrel) grows `ProbeTable` —
 * and therefore `count()`/`snapshot()` — for free; no change to this file.
 *
 * Why the barrel and not one `import * as` per schema module (as the medscall origin did): in this
 * template the schema lives in a SEPARATE package (`@codm/contracts`) while `api/typescript` is a
 * `composite` TS project. A relative import into `packages/contracts/db/schema/*.ts` pulls those
 * source files into this composite project and trips `TS6307` (file not in the project's `include`),
 * and the package only publishes the flat `./db` barrel in its `exports` map — so per-module imports
 * aren't reachable by specifier either. The barrel is the one seam that resolves as an external
 * dependency.
 */
export type ProbeTable = {
	[K in keyof SchemaBarrel]: SchemaBarrel[K] extends SQLiteTable ? K & string : never
}[keyof SchemaBarrel]

/**
 * Runtime counterpart of `ProbeTable` — flattens the barrel into `{ events, outbox, ... }`,
 * filtering out every non-table export (enum handles, `relations()` results) via
 * `is(x, SQLiteTable)`. The cast on the final assignment is the SINGLE, DOCUMENTED, unavoidable
 * boundary cast in this file: `Object.entries`/`map` widen the key back to `string` at the runtime
 * level even though the `is()` filter guarantees every value is a `SQLiteTable` and the key is
 * provably one of the `ProbeTable` literals computed above — TypeScript has no way to carry a
 * per-entry literal key through a dynamic `map` without this. No `as any` anywhere in this file.
 */
const PROBE_TABLES = Object.fromEntries(
	// Widen to `[string, unknown][]` up front: the barrel's value union includes enum handles and
	// `relations()` results, none assignable to `SQLiteTable`, which would make the
	// `entry is [string, SQLiteTable]` guard's asserted type non-assignable to the parameter.
	// `unknown` is the honest input type for a runtime `is()` narrowing.
	(Object.entries(schema) as [string, unknown][])
		.filter((entry): entry is [string, SQLiteTable] => is(entry[1], SQLiteTable))
		.map(([exportName, table]) => [exportName, table] as const),
) as Record<ProbeTable, SQLiteTable>

/**
 * The ONLY test-support seam authorized to resolve the driver's `.db` for READS. Assertions on
 * persisted events, outbox rows, and cross-table invariant snapshots go through here instead of
 * every test file importing raw schema tables + `eq`/`and` itself.
 *
 * See `tests/architecture/README.md` — "Reading Persisted State" for the convention this enforces,
 * the 4-category taxonomy it belongs to, and the named exceptions (schema-drift tests,
 * `Drizzle*Repository.test.ts`, DB-transactional service tests).
 *
 * Integration-mode only. Get one via `testBed.probe()` — the factory throws a clear error in mock
 * mode instead of handing back a probe that would blow up on first query.
 *
 * This class is deliberately generic across EVERY bounded context's schema (not billing-specific) —
 * see `PROBE_TABLES` above. There is no curated, hand-picked table list — callers that want a fixed
 * multi-table tuple declare it inline at the call site:
 * `probe.snapshot(['events', 'outbox'] as const)`.
 */
export class PersistenceProbe {
	constructor(private readonly db: DrizzleTransaction) {}

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
	 * Row count for ANY registered `ProbeTable` (the barrel export name). Filtering is
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
	 * `snapshot(['events', 'outbox'] as const)` resolves to
	 * `{ events: number; outbox: number }` — a typo'd key is a compile error, not a
	 * silently-`undefined` runtime lookup. Always unfiltered (full-table count); pass a `filter` to
	 * `count()` directly when a scoped comparison is needed.
	 *
	 * Comparable before/after a job run with `toEqual`. A job that must prove it never touched another
	 * table just adds it to the inline tuple:
	 * `probe.snapshot(['events', 'outbox', 'users'] as const)`.
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
