import { describe, expect, it } from 'bun:test'
import type { ZodType } from 'zod'
import type { BaseError } from '@codedm/core-typescript'
import { AgentRunner } from '../services/AgentRunner'
import { AgentName, AgentRunOutcome } from '../enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '../types'
import { InMemoryRunTokenService } from '../mcp/RunTokenService'
import { SCOPE_CONFINEMENT, TOOLS_IN_SCOPE, MCP_SCOPE_NAMES } from '../mcp/manifest'
import { Agent } from './Agent'
import { z } from '@codedm/core-typescript'

/**
 * CONFINEMENT IS PER SCOPE (orchestrator pivot §7.2.1), and this file is the only thing standing
 * between that rule and a silent regression.
 *
 * The mint site used to read `if (!input.issueId) throw` unconditionally — correct while every
 * scope-declaring agent worked an issue, and fatal the moment one does not: the orchestrator is keyed
 * by THREAD (§6.1) and would have died at mint time on every single turn. The guard is now driven by
 * `SCOPE_CONFINEMENT`, so the demand is made exactly where it means something.
 *
 * Two things need pinning, and NEITHER was covered before this file existed (verified: no test in the
 * repo exercised the no-issueId branch at all):
 *
 *  1. An `'issue'`-confined scope still refuses to mint without one. This is the SECURITY half — a
 *     token that can call the six `issue-handling` writes must name the issue it may write to, or
 *     `assertIdentityMatchesClaims` has no claim to compare arguments against and waves everything
 *     through (it skips absent claims; it does not reject them).
 *  2. A `'thread'`-confined scope mints happily WITHOUT one. This is the half the orchestrator needs,
 *     and it is asserted through the DECLARATION rather than through a hard-coded scope name, so it
 *     keeps testing the mechanism after `orchestration` lands.
 */

class CapturingRunner extends AgentRunner {
	readonly requests: AgentRunRequest<ZodType | undefined>[] = []

	run<OutputSchema extends ZodType | undefined = undefined>(request: AgentRunRequest<OutputSchema>): AsyncIterable<AgentRuntimeEvent> {
		this.requests.push(request)
		return (async function* () {
			yield {
				type: 'finished',
				result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'done', sessionId: 's1', failed: false },
			} satisfies AgentRuntimeEvent
		})()
	}

	async shutdown(): Promise<void> {}
}

const ProbeInputSchema = z.agentInput({})

/**
 * A minimal real subclass rather than a mock: `run()` is the base's template method and minting
 * happens inside it, so anything that stubbed the base would be testing itself. The scope is a
 * constructor parameter purely so one class can stand in for both confinement kinds.
 */
class ProbeAgent extends Agent<typeof ProbeInputSchema> {
	static override readonly NAME = AgentName.ISSUE_WORK
	override readonly inputSchema = ProbeInputSchema

	constructor(
		tokens: InMemoryRunTokenService,
		override readonly mcpScope: (typeof MCP_SCOPE_NAMES)[number],
	) {
		super(tokens)
	}

	override get tools() {
		return TOOLS_IN_SCOPE[this.mcpScope]
	}

	protected buildRequest(input: this['input']): Omit<AgentRunRequest, 'mcp' | 'agentName'> {
		return { cwd: input.cwd, systemPrompt: 'probe', messages: [] }
	}
}

const drain = async (agent: ProbeAgent, runner: CapturingRunner, issueId?: string) => {
	for await (const _ of agent.run(runner, {
		ownerId: '00000000-0000-4000-8000-0000000000aa',
		threadId: '00000000-0000-4000-8000-0000000000bb',
		cwd: '/tmp/x',
		...(issueId && { issueId }),
	})) {
		// drain
	}
}

describe('Agent — a run token is confined by its SCOPE, not by a blanket issue requirement', () => {
	const issueScopes = MCP_SCOPE_NAMES.filter(s => SCOPE_CONFINEMENT[s] === 'issue')
	const threadScopes = MCP_SCOPE_NAMES.filter(s => SCOPE_CONFINEMENT[s] === 'thread')

	it.each(issueScopes)("an 'issue'-confined scope (%s) REFUSES to mint without an issueId", async scope => {
		const runner = new CapturingRunner()
		const agent = new ProbeAgent(new InMemoryRunTokenService(), scope)

		await expect(drain(agent, runner)).rejects.toThrow(expect.objectContaining({ name: 'AGENT_TOOLS_UNSUPPORTED' }) as BaseError)
		// It refused BEFORE spawning — a token that cannot be confined must not produce a run at all.
		expect(runner.requests).toHaveLength(0)
	})

	it.each(issueScopes)("an 'issue'-confined scope (%s) mints normally WITH one", async scope => {
		const runner = new CapturingRunner()
		const tokens = new InMemoryRunTokenService()
		const agent = new ProbeAgent(tokens, scope)

		await drain(agent, runner, '00000000-0000-4000-8000-0000000000cc')

		const claims = tokens.verify(runner.requests[0]?.mcp?.token ?? '')
		expect(claims?.issueId).toBe('00000000-0000-4000-8000-0000000000cc')
		expect(claims?.scope).toBe(scope)
	})

	/**
	 * Asserted through the DECLARATION, so this starts exercising `orchestration` the moment that scope
	 * lands without an edit here. Skipped-by-emptiness today (both current scopes are `'issue'`) — which
	 * is why the `issue` cases above carry the regression weight for now, and why this reads off
	 * `SCOPE_CONFINEMENT` instead of naming a scope that does not exist yet.
	 */
	it.each(threadScopes)("a 'thread'-confined scope (%s) mints WITHOUT an issueId", async scope => {
		const runner = new CapturingRunner()
		const tokens = new InMemoryRunTokenService()
		const agent = new ProbeAgent(tokens, scope)

		await drain(agent, runner)

		const claims = tokens.verify(runner.requests[0]?.mcp?.token ?? '')
		expect(claims?.issueId).toBeUndefined()
		expect(claims?.threadId).toBe('00000000-0000-4000-8000-0000000000bb')
	})

	/** `entryId` rides the envelope to the claims — the channel that makes `originEntryId` un-forgeable (§7.2). */
	it('carries entryId from the input envelope into the claims when present', async () => {
		const runner = new CapturingRunner()
		const tokens = new InMemoryRunTokenService()
		const agent = new ProbeAgent(tokens, 'issue-handling')

		for await (const _ of agent.run(runner, {
			ownerId: '00000000-0000-4000-8000-0000000000aa',
			threadId: '00000000-0000-4000-8000-0000000000bb',
			issueId: '00000000-0000-4000-8000-0000000000cc',
			entryId: '00000000-0000-4000-8000-0000000000dd',
			cwd: '/tmp/x',
		})) {
			// drain
		}

		expect(tokens.verify(runner.requests[0]?.mcp?.token ?? '')?.entryId).toBe('00000000-0000-4000-8000-0000000000dd')
	})
})
