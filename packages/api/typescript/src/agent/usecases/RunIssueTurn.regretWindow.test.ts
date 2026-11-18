import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { MailboxItemKind, PermissionPosture, ProviderKind, ProviderStatus } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread, testId } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { RunIssueTurn } from './RunIssueTurn'
import { AgentRunner } from '../services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '../services/AgentRunnerFactory'
import { MockProviderDetector, ProviderDetector } from '../services/ProviderDetector'
import { AgentRunOutcome } from '../enums'
import type { AgentRunRequest } from '../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../types/AgentRuntimeEvent'

/** Records the request and declares the capability the claude runner declares. */
class HookingRunner extends AgentRunner {
	override readonly preToolHook = true
	readonly requests: AgentRunRequest<ZodType | undefined>[] = []

	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		yield { type: 'finished', result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'ok', sessionId: 'sess-r', failed: false } }
	}

	async shutdown(): Promise<void> {}
}

/**
 * THE ASSEMBLED PATH (fase 2, item 3): what the probe found (`--plugin-dir`) and what the runner declares
 * (`preToolHook`) both reach the request a real issue turn builds — the two halves the claude runner
 * needs to attach the hook. Each half is unit-tested elsewhere; this proves nothing between the detector
 * and `run()` drops either one (a re-declared caps shape would, silently: the run only logs "no window").
 */
describe('RunIssueTurn carries the regret window to the runner', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const runner = new HookingRunner()

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
		testBed.override(
			ProviderDetector,
			MockProviderDetector.with({
				[ProviderKind.CLAUDE_CODE]: {
					name: ProviderKind.CLAUDE_CODE,
					status: ProviderStatus.DETECTED,
					binaryPath: '/usr/local/bin/claude',
					version: '2.1.327',
					caps: { sessionResume: true, mcpConfig: true, pluginDir: true },
				},
			}),
		)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('the probed --plugin-dir and the hook door both arrive in the request', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-7' })

		await testBed.resolve(RunIssueTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			issueId: issue.id.value,
			threadId: thread.id.value,
			key: 'APP-7',
			title: 'Publicar a versão',
			provider: ProviderKind.CLAUDE_CODE,
			workspacePath: '/tmp/workspace',
			prompt: 'publica a versão nova',
			turnKind: MailboxItemKind.WORK as const,
			posture: PermissionPosture.AUTO,
			messageId: testId('regret-turn', 'entry'),
		})

		const request = runner.requests[0]
		expect(request?.caps?.pluginDir).toBe(true)
		expect(request?.mcp?.preToolHook?.endpoint).toEndWith('/agent/pre-tool-hook')
	})
})
