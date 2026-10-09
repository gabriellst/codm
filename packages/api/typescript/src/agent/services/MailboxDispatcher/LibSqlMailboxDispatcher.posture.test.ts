import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import type { ZodType } from 'zod'
import { AgentIdentityService, LibSqlDatabaseDriver, LoggingService } from '@codm/core-typescript'
import { agentMailbox } from '@codm/contracts/db'
import { MailboxItemKind, MailboxTargetKind, PermissionPosture, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { CloudSession } from '@shared/services/CloudSession'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { WorkspaceRepository } from '@workspace/repositories/WorkspaceRepository'
import { AgentSessionRepository } from '../../repositories/AgentSessionRepository'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { RunOrchestratorTurn } from '../../usecases/RunOrchestratorTurn'
import { RunIssueTurn } from '../../usecases/RunIssueTurn'
import { AgentRunner } from '../AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '../AgentRunnerFactory'
import { AgentRunOutcome } from '../../enums'
import type { AgentRunRequest } from '../../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../../types/AgentRuntimeEvent'
import { LibSqlMailboxDispatcher } from './LibSqlMailboxDispatcher'

/** Captures the request the AGENT assembled, so what reaches the seam is what gets asserted. */
class CapturingRunner extends AgentRunner {
	readonly requests: AgentRunRequest<ZodType | undefined>[] = []
	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		yield { type: 'finished', result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'ok', sessionId: 'sess-posture', failed: false } }
	}
	async shutdown(): Promise<void> {}
}

/**
 * AC-5 / AC-6 (participant-permission-posture) — the posture of the item the dispatcher CLAIMED is the
 * posture the turn runs under: it reaches the use case, then the runner request, then the run token
 * the tool doors read back. One item per turn (`claimNext` + `.limit(1)`), so there is nothing to
 * combine — the claimed item's posture IS the turn's.
 *
 * Items are inserted straight into `agent_mailbox` because what is under test is the READ side; the
 * producers that stamp the column are their own Task.
 */
describe('a turn runs with the posture of the item it consumed', () => {
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

	const insertItem = (values: {
		targetKind: MailboxTargetKind
		targetId: string
		kind: MailboxItemKind
		payload: unknown
		posture: PermissionPosture
	}) =>
		testBed
			.resolve(LibSqlDatabaseDriver)
			.db.insert(agentMailbox)
			.values({ id: uuidv7(), ownerId: MOCK_CLOUD_OWNER_ID, dedupKey: `posture:${uuidv7()}`, ...values })

	it('the dispatcher hands the claimed posture to the orchestrator turn AND to the issue turn', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})

		const seen: Record<string, PermissionPosture | undefined> = {}
		const spy = (label: string) => ({
			bindContainer() {
				return this
			},
			async execute(input: { posture: PermissionPosture }) {
				seen[label] = input.posture
				return { spoke: true }
			},
		})
		const spyContainer = testContainer.createChildContainer()
		spyContainer.registerInstance(RunOrchestratorTurn as never, spy('thread') as never)
		spyContainer.registerInstance(RunIssueTurn as never, spy('issue') as never)

		await insertItem({
			targetKind: MailboxTargetKind.THREAD,
			targetId: thread.id.value,
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			payload: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'operator', text: 'troca a moeda' },
			posture: PermissionPosture.BYPASS,
		})
		await insertItem({
			targetKind: MailboxTargetKind.ISSUE,
			targetId: uuidv7(),
			kind: MailboxItemKind.WORK,
			payload: { threadId: thread.id.value, key: 'moeda', title: 'moeda', goal: 'troca a moeda', provider: ProviderKind.CLAUDE_CODE },
			posture: PermissionPosture.BYPASS,
		})

		const dispatcher = new LibSqlMailboxDispatcher(
			testBed.resolve(MailboxRepository),
			testBed.resolve(ThreadRepository),
			testBed.resolve(WorkspaceRepository),
			testBed.resolve(AgentSessionRepository),
			testBed.resolve(LoggingService),
			testBed.resolve(CloudSession),
		).bind(spyContainer)
		await dispatcher.drain()

		expect(seen.thread).toBe(PermissionPosture.BYPASS)
		expect(seen.issue).toBe(PermissionPosture.BYPASS)
	})

	it('RunIssueTurn puts the posture on the runner request AND on the run token the tools read back', async () => {
		const runner = new CapturingRunner()
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))

		await testBed.resolve(RunIssueTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			issueId: uuidv7(),
			threadId: uuidv7(),
			key: 'moeda',
			title: 'Troca a moeda',
			provider: ProviderKind.CLAUDE_CODE,
			workspacePath: '/tmp/workspace',
			prompt: 'troca a moeda da Loja 01',
			turnKind: MailboxItemKind.WORK,
			messageId: uuidv7(),
			posture: PermissionPosture.BYPASS,
		})

		const request = runner.requests[0]
		expect(request?.posture).toBe(PermissionPosture.BYPASS)
		expect(testBed.resolve(AgentIdentityService).resolve(request?.mcp?.token ?? '')?.posture).toBe(PermissionPosture.BYPASS)
	})

	it('RunOrchestratorTurn does the same for the orchestrator — AUTO stays AUTO', async () => {
		const runner = new CapturingRunner()
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		await testBed.resolve(RunOrchestratorTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			workspacePath: '/tmp/workspace',
			provider: ProviderKind.CLAUDE_CODE,
			item: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'Ada', text: 'libera a conta X' },
			entryId: uuidv7(),
			posture: PermissionPosture.AUTO,
		})

		const request = runner.requests[0]
		expect(request?.posture).toBe(PermissionPosture.AUTO)
		expect(testBed.resolve(AgentIdentityService).resolve(request?.mcp?.token ?? '')?.posture).toBe(PermissionPosture.AUTO)
	})
})
