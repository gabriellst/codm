import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread } from '@test/support'
import { DayOfWeek, LoopScheduleKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { LoopRepository } from '../repositories/LoopRepository'
import type { LoopScheduleInput } from '../objects/LoopSchedule'
import { LOOP_PROMPT_MAX_LENGTH } from '../schemas'
import { ListThreadLoops } from './ListThreadLoops'
import { CreateThreadLoop, DeleteThreadLoop, SetThreadLoopEnabled, UpdateThreadLoop } from './ManageThreadLoops'

const OTHER_OWNER = '00000000-0000-4000-8000-0000000000ff'
const SCHEDULE: LoopScheduleInput = {
	kind: LoopScheduleKind.DAILY,
	timeOfDay: '09:00',
	weekdays: [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY],
	timezone: 'America/Sao_Paulo',
}
const EVERY_15_MIN: LoopScheduleInput = { kind: LoopScheduleKind.INTERVAL, everyMinutes: 15 }

/**
 * The console's four writes and its one read, against a real database.
 *
 * The recurrence itself is proven by `LoopSchedule.test.ts` with a fixed clock; what these assert is
 * the ORCHESTRATION around it — that a loop lands on the right thread, that the guard refuses the
 * wrong owner, and that a pause is visible in the same read the dialog renders.
 */
describe('Thread loops — create, list, edit, pause, delete', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const create = (threadId: string, overrides: Partial<{ prompt: string; schedule: LoopScheduleInput }> = {}) =>
		testBed.resolve(CreateThreadLoop).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId,
			prompt: overrides.prompt ?? 'pergunte como está o deploy',
			schedule: overrides.schedule ?? SCHEDULE,
		})

	const list = (threadId: string) => testBed.resolve(ListThreadLoops).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId })

	it('creates an armed loop and lists it back', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		const { loopId, nextRunAt } = await create(thread.id.value)

		const { loops, promptMaxLength } = await list(thread.id.value)
		expect(loops).toHaveLength(1)
		expect(loops[0]).toMatchObject({
			loopId,
			prompt: 'pergunte como está o deploy',
			schedule: SCHEDULE,
			enabled: true,
			nextRunAt,
		})
		// Never fired yet — the field the console renders as "última: —".
		expect(loops[0]?.lastFiredAt).toBeUndefined()
		// The cap the textarea counts down to travels in the DTO, so the counter cannot disagree with
		// the validator.
		expect(promptMaxLength).toBe(LOOP_PROMPT_MAX_LENGTH)
	})

	it('the next run is in the FUTURE — a loop created today is never immediately due', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { nextRunAt } = await create(thread.id.value)
		expect(new Date(nextRunAt).getTime()).toBeGreaterThan(Date.now())
	})

	it('refuses to schedule against a conversation that is not this owner’s', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await expect(
			testBed
				.resolve(CreateThreadLoop)
				.execute({ ownerId: OTHER_OWNER, threadId: thread.id.value, prompt: 'nem tente', schedule: SCHEDULE }),
		).rejects.toThrow(expect.objectContaining({ name: 'THREAD_NOT_FOUND' }))
	})

	it('refuses a schedule with no weekday — LOOP_WITHOUT_WEEKDAY, before anything is stored', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		await expect(create(thread.id.value, { schedule: { ...SCHEDULE, weekdays: [] } })).rejects.toThrow()

		expect((await list(thread.id.value)).loops).toHaveLength(0)
	})

	/**
	 * THE CADENCE MEMBER, end to end: through the use case, into the row, and back out of the read the
	 * dialog renders. What this proves that the value object's own test cannot is the round trip — that
	 * `kind` survives the write and that no wall-clock column leaks into a loop that has no wall clock.
	 */
	it('creates a loop that repeats every N minutes and lists it back as such', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		const { loopId, nextRunAt } = await create(thread.id.value, { prompt: 'veja se o build quebrou', schedule: EVERY_15_MIN })

		const { loops, minIntervalMinutes, maxIntervalMinutes } = await list(thread.id.value)
		expect(loops[0]).toMatchObject({ loopId, prompt: 'veja se o build quebrou', schedule: EVERY_15_MIN, enabled: true, nextRunAt })
		// A quarter of an hour from now, give or take the milliseconds the use case took.
		expect(new Date(nextRunAt).getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000)
		expect(new Date(nextRunAt).getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000)
		// The bounds the console's numeric field enforces come from the same place the validator does.
		expect({ minIntervalMinutes, maxIntervalMinutes }).toEqual({ minIntervalMinutes: 1, maxIntervalMinutes: 1440 })
	})

	it('refuses a cadence outside the allowed range — INVALID_LOOP_INTERVAL, before anything is stored', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		await expect(create(thread.id.value, { schedule: { kind: LoopScheduleKind.INTERVAL, everyMinutes: 0 } })).rejects.toThrow()

		expect((await list(thread.id.value)).loops).toHaveLength(0)
	})

	it('changes a loop from a wall clock to a cadence — and the row keeps nothing of the old shape', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { loopId } = await create(thread.id.value)

		await testBed.resolve(UpdateThreadLoop).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			loopId,
			prompt: 'agora de quinze em quinze',
			schedule: EVERY_15_MIN,
		})

		// `toEqual` on the whole schedule, not `toMatchObject`: the assertion IS that `timeOfDay`,
		// `weekdays` and `timezone` are gone, not merely that `everyMinutes` arrived.
		expect((await list(thread.id.value)).loops[0]?.schedule).toEqual(EVERY_15_MIN)
	})

	it('edits both the prompt and the schedule, and re-derives the next run', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { loopId, nextRunAt: before } = await create(thread.id.value)

		const { nextRunAt: after } = await testBed.resolve(UpdateThreadLoop).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			loopId,
			prompt: 'agora pergunte outra coisa',
			schedule: { kind: LoopScheduleKind.DAILY, timeOfDay: '18:30', weekdays: [DayOfWeek.SATURDAY], timezone: 'America/Sao_Paulo' },
		})

		expect(after).not.toBe(before)
		const [loop] = (await list(thread.id.value)).loops
		expect(loop).toMatchObject({
			prompt: 'agora pergunte outra coisa',
			schedule: { kind: LoopScheduleKind.DAILY, timeOfDay: '18:30', weekdays: [DayOfWeek.SATURDAY] },
		})
	})

	it('pausing clears the next run; resuming arms it again', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { loopId } = await create(thread.id.value)

		const paused = await testBed
			.resolve(SetThreadLoopEnabled)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, loopId, enabled: false })
		expect(paused.nextRunAt).toBeUndefined()
		expect((await list(thread.id.value)).loops[0]).toMatchObject({ enabled: false, nextRunAt: undefined })

		const resumed = await testBed
			.resolve(SetThreadLoopEnabled)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, loopId, enabled: true })
		expect(resumed.nextRunAt).toBeDefined()
		expect((await list(thread.id.value)).loops[0]?.enabled).toBe(true)
	})

	it('deletes a loop', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { loopId } = await create(thread.id.value)

		await testBed.resolve(DeleteThreadLoop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, loopId })

		expect((await list(thread.id.value)).loops).toHaveLength(0)
	})

	/**
	 * THE GUARD IS TWO QUESTIONS. A loop id is real and addressable; belonging to the URL's thread is a
	 * separate fact from existing, and a delete that only checked existence would remove another
	 * conversation's loop for anyone who could guess an id.
	 */
	it('refuses to touch a loop that belongs to ANOTHER conversation', async () => {
		const mine = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const other = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { loopId } = await create(other.id.value)

		await expect(
			testBed.resolve(DeleteThreadLoop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: mine.id.value, loopId }),
		).rejects.toThrow(expect.objectContaining({ name: 'LOOP_NOT_FOUND' }))

		expect(await testBed.resolve(LoopRepository).findById(loopId)).toBeDefined()
	})

	it('refuses to touch a loop that belongs to another OWNER', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { loopId } = await create(thread.id.value)

		await expect(
			testBed.resolve(SetThreadLoopEnabled).execute({ ownerId: OTHER_OWNER, threadId: thread.id.value, loopId, enabled: false }),
		).rejects.toThrow(expect.objectContaining({ name: 'LOOP_NOT_FOUND' }))
	})

	it('the list is scoped to ONE conversation', async () => {
		const a = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const b = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await create(a.id.value, { prompt: 'da conversa A' })
		await create(b.id.value, { prompt: 'da conversa B' })

		expect((await list(a.id.value)).loops.map(l => l.prompt)).toEqual(['da conversa A'])
	})
})
