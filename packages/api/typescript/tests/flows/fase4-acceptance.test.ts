import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import type { ZodType } from 'zod'
import { CommandQueue, DatabaseDriver, DomainEventRepository, LoggingService } from '@codm/core-typescript'
import {
	AgentModelId,
	BatchItemDestinationKind,
	BatchStatus,
	Language,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	ProviderKind,
	ProviderLimitWindow,
	UsageRole,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread, GIVEN_MENTION_TAG } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { CloudSession } from '@shared/services/CloudSession'
import { IssueHold } from '@issue/services/IssueHold'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { BatchRepository } from '@thread/repositories/BatchRepository'
import { IngestChannelMessage } from '@thread/usecases/IngestChannelMessage'
import { RecordBatch } from '@thread/usecases/RecordBatch'
import { WorkspaceRepository } from '@workspace/repositories/WorkspaceRepository'
import { ISSUE_ATTRIBUTE_DEFAULTS, IssueAttributes } from '@agent/entities/IssueAttributes'
import { AgentSession } from '@agent/entities/AgentSession'
import { AgentRunOutcome } from '@agent/enums'
import { QuotaMode } from '@agent/enums/QuotaMode'
import { AgentSessionHandedOffEvent } from '@agent/events/AgentSessionHandedOffEvent'
import { AgentSessionRepository } from '@agent/repositories/AgentSessionRepository'
import { IssueAttributesRepository } from '@agent/repositories/IssueAttributesRepository'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { AgentRunner } from '@agent/services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '@agent/services/AgentRunnerFactory'
import { IssueTurnAborter } from '@agent/services/IssueTurnAborter'
import { IssueWorktreeJanitor } from '@agent/services/IssueWorktreeJanitor'
import { MachineCapacity } from '@agent/services/MachineCapacity'
import { LibSqlMailboxDispatcher, type TurnReport } from '@agent/services/MailboxDispatcher/LibSqlMailboxDispatcher'
import { CUTS_WINDOWS, MockQuotaLedgerReader, QUOTA_SEED_CEILING, WINDOW_LENGTH_MS, type QuotaUsageFact } from '@agent/services/QuotaBudget'
import { InMemoryQuotaStatus } from '@agent/services/QuotaStatusReader'
import { ThroughputGate } from '@agent/services/ThroughputGate'
import { ISSUE_CONTEXT_BUDGET, RunIssueTurn } from '@agent/usecases/RunIssueTurn'
import type { AgentRunRequest } from '@agent/types/AgentRunRequest'
import type { AgentRuntimeEvent } from '@agent/types/AgentRuntimeEvent'
import { costOf, USAGE_COST_WEIGHTS } from '@agent/utils/UsageCost'

/**
 * ACEITE DA FASE 4 — "vazão" — the four criteria of the phase checked TOGETHER, on one integration test bed:
 *  1. with usage events from a real install (anonymized fixture: time offsets, role and token buckets only), the
 *     scheduler HOLDS new task work before the provider refuses — and
 *  2. the orchestrator keeps answering while the task quota is exhausted (the real dispatcher, budget ENFORCED);
 *  3. a batch receipt with 10 items records 10 destinations, and the group gets one receipt;
 *  4. a session past the threshold continues in a fresh session that keeps the thread (notes, pending message).
 *
 * Criterion 1 is shown here at the instants the provider refused out of sample, with the measured spend of the real
 * window just before each refusal: the lane is already closed while the provider still answers. What this does NOT
 * show (the spec says so — "Como medi (depois)"): that over the whole fortnight the budget holds fewer hours than the
 * provider paused — that is the `it.failing` criterion of `fase4-quota-replay.test.ts`, contradicted by the
 * measurement, and the reason enforcement stays OFF by default (observation week).
 */

interface FixtureTurn {
	tMs: number
	role: UsageRole
	inputTokens: number
	outputTokens: number
	cacheCreationInputTokens: number
	cacheReadInputTokens: number
}
interface Fixture {
	origin: string
	turns: FixtureTurn[]
	refusals: { tMs: number; window: ProviderLimitWindow }[]
}
const fixture: Fixture = JSON.parse(readFileSync(join(import.meta.dir, '../fixtures/quota/usage-2026-11.json'), 'utf8'))
const W46 = Date.parse('2026-11-09T00:00:00.000Z') - Date.parse(fixture.origin)
const WEIGHTS = USAGE_COST_WEIGHTS[AgentModelId.OPUS]
/** "Just before the refusal": the provider has not refused yet. */
const BEFORE_MS = 60_000

