import { describe, expect, it } from 'bun:test'
import { BaseError } from '@codm/core-typescript'
import { DayOfWeek } from '@codm/contracts-typescript/wire/enums'
import { LoopSchedule } from './LoopSchedule'

/**
 * The recurrence math, with a FIXED clock throughout.
 *
 * Every assertion here would be a `sleep` if `nextRunAfter` read the wall clock itself — which is why
 * it takes the instant as a parameter. The zone used most is `America/Sao_Paulo` (the operator's, and
 * DST-free since 2019); the DST cases pick zones that still observe it, because the bug this file is
 * guarding against is "the loop fired an hour off twice a year" and it is invisible in a zone that
 * never shifts.
 */

const SP = 'America/Sao_Paulo'

/** `2026-08-04T12:00:00Z` — a Tuesday, 09:00 in São Paulo (UTC-3). */
const TUESDAY_0900_SP = new Date('2026-08-04T12:00:00.000Z')

const schedule = (timeOfDay: string, weekdays: DayOfWeek[], timezone = SP) => new LoopSchedule({ timeOfDay, weekdays, timezone })

describe('LoopSchedule — construction', () => {
	it('rejects a time that is not HH:MM with INVALID_LOOP_TIME', () => {
		expect(() => schedule('09:70', [DayOfWeek.MONDAY])).toThrow(expect.objectContaining({ name: 'INVALID_LOOP_TIME' }))
		expect(() => schedule('9:00', [DayOfWeek.MONDAY])).toThrow(expect.objectContaining({ name: 'INVALID_LOOP_TIME' }))
		expect(() => schedule('24:00', [DayOfWeek.MONDAY])).toThrow(expect.objectContaining({ name: 'INVALID_LOOP_TIME' }))
	})

	it('rejects a schedule that repeats on no day — it would sit enabled and never fire', () => {
		expect(() => schedule('09:00', [])).toThrow(expect.objectContaining({ name: 'LOOP_WITHOUT_WEEKDAY' }))
	})

	it('rejects a timezone that is not an IANA zone', () => {
		expect(() => schedule('09:00', [DayOfWeek.MONDAY], 'Not/Real_Zone')).toThrow(BaseError)
	})

	it('normalizes the weekday set — deduplicated and in week order, whatever order they arrived in', () => {
		const s = schedule('09:00', [DayOfWeek.FRIDAY, DayOfWeek.MONDAY, DayOfWeek.FRIDAY])
		expect(s.weekdays).toEqual([DayOfWeek.MONDAY, DayOfWeek.FRIDAY])
	})
})

describe('LoopSchedule.nextRunAfter', () => {
	it('finds TODAY when the hour has not passed yet', () => {
		// Tuesday 09:00 local; the loop runs Tuesdays at 18:00 → nine hours later, same day.
		const next = schedule('18:00', [DayOfWeek.TUESDAY]).nextRunAfter(TUESDAY_0900_SP)
		expect(next.toISOString()).toBe('2026-08-04T21:00:00.000Z')
	})

	it('skips to the NEXT matching weekday when today is already past its hour', () => {
		// Tuesday 09:00 local, and the loop runs Tuesdays at 08:00 — today's run is gone.
		const next = schedule('08:00', [DayOfWeek.TUESDAY]).nextRunAfter(TUESDAY_0900_SP)
		expect(next.toISOString()).toBe('2026-08-11T11:00:00.000Z')
	})

	it('is STRICTLY after — an instant that IS the scheduled minute advances to the next occurrence', () => {
		// This is what stops `markFired` from re-arming onto the run it has just made, forever.
		const next = schedule('09:00', [DayOfWeek.TUESDAY]).nextRunAfter(TUESDAY_0900_SP)
		expect(next.toISOString()).toBe('2026-08-11T12:00:00.000Z')
	})

	it('picks the nearest of SEVERAL weekdays', () => {
		// Mon/Wed/Fri at 09:00, asked on Tuesday morning → Wednesday.
		const next = schedule('09:00', [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY]).nextRunAfter(TUESDAY_0900_SP)
		expect(next.toISOString()).toBe('2026-08-05T12:00:00.000Z')
	})

	it('wraps around the week — Monday-only, asked on Tuesday, lands six days out', () => {
		const next = schedule('09:00', [DayOfWeek.MONDAY]).nextRunAfter(TUESDAY_0900_SP)
		expect(next.toISOString()).toBe('2026-08-10T12:00:00.000Z')
	})

	it('reads the WEEKDAY in the schedule’s zone, not in UTC', () => {
		// 2026-08-04T02:00Z is still MONDAY 23:00 in São Paulo. A Monday loop at 23:30 therefore has a
		// run half an hour away; computing the weekday in UTC would have called this Tuesday and skipped
		// to next week.
		const mondayLateNightUtc = new Date('2026-08-04T02:00:00.000Z')
		const next = schedule('23:30', [DayOfWeek.MONDAY]).nextRunAfter(mondayLateNightUtc)
		expect(next.toISOString()).toBe('2026-08-04T02:30:00.000Z')
	})

	/**
	 * DST — the reason the search walks the CALENDAR instead of adding 24h at a time.
	 *
	 * New York moves to DST on 2026-03-08. A weekly 09:00 run that lands the day AFTER the shift must
	 * still be 09:00 local: 14:00Z, not the 13:00Z a fixed 24h step would produce.
	 */
	it('holds the WALL CLOCK across a DST boundary', () => {
		const beforeShift = new Date('2026-03-07T14:00:00.000Z') // Saturday 09:00 in New York (UTC-5)
		const next = schedule('09:00', [DayOfWeek.SUNDAY], 'America/New_York').nextRunAfter(beforeShift)
		// Sunday 09:00 New York, now UTC-4.
		expect(next.toISOString()).toBe('2026-03-08T13:00:00.000Z')
		expect(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(next)).toBe('09')
	})

	it('resolves a wall clock the spring-forward SKIPPED to the first instant that exists', () => {
		// 02:30 does not happen on 2026-03-08 in New York — the clock jumps 02:00 → 03:00. The run must
		// still happen that day rather than silently vanish.
		const saturday = new Date('2026-03-07T14:00:00.000Z')
		const next = schedule('02:30', [DayOfWeek.SUNDAY], 'America/New_York').nextRunAfter(saturday)
		expect(next.toISOString()).toBe('2026-03-08T07:30:00.000Z')
	})
})
