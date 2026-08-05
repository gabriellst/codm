import { BaseValueObject, z } from '@codm/core-typescript'
import type Z from 'zod'
import type { ZodObject } from 'zod'
import { TimezoneSchema } from '@shared/objects'
import { DayOfWeek, LoopScheduleKind } from '@codm/contracts-typescript/wire/enums'
import type { DomainErrors } from '../errors'

/**
 * WHEN a loop fires — and there are TWO answers to that, not one with holes in it.
 *
 * `DAILY` is a wall clock, a set of weekdays, and the zone the two are read in ("toda segunda e
 * quarta às 09:00"). `INTERVAL` is a cadence and nothing else ("a cada 15 minutos") — no time of day,
 * because there isn't one, and no timezone, because a quarter of an hour is a quarter of an hour
 * everywhere. They are two classes over one abstract base rather than one object with everything
 * optional: a row carrying `weekdays: []` "because the column allows it" is a row that lies about what
 * it is, and every consumer downstream would have to re-derive which fields it may trust.
 *
 * What the rest of the system asks of a schedule is only ever the two questions the base declares —
 * "when is the next run?" and "is this run too old to still make sense?" — so `Loop`, `FireDueLoops`
 * and the repository never branch on the shape. The one place that does is `loopScheduleOf`, which is
 * where wire props become a schedule.
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

/**
 * The narrowest and the widest cadence an interval loop may have: one minute, and one day.
 *
 * The FLOOR is the system's own resolution — the sweep runs once a minute and the other member's
 * clock is `HH:MM`, so anything finer would be a number the product cannot honour. The CEILING is a
 * day, because past it "every N minutes" stops being a cadence and becomes an hour, and an hour is
 * what `DAILY` is for. Both travel to the console in the DTO, so the field's own bounds and the
 * validator's cannot disagree.
 */
export const LOOP_MIN_INTERVAL_MINUTES = 1
export const LOOP_MAX_INTERVAL_MINUTES = 24 * 60

export const LoopIntervalMinutesSchema = z
	.number()
	.int({ error: 'INVALID_LOOP_INTERVAL' as DomainErrors })
	.min(LOOP_MIN_INTERVAL_MINUTES, { error: 'INVALID_LOOP_INTERVAL' as DomainErrors })
	.max(LOOP_MAX_INTERVAL_MINUTES, { error: 'INVALID_LOOP_INTERVAL' as DomainErrors })

/** The wire shape of a wall-clock schedule — the three fields, unnormalized. */
export const DailyLoopScheduleInputSchema = z.object({
	kind: z.literal(LoopScheduleKind.DAILY),
	timeOfDay: LoopTimeOfDaySchema,
	weekdays: LoopWeekdaysSchema,
	timezone: TimezoneSchema,
})

/** The wire shape of a cadence — one field, and deliberately no zone beside it. */
export const IntervalLoopScheduleInputSchema = z.object({
	kind: z.literal(LoopScheduleKind.INTERVAL),
	everyMinutes: LoopIntervalMinutesSchema,
})

/**
 * WHAT A CONTROLLER BODY CARRIES — the union itself, discriminated by `kind`.
 *
 * Declared over the input schemas (unnormalized), because this is the shape the SDK emits and the
 * console's form validates against: the operator's click order is theirs, and the normalization is the
 * value object's business.
 */
export const LoopScheduleInputSchema = z.discriminatedUnion('kind', [DailyLoopScheduleInputSchema, IntervalLoopScheduleInputSchema])

export type LoopScheduleInput = Z.input<typeof LoopScheduleInputSchema>

export const DailyLoopScheduleSchema = DailyLoopScheduleInputSchema.extend({ weekdays: NormalizedWeekdaysSchema })
export const IntervalLoopScheduleSchema = IntervalLoopScheduleInputSchema

export type DailyLoopScheduleProps = Z.infer<typeof DailyLoopScheduleSchema>
export type IntervalLoopScheduleProps = Z.infer<typeof IntervalLoopScheduleSchema>

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

/**
 * How late a WALL-CLOCK run may be and still happen: one hour.
 *
 * This is the whole reason `Loop.skipRun` exists. The daemon lives on the operator's machine — it is
 * asleep at night, closed over the weekend — so an alarm set for Monday 09:00 is very often first SEEN
 * at Monday 14:00, or on Tuesday. Firing it then would put "bom dia, como está o deploy?" into a real
 * conversation five hours after it made any sense, and after a long absence it would fire EVERY missed
 * occurrence in sequence, which is how a scheduling feature turns into a burst of nonsense.
 *
 * An hour is generous enough that an ordinary restart, a sleeping lid or a slow boot still delivers,
 * and short enough that anything delivered still reads as "on time" to the people in the conversation.
 */
export const MISSED_RUN_GRACE_MS = 60 * 60 * 1000

