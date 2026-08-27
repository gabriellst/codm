import { join } from 'node:path'
import { injectable } from 'tsyringe-neo'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { BaseError } from '@codm/core-typescript'
import { AgentIdentityService } from '@codm/core-typescript'
import type { AgentScenarioArtifactRef, AgentScenarioDeclaration } from '../services/AgentScenario'
import type { AgentRunIdentity } from '../types/AgentRunIdentity'
import type { AgentMcpInvocation } from '../types/AgentMcpInvocation'
import type { AgentApplicationErrors } from '../errors'
import { MCP_RUN_TOKEN_HEADER } from '@codm/client-typescript/typescript/mcp/context'
import { operationIdOf, ForkIssueController, RecordArtifactController, TransitionIssueStatusController } from './exposure'

/** One tool call the driver actually made — enough for the caller to render a frame pair. */
export interface DeclaredToolCall {
	tool: string
	input: Record<string, unknown>
	summary: string
}

/**
 * What the RUN knows that its roteiro cannot.
 *
 * One field today, and it is deliberately not the run's identity: `cwd` is invocation data of the
 * same nature as `binaryPath` (see `AgentRunRequest`), which is why the stand-in is allowed to hand
 * it over while the three envelope keys stay inside the opaque token.
 */
export interface DeclarationContext {
	/** The run's absolute workspace — resolves a WORKSPACE-relative artifact reference. */
	readonly cwd: string
}