/** The fixture's spend in `window` up to (and excluding) `at`, as the budget measures it. */
const spendBefore = (at: number, windowMs: number) =>
	fixture.turns.filter(turn => turn.tMs < at && turn.tMs >= at - windowMs).reduce((total, turn) => total + costOf(turn, WEIGHTS), 0)

/** The out-of-sample refusals whose whole five-hour window the fixture holds — the ones a real limit is known for. */
const outOfSampleFiveHour = fixture.refusals.filter(
	refusal =>
		refusal.tMs >= W46 &&
		CUTS_WINDOWS[refusal.window].includes(ProviderLimitWindow.FIVE_HOUR) &&
		refusal.tMs >= WINDOW_LENGTH_MS[ProviderLimitWindow.FIVE_HOUR],
)

/** The real usage of the week before `refusalAt`, replayed so that the refusal would land one minute from now. */
function ledgerBefore(refusalAt: number): MockQuotaLedgerReader {
	const now = Date.now()
	const usage: QuotaUsageFact[] = fixture.turns
		.filter(turn => turn.tMs < refusalAt - BEFORE_MS && turn.tMs >= refusalAt - WINDOW_LENGTH_MS[ProviderLimitWindow.WEEKLY])
		.map((turn, n) => ({
			at: now - (refusalAt - BEFORE_MS - turn.tMs),
			entityId: `turn-${n}`,
			role: turn.role,
			cost: costOf(turn, WEIGHTS),
			windows: [],
		}))
	const ledger = new MockQuotaLedgerReader()
	ledger.script({ usage, limits: [], holds: [], issueRunStarts: [] })
	return ledger
}

/** Each run finishes at once, reporting the session it was handed and a small context. */
class ScriptedRunner extends AgentRunner {
	requests: AgentRunRequest<ZodType | undefined>[] = []
	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		yield {
			type: 'finished',
			result: {
				outcome: AgentRunOutcome.COMPLETED,
				replyText: 'ok',
				sessionId: request.session?.resumeId ?? request.session?.newId ?? null,
				failed: false,
				contextTokens: 20_000,
			},
		}
	}
	async shutdown(): Promise<void> {}
}

