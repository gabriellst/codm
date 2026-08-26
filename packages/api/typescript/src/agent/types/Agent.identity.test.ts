import { describe, expect, it } from 'bun:test'
import type { ZodType } from 'zod'
import type { BaseError } from '@codm/core-typescript'
import { InMemoryAgentIdentityService, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { AgentRunner } from '../services/AgentRunner'
import { AgentName, AgentRunOutcome } from '../enums'
import type { AgentRunRequest } from '../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../types/AgentRuntimeEvent'
import { AgentRunIdentitySchema, type AgentRunIdentity } from './AgentRunIdentity'
import { Agent } from './Agent'

/**
 * IDENTITY IS PARSED AT SPAWN, AND AN IDENTITY THAT DOES NOT PARSE NEVER BECOMES A CREDENTIAL
 * (B2, spec decision 3 — the falsifier this frente does not close without).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACES. `Agent.confinement.test.ts` pinned the same property through
 * `SCOPE_CONFINEMENT` — a `Record<McpScope, 'issue' | 'thread'>` in the MCP manifest, read by exactly
 * one line in `buildMcpInvocation`. The property survives; its CARRIER changed from a record keyed by
 * scope to a schema owned by the agent. So the tests below assert through each agent's OWN
 * `IdentitySchema` rather than through a scope name, which is what keeps them meaningful when a scope
 * is added.
 *
 * THE TWO HALVES, AND NEITHER IS OPTIONAL:
 *  1. An agent whose schema REQUIRES a field refuses to spawn without it. This is the security half —
 *     a credential that can call six writes on an issue must name the issue it may write to, or the
 *     destination-side comparison has no axis to compare arguments against and waves everything
 *     through (it compares the keys the identity CARRIES; an absent key is an absent check).
 *  2. An agent whose schema does NOT declare the field spawns happily without it. This is the half
 *     the orchestrator needs, and it is what made the old blanket `if (!input.issueId) throw` fatal.
 *
 * AND THE ORDER IS THE PROPERTY: the refusal happens BEFORE `.issue(` and therefore before
 * `runner.run`, which is why every refusal case asserts `runner.requests` is EMPTY. A test that only
 * asserted the throw would stay green against an implementation that issued the token first.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
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

/**
 * The REAL service with its one WRITER observed — not a stub.
 *
 * `issue()` is the only thing that can bring a credential into existence, so counting its calls is
 * the only DIRECT measurement of "no credential was created". The assertion this replaces —
 * `expect(identities.resolve('')).toBeNull()` — could not measure it: a token is 32 random bytes and
 * is never the empty string, so that expression is `null` no matter what the implementation did. It
 * was MEASURED vacuous: with the parse moved below `.issue(`, the suite stayed 8 pass / 0 fail, and a
 * gate that has never gone red is not a gate.
 *
 * Subclassing instead of mocking keeps the storage REAL — `resolve()` still returns what `issue()`
 * stored, so the tests that read an identity back still exercise the production path.
 */
class RecordingAgentIdentityService extends InMemoryAgentIdentityService<AgentRunIdentity> {
	readonly issued: AgentRunIdentity[] = []

	override issue(identity: AgentRunIdentity): string {
		this.issued.push(identity)
		return super.issue(identity)
	}
}

const ProbeInputSchema = z.agentInput({})

/**
 * A minimal REAL subclass rather than a mock: minting happens inside the base's template-method
 * `run()`, so anything that stubbed the base would be testing itself. The scope AND the schema are
 * constructor/static inputs so one class can stand in for both agent shapes — and the schema is a
 * static, exactly as a real agent declares it.
 */
function probeAgentFor(scope: McpScope, IdentitySchema: ZodType | undefined) {
	return class ProbeAgent extends Agent<typeof ProbeInputSchema> {
		static override readonly NAME = AgentName.ISSUE_WORK
		static override readonly IdentitySchema = IdentitySchema as never
		override readonly inputSchema = ProbeInputSchema
		override readonly mcpScope = scope
		override readonly tools = ['mcp__codm__Probe']

		protected buildRequest(input: this['input']): Omit<AgentRunRequest, 'mcp' | 'agentName'> {
			return { cwd: input.cwd, binaryPath: '/usr/local/bin/claude', systemPrompt: 'probe', messages: [] }
		}
	}
}

const OWNER = '00000000-0000-4000-8000-0000000000aa'
const THREAD = '00000000-0000-4000-8000-0000000000bb'
const ISSUE = '00000000-0000-4000-8000-0000000000cc'
const ENTRY = '00000000-0000-4000-8000-0000000000dd'

const drain = async (agent: Agent<typeof ProbeInputSchema>, runner: CapturingRunner, extra: Record<string, string> = {}) => {
	for await (const _ of agent.run(runner, { ownerId: OWNER, threadId: THREAD, cwd: '/tmp/x', ...extra })) {
		// drain
	}
}

/** The two real shapes, spelled the way the two real agents spell them. */
const IssueWorkIdentity = AgentRunIdentitySchema.extend({ issueId: z.uuid() })
const OrchestratorIdentity = AgentRunIdentitySchema.omit({ issueId: true })

describe('Agent — the identity is parsed at spawn, and it gates the credential', () => {
	it('FALSEADOR — an agent whose IdentitySchema REQUIRES issueId refuses to spawn without one', async () => {
		const runner = new CapturingRunner()
		const Probe = probeAgentFor(McpScope.ISSUE_HANDLING, IssueWorkIdentity)
		const agent = new Probe(new InMemoryAgentIdentityService<AgentRunIdentity>())

		await expect(drain(agent, runner)).rejects.toThrow(expect.objectContaining({ name: 'AGENT_TOOLS_UNSUPPORTED' }) as BaseError)
		// BEFORE the spawn — the ORDER is the property. An implementation that issued first and then
		// validated would throw exactly the same error and leave this counter at 1.
		expect(runner.requests).toHaveLength(0)
	})

	it('FALSEADOR — and no credential was created: `issue()` was never reached', async () => {
		const identities = new RecordingAgentIdentityService()
		const Probe = probeAgentFor(McpScope.ISSUE_HANDLING, IssueWorkIdentity)
		const agent = new Probe(identities)

		await expect(drain(agent, new CapturingRunner())).rejects.toThrow()
		// THE ORDER, MEASURED AT THE WRITER. The refusal above proves the identity was rejected; this
		// line proves the rejection happened BEFORE anything was minted. `issue()` is the sole way a
		// credential comes into existence, so an implementation that issued first and validated after
		// leaves exactly one entry here while still throwing the same error — which is what the
		// falsifier for this axis moves the parse below `.issue(` to produce.
		expect(identities.issued).toHaveLength(0)
	})

	it('the same agent spawns normally WITH the field, and the identity carries it', async () => {
		const runner = new CapturingRunner()
		const identities = new InMemoryAgentIdentityService<AgentRunIdentity>()
		const Probe = probeAgentFor(McpScope.ISSUE_HANDLING, IssueWorkIdentity)

		await drain(new Probe(identities), runner, { issueId: ISSUE })

		const identity = identities.resolve(runner.requests[0]?.mcp?.token ?? '')
		expect(identity?.issueId).toBe(ISSUE)
		expect(identity?.scope).toBe(McpScope.ISSUE_HANDLING)
		expect(identity?.agentName).toBe(AgentName.ISSUE_WORK)
	})

	it('an agent whose IdentitySchema does NOT declare issueId spawns without one', async () => {
		const runner = new CapturingRunner()
		const identities = new InMemoryAgentIdentityService<AgentRunIdentity>()
		const Probe = probeAgentFor(McpScope.orchestration, OrchestratorIdentity)

		await drain(new Probe(identities), runner)

		const identity = identities.resolve(runner.requests[0]?.mcp?.token ?? '')
		expect(identity?.threadId).toBe(THREAD)
		// ABSENT, not undefined-but-present: the schema omitted the key, so the destination-side
		// comparison has no `issueId` axis at all. That absence is what the owning controller
		// compensates for by checking ownership itself.
		expect(identity && 'issueId' in identity).toBe(false)
	})

	it('an identity that is present but MALFORMED is refused too — the parse is not a presence check', async () => {
		const runner = new CapturingRunner()
		const Probe = probeAgentFor(McpScope.ISSUE_HANDLING, IssueWorkIdentity)
		const agent = new Probe(new InMemoryAgentIdentityService<AgentRunIdentity>())

		await expect(drain(agent, runner, { issueId: 'not-a-uuid' })).rejects.toThrow(
			expect.objectContaining({ name: 'AGENT_TOOLS_UNSUPPORTED' }) as BaseError,
		)
		expect(runner.requests).toHaveLength(0)
	})

	it('an agent that declares a scope and NO IdentitySchema fails loudly instead of issuing', async () => {
		const runner = new CapturingRunner()
		const Probe = probeAgentFor(McpScope.system, undefined)
		const agent = new Probe(new InMemoryAgentIdentityService<AgentRunIdentity>())

		await expect(drain(agent, runner)).rejects.toThrow(expect.objectContaining({ name: 'AGENT_TOOLS_UNSUPPORTED' }) as BaseError)
		expect(runner.requests).toHaveLength(0)
	})

	it('entryId rides the envelope into the identity — the channel that makes attribution unforgeable', async () => {
		const runner = new CapturingRunner()
		const identities = new InMemoryAgentIdentityService<AgentRunIdentity>()
		const Probe = probeAgentFor(McpScope.orchestration, OrchestratorIdentity)

		await drain(new Probe(identities), runner, { entryId: ENTRY })

		expect(identities.resolve(runner.requests[0]?.mcp?.token ?? '')?.entryId).toBe(ENTRY)
	})
})

describe('the two REAL agents declare the two shapes', () => {
	it('IssueWorkAgent.IdentitySchema requires issueId; OrchestratorAgent.IdentitySchema has no such field', async () => {
		const { IssueWorkAgent } = await import('../agents/IssueWorkAgent')
		const { OrchestratorAgent } = await import('../agents/OrchestratorAgent')

		expect(IssueWorkAgent.IdentitySchema?.safeParse({ ownerId: OWNER, threadId: THREAD }).success).toBe(false)
		expect(IssueWorkAgent.IdentitySchema?.safeParse({ ownerId: OWNER, threadId: THREAD, issueId: ISSUE }).success).toBe(true)

		const orchestrator = OrchestratorAgent.IdentitySchema?.safeParse({ ownerId: OWNER, threadId: THREAD })
		expect(orchestrator?.success).toBe(true)
		expect(orchestrator?.success && 'issueId' in orchestrator.data).toBe(false)
	})
})
