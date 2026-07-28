import { describe, expect, it } from 'bun:test'
import type { ZodType } from 'zod'
import { BaseError } from '@codedm/core-typescript'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunner } from '../../services/AgentRunner'
import { AgentRunOutcome, type TransportStopKind } from '../../enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '../../types'
import { ClassifyIssuePromptBuilder } from './prompt'
import { ClassifyIssueAgent } from './ClassifyIssueAgent'
// The real token service, not a double: it is a Map with a clock, so a stub would only be a second
// implementation of the thing under test. Every agent takes one now because the base MINTS in `run()`.
import { InMemoryRunTokenService } from '../../mcp/RunTokenService'

/**
 * `classify()` is the ONE public method this agent exposes (§4.5), and its whole body is
 * `return this.collect(input)` — the base's `protected` drain helper (`types/Agent.ts`). What is
 * under test here is exactly that delegation, plus the half of the base template method that ONLY an
 * agent WITH an `outputSchema` can reach at all: `IssueWorkAgent.test.ts` cannot exercise `collect()`
 * — its `output` phantom is `never`, so the method is unusable there, and its test file never calls it.
 *
 * Routing POLICY (confidence threshold, slug minting, the reply-quote shortcut, the `ClassificationDecision`
 * DTO) is `IssueRouter`'s, not this agent's, and `IssueRouter.test.ts` already exercises `classify()`
 * indirectly through that policy layer — including both `CLASSIFICATION_FAILED` translations. This file
 * does NOT repeat that matrix; it isolates the agent's OWN contract (delegation + the base's failure
 * translation) from the router that sits on top of it, with no `IssueRouter` import at all.
 */
class StubbedRunner extends AgentRunner {
	nextEvents: AgentRuntimeEvent[] = [
		{
			type: 'finished',
			result: { outcome: AgentRunOutcome.COMPLETED, replyText: '{}', sessionId: null, failed: false, output: { decision: 'CLARIFY' } },
		},
	]

	readonly requests: AgentRunRequest<ZodType | undefined>[] = []

	run<OutputSchema extends ZodType | undefined = undefined>(request: AgentRunRequest<OutputSchema>): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		const events = this.nextEvents
		return (async function* () {
			for (const event of events) yield event
		})()
	}

	async shutdown(): Promise<void> {}
}

const input = (overrides: Partial<Parameters<ClassifyIssueAgent['classify']>[0]> = {}): Parameters<ClassifyIssueAgent['classify']>[0] => ({
	ownerId: '00000000-0000-4000-8000-0000000000aa',
	threadId: '00000000-0000-4000-8000-0000000000bb',
	cwd: '/Users/dev/project',
	message: 'still broken',
	openIssues: [],
	...overrides,
})

const build = () => {
	const runner = new StubbedRunner()
	return { runner, agent: new ClassifyIssueAgent(runner, new InMemoryRunTokenService(), new ClassifyIssuePromptBuilder()) }
}

describe('ClassifyIssueAgent — classify() IS collect(), the base half IssueWorkAgent cannot reach', () => {
	it("returns the runner's raw structured output UNTOUCHED — classify adds no shape, no default, no field", async () => {
		const { runner, agent } = build()
		runner.nextEvents = [
			{
				type: 'finished',
				result: {
					outcome: AgentRunOutcome.COMPLETED,
					replyText: '{"decision":"NEW_ISSUE","title":"Fix the thing","confidence":0.8}',
					sessionId: 'sess-1',
					failed: false,
					output: { decision: 'NEW_ISSUE', title: 'Fix the thing', confidence: 0.8 },
				},
			},
		]

		const decision = await agent.classify(input())

		// Deep-equal to the EXACT object the runner produced (`result.output`, cast — never re-parsed,
		// per the base's own docstring): no `kind`, no `slugKey`, no default title. That reshaping is
		// `IssueRouter`'s DTO, and it never happens inside `classify()`/`collect()`.
		expect(decision).toEqual({ decision: 'NEW_ISSUE', title: 'Fix the thing', confidence: 0.8 })
		// One `classify()` call is one `run()` call — the delegation hides no retry and no second transport.
		expect(runner.requests).toHaveLength(1)
	})

	it("a TRANSPORT stop becomes CLASSIFICATION_FAILED — THIS agent's collectFailure override, not the base's plain Error", async () => {
		const { runner, agent } = build()
		runner.nextEvents = [
			{
				type: 'finished',
				result: {
					outcome: AgentRunOutcome.STOPPED,
					replyText: '',
					sessionId: null,
					failed: false,
					stop: { kind: StopKind.SERVER_ERROR as TransportStopKind, detail: 'provider offline' },
				},
			},
		]

		const rejection = agent.classify(input())

		// Overridden on `ClassifyIssueAgent.ts` (`collectFailure`) — the base's default would throw a bare
		// `Error`, unnamed and un-mappable by `GlobalErrorMapper`. Asserting the `BaseError` type, not just
		// the message, is what proves the override — not the base default — produced this rejection.
		await expect(rejection).rejects.toBeInstanceOf(BaseError)
		await expect(rejection).rejects.toThrow(expect.objectContaining({ name: 'CLASSIFICATION_FAILED' }) as BaseError)
	})

	it('a structurally-FAILED run becomes the SAME named error — both terminal failure shapes drain through one hook', async () => {
		const { runner, agent } = build()
		runner.nextEvents = [
			{
				type: 'finished',
				result: {
					outcome: AgentRunOutcome.COMPLETED,
					replyText: 'not json',
					sessionId: null,
					failed: true,
					failure: 'terminal reply text was not JSON',
				},
			},
		]

		const rejection = agent.classify(input())

		// Same `collectFailure` override as the transport-stop case above — `collect()`'s contract is that
		// BOTH failure modes (`result.stop` and `result.failed`) land on the SAME hook (`types/Agent.ts`
		// docstring), never as two different error shapes a caller would have to distinguish.
		await expect(rejection).rejects.toBeInstanceOf(BaseError)
		await expect(rejection).rejects.toThrow(expect.objectContaining({ name: 'CLASSIFICATION_FAILED' }) as BaseError)
	})
})
