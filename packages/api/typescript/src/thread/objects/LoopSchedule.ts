import { BaseValueObject, z } from '@codm/core-typescript'
import type Z from 'zod'
import { TimezoneSchema } from '@shared/objects'
import { DayOfWeek } from '@codm/contracts-typescript/wire/enums'
import type { DomainErrors } from '../errors'

/**
 * WHEN a loop fires — a wall clock, a set of weekdays, and the zone the two are read in.
 *
 * A composite value object rather than three fields on `Loop`, because the only interesting thing
 * anyone asks of a schedule is "when is the next run?", and that answer needs all three at once. An
 * invalid schedule never exists: `09:70` and "repeats on no day" are rejected at construction, so no
 * caller downstream has to ask whether the recurrence it is about to compute is meaningful.
 *
 * PURE. No `Date.now()` anywhere in this file — `nextRunAfter` takes the instant it computes from,
 * which is what makes every DST and week-wrap case assertable with a fixed clock instead of a
 * `sleep`. Same discipline as `ReplyCutPolicy` next door, for the same reason.
 */

/** `HH:MM`, 24h, zero-padded — the value an `<input type="time">` produces. */
export const LOOP_TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export const LoopTimeOfDaySchema = z.string().regex(LOOP_TIME_OF_DAY_PATTERN, { error: 'INVALID_LOOP_TIME' as DomainErrors })

/**
 * Week order, MONDAY-first — the order the console's picker renders and the order a stored schedule
 * is normalized into. Declared over the enum members so a new member of `DayOfWeek` is a tsc error
 * here instead of a day that silently never sorts.
 */
export const WEEK_ORDER = [
	DayOfWeek.MONDAY,
	DayOfWeek.TUESDAY,
	DayOfWeek.WEDNESDAY,
	DayOfWeek.THURSDAY,
	DayOfWeek.FRIDAY,
	DayOfWeek.SATURDAY,
	DayOfWeek.SUNDAY,
] as const satisfies readonly DayOfWeek[]

/**
 * The weekdays a loop repeats on — at least one. A loop that repeats on no day is a row that will
 * never fire, and nothing downstream would ever report it as broken.
 *
 * This is the WIRE form: whatever order the operator clicked the pills in, unnormalized. Use cases and
 * controllers declare against it, so the rule is stated once and the SDK carries it verbatim.
 */
export const LoopWeekdaysSchema = z.array(z.enum(DayOfWeek)).min(1, { error: 'LOOP_WITHOUT_WEEKDAY' as DomainErrors })

/**
 * The STORED form of the same set: normalized to week order and deduplicated.
 *
 * Normalized on the way IN, not on the way out: the set is what the row carries and what the console
 * renders back, and two schedules that mean the same thing must not differ by click order.
 * `[MONDAY, MONDAY]` is one Monday, for the same reason.
 */
const NormalizedWeekdaysSchema = LoopWeekdaysSchema.transform(days => WEEK_ORDER.filter(day => days.includes(day)))

/** The wire shape of a schedule — the three fields, unnormalized. What a controller body carries. */
export const LoopScheduleInputSchema = z.object({
	timeOfDay: LoopTimeOfDaySchema,
	weekdays: LoopWeekdaysSchema,
	timezone: TimezoneSchema,
})

export const LoopScheduleSchema = z.object({
	timeOfDay: LoopTimeOfDaySchema,
	weekdays: NormalizedWeekdaysSchema,
	timezone: TimezoneSchema,
})

/** `Date.prototype.getUTCDay()` is Sunday-indexed; this is the bridge to the enum. */
const BY_JS_INDEX = [
	DayOfWeek.SUNDAY,
	DayOfWeek.MONDAY,
	DayOfWeek.TUESDAY,
	DayOfWeek.WEDNESDAY,
	DayOfWeek.THURSDAY,
	DayOfWeek.FRIDAY,
	DayOfWeek.SATURDAY,
] as const satisfies readonly DayOfWeek[]

/** The wall-clock fields of an instant, as read in a given zone. */
interface WallClock {
	year: number
	month: number
	day: number
	hour: number
	minute: number
}

const PARTS_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false,
}

