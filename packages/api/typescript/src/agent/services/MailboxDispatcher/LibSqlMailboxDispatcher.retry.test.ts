import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { and, eq } from 'drizzle-orm'
import { DomainEventRepository, LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox } from '@codm/contracts/db'
import {
	BlockCause,
	IssueLifeState,
	IssueTimelineItemKind,
	MailboxClaimClass,
	MailboxDeferCause,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	ProviderKind,
	StopKind,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { CAUSE_OF_STOP } from '@thread/utils/OutputPolicy'
import { GetIssueDetail } from '@issue/usecases/GetIssueDetail'
import { GetIssueTimeline } from '@ui/usecases/GetIssueTimeline'
import { MailboxRepository, type ClaimedMailboxItem } from '../../repositories/MailboxRepository'
import { MailboxFailureClass } from '../../enums/MailboxFailureClass'
import { AgentRetryScheduledEvent } from '../../events/AgentRetryScheduledEvent'
import { RETRY_SCHEDULE } from '../../utils/RetrySchedule'
import { LibSqlMailboxDispatcher, type TurnReport } from './LibSqlMailboxDispatcher'

/** A step of the script: a report, or `CRASH` — the turn throws. */
type Step = TurnReport | 'CRASH'

/** The dispatcher with both turns replaced by a script — what is under test is what the QUEUE does with the outcome. */
class ScriptedDispatcher extends LibSqlMailboxDispatcher {
	readonly steps: Step[] = []
	/** The texts each run carried, head first. */
	readonly runs: string[][] = []
	private next(members: readonly ClaimedMailboxItem[]): TurnReport {
		this.runs.push(members.map(member => (member.payload as { text?: string }).text ?? ''))
		const step = this.steps.shift() ?? { spoke: true, provider: ProviderKind.CLAUDE_CODE }
		if (step === 'CRASH') throw new Error('turn exploded')
		return step
	}
	protected override async runIssueWork(item: ClaimedMailboxItem, followers: readonly ClaimedMailboxItem[] = []): Promise<TurnReport> {
		return this.next([item, ...followers])
	}
	protected override async runThreadTurn(item: ClaimedMailboxItem): Promise<TurnReport> {
		return this.next([item])
	}
}

const MINUTE = 60_000
/** The provider answered with an error — a retried transport stop of kind SERVER_ERROR. Its text is a sentinel. */
const PROVIDER_ERROR: TurnReport = {
	spoke: false,
	provider: ProviderKind.CLAUDE_CODE,
	transportStop: { kind: StopKind.SERVER_ERROR, detail: 'sentinel-provider-text' },
}
const LOGIN: TurnReport = {
	spoke: false,
	provider: ProviderKind.CLAUDE_CODE,
	transportStop: { kind: StopKind.AUTH_REQUIRED, detail: 'please run /login' },
}
const OK: TurnReport = { spoke: true, provider: ProviderKind.CLAUDE_CODE }

/**
 * NOVA TENTATIVA COM ESPERA CRESCENTE (fase 5, item 2) — on the real queue (SQLite), with the turns scripted.
 *
 * Before: a failure that asked for a retry released the item at once; it came back on the next poll (250 ms), three
 * attempts in seconds, and the item was dead before a provider overload had passed — and a login problem reached the
 * group as "erro do provedor". Now each lane and failure class has a calendar (`RETRY_SCHEDULE`), a person's message
 * during the wait does not use up an attempt, and the stop at the end says the right cause.
 *
 * The clock is played forward by lapsing the wait (`lease_until` in the past) — the waits themselves are read off the
 * row against the real calendar.
 */
describe('a failed turn tries again on a growing calendar before it asks someone', () => {
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

	const db = () => testBed.resolve(LibSqlDatabaseDriver).db
	const scene = async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: `APP-${Math.floor(Math.random() * 1000)}` })
		return { threadId: thread.id.value, issueId: issue.id.value }
	}
	const steer = async (scope: { threadId: string; issueId: string }, text: string) => {
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: scope.issueId,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.STEER,
			posture: PermissionPosture.AUTO,
			payload: { threadId: scope.threadId, key: 'APP-1', title: 'Prévia', text },
			dedupKey: `steer:${uuidv7()}`,
		})
		await Bun.sleep(2)
	}
	const dispatcher = () => testBed.resolve(ScriptedDispatcher).bind(testContainer)
	const rows = (targetId: string) =>
		db().select().from(agentMailbox).where(eq(agentMailbox.targetId, targetId)).orderBy(agentMailbox.createdAt)
	/** The clock moves past the wait: the RETRY lease of the target lapses. */
	const lapse = (targetId: string) =>
		db()
			.update(agentMailbox)
			.set({ leaseUntil: new Date(Date.now() - 1) })
			.where(and(eq(agentMailbox.targetId, targetId), eq(agentMailbox.deferCause, MailboxDeferCause.RETRY)))
	/** How long the head waits from now, in ms (0 when it is not waiting). */
	const waitOf = async (targetId: string) => {
		const [head] = await rows(targetId)
		return head?.leaseUntil ? head.leaseUntil.getTime() - Date.now() : 0
	}
	const retryFacts = async (targetId: string) =>
		(await testBed.resolve(DomainEventRepository).findByType(AgentRetryScheduledEvent)).filter(fact => fact.entityId === targetId)

	it('the task lane waits 1, 4, 15 and 60 min, then asks someone with SERVER_ERROR — and says so on the board', async () => {
		const scope = await scene()
		await steer(scope, 'gera a prévia')
		const run = dispatcher()
		const waits = RETRY_SCHEDULE[MailboxTargetKind.ISSUE][MailboxFailureClass.PROVIDER_ERROR]

		for (const [index, wait] of waits.entries()) {
			run.steps.push(PROVIDER_ERROR)
			await run.drain()
			const [head] = await rows(scope.issueId)
			expect([head?.deferCause, head?.attempts, head?.deadAt]).toEqual([MailboxDeferCause.RETRY, index + 1, null])
			// The wait is the calendar's, give or take the test's own run time.
			const waited = await waitOf(scope.issueId)
			expect(waited).toBeGreaterThan(wait - 5_000)
			expect(waited).toBeLessThanOrEqual(wait)

			if (index === 0) {
				// "Nova tentativa às hh:mm" — never "esperando cota", and nothing to the group.
				const detail = await testBed.resolve(GetIssueDetail).execute({ ownerId: MOCK_CLOUD_OWNER_ID, issueId: scope.issueId })
				expect(detail.issue.lifeState).toBe(IssueLifeState.WAITING_RETRY)
				expect(detail.issue.waitingForProviderUntil).toBeUndefined()
				expect(detail.issue.retryingAt).toBe(head?.leaseUntil?.toISOString())
				expect(await testBed.resolve(ThreadRepository).openStopsByIssue(scope.issueId)).toEqual([])
			}
			await lapse(scope.issueId)
		}
		run.steps.push(PROVIDER_ERROR)
		await run.drain()

		expect(run.runs).toHaveLength(5)
		const [dead] = await rows(scope.issueId)
		expect([dead?.deadAt !== null, dead?.attempts, dead?.deferCause]).toEqual([true, 5, null])
		const stops = await testBed.resolve(ThreadRepository).openStopsByIssue(scope.issueId)
		expect(stops.map(stop => stop.kind)).toEqual([StopKind.SERVER_ERROR])
		expect(stops[0]?.detail).toContain('depois de 5 tentativas')

		// One fact per scheduled retry, in the same write as the `fail`: the class, never the provider's text.
		const facts = await retryFacts(scope.issueId)
		expect(facts.map(fact => [fact.payload.attempt, fact.payload.maxAttempts, fact.payload.failureClass])).toEqual(
			[1, 2, 3, 4].map(attempt => [attempt, 5, MailboxFailureClass.PROVIDER_ERROR]),
		)
		expect(JSON.stringify(facts.map(fact => fact.payload))).not.toContain('sentinel-provider-text')
		// …and they reach the issue's timeline.
		const timeline = await testBed.resolve(GetIssueTimeline).execute({ ownerId: MOCK_CLOUD_OWNER_ID, issueId: scope.issueId })
		expect(timeline.items.filter(item => item.kind === IssueTimelineItemKind.RETRY_SCHEDULED)).toHaveLength(4)
	})

	it('the conversation lane waits 10 s, then 60 s — a person is waiting — then asks someone', async () => {
		const { threadId } = await scene()
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.THREAD,
			targetId: threadId,
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			claimClass: MailboxClaimClass.OPERATOR,
			posture: PermissionPosture.AUTO,
			payload: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'operator', text: 'oi' },
			dedupKey: `thread:${uuidv7()}`,
		})
		const run = dispatcher()
		for (const wait of RETRY_SCHEDULE[MailboxTargetKind.THREAD][MailboxFailureClass.PROVIDER_ERROR]) {
			run.steps.push(PROVIDER_ERROR)
			await run.drain()
			const waited = await waitOf(threadId)
			expect(waited).toBeGreaterThan(wait - 5_000)
			expect(waited).toBeLessThanOrEqual(wait)
			await lapse(threadId)
		}
		run.steps.push(PROVIDER_ERROR)
		await run.drain()

		expect(run.runs).toHaveLength(3)
		expect((await testBed.resolve(ThreadRepository).openStops(threadId)).map(stop => stop.kind)).toEqual([StopKind.SERVER_ERROR])
	})

	it('a login failure retries at once (no lease, attempt kept) and, spent, is reported as a LOGIN problem', async () => {
		const scope = await scene()
		await steer(scope, 'gera a prévia')
		const run = dispatcher()
		run.steps.push(LOGIN, LOGIN, LOGIN)

		await run.drain()

		// Wait 0 = again in the same drain; the attempt stays charged, so it ends after the calendar's 3 runs.
		expect(run.runs).toHaveLength(3)
		const [dead] = await rows(scope.issueId)
		expect([dead?.deadAt !== null, dead?.attempts]).toEqual([true, 3])
		const stops = await testBed.resolve(ThreadRepository).openStopsByIssue(scope.issueId)
		expect(stops.map(stop => stop.kind)).toEqual([StopKind.AUTH_REQUIRED])
		// The group's notice for this stop is the CLI-login cause — "o CLI precisa de login", not "erro do provedor".
		expect(stops.map(stop => CAUSE_OF_STOP[stop.kind])).toEqual([BlockCause.CLI_LOGIN])
	})

	it('a crash is its own class — 1 min first, recorded as CRASH', async () => {
		const scope = await scene()
		await steer(scope, 'gera a prévia')
		const run = dispatcher()
		run.steps.push('CRASH')

		await run.drain()

		const first = RETRY_SCHEDULE[MailboxTargetKind.ISSUE][MailboxFailureClass.CRASH][0] ?? 0
		const waited = await waitOf(scope.issueId)
		expect(waited).toBeGreaterThan(first - 5_000)
		expect((await retryFacts(scope.issueId)).map(fact => [fact.payload.failureClass, fact.payload.maxAttempts])).toEqual([
			[MailboxFailureClass.CRASH, 4],
		])
	})

	/**
	 * A PERSON'S MESSAGE DOES NOT USE UP AN ATTEMPT. The claim always hands the target's oldest item, so the message ends
	 * the wait and rides with the failed head; the wait it ended is handed back. Three messages in the same wait: the
	 * calendar stays on its first step.
	 *
	 * Falsifier: drop the refund on release and the head reads attempts 4 and waits 60 min by the third message.
	 */
	it('three messages during the wait release it and ride along — the calendar does not advance', async () => {
		const scope = await scene()
		await steer(scope, 'um')
		const run = dispatcher()
		run.steps.push(PROVIDER_ERROR)
		await run.drain()

		for (const text of ['dois', 'tres', 'quatro']) {
			await steer(scope, text)
			run.steps.push(PROVIDER_ERROR)
			await run.drain()
			const [head] = await rows(scope.issueId)
			expect([head?.attempts, head?.deferCause]).toEqual([1, MailboxDeferCause.RETRY])
			expect(await waitOf(scope.issueId)).toBeLessThanOrEqual(MINUTE)
		}
		expect(run.runs).toEqual([['um'], ['um', 'dois'], ['um', 'dois', 'tres'], ['um', 'dois', 'tres', 'quatro']])
		expect((await retryFacts(scope.issueId)).map(fact => fact.payload.attempt)).toEqual([1, 1, 1, 1])

		// The wait ends on its own: everything runs together, once, and is consumed.
		await lapse(scope.issueId)
		await run.drain()
		expect(run.runs.at(-1)).toEqual(['um', 'dois', 'tres', 'quatro'])
		expect((await rows(scope.issueId)).every(row => row.consumedAt !== null)).toBe(true)
	})

	/**
	 * THE FACT AND THE `fail` ARE ONE WRITE. Falsifier: save the fact outside the unit of work and a failed save leaves
	 * the item parked on its calendar with no trace on the timeline.
	 */
	it('a fact that cannot be written rolls the retry back — the item keeps the lease it was claimed under', async () => {
		const scope = await scene()
		await steer(scope, 'gera a prévia')
		const events = testBed.resolve(DomainEventRepository)
		const realSave = events.save.bind(events)
		events.save = async () => {
			throw new Error('SQLITE_BUSY: database is locked')
		}
		const run = dispatcher()
		run.steps.push(PROVIDER_ERROR)
		try {
			await run.drain()
		} finally {
			events.save = realSave
		}

		const [head] = await rows(scope.issueId)
		expect(head?.deferCause).toBeNull()
		expect(head?.claimedBy).not.toBeNull()
		expect(head?.lastError).toBeNull()
		expect(await retryFacts(scope.issueId)).toEqual([])
	})

	/**
	 * Another turn of the same provider passing proves nothing about this one (`DEFER_RELEASE.RETRY.onProviderCredit`).
	 * Falsifier: drop the cause filter in `creditAcceptedTurn` and the retry runs right after the other task's turn.
	 */
	it('an accepted turn of the provider does not release a retry waiting its calendar', async () => {
		const failing = await scene()
		const other = await scene()
		await steer(failing, 'falha')
		const run = dispatcher()
		run.steps.push(PROVIDER_ERROR)
		await run.drain()

		await steer(other, 'passa')
		run.steps.push(OK)
		await run.drain()

		expect(run.runs).toEqual([['falha'], ['passa']])
		const [head] = await rows(failing.issueId)
		expect(head?.deferCause).toBe(MailboxDeferCause.RETRY)
		expect(await waitOf(failing.issueId)).toBeGreaterThan(MINUTE - 5_000)
	})
})