describe('fase 4 — acceptance', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const runner = new ScriptedRunner()

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
	})
	beforeEach(async () => {
		await testBed.reset()
		runner.requests = []
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	describe('1–2. real usage: the task lane closes before the provider refuses, and the orchestrator keeps answering', () => {
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
		const enforcedOver = (ledger: MockQuotaLedgerReader) => {
			class EnforcedGate extends ThroughputGate {
				protected override mode = QuotaMode.ENFORCE
			}
			const gate = new EnforcedGate(
				ledger,
				testBed.resolve(MachineCapacity),
				testBed.resolve(IssueWorktreeJanitor),
				testBed.resolve(InMemoryQuotaStatus),
				testBed.resolve(DatabaseDriver),
				testBed.resolve(DomainEventRepository),
				testBed.resolve(LoggingService),
			)
			return new RecordingDispatcher(
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
		}

		it('the fixture has out-of-sample five-hour refusals whose measured spend just before them passes the seed', () => {
			expect(outOfSampleFiveHour.length).toBeGreaterThan(0)
			const atOrPastSeed = outOfSampleFiveHour.filter(
				refusal =>
					spendBefore(refusal.tMs - BEFORE_MS, WINDOW_LENGTH_MS[ProviderLimitWindow.FIVE_HOUR]) >=
					QUOTA_SEED_CEILING[ProviderLimitWindow.FIVE_HOUR],
			)
			expect(atOrPastSeed.length).toBeGreaterThan(0)
		})

		for (const [n, refusal] of outOfSampleFiveHour.entries()) {
			it(`one minute before real refusal #${n + 1}: no new task is claimed, the conversation's message is answered`, async () => {
				ran.length = 0
				const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
				const threadId = thread.id.value
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
					payload: { threadId, key: 'APP-1', title: 'tarefa nova', goal: 'x' },
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

				await enforcedOver(ledgerBefore(refusal.tMs)).drain()

				expect(ran).toEqual([MailboxTargetKind.THREAD])
				expect(await mailbox.hasPending(MailboxTargetKind.ISSUE, issueId)).toBe(true)
			})
		}
	})

	describe('3. a batch of 10 items records 10 destinations, and the group gets one receipt', () => {
		it('10 listed → 10 destinations, RECORDED, one delivery', async () => {
			const thread = await givenThread(testBed, {
				ownerId: MOCK_CLOUD_OWNER_ID,
				participants: [
					{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
					{ participantId: 'member-a', name: 'Member A', source: 'Group member', canInvoke: true, canElevate: false },
				],
			})
			thread.configureLanguage(Language.PT_BR)
			await testBed.resolve(ThreadRepository).save(thread)
			await testBed.resolve(IngestChannelMessage).execute({
				threadId: thread.id.value,
				senderExternalId: 'member-a',
				text: [`${GIVEN_MENTION_TAG} lista:`, ...Array.from({ length: 10 }, (_, i) => `${i + 1}. pedido ${i + 1}`)].join('\n'),
				receivedAt: new Date(),
				platformMessageId: `platform-${uuidv7()}`,
			})
			const deliveries = () => testBed.probe().count('scheduledCommands', { name: 'deliver_channel_message' })
			const before = await deliveries()

			await testBed.resolve(RecordBatch).execute({
				ownerId: MOCK_CLOUD_OWNER_ID,
				threadId: thread.id.value,
				batchCode: 'L-1',
				items: Array.from({ length: 10 }, (_, i) => ({
					n: i + 1,
					destination: { kind: BatchItemDestinationKind.DEFERRED, reason: `depois ${i + 1}` },
				})),
			})

			const batch = await testBed.resolve(BatchRepository).findByCode(thread.id.value, 'L-1')
			expect(batch?.status).toBe(BatchStatus.RECORDED)
			expect(batch?.items.filter(item => item.destination !== undefined)).toHaveLength(10)
			expect(await deliveries()).toBe(before + 1)
		})
	})

	describe('4. past the threshold the task continues in a fresh session that keeps the thread', () => {
		it('notes + pending message seed the new session; the fact records both sessions', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			const issueId = uuidv7()
			const notes = 'Goal: the report as PDF. Done: the template. Next: the footer.'
			const [entry0, entry1] = [uuidv7(), uuidv7()]
			const session = AgentSession.create({
				ownerId: MOCK_CLOUD_OWNER_ID,
				issueId,
				threadId: thread.id.value,
				provider: ProviderKind.CLAUDE_CODE,
				cwd: '/tmp/workspace',
				agentSessionId: 'old-session',
				model: AgentModelId.DEFAULT,
				lastMessageId: entry0,
				contextTokens: ISSUE_CONTEXT_BUDGET + 10_000,
			})
			session.recordHandoff(notes)
			await testBed.resolve(AgentSessionRepository).save(session)

			await testBed.resolve(RunIssueTurn).execute({
				ownerId: MOCK_CLOUD_OWNER_ID,
				issueId,
				threadId: thread.id.value,
				key: 'APP-7',
				title: 'Relatório em PDF',
				provider: ProviderKind.CLAUDE_CODE,
				workspacePath: '/tmp/workspace',
				prompt: 'põe o logo no rodapé',
				turnKind: MailboxItemKind.STEER,
				posture: PermissionPosture.AUTO,
				messageId: entry1,
				priorMessageId: entry0,
			})

			const request = runner.requests[0]
			expect(request?.session?.resumeId).toBeUndefined()
			const first = String(request?.messages[0]?.content ?? '')
			expect(first).toContain(notes)
			expect(first).toContain('põe o logo no rodapé')
			const [fact] = await testBed.resolve(DomainEventRepository).findByType(AgentSessionHandedOffEvent)
			expect(fact?.payload).toMatchObject({ issueId, fromAgentSessionId: 'old-session', toAgentSessionId: String(request?.session?.newId) })
		})
	})
})
