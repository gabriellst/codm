import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { DomainEventRepository, OutboxDispatcher } from '@codm/core-typescript'
import {
	AgentModelId,
	IssueStatus,
	IssueTimelineItemKind,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	NudgeSource,
	PermissionPosture,
	ProviderKind,
	StopKind,
	StopResolution,
	SupervisorVerdict,
	SuspicionReason,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenStop, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { GetIssuesOverview } from '@issue/usecases/GetIssuesOverview'
import { assembleIssueTimeline } from '@issue/utils/issueTimeline'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { ResumeIssuePayloadSchema } from '@thread/objects'
import { ThreadStopResolvedEvent } from '@thread/events/ThreadStopResolvedEvent'
import { ResumeIssueOnStopResolved } from '@thread/handlers/ResumeIssueOnStopResolved'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { PUBLISH_AUTHORIZED_BY, NUDGES_BEFORE_STALL, NudgePayloadSchema } from '../objects'
import { AgentSession } from '../entities/AgentSession'
import { AgentSupervisorReviewedEvent } from '../events/AgentSupervisorReviewedEvent'
import { SupervisorFallback } from '../enums/SupervisorFallback'
import { SupervisorMode } from '../enums/SupervisorMode'
import { AgentSessionRepository } from '../repositories/AgentSessionRepository'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { DeclaredWaitReader, MockDeclaredWaitReader } from '../services/DeclaredWaitReader'
import { IssueTurnAborter, type IssueTurnHandle } from '../services/IssueTurnAborter'
import { SuspectIssueReader } from '../services/SuspectIssueReader'
import { ActOnSupervisorVerdict } from './ActOnSupervisorVerdict'
import { ReconcileStalledIssues } from './ReconcileStalledIssues'

/**
 * THE SUPERVISOR ACTS (fase 5, S5) — each verdict through its one door, each safety rail refusing, every verdict
 * recorded with its reason. Integration test bed (the thread's retry, the resume handler, the reconciler and the
 * timeline are the real ones); time is the pass's `now`.
 *
 * Falsifiers: drop a rail in `carryOut` and its test acts on a held / waiting / live task; let `MODE_ACTS[OBSERVE]` be
 * true and observation changes the store; queue the resume as `DECISION_ANSWER` and it jumps ahead of a person's answer
 * (and reaches the publish trigger); drop the resume's `nudge` and a quiet turn after it gets a new pair of nudges.
 */
describe('ActOnSupervisorVerdict', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const handles: IssueTurnHandle[] = []

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		testBed.override(DeclaredWaitReader, new MockDeclaredWaitReader())
	})
	afterEach(() => {
		for (const handle of handles.splice(0)) handle.end()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function givenTask(opts: { stop?: StopKind; session?: boolean } = {}) {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			key: 'APP-21',
			status: opts.stop ? IssueStatus.NEEDS_INPUT : IssueStatus.WORKING,
		})
		const stop = opts.stop ? await givenStop(testBed, { threadId: thread.id.value, issueId: issue.id.value, kind: opts.stop }) : undefined
		if (opts.session) {
			await testBed.resolve(AgentSessionRepository).save(
				AgentSession.create({
					ownerId: MOCK_CLOUD_OWNER_ID,
					issueId: issue.id.value,
					threadId: thread.id.value,
					provider: ProviderKind.CLAUDE_CODE,
					cwd: '/tmp/workspace',
					agentSessionId: 'old-session',
					model: AgentModelId.DEFAULT,
					lastMessageId: 'entry-0',
					contextTokens: 10_000,
				}),
			)
		}
		return { thread, issue, issueId: issue.id.value, threadId: thread.id.value, stop }
	}

	const suspectOf = (task: { issueId: string; threadId: string }, reason: SuspicionReason) => ({
		issueId: task.issueId,
		ownerId: MOCK_CLOUD_OWNER_ID,
		threadId: task.threadId,
		key: 'APP-21',
		title: 'Test issue',
		provider: ProviderKind.CLAUDE_CODE,
		reason,
	})

	const act = (
		task: { issueId: string; threadId: string },
		reason: SuspicionReason,
		verdict: SupervisorVerdict,
		mode: SupervisorMode = SupervisorMode.ACT,
	) =>
		testBed
			.resolve(ActOnSupervisorVerdict)
			.execute({ suspect: suspectOf(task, reason), decision: { verdict, confidence: 0.9 }, mode, now: new Date() })

	const facts = () => testBed.resolve(DomainEventRepository).findByType(AgentSupervisorReviewedEvent)
	/**
	 * The resolution's fact reaches its consumer — called directly, the explicit chaining the thread's own tests use
	 * (`integration` has no outbox poller to drain), after the outbox flush ran every other subscriber.
	 */
	const settle = async () => {
		await testBed.resolve(OutboxDispatcher).flush()
		for (const fact of await testBed.resolve(DomainEventRepository).findByType(ThreadStopResolvedEvent))
			await testBed.resolve(ResumeIssueOnStopResolved).handle(fact)
	}
	const stopOf = async (stopId: string) => testBed.resolve(ThreadRepository).findStop(stopId)
	const deliveries = () => testBed.probe().count('scheduledCommands', { name: 'deliver_channel_message' })
	/** Every queued item of the issue, claimed and completed in claim order. */
	const drain = async (issueId: string) => {
		const mailbox = testBed.resolve(MailboxRepository)
		const items = []
		for (let item = await mailbox.claimNext('act-test', 60_000); item; item = await mailbox.claimNext('act-test', 60_000)) {
			if (item.targetId === issueId) items.push(item)
			await mailbox.complete([item.id])
		}
		return items
	}

	describe('NUDGE — the thread retries the stop, the resume is the last nudge', () => {
		it('resolves the stall with AUTO_RETRY; the resume is a REMINDER in AUTO, the last nudge, never a publish trigger', async () => {
			const task = await givenTask({ stop: StopKind.STALLED })
			const before = await deliveries()

			expect(await act(task, SuspicionReason.STALLED_OPEN, SupervisorVerdict.NUDGE)).toEqual({
				verdict: SupervisorVerdict.NUDGE,
				acted: true,
			})
			expect((await stopOf(task.stop?.stopId ?? ''))?.resolution).toBe(StopResolution.AUTO_RETRY)
			const [fact] = await facts()
			expect(fact?.payload).toMatchObject({ reason: SuspicionReason.STALLED_OPEN, verdict: SupervisorVerdict.NUDGE, acted: true })

			await settle()
			const [resume, ...rest] = await drain(task.issueId)
			expect(rest).toHaveLength(0)
			expect(resume?.claimClass).toBe(MailboxClaimClass.REMINDER)
			expect(resume?.posture).toBe(PermissionPosture.AUTO)
			const payload = ResumeIssuePayloadSchema.parse(resume?.payload)
			expect(payload.resolution).toBe(StopResolution.AUTO_RETRY)
			expect(payload.nudge).toEqual({ ordinal: NUDGES_BEFORE_STALL, source: NudgeSource.SUPERVISOR })
			const resolved = await stopOf(task.stop?.stopId ?? '')
			if (!resolved) throw new Error('stop not persisted')
			expect(PUBLISH_AUTHORIZED_BY[payload.resolution](resolved)).toBe(false)
			// Nobody is written to: no delivery to the channel came of it.
			expect(await deliveries()).toBe(before)
		})

		it("the resume never jumps ahead of a person's answer on another task, though it was queued first", async () => {
			const retried = await givenTask({ stop: StopKind.SERVER_ERROR })
			await act(retried, SuspicionReason.PROVIDER_ERROR_OPEN, SupervisorVerdict.NUDGE)
			await settle()
			const answered = await givenTask()
			await testBed.resolve(MailboxRepository).enqueue({
				ownerId: MOCK_CLOUD_OWNER_ID,
				targetKind: MailboxTargetKind.ISSUE,
				targetId: answered.issueId,
				kind: MailboxItemKind.STEER,
				claimClass: MailboxClaimClass.DECISION_ANSWER,
				posture: PermissionPosture.AUTO,
				payload: { issueId: answered.issueId, threadId: answered.threadId, text: 'resposta' },
				dedupKey: 'answer:act-test',
			})
			const mailbox = testBed.resolve(MailboxRepository)
			const first = await mailbox.claimNext('act-test', 60_000)
			const second = await mailbox.claimNext('act-test', 60_000)
			expect([first?.targetId, second?.targetId]).toEqual([answered.issueId, retried.issueId])
			expect(second?.claimClass).toBe(MailboxClaimClass.REMINDER)
		})

		it('one automatic turn per action: quiet after the resume, the task shows as blocked (STALLED) straight away', async () => {
			const task = await givenTask({ stop: StopKind.STALLED })
			await act(task, SuspicionReason.STALLED_OPEN, SupervisorVerdict.NUDGE)
			await settle()
			expect(await drain(task.issueId)).toHaveLength(1)
			// The resumed turn ran and said nothing: the issue is back at WORKING with nothing in flight.
			const issue = await testBed.resolve(IssueRepository).findById(task.issueId)
			if (issue && issue.status !== IssueStatus.WORKING) {
				issue.status = IssueStatus.WORKING
				await testBed.resolve(IssueRepository).save(issue)
			}

			const out = await testBed.resolve(ReconcileStalledIssues).execute({})
			expect(out).toEqual({ stalledIssueIds: [task.issueId], nudgedIssueIds: [] })
		})
	})

	describe('RESTART_WITH_NOTES', () => {
		it('with a stop: the stop is retried and the session asked to restart from its notes', async () => {
			const task = await givenTask({ stop: StopKind.STALLED, session: true })
			expect((await act(task, SuspicionReason.STALLED_OPEN, SupervisorVerdict.RESTART_WITH_NOTES)).acted).toBe(true)
			expect((await stopOf(task.stop?.stopId ?? ''))?.resolution).toBe(StopResolution.AUTO_RETRY)
			expect((await testBed.resolve(AgentSessionRepository).findByIssueId(task.issueId))?.handoffRequestedAt).toBeDefined()
			expect((await facts())[0]?.payload).toMatchObject({ acted: true, sessionRestarted: true })
		})

		it('with no stop (a loop of nudges): the agent queues the last nudge itself', async () => {
			const task = await givenTask({ session: true })
			expect((await act(task, SuspicionReason.NUDGE_LOOP, SupervisorVerdict.RESTART_WITH_NOTES)).acted).toBe(true)
			const [nudge, ...rest] = await drain(task.issueId)
			expect(rest).toHaveLength(0)
			expect(nudge?.claimClass).toBe(MailboxClaimClass.REMINDER)
			expect(nudge?.posture).toBe(PermissionPosture.AUTO)
			expect(NudgePayloadSchema.parse(nudge?.payload).nudge).toEqual({ ordinal: NUDGES_BEFORE_STALL, source: NudgeSource.SUPERVISOR })
			expect((await testBed.resolve(AgentSessionRepository).findByIssueId(task.issueId))?.handoffRequestedAt).toBeDefined()
		})

		it('a task with no session: nothing to restart — the request is ignored and said so on the fact', async () => {
			const task = await givenTask()
			expect((await act(task, SuspicionReason.NUDGE_LOOP, SupervisorVerdict.RESTART_WITH_NOTES)).acted).toBe(true)
			expect((await facts())[0]?.payload).toMatchObject({ acted: true, sessionRestarted: false })
			expect(await drain(task.issueId)).toHaveLength(1)
		})

		it('a stop someone resolved first: the suspicion about a stop does nothing more', async () => {
			const task = await givenTask({ stop: StopKind.STALLED, session: true })
			const threads = testBed.resolve(ThreadRepository)
			const thread = await threads.findById(task.threadId)
			const stop = await stopOf(task.stop?.stopId ?? '')
			if (!thread || !stop) throw new Error('scene not persisted')
			thread.resolveStop(stop, StopResolution.RETRY, PermissionPosture.AUTO)
			await threads.save(thread)

			expect(await act(task, SuspicionReason.STALLED_OPEN, SupervisorVerdict.RESTART_WITH_NOTES)).toEqual({
				verdict: SupervisorVerdict.LEAVE,
				acted: false,
				fallback: SupervisorFallback.NO_STOP,
			})
			expect((await testBed.resolve(AgentSessionRepository).findByIssueId(task.issueId))?.handoffRequestedAt).toBeUndefined()
			expect(await drain(task.issueId)).toHaveLength(0)
		})
	})

	describe('ESCALATE — a badge and a timeline moment, nobody written to', () => {
		it('only the fact: the timeline shows it, the card carries escalatedAt until the task moves', async () => {
			const task = await givenTask({ stop: StopKind.STALLED })
			const before = await deliveries()
			expect((await act(task, SuspicionReason.STALLED_OPEN, SupervisorVerdict.ESCALATE)).acted).toBe(true)
			expect((await stopOf(task.stop?.stopId ?? ''))?.resolvedAt).toBeUndefined()
			await settle()
			expect(await drain(task.issueId)).toHaveLength(0)
			expect(await deliveries()).toBe(before)

			const timeline = await assembleIssueTimeline(testBed.resolve(LibSqlDatabaseDriver), task.issueId, 'Test issue')
			expect(timeline.filter(item => item.kind === IssueTimelineItemKind.SUPERVISOR_REVIEWED)).toHaveLength(1)
			const card = async () =>
				(await testBed.resolve(GetIssuesOverview).execute({ ownerId: MOCK_CLOUD_OWNER_ID, includeArchived: false })).groups
					.flatMap(group => group.items)
					.find(item => item.issueId === task.issueId)
			expect((await card())?.escalatedAt).toBeDefined()

			// Someone resolves the stop: the task moved, the badge goes.
			const threads = testBed.resolve(ThreadRepository)
			const thread = await threads.findById(task.threadId)
			const stop = await stopOf(task.stop?.stopId ?? '')
			if (!thread || !stop) throw new Error('scene not persisted')
			thread.resolveStop(stop, StopResolution.RETRY, PermissionPosture.AUTO, { now: new Date(Date.now() + 1_000) })
			await threads.save(thread)
			expect((await card())?.escalatedAt).toBeUndefined()
		})

		it('a live turn is only flagged — never stopped, never run beside', async () => {
			const task = await givenTask()
			handles.push(testBed.resolve(IssueTurnAborter).begin(task.issueId))
			expect((await act(task, SuspicionReason.SILENT_TURN, SupervisorVerdict.ESCALATE)).acted).toBe(true)
			expect(handles[0]?.signal.aborted).toBe(false)
		})
	})

	describe('the safety rails, re-checked when acting', () => {
		const refused = (fallback: SupervisorFallback) => ({ verdict: SupervisorVerdict.LEAVE, acted: false, fallback })

		it('a paused issue is never touched', async () => {
			const task = await givenTask({ stop: StopKind.STALLED })
			task.issue.pause()
			await testBed.resolve(IssueRepository).save(task.issue)
			expect(await act(task, SuspicionReason.STALLED_OPEN, SupervisorVerdict.NUDGE)).toEqual(refused(SupervisorFallback.HELD))
			expect((await stopOf(task.stop?.stopId ?? ''))?.resolvedAt).toBeUndefined()
		})

		it('a task waiting for feedback is never touched', async () => {
			const task = await givenTask({ stop: StopKind.STALLED })
			;(testBed.resolve(DeclaredWaitReader) as MockDeclaredWaitReader).declare(task.issueId)
			expect(await act(task, SuspicionReason.STALLED_OPEN, SupervisorVerdict.NUDGE)).toEqual(refused(SupervisorFallback.WAITING))
		})

		it("a person's stop open beside the stall is never answered", async () => {
			const task = await givenTask({ stop: StopKind.STALLED })
			await givenStop(testBed, { threadId: task.threadId, issueId: task.issueId, kind: StopKind.APPROVAL_NEEDED })
			expect(await act(task, SuspicionReason.STALLED_OPEN, SupervisorVerdict.NUDGE)).toEqual(refused(SupervisorFallback.PERSON_STOP))
			expect((await stopOf(task.stop?.stopId ?? ''))?.resolvedAt).toBeUndefined()
		})

		it('a live turn, or work already queued, gets no turn beside it', async () => {
			const live = await givenTask({ stop: StopKind.STALLED })
			handles.push(testBed.resolve(IssueTurnAborter).begin(live.issueId))
			expect(await act(live, SuspicionReason.STALLED_OPEN, SupervisorVerdict.NUDGE)).toEqual(refused(SupervisorFallback.LIVE_TURN))

			const queued = await givenTask({ session: true })
			await testBed.resolve(MailboxRepository).enqueue({
				ownerId: MOCK_CLOUD_OWNER_ID,
				targetKind: MailboxTargetKind.ISSUE,
				targetId: queued.issueId,
				kind: MailboxItemKind.STEER,
				claimClass: MailboxClaimClass.STEER,
				posture: PermissionPosture.AUTO,
				payload: { issueId: queued.issueId, threadId: queued.threadId, text: 'segue' },
				dedupKey: 'steer:act-test',
			})
			expect(await act(queued, SuspicionReason.NUDGE_LOOP, SupervisorVerdict.RESTART_WITH_NOTES)).toEqual(
				refused(SupervisorFallback.LIVE_TURN),
			)
			expect((await testBed.resolve(AgentSessionRepository).findByIssueId(queued.issueId))?.handoffRequestedAt).toBeUndefined()
		})

		it('OBSERVE records the verdict and changes nothing', async () => {
			const task = await givenTask({ stop: StopKind.STALLED, session: true })
			expect(await act(task, SuspicionReason.STALLED_OPEN, SupervisorVerdict.RESTART_WITH_NOTES, SupervisorMode.OBSERVE)).toEqual({
				verdict: SupervisorVerdict.RESTART_WITH_NOTES,
				acted: false,
			})
			expect((await stopOf(task.stop?.stopId ?? ''))?.resolvedAt).toBeUndefined()
			expect((await testBed.resolve(AgentSessionRepository).findByIssueId(task.issueId))?.handoffRequestedAt).toBeUndefined()
			expect((await facts())[0]?.payload).toMatchObject({ mode: SupervisorMode.OBSERVE, acted: false })
		})

		it('LEAVE is only the fact — never "acted", never on the timeline', async () => {
			const task = await givenTask({ stop: StopKind.STALLED })
			expect(await act(task, SuspicionReason.STALLED_OPEN, SupervisorVerdict.LEAVE)).toEqual({
				verdict: SupervisorVerdict.LEAVE,
				acted: false,
			})
			const timeline = await assembleIssueTimeline(testBed.resolve(LibSqlDatabaseDriver), task.issueId, 'Test issue')
			expect(timeline.filter(item => item.kind === IssueTimelineItemKind.SUPERVISOR_REVIEWED)).toHaveLength(0)
		})

		it('every acted verdict is counted by the per-task ceilings (the reader reads the facts back)', async () => {
			const task = await givenTask({ stop: StopKind.STALLED })
			await act(task, SuspicionReason.STALLED_OPEN, SupervisorVerdict.ESCALATE)
			await givenStop(testBed, { threadId: task.threadId, issueId: task.issueId, kind: StopKind.SERVER_ERROR })
			const later = new Date(Date.now() + 2 * 60 * 60_000)
			const [suspect] = await testBed.resolve(SuspectIssueReader).suspects(later, 5)
			expect(suspect?.actedLastDay).toEqual([SupervisorVerdict.ESCALATE])
		})
	})
})
