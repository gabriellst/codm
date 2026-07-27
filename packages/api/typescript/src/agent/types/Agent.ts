import type Z from 'zod'
import type { ZodType } from 'zod'
import type { AgentName, AgentToolName } from '../enums'
import type { AgentRunner } from '../services/AgentRunner'
import type { AgentInputEnvelope, AgentInputSchemaConstraint } from './AgentInput'
import type { AgentRunRequest } from './AgentRunRequest'
import type { AgentRuntimeEvent } from './AgentRuntimeEvent'

/**
 * The base every internal agent extends (GOAL-agent-abstraction §4.5).
 *
 * ### Why a class and not an interface
 * Copied from the medscall base (`packages/api/src/agent/types/Agent.ts` — the TECHNIQUE, not the
 * fields): a class survives `instanceof`, and tsyringe gets a stable CLASS token per concrete agent.
 * That is what lets §4.8 register agents as class tokens with the same instance in all three envs and
 * forbid a name→agent map — `AgentName` exists for IDENTITY (logs, spans, run-token claims), never
 * for resolution.
 *
 * ### `run()` is a TEMPLATE METHOD, not a hook — and this is load-bearing
 * An earlier design declared `abstract run(...)` here AND said the base mints the run token inside
 * `run()`. Those cannot both hold: a body-less base has nowhere to mint, and AC-6.12 requires `.mint(`
 * to appear in this file and nowhere else. Resolution (§4.5): `run()` is CONCRETE, and the ONLY point
 * of variation per agent is `protected abstract buildRequest(input)`, which returns the request
 * WITHOUT `mcp` and WITHOUT identity. A subclass that overrode `run()` would re-open a second place to
 * mint a token — which is why the `agent` skill's registry lists that override as a named bad practice
 * and AC-5.8 greps for it.
 *
 * ### `input` / `output` are PHANTOM
 * Definite-assignment fields that are never assigned — pure type carriers, so a subclass writes
 * `this['input']` instead of restating `Z.output<typeof XSchema> & AgentInputEnvelope` at every
 * signature. The intersection with `AgentInputEnvelope` is the §4.6 fix: inside a generic,
 * `Z.output<InputSchema>` collapses to `Record<string, unknown>` under constraint erasure and the
 * envelope fields vanish. `tests/architecture/agent-input.type-test.ts` is the compile-time proof.
 *
 * ### What this class does NOT do yet, said out loud rather than half-built
 * `tools` is declared here because the tool SCOPE is an agent-level fact and Fase 1 froze its
 * vocabulary (`AgentToolName`). The MCP half of `run()` — `buildMcpInvocation`, the `RunTokenService`
 * constructor dependency and the `mint` call — lands in **Fase 6**, the phase that births the MCP
 * router, the four tool handlers and the only implementation of `RunTokenService`. That service is
 * contract-only today (no binding in `agent/registry.ts`), so injecting it here would fail DI
 * resolution at boot, and building an `mcp` invocation now would hand a CLI an `--mcp-config` pointing
 * at a route that does not exist. Until then both agents declare an EMPTY scope and `request.mcp` is
 * absent — which is exactly the invariant §4.3 rule 7 states: `request.mcp` present ⟺
 * `agent.tools.length > 0`.
 */
export abstract class Agent<InputSchema extends AgentInputSchemaConstraint, OutputSchema extends ZodType | undefined = undefined> {
	/**
	 * Identity, ATTRIBUTED by each concrete agent (§4.8) and DECLARED here so the template method below
	 * can read it off `this.constructor`. Statics escape `strictPropertyInitialization`, so the base may
	 * declare without initializing and the subclass assigns.
	 */
	static readonly NAME: AgentName

	abstract readonly inputSchema: InputSchema
	readonly outputSchema?: OutputSchema

	/** The tool scope of this agent. Empty = this run declares nothing and carries no `mcp` (§4.3 rule 7). */
	readonly tools: readonly AgentToolName[] = []

	/** Phantom — never assigned. See the class docstring. */
	readonly input!: Z.output<InputSchema> & AgentInputEnvelope
	/** Phantom — never assigned. `never` for an agent with no `outputSchema`, which makes `collect()` unusable there. */
	readonly output!: OutputSchema extends ZodType ? Z.output<OutputSchema> : never

	constructor(protected readonly runner: AgentRunner) {}

	/**
	 * The ONE entry point, and it is CONCRETE. DO NOT OVERRIDE — see the class docstring.
	 *
	 * It adds exactly what a subclass is not allowed to decide: the agent's IDENTITY (and, from Fase 6,
	 * the `mcp` invocation carrying the minted run token). Everything domain-shaped comes from
	 * `buildRequest`.
	 */
	async *run(input: this['input']): AsyncIterable<AgentRuntimeEvent> {
		yield* this.runner.run({ ...this.buildRequest(input), agentName: (this.constructor as typeof Agent).NAME })
	}

	/** The ONLY point of variation per agent: input → request, WITHOUT `mcp` and WITHOUT identity. */
	protected abstract buildRequest(input: this['input']): Omit<AgentRunRequest<OutputSchema>, 'mcp' | 'agentName'>

	/**
	 * Drain `run()` to its ONE terminal event and return the validated structured output.
	 *
	 * A helper OVER the same iteration — not a second transport and not a second seam method (§4.1).
	 * `protected` on purpose: an agent with an `outputSchema` exposes exactly ONE public method, named
	 * for the business purpose, whose body is `return this.collect(input)` and nothing else (§4.5). A
	 * body with more than that means routing policy leaked into the agent — policy lives in
	 * `services/IssueRouter`.
	 *
	 * ### Why the failure modes surface as the AGENT's named error
	 * `run()` never throws mid-drain (§4.3 rule 4) — a transport stop and a failed structural validation
	 * both arrive as fields on the terminal record. Turning that record into a NAMED error is this
	 * method's job, and `collectFailure()` is where each agent supplies its own code instead of this
	 * base inventing one it has no vocabulary for.
	 */
	protected async collect(input: this['input']): Promise<this['output']> {
		for await (const event of this.run(input)) {
			if (event.type !== 'finished') continue
			const { result } = event
			if (result.stop) throw this.collectFailure(`agent run stopped: ${result.stop.kind} — ${result.stop.detail}`)
			if (result.failed || result.output === undefined) {
				throw this.collectFailure(result.failure ?? 'agent run produced no parseable structured output')
			}
			// Narrowed by CAST rather than re-parsed: the runner sets `output` only when
			// `outputSchema.safeParse` succeeded, so a second parse here would re-run the same validation
			// and, worse, would give a fake runner in a test a different verdict than the real one. The
			// `failed` / `output === undefined` guard above is what makes this sound.
			return result.output as this['output']
		}
		// `run()` yields exactly one `finished` event, always last — unreachable unless that invariant
		// breaks. Named rather than silent: an implicit `undefined` here would surface as a confusing
		// schema error several layers up, in a caller that never touched the runner.
		throw this.collectFailure('agent run produced no terminal event')
	}

	/**
	 * The error `collect()` raises. Overridden by every agent that declares an `outputSchema`, so the
	 * caller gets a code from that agent's own vocabulary. The base returns a plain `Error` rather than
	 * throwing from here: an agent WITHOUT an `outputSchema` never reaches `collect()` (its `output`
	 * phantom is `never`), so there is nothing for it to implement.
	 */
	protected collectFailure(message: string): Error {
		return new Error(message)
	}
}
