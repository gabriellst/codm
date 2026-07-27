import { describe, expect, it } from 'bun:test'
import type { ZodType } from 'zod'
import { AgentModelId } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunner } from '../../services/AgentRunner'
import { AgentName, AgentRunOutcome } from '../../enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '../../types'
import { IssueWorkPromptBuilder } from './prompt'
import { IssueWorkAgent } from './IssueWorkAgent'

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
	return { runner, agent: new IssueWorkAgent(runner, new IssueWorkPromptBuilder()) }
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

	it('declares NOTHING — empty tool scope means no `mcp` on the request at all (§4.3 rule 7)', async () => {
		const { runner, agent } = build()

		for await (const _ of agent.run(input())) {
			// drain
		}

		expect(agent.tools).toEqual([])
		expect(runner.requests[0]?.mcp).toBeUndefined()
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
