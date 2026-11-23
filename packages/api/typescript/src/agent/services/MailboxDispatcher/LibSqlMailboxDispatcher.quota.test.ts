import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { CommandQueue, DatabaseDriver, DomainEventRepository, LoggingService } from '@codm/core-typescript'
import {
	IssueLifeState,
	IssueStatus,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	ProviderKind,
	ProviderLimitWindow,
	SlotLimit,
	TranscriptKind,
	UsageRole,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { CloudSession } from '@shared/services/CloudSession'
import { IssueHold } from '@issue/services/IssueHold'
import { lifeStateOf } from '@issue/utils/issueLifeState'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { WorkspaceRepository } from '@workspace/repositories/WorkspaceRepository'
import { ISSUE_ATTRIBUTE_DEFAULTS, IssueAttributes } from '../../entities/IssueAttributes'
import { QuotaMode } from '../../enums/QuotaMode'
import { AgentQuotaHeldEvent, AgentQuotaReleasedEvent } from '../../events/AgentQuotaHeldEvent'
import { AgentSessionRepository } from '../../repositories/AgentSessionRepository'
import { IssueAttributesRepository } from '../../repositories/IssueAttributesRepository'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { IssueTurnAborter } from '../IssueTurnAborter'
import { IssueWorktreeJanitor } from '../IssueWorktreeJanitor'
import { MachineCapacity } from '../MachineCapacity'
import { MockQuotaLedgerReader, QUOTA_SEED_CEILING } from '../QuotaBudget'
import { InMemoryQuotaStatus } from '../QuotaStatusReader'
import { ThroughputGate, type IssueLane } from '../ThroughputGate'
import { LibSqlMailboxDispatcher, type TurnReport } from './LibSqlMailboxDispatcher'

/**
 * THE QUOTA BUDGET AT THE DISPATCHER (fase 4, S3) — "o orquestrador continua respondendo com a cota de tarefas
 * esgotada". The ledger says the five-hour window is spent past its seed ceiling, so the budget denies every task turn:
 *  - in OBSERVATION (the default, owner's decision of 19/11) nothing changes in the claim — the task runs — and nothing
 *    is said; the only trace is `agent.quota.held { enforced: false }`, and no task is WAITING_BUDGET;
 *  - ENFORCED, the task lane stays closed BEFORE the claim (its item is never claimed: no attempt spent), the
 *    conversation's turn still runs, the group is told once (`BUDGET_HELD`), and the fact says `enforced: true`.
 *
 * Falsifiers: read the mode out of `HOLDS_LANE` and observation holds the task; claim and give back instead of closing
 * the lane and the held item's attempt is spent; route the THREAD lane through the gate and the conversation waits.
 */
describe('LibSqlMailboxDispatcher — the quota budget holds tasks, never the orchestrator', () => {
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

	/** A ledger whose five-hour window is spent past its seed: every task turn is denied. */
	const exhausted = () => {
		const ledger = new MockQuotaLedgerReader()
		const now = Date.now()
		ledger.script({
			usage: [
				{
					at: now - 60 * 60_000,
					entityId: 'spent',
					role: UsageRole.ISSUE,
					cost: QUOTA_SEED_CEILING[ProviderLimitWindow.FIVE_HOUR],
					windows: [],
				},
				{ at: now - 30 * 60_000, entityId: 'spent', role: UsageRole.ISSUE, cost: 1_000_000, windows: [] },
			],
			limits: [],
			holds: [],
			issueRunStarts: [],
		})
		return ledger
	}

	const gateIn = (mode: QuotaMode) => {
		class ModeGate extends ThroughputGate {
			protected override mode = mode
		}
		return new ModeGate(
			exhausted(),
			testBed.resolve(MachineCapacity),
			testBed.resolve(IssueWorktreeJanitor),
			testBed.resolve(InMemoryQuotaStatus),
			testBed.resolve(DatabaseDriver),
			testBed.resolve(DomainEventRepository),
			testBed.resolve(LoggingService),
		)
	}

	const ran: MailboxTargetKind[] = []
	class RecordingDispatcher extends LibSqlMailboxDispatcher {
		protected override async runIssueWork(): Promise<TurnReport> {
			ran.push(MailboxTargetKind.ISSUE)
			return { spoke: true, provider: ProviderKind.CLAUDE_CODE }
		}
		protected override async runThreadTurn(): Promise<TurnReport> {
			ran.push(MailboxTargetKind.THREAD)
			return { spoke: true, provider: ProviderKind.CLAUDE_CODE }
		}
	}
	const dispatcherWith = (gate: ThroughputGate) =>
		new RecordingDispatcher(
			testBed.resolve(MailboxRepository),
			testBed.resolve(ThreadRepository),
			testBed.resolve(WorkspaceRepository),
			testBed.resolve(AgentSessionRepository),
			testBed.resolve(LoggingService),
			testBed.resolve(CloudSession),
			testBed.resolve(IssueHold),
			testBed.resolve(IssueTurnAborter),
			testBed.resolve(CommandQueue),
			gate,
			testBed.resolve(IssueAttributesRepository),
		).bind(testContainer)

	/** A task of `threadId` with one queued work item, and a message to the orchestrator in the same conversation. */
	const queueTaskAndMessage = async (threadId: string) => {
		const issueId = uuidv7()
		await testBed
			.resolve(IssueAttributesRepository)
			.insertIfNew(IssueAttributes.born({ issueId, ownerId: MOCK_CLOUD_OWNER_ID, threadId, ...ISSUE_ATTRIBUTE_DEFAULTS }))
		const mailbox = testBed.resolve(MailboxRepository)
		await mailbox.enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.WORK,
			claimClass: MailboxClaimClass.WORK,
			posture: PermissionPosture.AUTO,
			payload: { threadId, key: 'APP-7', title: 'tarefa', goal: 'x' },
			dedupKey: `work:${issueId}`,
		})
		await mailbox.enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.THREAD,
			targetId: threadId,
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			claimClass: MailboxClaimClass.OPERATOR,
			posture: PermissionPosture.AUTO,
			payload: { entryId: uuidv7() },
			dedupKey: `msg:${threadId}`,
		})
		return issueId
	}

	const systemLines = async (threadId: string) =>
		(await testBed.resolve(ThreadRepository).listEntries(threadId)).filter(entry => entry.kind === TranscriptKind.SYSTEM)
	const heldFacts = () => testBed.resolve(DomainEventRepository).findByType(AgentQuotaHeldEvent)

	it('OBSERVATION: the task runs, nothing is said, and the fact records what it WOULD have held', async () => {
		ran.length = 0
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await queueTaskAndMessage(thread.id.value)

		await dispatcherWith(gateIn(QuotaMode.OBSERVE)).drain()

		expect(ran.sort()).toEqual([MailboxTargetKind.ISSUE, MailboxTargetKind.THREAD].sort())
		expect(await systemLines(thread.id.value)).toEqual([])
		const facts = await heldFacts()
		expect(facts).toHaveLength(1)
		expect(facts[0]!.payload).toMatchObject({ window: ProviderLimitWindow.FIVE_HOUR, enforced: false })
		// the board never shows a hold that is not happening
		expect(testBed.resolve(InMemoryQuotaStatus).holdsIssueLane()).toBe(false)
	})

	it('ENFORCED: the task lane stays closed before the claim, the orchestrator still answers, the group is told once', async () => {
		ran.length = 0
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issueId = await queueTaskAndMessage(thread.id.value)
		const dispatcher = dispatcherWith(gateIn(QuotaMode.ENFORCE))

		await dispatcher.drain()

		expect(ran).toEqual([MailboxTargetKind.THREAD])
		expect((await heldFacts()).map(fact => fact.payload)).toEqual([expect.objectContaining({ enforced: true })])
		const status = testBed.resolve(InMemoryQuotaStatus)
		expect(status.holdsIssueLane()).toBe(true)
		expect(status.current()?.slots).toMatchObject({ effective: 0 })
		// the queued task reads WAITING_BUDGET with the agent's answer
		expect(
			lifeStateOf({
				status: IssueStatus.WORKING,
				held: false,
				pending: [{ running: false, reminder: false }],
				openStops: 0,
				budgetHeld: status.holdsIssueLane(),
			}),
		).toBe(IssueLifeState.WAITING_BUDGET)
		// one notice for the conversation, and a second drain while still held does not repeat it
		expect(await systemLines(thread.id.value)).toHaveLength(1)
		await dispatcher.drain()
		expect(await systemLines(thread.id.value)).toHaveLength(1)

		// no attempt was spent: the first claim of the task's item is its first
		const claimed = await testBed.resolve(MailboxRepository).claimNext('quota-test', 60_000)
		expect(claimed?.targetId).toBe(issueId)
		expect(claimed?.attempts).toBe(1)
	})

	it('an empty ledger admits and records nothing — the existing queue is untouched by the budget', async () => {
		ran.length = 0
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await queueTaskAndMessage(thread.id.value)
		class EnforcingEmptyGate extends ThroughputGate {
			protected override mode = QuotaMode.ENFORCE
		}
		const gate = new EnforcingEmptyGate(
			new MockQuotaLedgerReader(),
			testBed.resolve(MachineCapacity),
			testBed.resolve(IssueWorktreeJanitor),
			testBed.resolve(InMemoryQuotaStatus),
			testBed.resolve(DatabaseDriver),
			testBed.resolve(DomainEventRepository),
			testBed.resolve(LoggingService),
		)

		await dispatcherWith(gate).drain()

		expect(ran.sort()).toEqual([MailboxTargetKind.ISSUE, MailboxTargetKind.THREAD].sort())
		expect(await heldFacts()).toEqual([])
	})

	it('a hold a previous run left open is released on the first loop that admits — never left open to "now"', async () => {
		const ledger = new MockQuotaLedgerReader()
		ledger.script({
			usage: [],
			limits: [],
			holds: [{ at: Date.now() - 60 * 60_000, window: ProviderLimitWindow.FIVE_HOUR, holding: true, enforced: false }],
			issueRunStarts: [],
		})
		const gate = new ThroughputGate(
			ledger,
			testBed.resolve(MachineCapacity),
			testBed.resolve(IssueWorktreeJanitor),
			testBed.resolve(InMemoryQuotaStatus),
			testBed.resolve(DatabaseDriver),
			testBed.resolve(DomainEventRepository),
			testBed.resolve(LoggingService),
		)
		await gate.issueLane({ inFlight: 0, max: 6, providerRefusing: false })
		const released = await testBed.resolve(DomainEventRepository).findByType(AgentQuotaReleasedEvent)
		expect(released.map(fact => fact.payload)).toEqual([
			expect.objectContaining({ window: ProviderLimitWindow.FIVE_HOUR, enforced: false }),
		])
	})

	/** A gate whose answer the test sets — to drive hold, release and hold again without a ledger. */
	const scriptedGate = () => {
		const script: { lane: IssueLane } = {
			lane: { slots: 0, limitedBy: SlotLimit.BUDGET, announce: { window: ProviderLimitWindow.FIVE_HOUR } },
		}
		class ScriptedGate extends ThroughputGate {
			override async issueLane(): Promise<IssueLane> {
				return script.lane
			}
		}
		const gate = new ScriptedGate(
			new MockQuotaLedgerReader(),
			testBed.resolve(MachineCapacity),
			testBed.resolve(IssueWorktreeJanitor),
			testBed.resolve(InMemoryQuotaStatus),
			testBed.resolve(DatabaseDriver),
			testBed.resolve(DomainEventRepository),
			testBed.resolve(LoggingService),
		)
		return { gate, script }
	}

	const noticesAcross = async (graceMs: number) => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await queueTaskAndMessage(thread.id.value)
		const { gate, script } = scriptedGate()
		class EagerDispatcher extends RecordingDispatcher {
			protected override budgetNoticeRecheckMs = 0
			protected override budgetReleaseGraceMs = graceMs
		}
		const dispatcher = new EagerDispatcher(
			testBed.resolve(MailboxRepository),
			testBed.resolve(ThreadRepository),
			testBed.resolve(WorkspaceRepository),
			testBed.resolve(AgentSessionRepository),
			testBed.resolve(LoggingService),
			testBed.resolve(CloudSession),
			testBed.resolve(IssueHold),
			testBed.resolve(IssueTurnAborter),
			testBed.resolve(CommandQueue),
			gate,
			testBed.resolve(IssueAttributesRepository),
		).bind(testContainer)
		const held = script.lane
		await dispatcher.drain() // held: told
		script.lane = { slots: 0, limitedBy: SlotLimit.MAX } // a turn settled: admitting for a moment
		await dispatcher.drain()
		script.lane = held // the next claim: held again
		await dispatcher.drain()
		return (await systemLines(thread.id.value)).length
	}

	it('a momentary release (one turn settled) does not close the cause: hold, release, hold again is ONE notice', async () => {
		expect(await noticesAcross(30 * 60_000)).toBe(1)
	})

	it('once the lane has really reopened (past the grace), the next hold is told again', async () => {
		expect(await noticesAcross(0)).toBe(2)
	})
})