/**
 * The two questions the rest of the system asks a schedule. Everything else about a schedule — which
 * fields it has, which of them the console renders — is the concrete member's business.
 */
abstract class BaseLoopSchedule<S extends ZodObject> extends BaseValueObject<S> {
	/**
	 * The first instant STRICTLY AFTER `from` that matches this schedule.
	 *
	 * Strictly after, and that is the invariant the whole firing path rests on: `markFired` calls this
	 * with the instant it just fired at, so a loop can never re-arm onto the run it has already made
	 * and spin.
	 */
	abstract nextRunAfter(from: Date): Date

	/**
	 * Whether a run that was due at `scheduledFor` is, at `now`, too late to still be worth making.
	 * `FireDueLoops` turns a `true` here into a `skipRun` instead of a whisper.
	 */
	abstract isRunStale(scheduledFor: Date, now: Date): boolean
}

/** "Toda segunda e quarta às 09:00" — a wall clock, a weekday set, and the zone both are read in. */
export class DailyLoopSchedule extends BaseLoopSchedule<typeof DailyLoopScheduleSchema> {
	static override schema = DailyLoopScheduleSchema

	/**
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
		throw new Error(`DailyLoopSchedule.nextRunAfter found no occurrence within 8 days — weekdays=${this.weekdays.join(',')}`)
	}

	/** A wall clock is a promise about a moment of the day, and an hour late already breaks it. */
	isRunStale(scheduledFor: Date, now: Date): boolean {
		return now.getTime() - scheduledFor.getTime() > MISSED_RUN_GRACE_MS
	}
}

export interface DailyLoopSchedule extends DailyLoopScheduleProps {}

/** "A cada 15 minutos" — a cadence, with no clock to be read against and no zone to read it in. */
export class IntervalLoopSchedule extends BaseLoopSchedule<typeof IntervalLoopScheduleSchema> {
	static override schema = IntervalLoopScheduleSchema

	/**
	 * The cadence is anchored on WHAT JUST HAPPENED, not on a grid.
	 *
	 * Each caller already passes the right instant — `create` and `setEnabled` pass `now` (so the first
	 * run is one full interval away and never immediate), `markFired` passes the instant it fired at,
	 * `skipRun` passes `now`. An absolute grid ("at :00, :15, :30, :45") would need an anchor persisted
	 * beside the cadence and a zone to place it in, and would produce gaps nobody asked for whenever the
	 * daemon slept through part of the day.
	 */
	nextRunAfter(from: Date): Date {
		return new Date(from.getTime() + this.everyMinutes * 60_000)
	}

	/**
	 * NEVER stale — and that is a decision, not an omission.
	 *
	 * There is no wall clock here for lateness to contradict: fifteen minutes does not mean anything in
	 * particular about the day, so a run first seen three hours late is simply the next one. It fires
	 * ONCE and re-anchors, because `markFired` derives the following run from the instant it fired —
	 * a week of downtime cannot produce the backlog burst that the grace window exists to prevent for
	 * `DAILY`.
	 */
	isRunStale(): boolean {
		return false
	}
}

export interface IntervalLoopSchedule extends IntervalLoopScheduleProps {}

/** WHEN a loop fires. One of two shapes — narrow it with `kind`. */
export type LoopSchedule = DailyLoopSchedule | IntervalLoopSchedule

/**
 * Wire props → the schedule they describe. THE one place that branches on shape.
 *
 * The `default` arm is unreachable through the type system and is stated anyway: `never` makes a third
 * member of `LoopScheduleKind` a compile error here, which is precisely where it should be caught.
 */
export function loopScheduleOf(input: LoopScheduleInput): LoopSchedule {
	switch (input.kind) {
		case LoopScheduleKind.DAILY:
			return new DailyLoopSchedule(input)
		case LoopScheduleKind.INTERVAL:
			return new IntervalLoopSchedule(input)
		default: {
			const exhaustive: never = input
			throw new Error(`unknown loop schedule kind: ${JSON.stringify(exhaustive)}`)
		}
	}
}

const isLoopSchedule = (value: LoopSchedule | LoopScheduleInput): value is LoopSchedule => value instanceof BaseLoopSchedule

/**
 * The `Loop.schedule` FIELD — accepts either an already-built schedule or the raw props, exactly like
 * `z.instance()` does for a single-class value object.
 *
 * It cannot BE `z.instance()`, and the reason is the point of this file: `z.instance(Cls)` constructs
 * `new Cls(props)`, and there is no one class to name — which member the props describe is what `kind`
 * says. The construction is delegated to `loopScheduleOf`, and the passthrough branch keeps
 * `this.validate()` (which re-parses the entity against its own schema) idempotent.
 */
export const LoopScheduleFieldSchema = z
	.custom<LoopSchedule | LoopScheduleInput>()
	.transform(value => (isLoopSchedule(value) ? value : loopScheduleOf(value)))
