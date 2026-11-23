import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { DomainEventRepository } from '@codm/core-typescript'
import {
	ProviderLimitWindow,
	SlotLimit,
	StopKind,
	StopResolution,
	SupervisorVerdict,
	SuspicionReason,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenStop, givenThread } from '@test/support'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { AgentSupervisorReviewedEvent } from '../events/AgentSupervisorReviewedEvent'
import { SupervisorFallback } from '../enums/SupervisorFallback'
import { SupervisorMode } from '../enums/SupervisorMode'
import { SupervisorPassSkip } from '../enums/SupervisorPassSkip'
import { IssueSupervisor, MockIssueSupervisor } from '../services/IssueSupervisor'
import { InMemoryQuotaStatus, type QuotaStatus } from '../services/QuotaStatusReader'
import { MockSuspectIssueReader, SuspectIssueReader, type SuspectIssue } from '../services/SuspectIssueReader'
import { SUPERVISOR_MODE_DEFAULT, SuperviseSuspectIssues } from './SuperviseSuspectIssues'

class ObservingSupervisor extends SuperviseSuspectIssues {
	protected override mode = SupervisorMode.OBSERVE
}
class ActingSupervisor extends SuperviseSuspectIssues {
	protected override mode = SupervisorMode.ACT
}
class OffSupervisor extends SuperviseSuspectIssues {
	protected override mode = SupervisorMode.OFF
}

const account = (window: ProviderLimitWindow.FIVE_HOUR | ProviderLimitWindow.WEEKLY) => ({
	window,
	spent: 10,
	issueSpent: 10,
	reservedSpent: 0,
	ceiling: 100,
	reserveFloor: 5,
})

/** The dispatcher's last word: admitting, not refusing — unless a case overrides it. */
const status = (overrides: Partial<QuotaStatus> = {}): QuotaStatus => ({
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
	...overrides,
})

/**
 * THE SUPERVISOR JOB (fase 5, S4 + S5): it looks and records every verdict, in every mode that runs, as
 * `agent.supervisor.reviewed`; in `OBSERVE` (`acted: false`) nothing else changes, in `ACT` — the default, owner's
 * decision of 20/11 — the verdict is carried out through `ActOnSupervisorVerdict` (its rails tested there).
 *
 * Falsifiers: carry a verdict out in OBSERVE and the "nothing else changes" asserts fail; leave `MODE_ACTS[ACT]` false
 * and ACT resolves nothing; drop the mode check and OFF records; drop a skip and the paused / held passes call the model.
 */
