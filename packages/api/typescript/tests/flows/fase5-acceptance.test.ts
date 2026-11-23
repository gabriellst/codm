import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { and, eq } from 'drizzle-orm'
import { DomainEventRepository, LibSqlDatabaseDriver, OutboxDispatcher } from '@codm/core-typescript'
import { agentMailbox, stops } from '@codm/contracts/db'
import {
	AskAnswerKind,
	IssueSignalLevel,
	MailboxClaimClass,
	MailboxDeferCause,
	MailboxItemKind,
	MailboxTargetKind,
	NudgeSource,
	PermissionPosture,
	ProviderKind,
	ProviderLimitWindow,
	SlotLimit,
	StopKind,
	StopResolution,
	SupervisorVerdict,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { ThreadStopRaisedEvent } from '@codm/contracts-typescript/wire/events'
import { TestBed, givenDomainEvent, givenIssue, givenStop, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MarkIssueNeedsInputFromStop } from '@issue/handlers/MarkIssueNeedsInputFromStop'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { ThreadStopResolvedEvent } from '@thread/events/ThreadStopResolvedEvent'
import { RecordStopFromExecution } from '@thread/handlers/RecordStopFromExecution'
import { ResumeIssueOnStopResolved } from '@thread/handlers/ResumeIssueOnStopResolved'
import { MailboxFailureClass } from '@agent/enums/MailboxFailureClass'
import { SupervisorMode } from '@agent/enums/SupervisorMode'
import { AgentIssueNudgedEvent } from '@agent/events/AgentIssueNudgedEvent'
import { AgentRunStopRaisedEvent } from '@agent/events/AgentRunStopRaisedEvent'
import { AgentSupervisorReviewedEvent } from '@agent/events/AgentSupervisorReviewedEvent'
import { IssueSpokeEvent } from '@agent/events/IssueSpokeEvent'
import { NUDGES_BEFORE_STALL, NudgePayloadSchema } from '@agent/objects'
import { MailboxRepository, type ClaimedMailboxItem } from '@agent/repositories/MailboxRepository'
import { IssueSupervisor, MockIssueSupervisor } from '@agent/services/IssueSupervisor'
import { LibSqlMailboxDispatcher, type TurnReport } from '@agent/services/MailboxDispatcher/LibSqlMailboxDispatcher'
import { InMemoryQuotaStatus, type QuotaStatus } from '@agent/services/QuotaStatusReader'
import { ReconcileStalledIssues } from '@agent/usecases/ReconcileStalledIssues'
import { SuperviseSuspectIssues } from '@agent/usecases/SuperviseSuspectIssues'
import { RETRY_SCHEDULE } from '@agent/utils/RetrySchedule'

/**
 * ACEITE DA FASE 5 — "autonomia". The phase's criterion (goal file): **a task stopped for no reason gets nudged and,
 * with no reaction, becomes a visible block; a task waiting on a person is not nudged** — plus the spec's two other
 * items, on one integration test bed (the precedent of the fase-4 acceptance, not the `mock` the `test` registry
 * suggests for flows: the criterion depends on the REAL queue, dispatcher and reconciler):
 *  1. a quiet task gets nudge 1, then nudge 2, then — still quiet — `STALLED`, told to the group as a block notice;
 *  2. a task with an open decision, an open question, a feedback asked in its last turn, or a paused conversation gets
 *     no nudge in 10 passes;
 *  3. a provider error is tried 5 times, on the growing calendar, and only then asks someone (`SERVER_ERROR`);
 *  4. the supervisor in `OBSERVE` changes nothing; in `ACT` it retries the `STALLED` once, in AUTO, as the last nudge.
 *
 * The provider is never called: the turns are scripted (the dispatcher's two run seams) and the supervisor's model is
 * the scripted `MockIssueSupervisor`. The clock moves by lapsing a lease or ageing a stop (`raised_at`), never by
 * sleeping. What this run measures is printed at the end (`ACEITE FASE 5`) and recorded in the spec ("Como medi —
 * depois"): scripted numbers, not production ones.
 */

/** Every turn ends without declaring anything (a quiet turn) unless a step says otherwise. */
class ScriptedDispatcher extends LibSqlMailboxDispatcher {
	readonly steps: TurnReport[] = []
	/** Each run's head item, in order. */
	readonly runs: ClaimedMailboxItem[] = []
	protected override async runIssueWork(item: ClaimedMailboxItem): Promise<TurnReport> {
		this.runs.push(item)
		return this.steps.shift() ?? { spoke: true, provider: ProviderKind.CLAUDE_CODE }
	}
	protected override async runThreadTurn(item: ClaimedMailboxItem): Promise<TurnReport> {
		this.runs.push(item)
		return { spoke: true, provider: ProviderKind.CLAUDE_CODE }
	}
}
class ObservingSupervisor extends SuperviseSuspectIssues {
	protected override mode = SupervisorMode.OBSERVE
}
class ActingSupervisor extends SuperviseSuspectIssues {
	protected override mode = SupervisorMode.ACT
}

const MINUTE = 60_000
const PROVIDER_ERROR: TurnReport = {
	spoke: false,
	provider: ProviderKind.CLAUDE_CODE,
	transportStop: { kind: StopKind.SERVER_ERROR, detail: 'provider error' },
}
const account = (window: ProviderLimitWindow.FIVE_HOUR | ProviderLimitWindow.WEEKLY) => ({
	window,
	spent: 10,
	issueSpent: 10,
	reservedSpent: 0,
	ceiling: 100,
	reserveFloor: 5,
})
/** The dispatcher's last word: admitting, nothing paused — the supervisor's pass is not skipped. */
const admitting = (): QuotaStatus => ({
	at: Date.now(),
	enforced: false,
	admission: {
		admitted: true,
		expectedTurnCost: 1,
		reserveShare: 0.05,
		accounts: {
			[ProviderLimitWindow.FIVE_HOUR]: account(ProviderLimitWindow.FIVE_HOUR),
			[ProviderLimitWindow.WEEKLY]: account(ProviderLimitWindow.WEEKLY),
		},
	},
	slots: { inUse: 0, max: 6, effective: 6, limitedBy: SlotLimit.MAX },
	diskFreeBytes: 5_000_000_000,
	providerRefusing: false,
})

/** What the run measured — printed at the end, copied to the spec. */
const measured: Record<string, unknown> = {}

describe('fase 5 — acceptance', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let supervisor: MockIssueSupervisor

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		supervisor = new MockIssueSupervisor()
		testBed.override(IssueSupervisor, supervisor)
		testBed.resolve(InMemoryQuotaStatus).publish(admitting())
	})
	afterAll(async () => {
		console.log(`ACEITE FASE 5 ${JSON.stringify(measured)}`)
		await testBed.destroy()
	})

	const db = () => testBed.resolve(LibSqlDatabaseDriver).db
	const dispatcher = () => testBed.resolve(ScriptedDispatcher).bind(testContainer)
	const reconcile = () => testBed.resolve(ReconcileStalledIssues).execute({})
	const settle = () => testBed.resolve(OutboxDispatcher).flush()
	const deliveries = () => testBed.probe().count('scheduledCommands', { name: 'deliver_channel_message' })

	async function scene(key: string) {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key })
		return { thread, issue, threadId: thread.id.value, issueId: issue.id.value }
	}

	/** A person's message routed to the task — the work that starts a turn. */
	async function steer(scope: { threadId: string; issueId: string }, text = 'segue') {
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: scope.issueId,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.STEER,
			posture: PermissionPosture.AUTO,
			payload: { issueId: scope.issueId, threadId: scope.threadId, key: 'APP-1', title: 'Prévia', text },
			dedupKey: `steer:${uuidv7()}`,
		})
		await Bun.sleep(2)
	}

	/** One pass of the system's own clockwork: the facts dispatched, the queue drained, the reconciler's sweep. */
	async function pass(run: ScriptedDispatcher) {
		await settle()
		await run.drain()
		await settle()
		return reconcile()
	}

	/**
	 * The stall's fact reaches the thread (the block notice) and the issue (NEEDS_INPUT) — the bridged consumers called
	 * directly, the explicit chaining `integration` needs (no outbox poller between contexts here).
	 */
	async function deliverStall(scope: { threadId: string; issueId: string }) {
		const fact = (await testBed.resolve(DomainEventRepository).findByType(AgentRunStopRaisedEvent)).find(
			candidate => candidate.entityId === scope.issueId || candidate.payload.issueId === scope.issueId,
		)
		if (!fact) throw new Error('no stall raised')
		const bridged = new ThreadStopRaisedEvent({
			ownerId: MOCK_CLOUD_OWNER_ID,
			payload: {
				stopId: fact.payload.stopId,
				issueId: scope.issueId,
				threadId: scope.threadId,
				kind: fact.payload.kind,
				detail: fact.payload.detail,
			},
		})
		await testBed.resolve(RecordStopFromExecution).handle(bridged)
		await testBed.resolve(MarkIssueNeedsInputFromStop).handle(bridged)
		return fact
	}

	/** A quiet task, nudged twice, still quiet: STALLED. Returns the passes' outcomes and the stall. */
	async function stallQuietly(key: string) {
		const scope = await scene(key)
		const run = dispatcher()
		await steer(scope)
		const outcomes = []
		for (let n = 0; n < NUDGES_BEFORE_STALL + 1; n++) outcomes.push(await pass(run))
		return { scope, run, outcomes }
	}

	describe('1. a task stopped for no reason is nudged, and with no reaction becomes a visible block', () => {
		it('nudge 1, nudge 2 (REMINDER, AUTO), then STALLED — and the group is told once', async () => {
			const { scope, run, outcomes } = await stallQuietly('APP-1')

			expect(outcomes).toEqual([
				{ stalledIssueIds: [], nudgedIssueIds: [scope.issueId] },
				{ stalledIssueIds: [], nudgedIssueIds: [scope.issueId] },
				{ stalledIssueIds: [scope.issueId], nudgedIssueIds: [] },
			])
			const nudges = run.runs.filter(item => item.claimClass === MailboxClaimClass.REMINDER)
			expect(nudges.map(item => NudgePayloadSchema.parse(item.payload).nudge.ordinal)).toEqual([1, 2])
			expect(nudges.every(item => item.posture === PermissionPosture.AUTO)).toBe(true)

			const before = await deliveries()
			const stall = await deliverStall(scope)
			expect(stall.payload).toMatchObject({ kind: StopKind.STALLED, detail: ReconcileStalledIssues.DETAIL_AFTER_NUDGES })
			const notice = (await testBed.resolve(ThreadRepository).listEntries(scope.threadId)).filter(
				entry => entry.kind === TranscriptKind.SYSTEM && entry.level === IssueSignalLevel.BLOCK_NOTICE,
			)
			expect(notice).toHaveLength(1)
			expect(await deliveries()).toBe(before + 1)
			// The nudges themselves wrote to nobody: the block notice is the group's only message.
			measured.nudgesBeforeStall = nudges.length
			measured.groupMessagesForTheStall = (await deliveries()) - before
		})
	})

	describe('2. a task waiting on a person is never nudged — 10 passes each', () => {
		it('an open decision, an open question, a feedback asked in its last turn, a paused conversation', async () => {
			const run = dispatcher()
			const decision = await scene('APP-2')
			const question = await scene('APP-3')
			const feedback = await scene('APP-4')
			const paused = await scene('APP-5')
			// The control: the same quiet turn with nothing to wait on — the passes below DO nudge it.
			const control = await scene('APP-9')
			// Each ran a turn that ended without declaring — the case that WOULD be nudged — plus the one thing that
			// makes it a wait on a person.
			for (const scope of [decision, question, feedback, paused, control]) await steer(scope)
			await run.drain()
			// The feedback the task asked for (what `RequestFeedback` records) — after its last turn started.
			await givenDomainEvent(
				testBed,
				new IssueSpokeEvent({
					entityId: feedback.issueId,
					ownerId: MOCK_CLOUD_OWNER_ID,
					payload: {
						issueId: feedback.issueId,
						threadId: feedback.threadId,
						level: IssueSignalLevel.FEEDBACK,
						text: 'prévia pronta',
						artifactIds: [],
					},
				}),
			)

			const opened = [
				{
					scope: decision,
					stop: await givenStop(testBed, {
						threadId: decision.threadId,
						issueId: decision.issueId,
						ask: {
							question: 'Tema escuro?',
							options: [
								{ id: 'yes', label: 'Sim' },
								{ id: 'no', label: 'Não' },
							],
							effects: [],
							requested: StopKind.DECISION_REQUESTED,
						},
					}),
				},
				{
					scope: question,
					stop: await givenStop(testBed, {
						threadId: question.threadId,
						issueId: question.issueId,
						ask: {
							question: 'Qual título?',
							options: [],
							default: { kind: AskAnswerKind.TEXT, text: 'Novidades' },
							effects: [],
							requested: StopKind.QUESTION_ASKED,
						},
					}),
				},
			]
			// Each stop takes its task to NEEDS_INPUT — the issue's consumer of the stop, called directly.
			for (const { scope, stop } of opened)
				await testBed.resolve(MarkIssueNeedsInputFromStop).handle(
					new ThreadStopRaisedEvent({
						ownerId: MOCK_CLOUD_OWNER_ID,
						payload: { stopId: stop.stopId, issueId: scope.issueId, threadId: scope.threadId, kind: stop.kind, detail: 'aberto' },
					}),
				)
			paused.thread.pause()
			await testBed.resolve(ThreadRepository).save(paused.thread)

			const ids = [decision, question, feedback, paused].map(scope => scope.issueId)
			const touched: string[] = []
			let controlNudges = 0
			for (let n = 0; n < 10; n++) {
				const out = await pass(run)
				controlNudges += out.nudgedIssueIds.filter(id => id === control.issueId).length
				touched.push(...out.nudgedIssueIds.filter(id => ids.includes(id)), ...out.stalledIssueIds.filter(id => ids.includes(id)))
			}
			expect(touched).toEqual([])
			expect(controlNudges).toBe(NUDGES_BEFORE_STALL)
			const nudged = (await testBed.resolve(DomainEventRepository).findByType(AgentIssueNudgedEvent)).filter(fact =>
				ids.includes(fact.entityId ?? ''),
			)
			expect(nudged).toHaveLength(0)
			measured.nudgesToWaitingTasksIn10Passes = nudged.length
		})
	})

	describe('3. a provider error is tried again on a growing calendar before asking someone', () => {
		it('5 attempts, waits of 1, 4, 15 and 60 min, then SERVER_ERROR', async () => {
			const scope = await scene('APP-6')
			const run = dispatcher()
			await steer(scope, 'gera a prévia')
			const waits: number[] = []
			const head = async () =>
				(await db().select().from(agentMailbox).where(eq(agentMailbox.targetId, scope.issueId)).orderBy(agentMailbox.createdAt))[0]
			const calendar = RETRY_SCHEDULE[MailboxTargetKind.ISSUE][MailboxFailureClass.PROVIDER_ERROR]
			for (let attempt = 1; attempt <= calendar.length; attempt++) {
				run.steps.push(PROVIDER_ERROR)
				await run.drain()
				const row = await head()
				expect([row?.deferCause, row?.attempts, row?.deadAt]).toEqual([MailboxDeferCause.RETRY, attempt, null])
				// Nobody is asked while the calendar runs.
				expect(await testBed.resolve(ThreadRepository).openStopsByIssue(scope.issueId)).toEqual([])
				waits.push(Math.round(((row?.leaseUntil?.getTime() ?? 0) - Date.now()) / MINUTE))
				// The clock moves past the wait.
				await db()
					.update(agentMailbox)
					.set({ leaseUntil: new Date(Date.now() - 1) })
					.where(and(eq(agentMailbox.targetId, scope.issueId), eq(agentMailbox.deferCause, MailboxDeferCause.RETRY)))
			}
			run.steps.push(PROVIDER_ERROR)
			await run.drain()

			expect(waits).toEqual(calendar.map(wait => Math.round(wait / MINUTE)))
			expect(run.runs).toHaveLength(calendar.length + 1)
			const open = await testBed.resolve(ThreadRepository).openStopsByIssue(scope.issueId)
			expect(open.map(stop => stop.kind)).toEqual([StopKind.SERVER_ERROR])
			measured.providerErrorAttempts = run.runs.length
			measured.retryWaitsMin = waits
			measured.minutesBeforeAskingSomeone = waits.reduce((total, wait) => total + wait, 0)
		})
	})

	describe('4. the supervisor: OBSERVE changes nothing; ACT retries the STALLED once, in AUTO', () => {
		/** The stall has stood for 45 min — past `SUSPECT_STOP_AGE_MS`, a person had the time to see it first. */
		const age = (issueId: string) =>
			db()
				.update(stops)
				.set({ raisedAt: new Date(Date.now() - 45 * MINUTE) })
				.where(eq(stops.issueId, issueId))

		it('OBSERVE: the verdict is recorded (acted: false) and the stall, the queue and the group stay as they were', async () => {
			const { scope, run } = await stallQuietly('APP-7')
			const stall = await deliverStall(scope)
			await age(scope.issueId)
			supervisor.script(scope.issueId, { verdict: SupervisorVerdict.NUDGE, confidence: 0.9 })
			const runsBefore = run.runs.length
			const before = await deliveries()

			const out = await testBed.resolve(ObservingSupervisor).execute({})

			expect(out.reviewed.map(review => review.issueId)).toEqual([scope.issueId])
			expect((await testBed.resolve(ThreadRepository).findStop(stall.payload.stopId))?.resolvedAt).toBeUndefined()
			await settle()
			await run.drain()
			expect(run.runs.length).toBe(runsBefore)
			expect(await deliveries()).toBe(before)
			const [fact] = await testBed.resolve(DomainEventRepository).findByType(AgentSupervisorReviewedEvent)
			expect(fact?.payload).toMatchObject({ verdict: SupervisorVerdict.NUDGE, mode: SupervisorMode.OBSERVE, acted: false })
			measured.observeActions = 0
		})

		it('ACT: AUTO_RETRY on the stall, ONE resume (REMINDER, AUTO, last nudge); quiet after it ⇒ STALLED straight away', async () => {
			const { scope, run } = await stallQuietly('APP-8')
			const stall = await deliverStall(scope)
			await age(scope.issueId)
			supervisor.script(scope.issueId, { verdict: SupervisorVerdict.NUDGE, confidence: 0.9 })
			const runsBefore = run.runs.length
			const before = await deliveries()

			await testBed.resolve(ActingSupervisor).execute({})

			expect((await testBed.resolve(ThreadRepository).findStop(stall.payload.stopId))?.resolution).toBe(StopResolution.AUTO_RETRY)
			await settle()
			for (const resolved of await testBed.resolve(DomainEventRepository).findByType(ThreadStopResolvedEvent))
				await testBed.resolve(ResumeIssueOnStopResolved).handle(resolved)
			await run.drain()
			const resumes = run.runs.slice(runsBefore)
			expect(resumes).toHaveLength(1)
			expect(resumes[0]?.claimClass).toBe(MailboxClaimClass.REMINDER)
			expect(resumes[0]?.posture).toBe(PermissionPosture.AUTO)
			expect(NudgePayloadSchema.parse(resumes[0]?.payload).nudge).toEqual({ ordinal: NUDGES_BEFORE_STALL, source: NudgeSource.SUPERVISOR })

			// The resumed turn said nothing: no new pair of nudges — the task shows as blocked again.
			await settle()
			expect(await reconcile()).toEqual({ stalledIssueIds: [scope.issueId], nudgedIssueIds: [] })
			// The supervisor wrote to nobody (the second stall's notice is the reconciler's, delivered separately).
			expect(await deliveries()).toBe(before)
			measured.actAutomaticTurns = resumes.length
		})
	})
})
