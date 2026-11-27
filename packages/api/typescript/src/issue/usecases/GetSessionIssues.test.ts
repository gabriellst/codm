import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenStop, givenThread } from '@test/support'
import { uuidv7 } from 'uuidv7'
import {
	IssueLifeState,
	IssueStatus,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	StopKind,
} from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { GetSessionIssues } from './GetSessionIssues'

/**
 * The conversation's tasks carry where the work stands right now (`lifeState`) and the facts behind it —
 * the columns and card lines of the conversation's kanban — read by the same rule as the detail page.
 *
 * Falsifier: drop the life-state reading and every item comes back without its column.
 */
describe('GetSessionIssues — life state per item', () => {
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

	it('an empty conversation answers empty groups', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const out = await testBed.resolve(GetSessionIssues).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		expect(out.groups.flatMap(group => group.items)).toEqual([])
		expect(out.archived).toEqual([])
	})

	it('a task waiting on someone and a paused task each carry their state', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const waiting = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-1' })
		await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-2', paused: true })
		await givenStop(testBed, { threadId: thread.id.value, issueId: waiting.id.value, kind: StopKind.APPROVAL_NEEDED })

		const out = await testBed.resolve(GetSessionIssues).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		const byKey = new Map(out.groups.flatMap(group => group.items).map(item => [item.key, item]))

		expect(byKey.get('APP-1')?.lifeState).toBe(IssueLifeState.WAITING_PERSON)
		expect(byKey.get('APP-1')?.paused).toBe(false)
		expect(byKey.get('APP-2')?.lifeState).toBe(IssueLifeState.PAUSED)
		expect(byKey.get('APP-2')?.paused).toBe(true)
	})

	it('a task deferred by the provider says until when; a completed one is DONE', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const deferred = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-3' })
		await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-4', status: IssueStatus.COMPLETED })
		const mailbox = testBed.resolve(MailboxRepository)
		await mailbox.enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: deferred.id.value,
			kind: MailboxItemKind.STEER,
			posture: PermissionPosture.AUTO,
			payload: { threadId: thread.id.value, key: 'APP-3', title: 'x', text: 'x', provider: 'CLAUDE' },
			dedupKey: `deferred-${uuidv7()}`,
		})
		const claimed = await mailbox.claimNext('session-issues-test', 60_000, [MailboxTargetKind.ISSUE])
		if (!claimed) throw new Error('no item claimed')
		const reset = new Date(Date.now() + 2 * 60 * 60_000)
		// The way the dispatcher defers on a usage-limit refusal.
		await mailbox.defer(claimed.id, reset)

		const out = await testBed.resolve(GetSessionIssues).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		const byKey = new Map(out.groups.flatMap(group => group.items).map(item => [item.key, item]))

		expect(byKey.get('APP-3')?.lifeState).toBe(IssueLifeState.WAITING_PROVIDER)
		expect(byKey.get('APP-3')?.waitingForProviderUntil).toBe(reset.toISOString())
		expect(byKey.get('APP-4')?.lifeState).toBe(IssueLifeState.DONE)
		expect(byKey.get('APP-4')?.waitingForProviderUntil).toBeUndefined()
	})
})
