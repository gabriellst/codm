import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenDomainEvent, givenIssue, givenThread } from '@test/support'
import {
	IssueArchiveReason,
	IssueSignalLevel,
	MailboxClaimClass,
	MailboxDeferCause,
	MailboxItemKind,
	MailboxTargetKind,
	NudgeSource,
	PermissionPosture,
	ProviderKind,
	StopKind,
	SupervisorVerdict,
	SuspicionReason,
} from '@codm/contracts-typescript/wire/enums'
import { ThreadStopRaisedEvent } from '@codm/contracts-typescript/wire/events'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { RecordStopFromExecution } from '@thread/handlers/RecordStopFromExecution'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { AgentIssueNudgedEvent } from '../../events/AgentIssueNudgedEvent'
import { AgentRunStartedEvent } from '../../events/AgentRunStartedEvent'
import { AgentSupervisorReviewedEvent } from '../../events/AgentSupervisorReviewedEvent'
import { IssueSpokeEvent } from '../../events/IssueSpokeEvent'
import { SupervisorMode } from '../../enums/SupervisorMode'
import { SuspectIssueReader } from './SuspectIssueReader'

const MIN = 60_000

/**
 * The supervisor's suspects (fase 5, item 3): each reason enters, each exclusion leaves, the cooldown holds, oldest
 * first. Time is the reader's `now` argument — the store keeps real instants, and the pass is asked "as of" later.
 */