/** Read an instant's wall clock in `timezone`. The one place `Intl` is touched. */
function wallClockAt(instantMs: number, timezone: string): WallClock & { second: number } {
	const parts = new Intl.DateTimeFormat('en-US', { ...PARTS_FORMAT_OPTIONS, timeZone: timezone }).formatToParts(new Date(instantMs))
	const read = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find(part => part.type === type)?.value ?? 0)
	// `hour12: false` still renders midnight as `24` in some ICU versions — normalize it to 0 so the
	// arithmetic below never sees an hour that does not exist.
	const hour = read('hour') % 24
	return { year: read('year'), month: read('month'), day: read('day'), hour, minute: read('minute'), second: read('second') }
}

/** How far `timezone` is from UTC at a given instant, in ms. Positive east of Greenwich. */
function zoneOffsetMs(instantMs: number, timezone: string): number {
	const wall = wallClockAt(instantMs, timezone)
	const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
	// Both sides are whole seconds; the instant's own sub-second part must not leak into the offset.
	return asUtc - Math.floor(instantMs / 1000) * 1000
}

/**
 * The instant at which a given wall clock happens in `timezone`.
 *
 * The inverse of `wallClockAt`, and it needs two passes because the offset it must subtract is itself
 * a function of the instant it is solving for. The first pass guesses with the offset in force at the
 * naive UTC reading; when that guess lands on the other side of a DST transition the offset changes,
 * and the second pass re-solves with the corrected one.
 *
 * SPRING-FORWARD GAP: a wall clock that does not exist (02:30 on a day that jumps 02:00 → 03:00) is
 * detected by reading the answer back — neither pass can produce the requested clock, because nothing
 * can. The later of the two candidates is returned, which is the reading on the far side of the jump
 * (03:30 local, one hour "later" than asked). A loop set to a skipped hour therefore fires that day,
 * shifted, instead of silently not firing at all — the same rule `java.time` applies to a local gap.
 */
function instantOfWallClock(wall: WallClock, timezone: string): number {
	const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)
	const firstGuess = naive - zoneOffsetMs(naive, timezone)
	const corrected = naive - zoneOffsetMs(firstGuess, timezone)

	const reading = wallClockAt(corrected, timezone)
	const lands = reading.hour === wall.hour && reading.minute === wall.minute
	return lands ? corrected : Math.max(firstGuess, corrected)
}

export type LoopScheduleProps = Z.infer<typeof LoopScheduleSchema>

export class LoopSchedule extends BaseValueObject<typeof LoopScheduleSchema> {
	static override schema = LoopScheduleSchema

	/**
	 * The first instant STRICTLY AFTER `from` that matches this schedule.
	 *
	 * Strictly after, and that is the invariant the whole firing path rests on: `markFired` calls this
	 * with the instant it just fired at, so a loop can never re-arm onto the run it has already made
	 * and spin. It also means "the alarm is exactly now" advances to next week rather than to itself.
	 *
	 * The search walks the CALENDAR of `timezone`, not fixed 24h steps — a day is not always 24 hours
	 * long, and stepping by milliseconds drifts an hour across every DST boundary. Eight days is the
	 * bound: seven covers every weekday, and the eighth covers the case where today's occurrence has
	 * already passed and today is also the only weekday selected.
	 */
	nextRunAfter(from: Date): Date {
		const fromMs = from.getTime()
		const today = wallClockAt(fromMs, this.timezone)
		const [hour, minute] = this.timeOfDay.split(':').map(Number) as [number, number]

		for (let offset = 0; offset <= 7; offset++) {
			// Calendar arithmetic on a UTC anchor: `Date.UTC` normalizes month/year rollover for us, and
			// the fields we read back out are the local calendar date we want — no zone involved yet.
			const anchor = new Date(Date.UTC(today.year, today.month - 1, today.day + offset))
			const weekday = BY_JS_INDEX[anchor.getUTCDay()]!
			if (!this.weekdays.includes(weekday)) continue

			const candidate = instantOfWallClock(
				{ year: anchor.getUTCFullYear(), month: anchor.getUTCMonth() + 1, day: anchor.getUTCDate(), hour, minute },
				this.timezone,
			)
			if (candidate > fromMs) return new Date(candidate)
		}

		// Unreachable: `weekdays` is non-empty by construction, so one of the eight days above matches.
		// Thrown rather than returned as a fallback instant, because a silent wrong date here is a loop
		// that fires at a time nobody asked for.
		throw new Error(`LoopSchedule.nextRunAfter found no occurrence within 8 days — weekdays=${this.weekdays.join(',')}`)
	}
}

export interface LoopSchedule extends LoopScheduleProps {}
