import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread } from '@test/support'
import { DayOfWeek, LoopScheduleKind, MailboxTargetKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories'
import { OPERATOR_ID } from '@auth/operator'
import { Loop } from '../entities/Loop'
import { LoopRepository } from '../repositories/LoopRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { FireDueLoops } from './FireDueLoops'

const SP = 'America/Sao_Paulo'
const PROMPT = 'pergunte como está o deploy'

/**
 * The sweep — the half of the feature nobody clicks.
 *
 * Every case here seeds a loop whose `nextRunAt` is already in the past, because that is the only
 * state the sweep can see, and asserts on the two things that must be true afterwards: what landed in
 * the conversation, and where the loop is pointing next. The clock is real (the sweep reads `now`
 * itself, as a job must); what makes the assertions deterministic is that the SEEDED instant is
 * chosen relative to it.
 */
describe('FireDueLoops — the scheduled whisper', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/**
	 * A loop already due `agoMs` ago. Seeded through the REPOSITORY (never the use case, per the given
	 * discipline) with an every-weekday schedule, so whatever day the suite runs on there is always a
	 * next occurrence within a day.
	 */
	const givenDueLoop = async (threadId: string, agoMs = 60_000): Promise<Loop> => {
		const loop = Loop.create({
			ownerId: OPERATOR_ID,
			threadId,
			prompt: PROMPT,
			schedule: { kind: LoopScheduleKind.DAILY, timeOfDay: '09:00', weekdays: Object.values(DayOfWeek), timezone: SP },
			now: new Date(),
		})
		loop.nextRunAt = new Date(Date.now() - agoMs)
		return testBed.resolve(LoopRepository).save(loop)
	}

	/** The same, on a cadence — the shape with no wall clock for lateness to contradict. */
	const givenDueIntervalLoop = async (threadId: string, agoMs: number, everyMinutes = 15): Promise<Loop> => {
		const loop = Loop.create({
			ownerId: OPERATOR_ID,
			threadId,
			prompt: PROMPT,
			schedule: { kind: LoopScheduleKind.INTERVAL, everyMinutes },
			now: new Date(),
		})
		loop.nextRunAt = new Date(Date.now() - agoMs)
		return testBed.resolve(LoopRepository).save(loop)
	}

	const sweep = () => testBed.resolve(FireDueLoops).execute({})

	it('whispers the loop’s prompt into the conversation and advances the schedule', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const loop = await givenDueLoop(thread.id.value)

		const { firedLoopIds } = await sweep()

		expect(firedLoopIds).toEqual([loop.id.value])

		// The line the agents read — a WHISPER, never a message on the channel.
		const entries = await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)
		expect(entries.filter(e => e.kind === TranscriptKind.WHISPER).map(e => e.text)).toEqual([PROMPT])

		// And a turn is actually queued — without this the whisper is a line nobody ever reads.
		expect(await testBed.resolve(MailboxRepository).hasPending(MailboxTargetKind.THREAD, thread.id.value)).toBe(true)

		const after = await testBed.resolve(LoopRepository).findById(loop.id.value)
		expect(after?.lastFiredAt).toBeDefined()
		expect(after!.nextRunAt!.getTime()).toBeGreaterThan(Date.now())
	})

	it('fires ONCE — a second sweep in the same minute finds nothing to do', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenDueLoop(thread.id.value)

		await sweep()
		const second = await sweep()

		expect(second.firedLoopIds).toEqual([])
		const entries = await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)
		expect(entries.filter(e => e.kind === TranscriptKind.WHISPER)).toHaveLength(1)
	})

	it('leaves a loop whose hour has NOT come alone', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		// Due one minute from now — the sweep must not anticipate it.
		await givenDueLoop(thread.id.value, -60_000)

		const { firedLoopIds, skippedLoopIds } = await sweep()

		expect({ firedLoopIds, skippedLoopIds }).toEqual({ firedLoopIds: [], skippedLoopIds: [] })
	})

	it('a PAUSED conversation skips the run — and does not pretend it fired', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		thread.pause()
		await testBed.resolve(ThreadRepository).save(thread)
		const loop = await givenDueLoop(thread.id.value)

		const { firedLoopIds, skippedLoopIds } = await sweep()

		expect({ firedLoopIds, skippedLoopIds }).toEqual({ firedLoopIds: [], skippedLoopIds: [loop.id.value] })

		const after = await testBed.resolve(LoopRepository).findById(loop.id.value)
		// The whole point of `skipRun` being a different transition: no whisper, so no `lastFiredAt`…
		expect(after?.lastFiredAt).toBeUndefined()
		// …but the schedule DID advance, or the sweep would find it due again a second later, forever.
		expect(after!.nextRunAt!.getTime()).toBeGreaterThan(Date.now())
		expect(await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)).toHaveLength(0)
	})

	it('a DELETED conversation skips the run — the loop survives the soft delete, silently', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		thread.delete()
		await testBed.resolve(ThreadRepository).save(thread)
		const loop = await givenDueLoop(thread.id.value)

		const { skippedLoopIds } = await sweep()

		expect(skippedLoopIds).toEqual([loop.id.value])
		// Kept, not removed: deletion is soft and re-attach revives the same conversation.
		expect(await testBed.resolve(LoopRepository).findById(loop.id.value)).toBeDefined()
	})

	/**
	 * THE DOWNTIME CASE, and the reason the grace window exists. The daemon lives on the operator's
	 * laptop; a run that came due while the lid was closed must not be delivered hours late into a real
	 * conversation.
	 */
	it('skips a run that is older than the grace window instead of whispering it hours late', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const loop = await givenDueLoop(thread.id.value, 5 * 60 * 60 * 1000)

		const { firedLoopIds, skippedLoopIds } = await sweep()

		expect({ firedLoopIds, skippedLoopIds }).toEqual({ firedLoopIds: [], skippedLoopIds: [loop.id.value] })
		expect(await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)).toHaveLength(0)
	})

	/**
	 * THE SAME DOWNTIME, on the other shape — and the opposite outcome, on purpose.
	 *
	 * Five hours late means nothing to "a cada 15 minutos": there is no hour it promised. It fires ONCE
	 * and re-anchors, which is what makes this safe — the four hundred missed occurrences are gone, not
	 * queued behind it.
	 */
	it('DELIVERS a long-overdue cadence run, exactly once, and re-anchors from now', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const loop = await givenDueIntervalLoop(thread.id.value, 5 * 60 * 60 * 1000)

		expect((await sweep()).firedLoopIds).toEqual([loop.id.value])

		const entries = await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)
		expect(entries.filter(e => e.kind === TranscriptKind.WHISPER)).toHaveLength(1)

		const after = await testBed.resolve(LoopRepository).findById(loop.id.value)
		// Fifteen minutes from NOW, not fifteen minutes after the instant it was due — which is what
		// stops the backlog from draining one tick at a time.
		expect(after!.nextRunAt!.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000)

		// And the second sweep finds nothing: no burst.
		expect((await sweep()).firedLoopIds).toEqual([])
	})

	it('still delivers a run the daemon was a few minutes late to see', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const loop = await givenDueLoop(thread.id.value, 10 * 60 * 1000)

		expect((await sweep()).firedLoopIds).toEqual([loop.id.value])
	})

	it('a PAUSED loop is invisible to the sweep even when its old instant is long past', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const loop = await givenDueLoop(thread.id.value)
		loop.setEnabled(false, new Date())
		await testBed.resolve(LoopRepository).save(loop)

		expect(await sweep()).toEqual({ firedLoopIds: [], skippedLoopIds: [] })
	})

	it('fires every due loop of every conversation in one pass', async () => {
		const a = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const b = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const first = await givenDueLoop(a.id.value, 120_000)
		const second = await givenDueLoop(b.id.value, 60_000)

		const { firedLoopIds } = await sweep()

		// Oldest first — the order `findDue` promises.
		expect(firedLoopIds).toEqual([first.id.value, second.id.value])
	})
})
