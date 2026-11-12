import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { MailboxItemKind, MailboxTargetKind, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { GetIssuesOverview } from './GetIssuesOverview'
import { GetIssueDetail } from './GetIssueDetail'

/**
 * "ESPERANDO COTA ATÉ dd/mm hh:mm" NA TAREFA (fase 0, item 2).
 *
 * Measured 2026-11-11: four issues held for six days by a weekly usage window rendered as ordinary
 * `WORKING` rows — the deferral lived only on the queue item, and nothing a person could see said why
 * they were quiet. The overview and the detail now carry the instant the issue's next turn is deferred
 * to; an issue with nothing deferred carries nothing.
 *
 * Falsifier: drop `waitingForProviderUntil` from either query and the first assertion goes undefined.
 */
describe('an issue waiting on the provider says so, and until when', () => {
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

	const steer = (issueId: string, threadId: string, dedupKey: string) =>
		testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.STEER,
			posture: PermissionPosture.AUTO,
			payload: { threadId, key: 'ISS-1', title: 'x', text: dedupKey, provider: 'CLAUDE' },
			dedupKey,
		})

	it('the overview and the detail carry the deferral instant; a free issue carries none', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		// Explicit keys: two issues opened in the same millisecond share the default uuidv7-prefix key.
		const waiting = await givenIssue(testBed, { threadId: thread.id.value, key: 'waiting' })
		const free = await givenIssue(testBed, { threadId: thread.id.value, key: 'free' })
		const mailbox = testBed.resolve(MailboxRepository)

		await steer(waiting.id.value, thread.id.value, `wait-${uuidv7()}`)
		await steer(free.id.value, thread.id.value, `free-${uuidv7()}`)
		const claimed = await mailbox.claimNext('provider-wait-test', 60_000, [MailboxTargetKind.ISSUE])
		const reset = new Date(Date.now() + 6 * 24 * 60 * 60_000)
		// Defer exactly the waiting issue's item, the way the dispatcher does on a usage-limit refusal.
		const target =
			claimed?.targetId === waiting.id.value ? claimed : await mailbox.claimNext('provider-wait-test', 60_000, [MailboxTargetKind.ISSUE])
		if (!target) throw new Error('no item claimed')
		await mailbox.defer(target.id, reset)
		if (claimed && claimed.id !== target.id) await mailbox.complete(claimed.id)

		const overview = await testBed.resolve(GetIssuesOverview).execute({ ownerId: MOCK_CLOUD_OWNER_ID, includeArchived: false })
		const items = overview.groups.flatMap(g => g.items)
		expect(items.find(i => i.issueId === waiting.id.value)?.waitingForProviderUntil).toBe(reset.toISOString())
		expect(items.find(i => i.issueId === free.id.value)?.waitingForProviderUntil).toBeUndefined()

		const detail = await testBed.resolve(GetIssueDetail).execute({ ownerId: MOCK_CLOUD_OWNER_ID, issueId: waiting.id.value })
		expect(detail.issue.waitingForProviderUntil).toBe(reset.toISOString())
	})

	it('a released deferral stops showing — the wait is read, never stored', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value })
		const mailbox = testBed.resolve(MailboxRepository)

		await steer(issue.id.value, thread.id.value, `released-${uuidv7()}`)
		const claimed = await mailbox.claimNext('provider-wait-test', 60_000, [MailboxTargetKind.ISSUE])
		if (!claimed) throw new Error('no item claimed')
		await mailbox.defer(claimed.id, new Date(Date.now() + 60 * 60_000))
		await mailbox.releaseDeferred(MailboxTargetKind.ISSUE)

		const detail = await testBed.resolve(GetIssueDetail).execute({ ownerId: MOCK_CLOUD_OWNER_ID, issueId: issue.id.value })
		expect(detail.issue.waitingForProviderUntil).toBeUndefined()
	})
})
