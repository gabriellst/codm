import type Z from 'zod'
import type { ZodType } from 'zod'
import { BaseError, Config, AgentIdentityService } from '@codedm/core-typescript'
import type { McpScope } from '@codedm/contracts-typescript/wire/enums'
import type { AgentName, AgentToolName } from '../enums'
import type { AgentRunner } from '../services/AgentRunner'
import type { AgentMcpInvocation } from './AgentMcpInvocation'
import type { ProviderCapabilities } from './ProviderCapabilities'
import type { AgentRunIdentity, AgentRunIdentityFields } from './AgentRunIdentity'
import { MCP_ROUTE_PREFIX } from '../mcp/route'
import type { AgentApplicationErrors } from '../errors'

/**
 * How long a minted run token stays valid. The RUN WINDOW plus grace — expiry is a backstop, and
 * `revoke` at termination is the primary invalidation (§4.4). Generous rather than tight on purpose: a
 * long agent turn that outlived its own credential would fail at the worst possible moment, mid-work,
 * with an error the model cannot act on.
 */
const RUN_TOKEN_TTL_MS = 6 * 60 * 60 * 1000
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
 * An earlier design declared `abstract run(...)` here AND said the base issues the run token inside
 * `run()`. Those cannot both hold: a body-less base has nowhere to issue one, and AC-6.12 requires the
 * call to appear in this file and nowhere else. Resolution (§4.5): `run()` is CONCRETE, and the ONLY
 * point of variation per agent is `protected abstract buildRequest(input)`, which returns the request
 * WITHOUT `mcp` and WITHOUT identity. A subclass that overrode `run()` would re-open a second place to
 * create a credential — which is why the `agent` skill's registry lists that override as a named bad
 * practice and AC-5.8 greps for it.
 *
 * ### `input` / `output` are PHANTOM
 * Definite-assignment fields that are never assigned — pure type carriers, so a subclass writes
 * `this['input']` instead of restating `Z.output<typeof XSchema> & AgentInputEnvelope` at every
 * signature. The intersection with `AgentInputEnvelope` is the §4.6 fix: inside a generic,
 * `Z.output<InputSchema>` collapses to `Record<string, unknown>` under constraint erasure and the
 * envelope fields vanish. `tests/architecture/agent-input.type-test.ts` is the compile-time proof.
 *
 * ### The MCP half, and where its two collaborators live
 * `tools` is declared here because the tool SCOPE is an agent-level fact and Fase 1 froze its
 * vocabulary (`AgentToolName`). `buildMcpInvocation` below turns that scope into an
 * `AgentMcpInvocation` — the invariant §4.3 rule 7 states holds by construction: `request.mcp` present
 * ⟺ `agent.tools.length > 0`. The credential seam it uses (`AgentIdentityService`) is a CORE service
 * bound at the ROOT container, and the SHAPE of what it issues is each agent's own
 * `static IdentitySchema` — neither is this class's to know beyond the two lines that read them.
 */
export abstract class Agent<InputSchema extends AgentInputSchemaConstraint, OutputSchema extends ZodType | undefined = undefined> {
	/**
	 * Identity, ATTRIBUTED by each concrete agent (§4.8) and DECLARED here so the template method below
	 * can read it off `this.constructor`. Statics escape `strictPropertyInitialization`, so the base may
	 * declare without initializing and the subclass assigns.
	 */
	static readonly NAME: AgentName

	/**
	 * THE SHAPE OF THIS AGENT'S IDENTITY — declared by the agent that has it (spec decision 3).
	 *
	 * It replaces `SCOPE_CONFINEMENT`, a `Record<McpScope, 'issue' | 'thread'>` in the MCP manifest
	 * whose ONLY reader was the line below. That record made "which id does this surface require" a
	 * property of the SCOPE, kept in a file far from every agent, and a scope added tomorrow was a
	 * line somebody had to remember to add — with the weaker confinement as the silent default if
	 * they forgot.
	 *
	 * Here the requirement is a schema on the class: `IssueWorkAgent.IdentitySchema` demands `issueId`,
	 * `OrchestratorAgent.IdentitySchema` does not have the field. A NEW scope forces the question at
	 * the only place that can answer it — the first agent that declares the scope — and forces it at
	 * the moment that matters, which is BEFORE a credential exists.
	 *
	 * Declared here without an initializer so `run()` can read it off `this.constructor`; statics
	 * escape `strictPropertyInitialization`, same mechanism as `NAME` above. `undefined` is legal and
	 * means "this agent declares no scope" — an agent that declares one and no schema fails loudly at
	 * spawn rather than issuing a credential confined to nothing.
	 */
	static readonly IdentitySchema?: ZodType<AgentRunIdentityFields>

