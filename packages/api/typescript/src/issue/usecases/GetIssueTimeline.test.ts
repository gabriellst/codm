import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenThread } from '@test/support'
import {
	IssueTimelineItemKind,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	StopKind,
	StopResolution,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { GetIssueTimeline } from './GetIssueTimeline'

/**
 * THE TIMELINE (fase 1, item 1) — what happened to one issue, oldest first, assembled from facts that
 * already exist: transcript entries linked to it, steers on the queue, and its stops with their answers.
 *
 * Falsifier: drop any source from the query and its kind disappears from `kinds`.
 */
describe('GetIssueTimeline', () => {
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

	const tick = () => new Promise(resolve => setTimeout(resolve, 3))

	it('lists messages, steers and a stop with its answer, oldest first, each as its own kind', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value })
		const threads = testBed.resolve(ThreadRepository)

		thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: 'prévia pronta', issueId: issue.id.value })
		await threads.save(thread)
		await tick()

		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issue.id.value,
			kind: MailboxItemKind.STEER,
			posture: PermissionPosture.AUTO,
			payload: { threadId: thread.id.value, key: issue.key, title: issue.title, text: 'tira o rodapé' },
			dedupKey: 'timeline-steer',
		})
		await tick()

		const stop = thread.raiseStop({ issueId: issue.id.value, kind: StopKind.APPROVAL_NEEDED, title: 'posso publicar?', detail: '' })
		await threads.save(thread)
		await tick()
		thread.resolveStop(stop, StopResolution.APPROVE, PermissionPosture.AUTO)
		await threads.save(thread)

		const { items } = await testBed.resolve(GetIssueTimeline).execute({ ownerId: MOCK_CLOUD_OWNER_ID, issueId: issue.id.value })
		const kinds = items.map(item => item.kind)

		expect(kinds).toEqual([
			IssueTimelineItemKind.MESSAGE,
			IssueTimelineItemKind.STEER,
			IssueTimelineItemKind.STOP_RAISED,
			IssueTimelineItemKind.STOP_RESOLVED,
		])
		const steer = items[1]
		expect(steer?.kind === IssueTimelineItemKind.STEER && steer.text).toBe('tira o rodapé')
		const resolved = items[3]
		expect(resolved?.kind === IssueTimelineItemKind.STOP_RESOLVED && resolved.resolution).toBe(StopResolution.APPROVE)
	})

	it("another owner's issue is not found", async () => {
		const issue = await givenIssue(testBed, {})
		const failure = await testBed
			.resolve(GetIssueTimeline)
			.execute({ ownerId: '00000000-0000-4000-8000-0000000000ff', issueId: issue.id.value })
			.then(
				() => undefined,
				(error: unknown) => error,
			)
		expect(failure).toEqual(expect.objectContaining({ name: 'ISSUE_NOT_FOUND' }))
	})
})