/**
 * THE DETERMINISTIC HALF OF AC-6.2 — a stand-in for the model that DECLARES, over the real MCP door.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY IT EXISTS AT ALL. Fase 6 removed the INFERRED completion for any agent carrying a tool scope
 * (`RunIssueTurn.persistOutcome`, §4.3 rule 7): with tools, "the issue is done" must be SAID, never
 * derived from a process exiting cleanly. That removal without a declaring counterpart leaves the
 * only deterministic path in the repo — the Playwright e2e, which must never spawn a provider CLI —
 * with a run that opens an issue and never closes it. The two halves cannot ship apart, and this is
 * the second half.
 *
 * WHY IT IS A REAL CLIENT OVER THE REAL ENDPOINT, not an in-process shortcut. Everything between the
 * agent and the domain is exercised: the JSON-RPC transport, the router's token verification, its
 * scope check, its identity walk, the generated tool, the `_http` shim that attaches the token, the
 * HTTP hop, the controller, the use case. An in-process call to the use case would prove the use case
 * works and nothing the phase is about.
 *
 * WHY IT LIVES HERE AND NOT NEXT TO THE STUB RUNNER. AC-6.12 greps
 * `services/AgentRunner` + `providers` for `ownerId|issueId|threadId` and requires ZERO hits: the
 * transport seam does not see identity. A driver that names the issue it is declaring on therefore
 * cannot live there. `agent/mcp/` is exactly where the AC says those three names appear legitimately —
 * it is where the identity is read and compared.
 *
 * WHERE ITS IDENTITY COMES FROM, and why that is not a shortcut. It resolves the identity from the
 * OPAQUE token through `AgentIdentityService.resolve` — the same call, on the same service instance, that
 * the router makes on every tool call. A real model learns the same two ids from its prompt (see
 * `IssueWorkPromptBuilder`, which renders them precisely because a generated tool inherits its
 * controller's path parameters). Reading them from the credential instead of re-parsing prose keeps
 * this file free of the text-matching AC-6.2 forbids anywhere in the chain, and it cannot widen what
 * the run may touch: the router validates every argument against that same identity regardless.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
@injectable()
export class E2eMcpDriver {
	constructor(private readonly identities: AgentIdentityService<AgentRunIdentity>) {}

	/**
	 * Make every declaration of one scripted act, in order, over ONE connection — and fail loudly.
	 *
	 * ### Why one entry point instead of the two it replaced
	 * There used to be `forkIssue()` and `declareIssueWorkComplete()`, each with the calls it makes
	 * written into its body. That is two hard-coded performances, and it is why the runner could only
	 * ever tell one story. What a run declares is now DECLARED — `AgentScenarioDeclaration`, chosen by
	 * the roteiro (`services/AgentScenario`) — and this method is the interpreter that turns each
	 * member into a real tool call on the real door. Adding a fact a scripted run can declare is a
	 * member on that union plus a `case` below, and the switch stops compiling until both exist.
	 *
	 * ### Why isError is asserted on every call, which is not zeal
	 * Measured on the generated server: the MCP SDK validates a tool's `outputSchema` AFTER the handler
	 * has already issued its HTTP write, so a drift between the emitted response schema and what the
	 * endpoint returns turns a COMPLETED write into a tool error — and a real model retries, which is a
	 * silent double write wearing a failure's clothes. Failing loudly here is what makes that visible.
	 */
	async declare(
		mcp: AgentMcpInvocation,
		declarations: readonly AgentScenarioDeclaration[],
		ctx: DeclarationContext,
	): Promise<DeclaredToolCall[]> {
		// A run with no triggering transcript entry CANNOT fork: the router injects `originEntryId`
		// from this very field, and `ForkIssue` rejects the attribution gap by design (§7.2). Such
		// turns exist — a whisper queues an orchestrator turn with no origin — and the real
		// orchestrator answers them by replying, not by forking. Dropping the declaration is that
		// behavior (AC-5: nothing is declared and NO connection is opened); forcing the call would turn
		// a designed rejection into 3 mailbox retries per whisper. An INVALID token still falls through
		// below, where the fail-loudly path reports it — that guard is for runs that CAN declare.
		const identity = this.identities.resolve(mcp.token)
		const eligible =
			identity && !identity.entryId ? declarations.filter(declaration => !REQUIRES_ORIGIN_ENTRY[declaration.kind]) : declarations
		if (eligible.length === 0) return []

		if (!identity) {
			throw new BaseError<AgentApplicationErrors>('AGENT_TOOLS_UNSUPPORTED', 'run token is not valid — nothing can be declared with it')
		}
		if (!mcp.endpoint) {
			throw new BaseError<AgentApplicationErrors>('AGENT_TOOLS_UNSUPPORTED', 'the deterministic driver only speaks the http transport')
		}

		const calls = eligible.map(declaration => this.toolCall(declaration, identity, ctx))

		const client = new Client({ name: 'codm-e2e-driver', version: '0.0.0' })
		const transport = new StreamableHTTPClientTransport(new URL(mcp.endpoint), {
			// Both spellings, because the router accepts either and a CLI may only be able to set one.
			requestInit: { headers: { authorization: `Bearer ${mcp.token}`, [MCP_RUN_TOKEN_HEADER]: mcp.token } },
		})

		try {
			await client.connect(transport)

			for (const call of calls) {
				const result = await client.callTool({ name: call.tool, arguments: call.input })
				if (result.isError) {
					throw new BaseError<AgentApplicationErrors>(
						'AGENT_TOOLS_UNSUPPORTED',
						`MCP tool '${call.tool}' answered isError — ${JSON.stringify(result.content)}`,
					)
				}
			}
			return calls
		} finally {
			await client.close().catch(() => undefined)
		}
	}

	/**
	 * ONE declaration → the tool call that carries it, with the ids filled in from the credential.
	 *
	 * A plain exhaustive `switch`, which is this repo's canonical shape for a discriminated union (see
	 * the Projector contract in CLAUDE.md: narrowing per `case`, `never` at the default, no mapped
	 * types). It is also the ONE place the run's identity meets the scenario's intent — the roteiro
	 * says WHAT to declare and cannot say on whose behalf, which is the whole reason it lives in a
	 * subtree that AC-6.12 keeps free of these three keys.
	 */
	private toolCall(declaration: AgentScenarioDeclaration, identity: AgentRunIdentity, ctx: DeclarationContext): DeclaredToolCall {
		switch (declaration.kind) {
			case 'FORK_ISSUE':
				return {
					tool: operationIdOf(ForkIssueController),
					// `originEntryId` is NOT passed and could not be: the router injects it from the identity
					// (§7.2). If this driver could supply it, so could a model.
					input: { threadId: identity.threadId, data: { goal: declaration.goal } },
					summary: 'issue forked from the conversation',
				}

			case 'RECORD_ARTIFACT':
				return {
					tool: operationIdOf(RecordArtifactController),
					// NO `issueId`: the use case validates the issue EXISTS when one is supplied, and the issue
					// is materialized asynchronously. Naming the thread only is sufficient and race-free.
					input: {
						threadId: identity.threadId,
						data: {
							kind: declaration.artifact.kind,
							name: declaration.artifact.name,
							ref: resolveArtifactRef(declaration.artifact.ref, ctx.cwd),
							meta: declaration.artifact.meta,
						},
					},
					summary: 'artifact recorded',
				}

			case 'COMPLETE_ISSUE':
				return {
					tool: operationIdOf(TransitionIssueStatusController),
					input: {
						threadId: identity.threadId,
						issueId: identity.issueId,
						data: { status: IssueStatus.COMPLETED, summary: declaration.summary },
					},
					summary: 'issue declared complete',
				}
		}
	}
}

/**
 * Which declarations the router will refuse without an origin transcript entry (§7.2).
 *
 * A total record rather than a predicate with an `if`: a member added to the union leaves this map
 * incomplete, which is a `tsc` error, whereas a predicate would quietly answer `false` for it.
 */
const REQUIRES_ORIGIN_ENTRY: Readonly<Record<AgentScenarioDeclaration['kind'], boolean>> = {
	FORK_ISSUE: true,
	RECORD_ARTIFACT: false,
	COMPLETE_ISSUE: false,
}

/**
 * Where an artifact's bytes actually are, once the run that owns them exists.
 *
 * A scenario cannot write down a scratch workspace's path — it is a `mkdtemp` minted per run — so it
 * declares the location RELATIVE to the run and the absolute form is composed here, the first place
 * that knows both halves.
 */
function resolveArtifactRef(ref: AgentScenarioArtifactRef, cwd: string): string {
	switch (ref.at) {
		case 'WORKSPACE':
			return join(cwd, ref.relativePath)
		case 'URL':
			return ref.url
	}
}
