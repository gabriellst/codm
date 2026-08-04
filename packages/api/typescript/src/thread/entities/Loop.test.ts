import { describe, expect, it } from 'bun:test'
import { DayOfWeek } from '@codm/contracts-typescript/wire/enums'
import { LOOP_PROMPT_MAX_LENGTH } from '../schemas'
import { Loop } from './Loop'

/**
 * The four transitions that can move a loop's next run, and the one property they all share: after
 * ANY of them, `nextRunAt` is either the schedule's own answer or absent — never a stale instant.
 */

const OWNER = '00000000-0000-4000-8000-000000000001'
const THREAD = '019e4d24-6524-7041-9e1c-8108180cddae'
const SP = 'America/Sao_Paulo'

/** Tuesday, 09:00 in São Paulo. */
const TUESDAY_0900 = new Date('2026-08-04T12:00:00.000Z')

const aLoop = (weekdays: DayOfWeek[] = [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY], timeOfDay = '09:00') =>
	Loop.create({
		ownerId: OWNER,
		threadId: THREAD,
		prompt: 'pergunte como está o deploy',
		schedule: { timeOfDay, weekdays, timezone: SP },
		now: TUESDAY_0900,
	})

describe('Loop.create', () => {
	it('is born ENABLED and already armed at its next occurrence', () => {
		const loop = aLoop()
		expect(loop.enabled).toBe(true)
		// Tuesday morning → the Wednesday run.
		expect(loop.nextRunAt?.toISOString()).toBe('2026-08-05T12:00:00.000Z')
		expect(loop.lastFiredAt).toBeUndefined()
	})

	it('refuses a prompt past the cap with LOOP_PROMPT_TOO_LONG', () => {
		expect(() =>
			Loop.create({
				ownerId: OWNER,
				threadId: THREAD,
				prompt: 'x'.repeat(LOOP_PROMPT_MAX_LENGTH + 1),
				schedule: { timeOfDay: '09:00', weekdays: [DayOfWeek.MONDAY], timezone: SP },
				now: TUESDAY_0900,
			}),
		).toThrow(expect.objectContaining({ name: 'INVALID_ENTITY' }))
	})
})

describe('Loop.reschedule', () => {
	it('RE-DERIVES the next run from the new schedule — moving the hour moves the pending run', () => {
		const loop = aLoop([DayOfWeek.TUESDAY], '18:00')
		expect(loop.nextRunAt?.toISOString()).toBe('2026-08-04T21:00:00.000Z')

		loop.reschedule({
			prompt: 'outra coisa',
			schedule: { timeOfDay: '10:00', weekdays: [DayOfWeek.TUESDAY], timezone: SP },
			now: TUESDAY_0900,
		})

		expect(loop.prompt).toBe('outra coisa')
		// Today at 10:00 local, an hour away — not next Tuesday at 18:00.
		expect(loop.nextRunAt?.toISOString()).toBe('2026-08-04T13:00:00.000Z')
	})

	it('does NOT re-arm a disabled loop — editing is not a way to switch something back on', () => {
		const loop = aLoop()
		loop.setEnabled(false, TUESDAY_0900)

		loop.reschedule({ prompt: 'novo texto', now: TUESDAY_0900 })

		expect(loop.enabled).toBe(false)
		expect(loop.nextRunAt).toBeUndefined()
	})
})

describe('Loop.setEnabled', () => {
	it('disabling clears the next run — the sweep can no longer see it', () => {
		const loop = aLoop()
		loop.setEnabled(false, TUESDAY_0900)
		expect(loop.nextRunAt).toBeUndefined()
		expect(loop.isDue(new Date('2027-01-01T00:00:00.000Z'))).toBe(false)
	})

	it('re-enabling arms from NOW, not from the instant it was paused at', () => {
		const loop = aLoop([DayOfWeek.WEDNESDAY])
		loop.setEnabled(false, TUESDAY_0900)

		// A fortnight later. A restored timestamp would be far in the past and fire immediately.
		const laterTuesday = new Date('2026-08-18T12:00:00.000Z')
		loop.setEnabled(true, laterTuesday)

		expect(loop.nextRunAt?.toISOString()).toBe('2026-08-19T12:00:00.000Z')
		expect(loop.isDue(laterTuesday)).toBe(false)
	})
})

describe('Loop.markFired / skipRun', () => {
	it('markFired records WHEN and advances past the run it just made', () => {
		const loop = aLoop([DayOfWeek.TUESDAY])
		const firedAt = new Date('2026-08-11T12:00:00.000Z')

		loop.markFired(firedAt)

		expect(loop.lastFiredAt).toEqual(firedAt)
		// Strictly after — never the same instant again, which is what stops the sweep from spinning.
		expect(loop.nextRunAt?.toISOString()).toBe('2026-08-18T12:00:00.000Z')
		expect(loop.isDue(firedAt)).toBe(false)
	})

	it('skipRun advances WITHOUT claiming a whisper happened', () => {
		const loop = aLoop([DayOfWeek.TUESDAY])
		loop.skipRun(new Date('2026-08-11T12:00:00.000Z'))

		expect(loop.lastFiredAt).toBeUndefined()
		expect(loop.nextRunAt?.toISOString()).toBe('2026-08-18T12:00:00.000Z')
	})
})

describe('Loop.isDue', () => {
	it('is true only for an ENABLED loop whose instant has arrived', () => {
		const loop = aLoop([DayOfWeek.WEDNESDAY])
		expect(loop.isDue(TUESDAY_0900)).toBe(false)
		expect(loop.isDue(new Date('2026-08-05T11:59:00.000Z'))).toBe(false)
		expect(loop.isDue(new Date('2026-08-05T12:00:00.000Z'))).toBe(true)
		expect(loop.isDue(new Date('2026-08-05T18:00:00.000Z'))).toBe(true)
	})
})
