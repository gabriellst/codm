import { injectable } from 'tsyringe-neo'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ArtifactKind, IssueStatus } from '@codedm/contracts-typescript/wire/enums'
import { BaseError } from '@codedm/core-typescript'
import { RunTokenService } from '../services/RunTokenService'
import type { AgentMcpInvocation } from '../types/AgentMcpInvocation'
import type { AgentApplicationErrors } from '../errors'
import { MCP_RUN_TOKEN_HEADER } from '@codedm/client-typescript/typescript/mcp/context'
import { ISSUE_HANDLING_OPERATION } from './manifest'

/** One tool call the driver actually made — enough for the caller to render a frame pair. */
export interface DeclaredToolCall {
	tool: string
	input: Record<string, unknown>
	summary: string
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
 * it is where the claims are read and compared.
 *
 * WHERE ITS IDENTITY COMES FROM, and why that is not a shortcut. It resolves the claims from the
 * OPAQUE token through `RunTokenService.verify` — the same call, on the same service instance, that
 * the router makes on every tool call. A real model learns the same two ids from its prompt (see
 * `IssueWorkPromptBuilder`, which renders them precisely because a generated tool inherits its
 * controller's path parameters). Reading them from the credential instead of re-parsing prose keeps
 * this file free of the text-matching AC-6.2 forbids anywhere in the chain, and it cannot widen what
 * the run may touch: the router validates every argument against those same claims regardless.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
@injectable()
export class E2eMcpDriver {
	/** Stable artifact the e2e asserts on, through the same `ListArtifacts` query the console uses. */
	static readonly ARTIFACT_NAME = 'e2e-agent: run notes'
	static readonly ARTIFACT_REF = 'https://codedm.local/e2e/run-notes'
	/** Stable completion note — carried on the declaration, not inferred from any text. */
	static readonly COMPLETION_SUMMARY = 'e2e-agent: declared complete over MCP'

	constructor(private readonly runTokens: RunTokenService) {}

	/**
	 * Record an artifact, then declare the issue COMPLETED — the exact chain AC-6.2 names.
	 *
	 * Both calls are asserted to come back `isError: false`, and that assertion is not zeal. Measured
	 * on the generated server: the MCP SDK validates a tool's `outputSchema` AFTER the handler has
	 * already issued its HTTP write, so a drift between the emitted response schema and what the
	 * endpoint returns turns a COMPLETED write into a tool error — and a real model retries, which is a
	 * silent double write wearing a failure's clothes. Failing loudly here is what makes that visible.
	 */
	async declareIssueWorkComplete(mcp: AgentMcpInvocation): Promise<DeclaredToolCall[]> {
		const claims = this.runTokens.verify(mcp.token)
		if (!claims) {
			throw new BaseError<AgentApplicationErrors>('AGENT_TOOLS_UNSUPPORTED', 'run token is not valid — nothing can be declared with it')
		}
		if (!mcp.endpoint) {
			throw new BaseError<AgentApplicationErrors>('AGENT_TOOLS_UNSUPPORTED', 'the deterministic driver only speaks the http transport')
		}

		const client = new Client({ name: 'codedm-e2e-driver', version: '0.0.0' })
		const transport = new StreamableHTTPClientTransport(new URL(mcp.endpoint), {
			// Both spellings, because the router accepts either and a CLI may only be able to set one.
			requestInit: { headers: { authorization: `Bearer ${mcp.token}`, [MCP_RUN_TOKEN_HEADER]: mcp.token } },
		})

		try {
			await client.connect(transport)
			const calls: DeclaredToolCall[] = [
				{
					tool: ISSUE_HANDLING_OPERATION.recordArtifact,
					// NO `issueId`: the use case validates the issue EXISTS when one is supplied, and the
					// issue is materialized asynchronously off `integration.issue.opened`. Naming the thread
					// only is both sufficient (the console lists a thread's artifacts) and race-free.
					input: {
						threadId: claims.threadId,
						data: {
							kind: ArtifactKind.LINK,
							name: E2eMcpDriver.ARTIFACT_NAME,
							ref: E2eMcpDriver.ARTIFACT_REF,
							meta: '{}',
						},
					},
					summary: 'artifact recorded',
				},
				{
					tool: ISSUE_HANDLING_OPERATION.transitionIssueStatus,
					input: {
						threadId: claims.threadId,
						issueId: claims.issueId,
						data: { status: IssueStatus.COMPLETED, summary: E2eMcpDriver.COMPLETION_SUMMARY },
					},
					summary: 'issue declared complete',
				},
			]

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
}