	abstract readonly inputSchema: InputSchema
	readonly outputSchema?: OutputSchema

	/** The tool scope of this agent. Empty = this run declares nothing and carries no `mcp` (§4.3 rule 7). */
	readonly tools: readonly AgentToolName[] = []

	/**
	 * WHICH declared scope this agent's `tools` came from — the MCP endpoint it is pointed at.
	 *
	 * Undefined means NO tools, and the two must agree: `tools` is always the derived expansion
	 * `toolsInScope(mcpScope)`, never a hand-written list (AC-6.5's falsifier declares the scope on a
	 * seventh controller and requires the argv to change with no edit to a runner or a test). Keeping the
	 * scope NAME rather than only the expansion is what lets the base build the endpoint URL without a
	 * second mapping table.
	 */
	readonly mcpScope?: McpScope

	/** Phantom — never assigned. See the class docstring. */
	readonly input!: Z.output<InputSchema> & AgentInputEnvelope
	/** Phantom — never assigned. `never` for an agent with no `outputSchema`, which makes `collect()` unusable there. */
	readonly output!: OutputSchema extends ZodType ? Z.output<OutputSchema> : never

	constructor(protected readonly identities: AgentIdentityService<AgentRunIdentity>) {}

	/**
	 * The ONE entry point, and it is CONCRETE. DO NOT OVERRIDE — see the class docstring.
	 *
	 * It adds exactly what a subclass is not allowed to decide: the agent's IDENTITY (and, from Fase 6,
	 * the `mcp` invocation carrying the minted run token). Everything domain-shaped comes from
	 * `buildRequest`.
	 *
	 * ### Why the runner is a PARAMETER and not a constructor dependency
	 * WHICH CLI drives a turn is a property of the THREAD (`thread.providers[0]`), so it is not known
	 * until a request exists — while a constructor dependency is resolved when the container is built.
	 * With exactly one runner bound that distinction was invisible; `AgentRunnerFactory` makes it real,
	 * and the caller that already holds the provider (`RunIssueTurn`, `DefaultIssueRouter`) is the one
	 * layer that can resolve it. The agent is left holding NO I/O at all, which is what lets §4.8 keep
	 * binding agents identically in all three envs.
	 */
	async *run(runner: AgentRunner, input: this['input']): AsyncIterable<AgentRuntimeEvent> {
		const request = { ...this.buildRequest(input), agentName: (this.constructor as typeof Agent).NAME }
		// The scope is passed DOWN rather than re-read off `this` inside the callee: it is what confines
		// the minted credential (D6-8), and threading the already-narrowed value is what makes "a token
		// is always bound to a scope" hold by type instead of by a cast.
		yield* runner.run({ ...request, ...(this.mcpScope && { mcp: this.buildMcpInvocation(input, request, this.mcpScope) }) })
	}

