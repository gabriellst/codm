import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { DomainEventRepository } from '@codm/core-typescript'
import {
	AgentModelId,
	IssueWorkKind,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	ProviderKind,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread, givenWorkspace, testId } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { ForkIssue } from '../../usecases/ForkIssue'
import { AgentUsageEvent } from '../../events/AgentUsageEvent'
import { AgentRunner } from '../AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '../AgentRunnerFactory'
import { AgentRunOutcome } from '../../enums'
import type { AgentRunRequest } from '../../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../../types/AgentRuntimeEvent'
import { MailboxDispatcher } from './MailboxDispatcher'

/** Records each request (its model and session) and reports the session it was handed, with some usage. */
class RecordingRunner extends AgentRunner {
	readonly requests: AgentRunRequest<ZodType | undefined>[] = []
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
				contextTokens: 10_000,
				usage: { inputTokens: 1, outputTokens: 10, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
			},
		}
	}
	async shutdown(): Promise<void> {}
}

/**
 * MODELO POR TIPO DE TRABALHO (fase 4, S7) — measured on the real dispatcher and the real issue turn (stub runner):
 * a task forked as DIAGNOSIS runs on the table's cheaper tier whatever the conversation is set to; its usage facts say
 * so (what S10 measures cost per task by); and the conversation changing its model later neither moves the task nor
 * breaks its resume (`MODEL_CHANGED`).
 *
 * Falsifier: keep `thread.modelFor(provider)` in the dispatcher and the first turn asks OPUS; re-resolve the model per
 * turn from the conversation and the second turn asks HAIKU and starts fresh.
 */
describe('a task runs on the model its kind of work was born with', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const runner = new RecordingRunner()

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
	})
	beforeEach(async () => {
		await testBed.reset()
		runner.requests.length = 0
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('a DIAGNOSIS runs cheaper, stamps that model on its usage, and keeps it when the conversation changes model', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})
		thread.configureModel(ProviderKind.CLAUDE_CODE, AgentModelId.OPUS)
		await testBed.resolve(ThreadRepository).save(thread)

		const { issueId, key } = await testBed.resolve(ForkIssue).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			goal: 'descobre por que o relatório de ontem veio vazio',
			workKind: IssueWorkKind.DIAGNOSIS,
			originEntryId: testId('dispatcher-model', 'entry'),
			posture: PermissionPosture.AUTO,
		})
		const dispatcher = testBed.resolve(MailboxDispatcher).bind(testContainer)
		await dispatcher.drain()

		expect(runner.requests[0]?.model).toBe(AgentModelId.SONNET)
		const [usage] = await testBed.resolve(DomainEventRepository).findByType(AgentUsageEvent)
		expect(usage?.entityId).toBe(issueId)
		expect(usage?.payload.model).toBe(AgentModelId.SONNET)

		// The conversation moves on to another model; the open task does not.
		const reloaded = await testBed.resolve(ThreadRepository).findById(thread.id.value)
		reloaded?.configureModel(ProviderKind.CLAUDE_CODE, AgentModelId.HAIKU)
		if (reloaded) await testBed.resolve(ThreadRepository).save(reloaded)
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.STEER,
			posture: PermissionPosture.AUTO,
			payload: { issueId, threadId: thread.id.value, key, title: 'relatório vazio', text: 'olha também o de anteontem' },
			dedupKey: `steer:${issueId}:model`,
		})
		await Bun.sleep(2) // two turns of one issue in one millisecond mint the same event id — see RunIssueTurn.test (CWD_CHANGED)
		await dispatcher.drain()

		expect(runner.requests[1]?.model).toBe(AgentModelId.SONNET)
		// Same model, same session: the resume premise held.
		expect(runner.requests[1]?.session?.resumeId).toBe(runner.requests[0]?.session?.newId)
	})
})
