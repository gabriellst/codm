import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { AgentIdentityService, LoggingService } from '@codm/core-typescript'
import { MailboxItemKind, ProviderKind, ProviderStatus } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread, testId } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { CodexAgentRunner } from '../services/AgentRunner'
import type { AgentProcess, AgentProcessSpec } from '../services/AgentRunner/ClaudeAgentRunner/AgentProcess'
import { AgentRunnerFactory } from '../services/AgentRunnerFactory'
import { ProviderDetector, MockProviderDetector } from '../services/ProviderDetector'
import { AgentSessionRepository } from '../repositories/AgentSessionRepository'
import { AgentRunOutcome } from '../enums'
import { RunIssueTurn } from './RunIssueTurn'
import { RunOrchestratorTurn } from './RunOrchestratorTurn'

class CodexOnlyFactory extends AgentRunnerFactory {
	readonly supported = [ProviderKind.CODEX] as const
	constructor(private readonly codex: CodexAgentRunner) { super() }
	protected runnerFor(provider: ProviderKind) { return provider === ProviderKind.CODEX ? this.codex : undefined }
	async shutdown(): Promise<void> { await this.codex.shutdown() }
}

function capturedCodexSpawner(reply: string, threadId: string) {
	const specs: AgentProcessSpec[] = []
	const line = (value: unknown): string => `${JSON.stringify(value)}\n`
	const output = [
		line({ type: 'thread.started', thread_id: threadId }),
		line({ type: 'turn.started' }),
		line({ type: 'item.completed', item: { id: 'item_answer', type: 'agent_message', text: reply } }),
		line({ type: 'turn.completed', usage: { input_tokens: 1200, cached_input_tokens: 800, cache_write_input_tokens: 0, output_tokens: 20 } }),
	]
	return {
		specs,
		spawn(spec: AgentProcessSpec): AgentProcess {
			specs.push(spec)
			return {
				stdout: (async function* () { for (const chunk of output) yield chunk })(),
				stderr: (async function* () {})(),
				write() {}, endStdin() {}, kill() {}, exited: Promise.resolve(0),
			}
		},
	}
}

describe('Codex vertical — use case → runner → captured JSONL → session', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => { await testBed.reset() })
	afterAll(async () => { await testBed.destroy() })

	function installCodex(reply: string, providerThreadId: string) {
		const fake = capturedCodexSpawner(reply, providerThreadId)
		const runner = CodexAgentRunner.withOptions(testBed.resolve(LoggingService), testBed.resolve(AgentIdentityService), { spawner: fake.spawn })
		testBed.override(AgentRunnerFactory, new CodexOnlyFactory(runner))
		testBed.override(ProviderDetector, MockProviderDetector.with({
			[ProviderKind.CODEX]: {
				name: ProviderKind.CODEX,
				status: ProviderStatus.DETECTED,
				binaryPath: '/opt/bin/codex',
				version: 'codex-cli smoke',
				caps: { mcpConfig: true, sessionResume: true },
			},
		}))
		return fake
	}

	it('RunOrchestratorTurn completes with Codex and persists its thread_id', async () => {
		const providerThreadId = '01a0488b-31d0-7613-a0fa-02c8993fb245'
		const fake = installCodex('Resposta Codex do orquestrador.', providerThreadId)
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, providers: [ProviderKind.CODEX] })

		const output = await testBed.resolve(RunOrchestratorTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			workspacePath: '/tmp/workspace',
			provider: ProviderKind.CODEX,
			item: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: crypto.randomUUID(), speaker: 'operator', text: 'continue' },
		})

		expect(output.text).toBe('Resposta Codex do orquestrador.')
		expect((await testBed.resolve(AgentSessionRepository).findOrchestratorByThreadId(thread.id.value))?.agentSessionId).toBe(providerThreadId)
		expect(fake.specs[0]?.cmd).toContain('exec')
		expect(fake.specs[0]?.env?.CODM_RUN_TOKEN).toBeDefined()
	})

	it('RunIssueTurn completes with Codex, persists thread_id, and uses resume on the second turn', async () => {
		const providerThreadId = '01a0488b-31d0-7613-a0fa-02c8993fb246'
		const fake = installCodex('Trabalho Codex concluído.', providerThreadId)
		const issueId = testId('codex-vertical', 'issue')
		const input = {
			ownerId: MOCK_CLOUD_OWNER_ID,
			issueId,
			threadId: testId('codex-vertical', 'thread'),
			key: 'codex-smoke',
			title: 'Codex smoke',
			provider: ProviderKind.CODEX,
			workspacePath: '/tmp/workspace',
			prompt: 'execute o trabalho',
			turnKind: MailboxItemKind.WORK as const,
			messageId: testId('codex-vertical', 'entry-1'),
		}

		const first = await testBed.resolve(RunIssueTurn).execute(input)
		expect(first.outcome).toBe(AgentRunOutcome.COMPLETED)
		expect(first.replyText).toBe('Trabalho Codex concluído.')
		expect((await testBed.resolve(AgentSessionRepository).findByIssueId(issueId))?.agentSessionId).toBe(providerThreadId)

		await testBed.resolve(RunIssueTurn).execute({ ...input, messageId: testId('codex-vertical', 'entry-2'), priorMessageId: input.messageId })
		expect(fake.specs[1]?.cmd).toEqual(expect.arrayContaining(['exec', '--approve-for-me', 'resume', providerThreadId]))
	})
})
