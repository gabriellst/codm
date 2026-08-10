import { injectable } from 'tsyringe-neo'
import { and, asc, eq, isNotNull, lte } from 'drizzle-orm'
import { DrizzleDatabaseDriver, tryCatchAsync, DrizzleTransaction } from '@codm/core-typescript'
import { loops } from '@codm/contracts/db'
import { LoopScheduleKind, type DayOfWeek } from '@codm/contracts-typescript/wire/enums'
import { Loop } from '../../entities/Loop'
import type { LoopScheduleInput } from '../../objects/LoopSchedule'
import { LoopRepository } from './LoopRepository'

/**
 * The columns the flattened schedule union owns — the set `scheduleColumns` fills and `save` must
 * carry over on conflict. Named once so the two cannot drift: a member added to `LoopScheduleKind`
 * with a column of its own is a tsc error at the writer, not a field silently left behind on update.
 */
type ScheduleColumn = 'kind' | 'timeOfDay' | 'weekdays' | 'timezone' | 'everyMinutes'

@injectable()
export class DrizzleLoopRepository extends LoopRepository {
	constructor(private driver: DrizzleDatabaseDriver) {
		super()
	}

	async findById(id: string, tx?: DrizzleTransaction): Promise<Loop | undefined> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(loops).where(eq(loops.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async listByThread(threadId: string, tx?: DrizzleTransaction): Promise<Loop[]> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () =>
			// Next run first, so the console's list reads as a timetable. A disabled loop has no next run
			// and sorts last on `NULLS LAST`-less SQLite… which puts NULLs FIRST — hence the second key:
			// `created_at` keeps the paused ones in a stable order among themselves.
			dbc.select().from(loops).where(eq(loops.threadId, threadId)).orderBy(asc(loops.nextRunAt), asc(loops.createdAt)),
		)
		if (!result.success || !result.data) return []
		return result.data.map(row => this.toDomain(row))
	}

	async findDue(now: Date, limit: number, tx?: DrizzleTransaction): Promise<Loop[]> {
		const dbc = tx ?? this.driver.db
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

	async save(entity: Loop, tx?: DrizzleTransaction): Promise<Loop> {
		const dbc = tx ?? this.driver.db
		const data = this.toPersistence(entity)
		const result = await tryCatchAsync(async () => {
			await dbc
				.insert(loops)
				.values(data)
				.onConflictDoUpdate({
					target: loops.id,
					set: {
						prompt: data.prompt,
						// The WHOLE schedule, member columns and all — `data` already carries the other member's
						// as NULL, and an update that listed only one member's would leave the shapes crossed.
						kind: data.kind,
						timeOfDay: data.timeOfDay,
						weekdays: data.weekdays,
						timezone: data.timezone,
						everyMinutes: data.everyMinutes,
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

	async delete(id: string, tx?: DrizzleTransaction): Promise<void> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(loops).where(eq(loops.id, id))
		})
		if (!result.success) throw result.error
	}

	/**
	 * The row's schedule columns → the wire props of the member `kind` names.
	 *
	 * The non-null assertions are the CHECK constraint's, not this method's opinion: `kind = 'DAILY'`
	 * means the three wall-clock columns are filled and `every_minutes` is not, and the enum check plus
	 * `toPersistence` below are what make that true of every row. Reading them as optional here would
	 * only push the same question one layer down, into a value object that must refuse it anyway.
	 */
	private scheduleOf(row: typeof loops.$inferSelect): LoopScheduleInput {
		return row.kind === LoopScheduleKind.INTERVAL
			? { kind: LoopScheduleKind.INTERVAL, everyMinutes: row.everyMinutes! }
			: { kind: LoopScheduleKind.DAILY, timeOfDay: row.timeOfDay!, weekdays: row.weekdays as DayOfWeek[], timezone: row.timezone! }
	}

	private toDomain(row: typeof loops.$inferSelect): Loop {
		return new Loop({
			id: row.id,
			ownerId: row.ownerId,
			threadId: row.threadId,
			prompt: row.prompt,
			// Raw props — `LoopScheduleFieldSchema` on the entity schema is what constructs the value
			// object, so the columns are rehydrated by the same rules that validated them on the way in.
			schedule: this.scheduleOf(row),
			enabled: row.enabled,
			nextRunAt: row.nextRunAt ?? undefined,
			lastFiredAt: row.lastFiredAt ?? undefined,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	/**
	 * The schedule → its columns, with the OTHER member's explicitly NULLED.
	 *
	 * The nulls are the whole point, not tidiness: an operator who moves a loop from "toda segunda às
	 * 09:00" to "a cada 30 minutos" would otherwise leave a row carrying both shapes, and the next read
	 * would resolve it by `kind` while the stale columns sat there contradicting it.
	 */
	private scheduleColumns(schedule: Loop['schedule']): Pick<typeof loops.$inferInsert, ScheduleColumn> {
		return schedule.kind === LoopScheduleKind.INTERVAL
			? { kind: schedule.kind, timeOfDay: null, weekdays: null, timezone: null, everyMinutes: schedule.everyMinutes }
			: {
					kind: schedule.kind,
					timeOfDay: schedule.timeOfDay,
					weekdays: schedule.weekdays,
					timezone: schedule.timezone,
					everyMinutes: null,
				}
	}

	private toPersistence(entity: Loop): typeof loops.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId,
			threadId: entity.threadId,
			prompt: entity.prompt,
			...this.scheduleColumns(entity.schedule),
			enabled: entity.enabled,
			nextRunAt: entity.nextRunAt ?? null,
			lastFiredAt: entity.lastFiredAt ?? null,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