	/**
	 * Build the MCP invocation for this run — ISSUING the run credential in the process.
	 *
	 * This is the ONLY `.issue(` call site in the codebase, and AC-6.12 greps for exactly that. The
	 * reason is structural rather than stylistic: this class is the only layer holding BOTH the input
	 * envelope (`ownerId`/`issueId`/`threadId`, §4.6) and the request being assembled. A runner that
	 * issued would have to be handed the identity the seam exists to keep out of it; a subclass that
	 * issued would be a SECOND place a credential is created.
	 *
	 * ### `issueId` is NARROWED HERE — by the agent's OWN schema, not by a blanket rule
	 * The envelope's `issueId` is OPTIONAL because an agent may run BEFORE an issue exists. Which
	 * agents nonetheless REQUIRE one is not a fact this base can know, so it does not decide: it reads
	 * `static IdentitySchema` off the concrete class and parses. An agent that needs an issue fails
	 * loudly here rather than issuing a token confined to nothing, which would hand a model a
	 * credential the destination-side comparison cannot constrain.
	 */
	private buildMcpInvocation(input: this['input'], request: { caps?: ProviderCapabilities }, scope: McpScope): AgentMcpInvocation {
		// A CLI whose probe says it cannot take an MCP config cannot serve an agent that REQUIRES tools.
		// NAMED failure, never a silent drop to the inferred path (§4.7): degrading here would look
		// exactly like a healthy run that simply chose to declare nothing, which is the one distinction
		// AC-6.4 and AC-6.7 exist to preserve. Absent `caps` stays permissive by the same rule the argv
		// builder uses — the probe did not run, so nothing was ruled out.
		if (request.caps && request.caps.mcpConfig === false) {
			throw new BaseError<AgentApplicationErrors>(
				'AGENT_TOOLS_UNSUPPORTED',
				`agent ${(this.constructor as typeof Agent).NAME} requires the '${scope}' tool scope, but this CLI build cannot take an MCP config`,
			)
		}

		// IDENTITY IS PARSED BEFORE IT CAN BECOME A CREDENTIAL (spec decision 3). This used to read
		// `if (SCOPE_CONFINEMENT[scope] === 'issue' && !input.issueId) throw` — one hardcoded axis, one
		// hardcoded question, keyed off a record in a manifest. The requirement did not go away: it
		// became the agent's OWN schema, so an agent that needs an issue says so where it lives, and an
		// agent that does not simply has no such field for anything to demand.
		//
		// It runs BEFORE `.issue(` and that ORDER is the property, not a detail: an identity that does
		// not parse never becomes a token, so there is no credential confined to nothing for a model to
		// hold — and `runner.run` is never reached, which is what the falsifier counts.
		const IdentitySchema = (this.constructor as typeof Agent).IdentitySchema
		if (!IdentitySchema) {
			throw new BaseError<AgentApplicationErrors>(
				'AGENT_TOOLS_UNSUPPORTED',
				`agent ${(this.constructor as typeof Agent).NAME} declares the '${scope}' tool scope but no IdentitySchema — a credential with no declared shape cannot be confined`,
			)
		}
		const parsed = IdentitySchema.safeParse({
			ownerId: input.ownerId,
			issueId: input.issueId,
			threadId: input.threadId,
			// Carried so the destination controller can read the originating entry off `ctx.agentIdentity`
			// — the reason `ForkIssue` does not take it as an argument. Absent on runs no message triggered.
			entryId: input.entryId,
		})
		if (!parsed.success) {
			throw new BaseError<AgentApplicationErrors>(
				'AGENT_TOOLS_UNSUPPORTED',
				`agent ${(this.constructor as typeof Agent).NAME} declares the '${scope}' tool scope, whose identity it cannot satisfy: ${parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`,
			)
		}

		const token = this.identities.issue({
			...parsed.data,
			agentName: (this.constructor as typeof Agent).NAME,
			// AUTHORIZATION, not decoration (D6-8). Without this field a token issued for the six writes of
			// `issue-handling` also opened `/mcp/system` — `CreateOwner`, `DisableOwner`, `AddWorkspace`,
			// `RemoveWorkspace` — because the door resolved the token and never asked what it was FOR.
			// `--allowedTools` is the client-side half of the same rule and the client is the attacker's.
			scope,
			expiresAt: new Date(Date.now() + RUN_TOKEN_TTL_MS),
		})

		// HTTP is the DECIDED default (§4.4): the daemon is already an HTTP server, so the MCP door costs
		// no extra process and no extra port. The stdio fallback exists in the contract and is a
		// BUILD-LOG decision if a CLI turns out not to speak HTTP MCP — explicitly not a founder call.
		return {
			transport: 'http',
			endpoint: `http://127.0.0.1:${Config.env.API_PORT}/${Config.version}${MCP_ROUTE_PREFIX}/${this.mcpScope}`,
			token,
			allowedTools: this.tools,
		}
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
	protected async collect(runner: AgentRunner, input: this['input']): Promise<this['output']> {
		for await (const event of this.run(runner, input)) {
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
