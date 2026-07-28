import { describe, expect, it } from 'bun:test'
import type { ZodType } from 'zod'
import { AgentModelId } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunner } from '../../services/AgentRunner'
import { AgentName, AgentRunOutcome } from '../../enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '../../types'
import { IssueWorkPromptBuilder } from './prompt'
import { IssueWorkAgent } from './IssueWorkAgent'
// The real token service, not a double: it is a Map with a clock, so a stub would only be a second
// implementation of the thing under test. Every agent takes one now because the base MINTS in `run()`.
import { InMemoryRunTokenService } from '../../mcp/RunTokenService'
import { TOOLS_IN_SCOPE, MCP_SCOPES } from '../../mcp/manifest'

/**
 * The BASE's contract, exercised through the agent that has no `outputSchema` (§4.5/AC-5.8).
 *
 * What is actually under test is the template method: `run()` is concrete on `Agent`, the only point
 * of variation is `buildRequest`, and the base is what stamps identity onto the request. A subclass
 * that overrode `run()` would re-open a second place to mint a run token in Fase 6 — the reason
 * AC-5.8 greps for the override and the `agent` skill lists it as a bad practice.
 */
class CapturingRunner extends AgentRunner {
	readonly requests: AgentRunRequest<ZodType | undefined>[] = []

	run<OutputSchema extends ZodType | undefined = undefined>(request: AgentRunRequest<OutputSchema>): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		return (async function* () {
			yield { type: 'frame', frame: { kind: 'assistant_text', messageId: 'm1', text: 'working', parentToolUseId: null } }
			yield {
				type: 'finished',
				result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'done', sessionId: 'sess-1', failed: false },
			} satisfies AgentRuntimeEvent
		})()
	}

	async shutdown(): Promise<void> {}
}

const input = (overrides: Partial<Parameters<IssueWorkAgent['run']>[0]> = {}): Parameters<IssueWorkAgent['run']>[0] => ({
	ownerId: '00000000-0000-4000-8000-0000000000aa',
	issueId: '00000000-0000-4000-8000-0000000000cc',
	threadId: '00000000-0000-4000-8000-0000000000bb',
	cwd: '/Users/dev/project',
	prompt: 'fix the coupon focus bug',
	key: 'coupon-focus',
	title: 'Coupon focus bug',
	...overrides,
})

const build = () => {
	const runner = new CapturingRunner()
	return { runner, agent: new IssueWorkAgent(runner, new InMemoryRunTokenService(), new IssueWorkPromptBuilder()) }
}

describe('IssueWorkAgent (and the Agent template method under it)', () => {
	it('the BASE stamps identity — `buildRequest` never sets `agentName`', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(input())) {
			// drain
		}

		expect(runner.requests[0]?.agentName).toBe(AgentName.ISSUE_WORK)
	})

	it('translates the envelope into one user turn in the thread workspace', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(input())) {
			// drain
		}

		const request = runner.requests[0]
		expect(request?.cwd).toBe('/Users/dev/project')
		expect(request?.messages).toHaveLength(1)
		expect(request?.messages[0]?.content).toBe('fix the coupon focus bug')
		// The standing prompt carries the workspace and the issue under work.
		expect(request?.systemPrompt).toContain('/Users/dev/project')
		expect(request?.systemPrompt).toContain('coupon-focus')
	})

	it('DECLARES the issue-handling scope, derived from the manifest and never typed by hand (AC-6.5)', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(input())) {
			// drain
		}

		// Compared against the DERIVED constant, never against a literal list. A literal here would be
		// exactly the second source of truth this phase exists to kill — and the falsifier is cheap:
		// add a seventh entry to `MCP_SCOPES['issue-handling']` and this assertion follows with no edit.
		expect(agent.tools).toEqual(TOOLS_IN_SCOPE['issue-handling'])
		expect(agent.tools).toHaveLength(MCP_SCOPES['issue-handling'].length)
		expect(runner.requests[0]?.mcp?.allowedTools).toEqual(TOOLS_IN_SCOPE['issue-handling'])
	})

	it('carries NO operation of the `system` scope — owner/* and workspace/* stay out of reach (AC-6.5(c))', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(input())) {
			// drain
		}

		// The agent is driven by the text of an inbound message written by someone who is not the
		// operator. `system` carries account administration; a single overlapping entry would put it one
		// prompt injection away from a stranger.
		const declared = new Set(runner.requests[0]?.mcp?.allowedTools ?? [])
		for (const systemTool of TOOLS_IN_SCOPE.system) expect(declared.has(systemTool)).toBe(false)
	})

	it('the BASE mints the run token and points the CLI at this scope endpoint — the subclass sets no `mcp`', async () => {
		const runner = new CapturingRunner()
		const tokens = new InMemoryRunTokenService()
		const agent = new IssueWorkAgent(runner, tokens, new IssueWorkPromptBuilder())

		for await (const _ of agent.run(input())) {
			// drain
		}

		const mcp = runner.requests[0]?.mcp
		expect(mcp?.transport).toBe('http')
		expect(mcp?.endpoint).toContain('/mcp/issue-handling')
		// The token is OPAQUE on the request and resolves to the ENVELOPE's identity — the seam carries
		// no `ownerId`/`issueId`/`threadId` of its own, which is the invariant AC-1.11 and AC-6.12 pin.
		expect(tokens.verify(mcp?.token ?? '')).toMatchObject({
			ownerId: '00000000-0000-4000-8000-0000000000aa',
			issueId: '00000000-0000-4000-8000-0000000000cc',
			threadId: '00000000-0000-4000-8000-0000000000bb',
			agentName: AgentName.ISSUE_WORK,
		})
	})

	it('an agent with a tool scope but NO issueId fails NAMED rather than minting an unconfined token', async () => {
		const { agent } = build()
		// `issueId` is optional on the envelope because the CLASSIFIER runs before an issue exists. An
		// agent that declares tools must never inherit that latitude: a token with nothing to be confined
		// to would give the identity check nothing to reject against.
		const drain = async () => {
			for await (const _ of agent.run(input({ issueId: undefined }))) {
				// drain
			}
		}
		await expect(drain()).rejects.toThrow(/issueId/)
	})

	it('has NO structured output — the consumer drains the stream (`outputSchema` absent)', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(input())) {
			// drain
		}

		expect(agent.outputSchema).toBeUndefined()
		expect(runner.requests[0]?.outputSchema).toBeUndefined()
	})

	it('threads the invocation facts the USE CASE resolved — model, session plan, binary and caps', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(
			input({
				model: AgentModelId.OPUS,
				session: { resumeId: 'sess-prev' },
				binaryPath: '/usr/local/bin/claude',
				caps: { sessionResume: true, partialMessages: false },
			}),
		)) {
			// drain
		}

		const request = runner.requests[0]
		expect(request?.model).toBe(AgentModelId.OPUS)
		expect(request?.session).toEqual({ resumeId: 'sess-prev' })
		expect(request?.binaryPath).toBe('/usr/local/bin/claude')
		expect(request?.caps).toEqual({ sessionResume: true, partialMessages: false })
	})

	it('yields the runner stream through untouched — the base adds identity, not frames', async () => {
		const { agent } = build()

		const events: AgentRuntimeEvent[] = []
		for await (const event of agent.run(input())) events.push(event)

		expect(events.map(e => e.type)).toEqual(['frame', 'finished'])
	})

	it('defaults the model to DEFAULT rather than omitting it — the CLI picks, and we say so', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(input())) {
			// drain
		}

		expect(runner.requests[0]?.model).toBe(AgentModelId.DEFAULT)
	})
})