describe('SuperviseSuspectIssues', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let suspects: MockSuspectIssueReader
	let supervisor: MockIssueSupervisor

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		suspects = new MockSuspectIssueReader()
		supervisor = new MockIssueSupervisor()
		testBed.override(SuspectIssueReader, suspects)
		testBed.override(IssueSupervisor, supervisor)
		testBed.resolve(InMemoryQuotaStatus).publish(status())
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function givenSuspect(overrides: Partial<SuspectIssue> = {}): Promise<SuspectIssue> {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		const suspect: SuspectIssue = {
			issueId: issue.id.value,
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			key: issue.key,
			title: issue.title,
			provider: issue.provider,
			reason: SuspicionReason.STALLED_OPEN,
			since: new Date(Date.now() - 45 * 60_000),
			nudgesLastDay: 2,
			actedLastDay: [],
			...overrides,
		}
		suspects.rows.push(suspect)
		return suspect
	}

	const facts = () => testBed.resolve(DomainEventRepository).findByType(AgentSupervisorReviewedEvent)

	/** What else a pass could have touched: a queue item for a turn, a delivery to the channel. */
	const sideEffects = async () => ({
		queued: (await testBed.resolve(MailboxRepository).claimNext('supervise-test', 60_000)) !== undefined,
		deliveries: await testBed.probe().count('scheduledCommands', { name: 'deliver_channel_message' }),
	})

	it('ACT is the default mode (owner, 20/11)', () => {
		expect(SUPERVISOR_MODE_DEFAULT).toBe(SupervisorMode.ACT)
	})

	it('ACT carries the verdict out: the stall is retried, the fact says acted', async () => {
		const suspect = await givenSuspect()
		const stop = await givenStop(testBed, { threadId: suspect.threadId, issueId: suspect.issueId, kind: StopKind.STALLED })
		supervisor.script(suspect.issueId, { verdict: SupervisorVerdict.NUDGE, confidence: 0.9 })

		const out = await testBed.resolve(ActingSupervisor).execute({})

		expect(out.reviewed).toEqual([{ issueId: suspect.issueId, reason: SuspicionReason.STALLED_OPEN, verdict: SupervisorVerdict.NUDGE }])
		expect((await testBed.resolve(ThreadRepository).findStop(stop.stopId))?.resolution).toBe(StopResolution.AUTO_RETRY)
		expect((await facts())[0]?.payload).toMatchObject({ verdict: SupervisorVerdict.NUDGE, mode: SupervisorMode.ACT, acted: true })
	})

	const recording: (typeof SuperviseSuspectIssues)[] = [ObservingSupervisor]
	for (const Job of recording) {
		it(`${Job.name}: every verdict is recorded, acted: false — and nothing else happens`, async () => {
			const suspect = await givenSuspect()
			const stop = await givenStop(testBed, { threadId: suspect.threadId, issueId: suspect.issueId, kind: StopKind.STALLED })
			supervisor.script(suspect.issueId, { verdict: SupervisorVerdict.NUDGE, confidence: 0.9 })

			const out = await testBed.resolve(Job).execute({})
			expect((await testBed.resolve(ThreadRepository).findStop(stop.stopId))?.resolvedAt).toBeUndefined()

			expect(out.reviewed).toEqual([{ issueId: suspect.issueId, reason: SuspicionReason.STALLED_OPEN, verdict: SupervisorVerdict.NUDGE }])
			const [fact] = await facts()
			expect(fact?.entityId).toBe(suspect.issueId)
			expect(fact?.payload).toMatchObject({
				issueId: suspect.issueId,
				reason: SuspicionReason.STALLED_OPEN,
				verdict: SupervisorVerdict.NUDGE,
				confidence: 0.9,
				acted: false,
			})
			// The supervisor saw the task's board state and timeline through the issue ports.
			expect(supervisor.reviewed[0]?.suspect.issueId).toBe(suspect.issueId)
			expect(await sideEffects()).toEqual({ queued: false, deliveries: 0 })
		})
	}

	it('OFF: the pass is skipped — no model, no fact', async () => {
		await givenSuspect()
		expect(await testBed.resolve(OffSupervisor).execute({})).toEqual({ skipped: SupervisorPassSkip.OFF, reviewed: [] })
		expect(supervisor.reviewed).toEqual([])
		expect(await facts()).toEqual([])
	})

	it('the provider refusing the account skips the pass', async () => {
		await givenSuspect()
		testBed.resolve(InMemoryQuotaStatus).publish(status({ providerRefusing: true, providerPausedUntil: Date.now() + 30 * 60_000 }))
		expect(await testBed.resolve(ObservingSupervisor).execute({})).toEqual({ skipped: SupervisorPassSkip.PROVIDER_PAUSED, reviewed: [] })
		expect(supervisor.reviewed).toEqual([])
	})

	it('the quota budget holding the task lane for real skips the pass; observing it does not', async () => {
		await givenSuspect()
		const denied = status({ enforced: true, admission: { ...status().admission, admitted: false } })
		testBed.resolve(InMemoryQuotaStatus).publish(denied)
		expect((await testBed.resolve(ObservingSupervisor).execute({})).skipped).toBe(SupervisorPassSkip.BUDGET_HELD)

		testBed.resolve(InMemoryQuotaStatus).publish({ ...denied, enforced: false })
		expect((await testBed.resolve(ObservingSupervisor).execute({})).reviewed).toHaveLength(1)
	})

	it('the per-task ceilings apply before recording: past them the task is escalated once, then left', async () => {
		const nudgedTwice = await givenSuspect({ actedLastDay: [SupervisorVerdict.NUDGE, SupervisorVerdict.NUDGE] })
		supervisor.script(nudgedTwice.issueId, { verdict: SupervisorVerdict.NUDGE, confidence: 0.9 })
		const escalatedToo = await givenSuspect({
			actedLastDay: [SupervisorVerdict.NUDGE, SupervisorVerdict.NUDGE, SupervisorVerdict.ESCALATE],
		})
		supervisor.script(escalatedToo.issueId, { verdict: SupervisorVerdict.NUDGE, confidence: 0.9 })

		await testBed.resolve(ObservingSupervisor).execute({})

		const byIssue = new Map((await facts()).map(fact => [fact.entityId, fact.payload]))
		expect(byIssue.get(nudgedTwice.issueId)).toMatchObject({ verdict: SupervisorVerdict.ESCALATE, fallback: SupervisorFallback.CAPPED })
		expect(byIssue.get(escalatedToo.issueId)).toMatchObject({ verdict: SupervisorVerdict.LEAVE, fallback: SupervisorFallback.CAPPED })
	})

	it('no more than SUPERVISOR_MAX_PER_PASS tasks per pass', async () => {
		for (let index = 0; index < 7; index++) await givenSuspect()
		expect((await testBed.resolve(ObservingSupervisor).execute({})).reviewed).toHaveLength(5)
	})
})
