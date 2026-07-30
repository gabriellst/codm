import { describe, expect, it } from 'bun:test'
import type { ZodType } from 'zod'
import { ContactKind, MailboxItemKind } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunner } from '../../services/AgentRunner'
import { AgentName, AgentRunOutcome } from '../../enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '../../types'
import { InMemoryAgentIdentityService } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import type { AgentRunIdentity } from '../../types/AgentRunIdentity'
import { TOOLS_IN_SCOPE } from '../../mcp/manifest'
import { OrchestratorPromptBuilder } from './prompt'
import { OrchestratorAgent } from './OrchestratorAgent'

class CapturingRunner extends AgentRunner {
	readonly requests: AgentRunRequest<ZodType | undefined>[] = []

	run<OutputSchema extends ZodType | undefined = undefined>(request: AgentRunRequest<OutputSchema>): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		return (async function* () {
			yield {
				type: 'finished',
				result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'sim, claro', sessionId: 'sess-1', failed: false },
			} satisfies AgentRuntimeEvent
		})()
	}

	async shutdown(): Promise<void> {}
}

const input = () =>
	({
		ownerId: '00000000-0000-4000-8000-0000000000aa',
		threadId: '00000000-0000-4000-8000-0000000000bb',
		// NO issueId — the orchestrator is thread-keyed and structurally has none (§6.1).
		entryId: '00000000-0000-4000-8000-0000000000dd',
		cwd: '/Users/dev/project',
		contactKind: ContactKind.GROUP,
		mentionTag: '@codedm',
		window: { seeded: true, entries: [] },
		item: {
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			entryId: '00000000-0000-4000-8000-0000000000dd',
			speaker: 'operator',
			text: 'pode me tirar uma dúvida?',
		},
	}) as Parameters<OrchestratorAgent['run']>[1]

const build = () => ({
	runner: new CapturingRunner(),
	tokens: new InMemoryAgentIdentityService<AgentRunIdentity>(),
})

describe('OrchestratorAgent', () => {
	/**
	 * AC-T3.2 — the blocker that gated the whole pivot, asserted as behaviour rather than as a comment.
	 *
	 * Before §7.2.1 the base refused to issue a credential for ANY scoped agent without an `issueId`. This agent
	 * declares a scope and never has one, so that rule would have thrown on every single turn — the
	 * product would have shipped conversing-never. A regression here is not subtle in production and is
	 * completely silent in a unit test that only checks the happy path, which is why the assertion is
	 * "the run completes at all".
	 */
	it('AC-T3.2 — a turn with NO issueId mints and runs, rather than throwing', async () => {
		const { runner, tokens } = build()
		const agent = new OrchestratorAgent(tokens, new OrchestratorPromptBuilder())

		for await (const _ of agent.run(runner, input())) {
			// drain
		}

		expect(runner.requests).toHaveLength(1)
	})

	it('AC-T3.1 — the request carries the orchestration scope, with tools DERIVED from the manifest', async () => {
		const { runner, tokens } = build()
		const agent = new OrchestratorAgent(tokens, new OrchestratorPromptBuilder())

		for await (const _ of agent.run(runner, input())) {
			// drain
		}

		const mcp = runner.requests[0]?.mcp
		expect(mcp?.endpoint).toContain('/mcp/orchestration')
		expect(mcp?.allowedTools).toEqual(TOOLS_IN_SCOPE.orchestration)
	})

	/**
	 * The claims are what the MCP router reads: `threadId` is the axis that still confines a
	 * thread-scoped token, and `entryId` is what the fork tool uses as `originEntryId` — the reason
	 * that value is not an argument the model supplies.
	 */
	it('the minted token carries threadId + entryId and NO issueId', async () => {
		const { runner, tokens } = build()
		const agent = new OrchestratorAgent(tokens, new OrchestratorPromptBuilder())

		for await (const _ of agent.run(runner, input())) {
			// drain
		}

		expect(tokens.resolve(runner.requests[0]?.mcp?.token ?? '')).toMatchObject({
			threadId: '00000000-0000-4000-8000-0000000000bb',
			entryId: '00000000-0000-4000-8000-0000000000dd',
			agentName: AgentName.ORCHESTRATOR,
			scope: McpScope.orchestration,
		})
		expect(tokens.resolve(runner.requests[0]?.mcp?.token ?? '')?.issueId).toBeUndefined()
	})

	/** The base stamps identity; `buildRequest` must never set it (§4.5). */
	it('the prompt reaches the request as systemPrompt + ONE user message', async () => {
		const { runner, tokens } = build()
		const agent = new OrchestratorAgent(tokens, new OrchestratorPromptBuilder())

		for await (const _ of agent.run(runner, input())) {
			// drain
		}

		const request = runner.requests[0]
		expect(request?.agentName).toBe(AgentName.ORCHESTRATOR)
		expect(request?.systemPrompt).toContain('QUOTING')
		expect(request?.messages).toHaveLength(1)
		expect(request?.messages?.[0]?.content).toContain('pode me tirar uma dúvida?')
	})
})
