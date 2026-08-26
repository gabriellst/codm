import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenStop, givenThread } from '@test/support'
import { StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { GetOpenStops } from './GetOpenStops'

/**
 * AC-4's READ — what the orchestrator prompt is handed about stops (issue-resume spec, decision 7).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THE ONE PROPERTY THAT MATTERS IS THE FILTER, so it is the property this suite is built around: a
 * prompt that lists an ALREADY-ANSWERED question invites the model to answer it a second time, which
 * (post-slice-2) reschedules an issue nobody asked to reschedule. "Open" is therefore measured against
 * a thread that has BOTH — two open and one resolved — rather than against a thread where every stop
 * happens to be open and an unfiltered read would pass by luck.
 *
 * THE EMPTY CASE IS THE OTHER HALF OF AC-4 ("…and does not contain them when none exist"). It is not a
 * smoke test: a read that returned every open stop in the database would satisfy the first case on a
 * one-thread fixture and fail here the moment a second thread exists, which is why the neighbour
 * thread carries a stop of its own.
 *
 * The stops are raised through `givenStop` (the aggregate + its repository) and resolved through the
 * aggregate too — never through `ResolveStop`, so a read test cannot go red because the resolve
 * pipeline broke.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
describe('GetOpenStops — the open stops of ONE thread, shaped for the orchestrator prompt', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('a thread with 2 open stops and 1 resolved returns ONLY the 2 open ones', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'refunds' })

		const askedFirst = await givenStop(testBed, {
			threadId: thread.id.value,
			issueId: issue.id.value,
			kind: StopKind.HUMAN_REQUESTED,
			title: 'Refund window',
			detail: 'Full or partial for orders older than 90 days?',
		})
		const askedSecond = await givenStop(testBed, {
			threadId: thread.id.value,
			kind: StopKind.APPROVAL_NEEDED,
			title: 'Drop the legacy column',
			detail: 'The migration drops `orders.legacy_ref` — confirm before I run it.',
		})
		const alreadyAnswered = await givenStop(testBed, {
			threadId: thread.id.value,
			issueId: issue.id.value,
			kind: StopKind.HUMAN_REQUESTED,
			title: 'Already answered',
			detail: 'this one must not reach the prompt',
		})

		// Resolved through the aggregate: this suite is about the READ, not about `ResolveStop`.
		const repo = testBed.resolve(ThreadRepository)
		const loaded = (await repo.findById(thread.id.value))!
		loaded.resolveStop(alreadyAnswered, StopResolution.REVIEW_AND_SEND)
		await repo.save(loaded)

		const { stops } = await testBed.resolve(GetOpenStops).execute({ threadId: thread.id.value })

		expect(stops.map(stop => stop.stopId)).toEqual([askedFirst.stopId, askedSecond.stopId])
		expect(stops).toEqual([
			{
				stopId: askedFirst.stopId,
				issueId: issue.id.value,
				kind: StopKind.HUMAN_REQUESTED,
				title: 'Refund window',
				detail: 'Full or partial for orders older than 90 days?',
			},
			{
				// A THREAD-LEVEL stop — raised before any issue existed (B4, decision 4). The field is
				// absent rather than null: the prompt renders "which issue" only when there is one.
				stopId: askedSecond.stopId,
				issueId: undefined,
				kind: StopKind.APPROVAL_NEEDED,
				title: 'Drop the legacy column',
				detail: 'The migration drops `orders.legacy_ref` — confirm before I run it.',
			},
		])
	})

	it('a thread with no stop returns nothing — and a NEIGHBOUR thread`s open stop is not borrowed', async () => {
		const quiet = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const noisy = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await givenStop(testBed, { threadId: noisy.id.value, kind: StopKind.HUMAN_REQUESTED, title: 'not yours' })

		const { stops } = await testBed.resolve(GetOpenStops).execute({ threadId: quiet.id.value })

		expect(stops).toEqual([])
	})
})
