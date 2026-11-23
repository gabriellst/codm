import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { DomainEventRepository } from '@codm/core-typescript'
import { IssueStatus, PermissionPosture, StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenStop, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ThreadStopResolvedEvent } from '../events/ThreadStopResolvedEvent'
import { SupervisorRetryOutcome } from '../enums/SupervisorRetryOutcome'
import { ApplySupervisorRetry } from './ApplySupervisorRetry'

/**
 * THE SUPERVISOR'S RETRY (fase 5, S5) — the thread's rule: only a stall / provider-error stop, resolved with AUTO_RETRY in
 * AUTO; a person's stop open refuses the whole retry; nothing open (or resolved first) does nothing; no channel delivery.
 *
 * Falsifiers: drop the person-stop check and the approval below is left beside a resumed task; resolve with the
 * resolver's posture and the fact carries it; record a signal line like the question default and a delivery appears.
 */
describe('ApplySupervisorRetry', () => {
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

	async function givenTask(...kinds: StopKind[]) {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-31', status: IssueStatus.NEEDS_INPUT })
		const stops = []
		for (const kind of kinds) stops.push(await givenStop(testBed, { threadId: thread.id.value, issueId: issue.id.value, kind }))
		return { threadId: thread.id.value, issueId: issue.id.value, stops }
	}
	const retry = (issueId: string) => testBed.resolve(ApplySupervisorRetry).execute({ issueId, now: new Date() })
	const stopOf = (stopId: string) => testBed.resolve(ThreadRepository).findStop(stopId)
	const deliveries = () => testBed.probe().count('scheduledCommands', { name: 'deliver_channel_message' })

	it('resolves every open stall / provider error of the task with AUTO_RETRY, in AUTO, and writes to nobody', async () => {
		const task = await givenTask(StopKind.STALLED, StopKind.SERVER_ERROR)
		const before = await deliveries()

		const out = await retry(task.issueId)

		expect(out.outcome).toBe(SupervisorRetryOutcome.APPLIED)
		expect(new Set(out.stopIds)).toEqual(new Set(task.stops.map(stop => stop.stopId)))
		for (const stop of task.stops) expect((await stopOf(stop.stopId))?.resolution).toBe(StopResolution.AUTO_RETRY)
		const facts = await testBed.resolve(DomainEventRepository).findByType(ThreadStopResolvedEvent)
		expect(facts.map(fact => [fact.payload.resolution, fact.payload.posture])).toEqual([
			[StopResolution.AUTO_RETRY, PermissionPosture.AUTO],
			[StopResolution.AUTO_RETRY, PermissionPosture.AUTO],
		])
		expect(await deliveries()).toBe(before)
	})

	it("refuses when a person's stop is open — resolves nothing", async () => {
		const task = await givenTask(StopKind.STALLED, StopKind.APPROVAL_NEEDED)
		expect(await retry(task.issueId)).toEqual({ outcome: SupervisorRetryOutcome.PERSON_STOP, stopIds: [] })
		for (const stop of task.stops) expect((await stopOf(stop.stopId))?.resolvedAt).toBeUndefined()
	})

	it('nothing open, or resolved first by someone: NO_STOP, nothing written', async () => {
		const none = await givenTask()
		expect(await retry(none.issueId)).toEqual({ outcome: SupervisorRetryOutcome.NO_STOP, stopIds: [] })

		const answered = await givenTask(StopKind.STALLED)
		const threads = testBed.resolve(ThreadRepository)
		const thread = await threads.findById(answered.threadId)
		const stop = await stopOf(answered.stops[0]?.stopId ?? '')
		if (!thread || !stop) throw new Error('scene not persisted')
		thread.resolveStop(stop, StopResolution.TAKE_OVER, PermissionPosture.AUTO)
		await threads.save(thread)
		expect(await retry(answered.issueId)).toEqual({ outcome: SupervisorRetryOutcome.NO_STOP, stopIds: [] })
		expect((await stopOf(stop.stopId))?.resolution).toBe(StopResolution.TAKE_OVER)
	})
})
