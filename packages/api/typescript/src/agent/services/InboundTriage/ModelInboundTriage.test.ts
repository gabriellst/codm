import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { DomainEventRepository } from '@codm/core-typescript'
import { ProviderKind, ProviderLimitWindow, UsageRole } from '@codm/contracts-typescript/wire/enums'
import { smallModelFor } from '@catalog'
import { TestBed } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { AgentRunOutcome, TriageDecision } from '../../enums'
import { ProviderLimitStatus } from '../../enums/ProviderLimitStatus'
import { AgentProviderLimitEvent } from '../../events/AgentProviderLimitEvent'
import { AgentUsageEvent } from '../../events/AgentUsageEvent'
import type { AgentRunRequest } from '../../types/AgentRunRequest'
import type { AgentRunResult, AgentRuntimeEvent } from '../../types/AgentRuntimeEvent'
import { AgentRunner } from '../AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '../AgentRunnerFactory'
import { ModelInboundTriage } from './ModelInboundTriage'

const usage = { inputTokens: 40, outputTokens: 12, cacheCreationInputTokens: 0, cacheReadInputTokens: 900 }

/** The triage's model, stubbed: answers `result` for every run — never a CLI. */
class ResultRunner extends AgentRunner {
	constructor(private readonly result: AgentRunResult) {
		super()
	}
	async *run<OutputSchema extends ZodType | undefined = undefined>(
		_request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		yield { type: 'finished', result: this.result }
	}
	async shutdown(): Promise<void> {}
}

/**
 * WHAT THE TRIAGE SPENT (fase 4, S1) — a triage run is a turn on the provider's small model, and its tokens count
 * against the same account: `agent.turn.usage` with `role: TRIAGE`, recorded by the agent (`TriageUsageRecorder`)
 * whatever the verdict — the `thread` context that asked never writes the agent's facts.
 *
 * Falsifier: drop the `onFinished` callback and neither case finds a TRIAGE fact.
 */
describe('ModelInboundTriage — the triage run spends, and the spend is recorded as TRIAGE', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const threadId = '00000000-0000-4000-8000-00000000aaaa'

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

	const decide = (result: AgentRunResult) => {
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(new ResultRunner(result)))
		return testBed.resolve(ModelInboundTriage).decide({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId,
			provider: ProviderKind.CLAUDE_CODE,
			cwd: '/tmp/workspace',
			message: { speaker: 'someone', text: 'tudo certo?' },
			openIssues: [],
			recent: [],
			now: new Date('2026-11-19T12:00:00Z'),
		})
	}
	const usageFacts = async () =>
		(await testBed.resolve(DomainEventRepository).findByType(AgentUsageEvent)).filter(e => e.entityId === threadId)

	it('a verdict the policy acts on records the run usage as TRIAGE, on the small model', async () => {
		const verdict = await decide({
			outcome: AgentRunOutcome.COMPLETED,
			replyText: '',
			sessionId: null,
			failed: false,
			output: { confidence: 0.99, verdict: { decision: TriageDecision.ORCHESTRATOR } },
			usage,
		})
		expect(verdict.decision).toBe(TriageDecision.ORCHESTRATOR)

		const [fact, ...rest] = await usageFacts()
		expect(rest).toHaveLength(0)
		expect(fact?.ownerId).toBe(MOCK_CLOUD_OWNER_ID)
		expect(fact?.payload).toEqual({
			...usage,
			role: UsageRole.TRIAGE,
			provider: ProviderKind.CLAUDE_CODE,
			model: smallModelFor(ProviderKind.CLAUDE_CODE),
		})
	})

	it('a run that failed validation spent its tokens all the same — and a refusal is a limit fact', async () => {
		const verdict = await decide({
			outcome: AgentRunOutcome.COMPLETED,
			replyText: 'not json',
			sessionId: null,
			failed: true,
			failure: 'terminal reply text was not JSON',
			usage,
			providerLimits: [{ window: ProviderLimitWindow.FIVE_HOUR, status: ProviderLimitStatus.REJECTED }],
		})
		expect(verdict.decision).toBe(TriageDecision.ORCHESTRATOR)

		expect((await usageFacts()).map(e => e.payload.role)).toEqual([UsageRole.TRIAGE])
		const limits = await testBed.resolve(DomainEventRepository).findByType(AgentProviderLimitEvent)
		expect(limits.map(e => [e.payload.role, e.payload.status])).toEqual([[UsageRole.TRIAGE, ProviderLimitStatus.REJECTED]])
	})
})