describe('LibSqlSuspectIssueReader', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let reader: SuspectIssueReader

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		reader = testBed.resolve(SuspectIssueReader)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const later = (minutes: number) => new Date(Date.now() + minutes * MIN)
	const ids = async (minutes: number, limit = 5) => (await reader.suspects(later(minutes), limit)).map(s => [s.key, s.reason])

	async function givenTask(key: string) {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key })
		return { thread, issue, issueId: issue.id.value, threadId: thread.id.value }
	}

	const raiseStop = (issueId: string, threadId: string, kind: StopKind) =>
		testBed.resolve(RecordStopFromExecution).handle(
			new ThreadStopRaisedEvent({
				ownerId: MOCK_CLOUD_OWNER_ID,
				payload: { stopId: uuidv7(), issueId, threadId, kind, detail: 'parado' },
			}),
		)

	const nudged = (issueId: string, threadId: string) =>
		givenDomainEvent(
			testBed,
			new AgentIssueNudgedEvent({
				entityId: issueId,
				ownerId: MOCK_CLOUD_OWNER_ID,
				payload: { issueId, threadId, rootItemId: uuidv7(), ordinal: 1, source: NudgeSource.RECONCILER },
			}),
		)

	const reviewed = (issueId: string, reason: SuspicionReason, verdict: SupervisorVerdict, acted: boolean) =>
		givenDomainEvent(
			testBed,
			new AgentSupervisorReviewedEvent({
				entityId: issueId,
				ownerId: MOCK_CLOUD_OWNER_ID,
				payload: { issueId, reason, verdict, mode: SupervisorMode.ACT, acted },
			}),
		)

	/** The current run of the task was spawned — what `RunIssueTurn` records before streaming. */
	const spawned = (issueId: string, threadId: string) =>
		givenDomainEvent(
			testBed,
			new AgentRunStartedEvent({
				entityId: issueId,
				ownerId: MOCK_CLOUD_OWNER_ID,
				payload: { issueId, threadId, key: 'k', title: 't', provider: ProviderKind.CLAUDE_CODE },
			}),
		)

	async function enqueueAndClaim(issueId: string, threadId: string, leaseMs: number) {
		const mailbox = testBed.resolve(MailboxRepository)
		await mailbox.enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.STEER,
			posture: PermissionPosture.AUTO,
			payload: { issueId, threadId, text: 'segue' },
			dedupKey: uuidv7(),
		})
		const item = await mailbox.claimNext('suspect-test', leaseMs, [MailboxTargetKind.ISSUE])
		if (!item) throw new Error('no item claimed')
		return item
	}

	it('each reason enters: a stall and a provider error left open 30 min, a loop of nudges, a live turn gone quiet', async () => {
		const stalled = await givenTask('APP-1')
		await raiseStop(stalled.issueId, stalled.threadId, StopKind.STALLED)
		const failed = await givenTask('APP-2')
		await raiseStop(failed.issueId, failed.threadId, StopKind.SERVER_ERROR)
		const loop = await givenTask('APP-3')
		for (let episode = 0; episode < 3; episode++) await nudged(loop.issueId, loop.threadId)
		const silent = await givenTask('APP-4')
		await enqueueAndClaim(silent.issueId, silent.threadId, 3 * 60 * MIN)
		await spawned(silent.issueId, silent.threadId)

		// Under the stop age nothing is suspect yet; the loop already is.
		expect(await ids(10)).toEqual([['APP-3', SuspicionReason.NUDGE_LOOP]])
		expect(new Set((await ids(35)).map(([key, reason]) => `${key}:${reason}`))).toEqual(
			new Set([
				`APP-1:${SuspicionReason.STALLED_OPEN}`,
				`APP-2:${SuspicionReason.PROVIDER_ERROR_OPEN}`,
				`APP-3:${SuspicionReason.NUDGE_LOOP}`,
				`APP-4:${SuspicionReason.SILENT_TURN}`,
			]),
		)
		const [loopSuspect] = (await reader.suspects(later(35), 5)).filter(s => s.key === 'APP-3')
		expect(loopSuspect?.nudgesLastDay).toBe(3)
	})

	/**
	 * SILENT_TURN is measured from the spawn of the CURRENT run, never from the item's first claim (a deferred item
	 * re-claimed would look old the instant it restarts). Falsifier: anchor on `first_claimed_at` and the unspawned
	 * claim below is suspect.
	 */
	it('a live claim whose run was not spawned is not a silent turn; a spawned one under 30 min is not either', async () => {
		const unspawned = await givenTask('APP-6')
		await enqueueAndClaim(unspawned.issueId, unspawned.threadId, 3 * 60 * MIN)
		expect(await ids(35)).toEqual([])

		const young = await givenTask('APP-7')
		await enqueueAndClaim(young.issueId, young.threadId, 3 * 60 * MIN)
		await spawned(young.issueId, young.threadId)
		expect(await ids(25)).toEqual([])
		expect(await ids(35)).toEqual([['APP-7', SuspicionReason.SILENT_TURN]])
	})

	it('two nudges in a day are not a loop', async () => {
		const task = await givenTask('APP-5')
		for (let episode = 0; episode < 2; episode++) await nudged(task.issueId, task.threadId)
		expect(await ids(35)).toEqual([])
	})

	describe('never suspect', () => {
		async function stalledTask(key: string) {
			const task = await givenTask(key)
			await raiseStop(task.issueId, task.threadId, StopKind.STALLED)
			return task
		}

		it("a person's stop open beside the stall", async () => {
			const task = await stalledTask('APP-10')
			await raiseStop(task.issueId, task.threadId, StopKind.HUMAN_REQUESTED)
			expect(await ids(35)).toEqual([])
		})

		it('a paused issue, and a paused conversation', async () => {
			const issueHeld = await stalledTask('APP-11')
			issueHeld.issue.pause()
			await testBed.resolve(IssueRepository).save(issueHeld.issue)
			const threadHeld = await stalledTask('APP-12')
			threadHeld.thread.pause()
			await testBed.resolve(ThreadRepository).save(threadHeld.thread)
			expect(await ids(35)).toEqual([])
		})

		it('a feedback asked in the last turn (a declared wait)', async () => {
			const task = await stalledTask('APP-13')
			const turn = await enqueueAndClaim(task.issueId, task.threadId, 60_000)
			await givenDomainEvent(
				testBed,
				new IssueSpokeEvent({
					entityId: task.issueId,
					ownerId: MOCK_CLOUD_OWNER_ID,
					payload: { issueId: task.issueId, threadId: task.threadId, level: IssueSignalLevel.FEEDBACK, text: 'prévia', artifactIds: [] },
				}),
			)
			await testBed.resolve(MailboxRepository).complete([turn.id])
			expect(await ids(35)).toEqual([])
		})

		it('work deferred for any cause', async () => {
			for (const [index, cause] of Object.values(MailboxDeferCause).entries()) {
				const task = await stalledTask(`APP-2${index}`)
				const item = await enqueueAndClaim(task.issueId, task.threadId, 60_000)
				await testBed.resolve(MailboxRepository).defer([item.id], later(120), cause)
			}
			expect(await ids(35)).toEqual([])
		})

		it('completed and archived', async () => {
			const done = await stalledTask('APP-30')
			done.issue.complete('entregue')
			await testBed.resolve(IssueRepository).save(done.issue)
			const archived = await stalledTask('APP-31')
			archived.issue.archive(IssueArchiveReason.MANUAL)
			await testBed.resolve(IssueRepository).save(archived.issue)
			expect(await ids(35)).toEqual([])
		})
	})

	it('cooling down: the same (task, reason) is not looked at again within the hour; another reason is', async () => {
		const task = await givenTask('APP-40')
		await raiseStop(task.issueId, task.threadId, StopKind.STALLED)
		await reviewed(task.issueId, SuspicionReason.STALLED_OPEN, SupervisorVerdict.LEAVE, false)
		expect(await ids(35)).toEqual([])
		expect(await ids(65)).toEqual([['APP-40', SuspicionReason.STALLED_OPEN]])
	})

	it('carries what was acted on the task in 24 h — what the daily ceilings count', async () => {
		const task = await givenTask('APP-50')
		await raiseStop(task.issueId, task.threadId, StopKind.STALLED)
		await reviewed(task.issueId, SuspicionReason.NUDGE_LOOP, SupervisorVerdict.NUDGE, true)
		await reviewed(task.issueId, SuspicionReason.NUDGE_LOOP, SupervisorVerdict.ESCALATE, false)
		const [suspect] = await reader.suspects(later(35), 5)
		expect(suspect?.actedLastDay).toEqual([SupervisorVerdict.NUDGE])
	})

	it('oldest suspicion first, at most `limit`', async () => {
		const first = await givenTask('APP-60')
		await raiseStop(first.issueId, first.threadId, StopKind.STALLED)
		await Bun.sleep(5)
		const second = await givenTask('APP-61')
		await raiseStop(second.issueId, second.threadId, StopKind.STALLED)
		expect(await ids(35, 1)).toEqual([['APP-60', SuspicionReason.STALLED_OPEN]])
	})
})
