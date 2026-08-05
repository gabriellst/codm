import { injectable } from 'tsyringe-neo'
import { and, asc, eq, isNotNull, lte } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codm/core-typescript'
import { loops } from '@codm/contracts/db'
import type { DayOfWeek } from '@codm/contracts-typescript/wire/enums'
import { Loop } from '../../entities/Loop'
import { LoopRepository } from './LoopRepository'

@injectable()
export class DrizzleLoopRepository extends LoopRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(id: string, tx?: DrizzleClient): Promise<Loop | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(loops).where(eq(loops.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async listByThread(threadId: string, tx?: DrizzleClient): Promise<Loop[]> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () =>
			// Next run first, so the console's list reads as a timetable. A disabled loop has no next run
			// and sorts last on `NULLS LAST`-less SQLite… which puts NULLs FIRST — hence the second key:
			// `created_at` keeps the paused ones in a stable order among themselves.
			dbc.select().from(loops).where(eq(loops.threadId, threadId)).orderBy(asc(loops.nextRunAt), asc(loops.createdAt)),
		)
		if (!result.success || !result.data) return []
		return result.data.map(row => this.toDomain(row))
	}

	async findDue(now: Date, limit: number, tx?: DrizzleClient): Promise<Loop[]> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () =>
			dbc
				.select()
				.from(loops)
				// `isNotNull` is redundant with `lte` in SQL (NULL <= x is never true) and is stated anyway:
				// it is what makes the predicate READ like the invariant it enforces — a disabled loop has
				// no next run — and it is what the index can use.
				.where(and(eq(loops.enabled, true), isNotNull(loops.nextRunAt), lte(loops.nextRunAt, now)))
				.orderBy(asc(loops.nextRunAt))
				.limit(limit),
		)
		if (!result.success || !result.data) return []
		return result.data.map(row => this.toDomain(row))
	}

	async save(entity: Loop, tx?: DrizzleClient): Promise<Loop> {
		const dbc = tx ?? this.db
		const data = this.toPersistence(entity)
		const result = await tryCatchAsync(async () => {
			await dbc
				.insert(loops)
				.values(data)
				.onConflictDoUpdate({
					target: loops.id,
					set: {
						prompt: data.prompt,
						timeOfDay: data.timeOfDay,
						weekdays: data.weekdays,
						timezone: data.timezone,
						enabled: data.enabled,
						// BOTH directions: disabling writes NULL here, and an update set that omitted the column
						// would leave a paused loop armed — it would keep firing with its switch visibly off.
						nextRunAt: data.nextRunAt,
						lastFiredAt: data.lastFiredAt,
						updatedAt: new Date(),
						version: data.version,
					},
				})
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: DrizzleClient): Promise<void> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(loops).where(eq(loops.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof loops.$inferSelect): Loop {
		return new Loop({
			id: row.id,
			ownerId: row.ownerId,
			threadId: row.threadId,
			prompt: row.prompt,
			// Raw primitives — `z.instance(LoopSchedule)` on the entity schema is what constructs the VO,
			// so the three columns are rehydrated by the same rules that validated them on the way in.
			schedule: { timeOfDay: row.timeOfDay, weekdays: row.weekdays as DayOfWeek[], timezone: row.timezone },
			enabled: row.enabled,
			nextRunAt: row.nextRunAt ?? undefined,
			lastFiredAt: row.lastFiredAt ?? undefined,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: Loop): typeof loops.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId,
			threadId: entity.threadId,
			prompt: entity.prompt,
			timeOfDay: entity.schedule.timeOfDay,
			weekdays: entity.schedule.weekdays,
			timezone: entity.schedule.timezone,
			enabled: entity.enabled,
			nextRunAt: entity.nextRunAt ?? null,
			lastFiredAt: entity.lastFiredAt ?? null,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
