import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import {
	IssueControlSource,
	MailboxClaimClass,
	MailboxDeferCause,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { ResumeIssue } from '@issue/usecases/ResumeIssue'
import { ReleaseIssueWorkOnResume } from '@issue/handlers/ReleaseIssueWorkOnResume'
import { IssueResumedEvent } from '@issue/events/IssueResumedEvent'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { MailboxDispatcher } from './MailboxDispatcher'

/**
 * A PAUSED ISSUE'S WORK WAITS, AND COSTS NOTHING (fase 2, item 2 — pausa como comando).
 *
 * Measured on the real queue: the dispatcher claims the item of a paused issue (or of an issue whose
 * conversation is paused), and instead of running it parks it — deferred, attempt refunded, not
 * consumed — so it neither runs nor walks toward poison. Resuming the issue releases it at once.
 *
 * Falsifier: drop the `hold.isHeld` check from `runIssueWork` and the item is RUN (the stub turn
 * consumes it); handle `held` with `recordFailure` instead of `holdItem` and the item is not deferred
 * (and its next claim counts 2 attempts).
 */
describe('the dispatcher holds a paused issue’s work without spending it', () => {
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

	const enqueueWork = (issueId: string, threadId: string) =>
		testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.WORK,
			claimClass: MailboxClaimClass.WORK,
			posture: PermissionPosture.AUTO,
			payload: { threadId, key: 'APP-12', title: 'Prévia', goal: 'gera a prévia' },
			dedupKey: `work:${uuidv7()}`,
		})

	/** Parked by the dispatcher: runnable, no holder, lease in the future — the repository's own "deferred". */
	const isHeld = async (issueId: string) => (await testBed.resolve(MailboxRepository).deferred()).some(item => item.targetId === issueId)
	/** Claim it as the next turn would — `attempts` counts this claim, so 1 proves the hold refunded its own. */
	const claim = () => testBed.resolve(MailboxRepository).claimNext('hold-test', 60_000)

	const drain = () => testBed.resolve(MailboxDispatcher).bind(testContainer).drain()

	it('a paused issue’s item is deferred with its attempt refunded — and resume releases it', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-12', paused: true })
		await enqueueWork(issue.id.value, thread.id.value)

		await drain()

		expect(await isHeld(issue.id.value)).toBe(true)
		expect(await claim()).toBeUndefined()

		await testBed
			.resolve(ResumeIssue)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, issueId: issue.id.value, source: IssueControlSource.CONSOLE })
		await testBed.resolve(ReleaseIssueWorkOnResume).handle(
			new IssueResumedEvent({
				entityId: issue.id.value,
				ownerId: MOCK_CLOUD_OWNER_ID,
				payload: { issueId: issue.id.value, threadId: thread.id.value, source: IssueControlSource.CONSOLE },
			}),
		)

		expect(await isHeld(issue.id.value)).toBe(false)
		const released = await claim()
		expect(released?.targetId).toBe(issue.id.value)
		expect(released?.attempts).toBe(1)
	})

	it('a paused CONVERSATION holds its issues’ work too', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		thread.pause()
		await testBed.resolve(ThreadRepository).save(thread)
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-13' })
		await enqueueWork(issue.id.value, thread.id.value)

		await drain()

		expect(await isHeld(issue.id.value)).toBe(true)
	})

	// Fase 5 (S1): a resume ends only the deferrals `DEFER_RELEASE` gives it — the hold and the provider wait, never a
	// retry waiting its schedule. Falsifier: drop the cause filter from `ReleaseIssueWorkOnResume` and the RETRY item is
	// claimable at once, spending its next attempt before the wait.
	it('resume releases the hold, never a retry waiting its schedule', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-14' })
		await enqueueWork(issue.id.value, thread.id.value)
		const mailbox = testBed.resolve(MailboxRepository)
		const claimed = await claim()
		if (!claimed) throw new Error('nothing claimed')
		await mailbox.defer([claimed.id], new Date(Date.now() + 600_000), MailboxDeferCause.RETRY)

		await testBed.resolve(ReleaseIssueWorkOnResume).handle(
			new IssueResumedEvent({
				entityId: issue.id.value,
				ownerId: MOCK_CLOUD_OWNER_ID,
				payload: { issueId: issue.id.value, threadId: thread.id.value, source: IssueControlSource.CONSOLE },
			}),
		)

		expect(await isHeld(issue.id.value)).toBe(true)
		expect(await claim()).toBeUndefined()
	})
})
