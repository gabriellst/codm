import { injectable } from 'tsyringe-neo'
import { AgentModelId, McpScope } from '@codedm/contracts-typescript/wire/enums'
import { AgentIdentityService, z } from '@codedm/core-typescript'
import { AgentMessageRole, AgentName } from '../../enums'
import { Agent } from '../../types/Agent'
import { AgentRunIdentitySchema, type AgentRunIdentity } from '../../types/AgentRunIdentity'
import { toolsInScope } from '../../mcp/exposure'
import type { AgentRunRequest } from '../../types'
import { IssueWorkPromptBuilder } from './prompt'
import { IssueWorkInputSchema } from './types'

/**
 * Drives ONE working turn for an issue (GOAL-agent-abstraction §4.8) — the agent `RunIssueTurn`
 * consumes, which the severed-saga closer triggers off `integration.message.classified`.
 *
 * ### No `outputSchema`, and therefore NO public method beyond `run()`
 * A working turn produces a stream, not an object: the consumer drains it, fans `frame` events to the
 * SSE observer and reads the ONE terminal event for the outcome. `collect()` would be meaningless
 * here (the `output` phantom is `never`), which is why AC-5.8 can state the rule as a flat grep: an
 * agent WITHOUT an `outputSchema` exposes nothing but the inherited `run()`. It does not even
 * IMPLEMENT `run()` — the base's template method is concrete and the only variation point is
 * `buildRequest`.
 *
 * ### Same runner, same transport, different request
 * This and `ClassifyIssueAgent` are handed the SAME `AgentRunner` (D3, satisfied structurally rather
 * than by convention): identical interface, identical transport, and the only difference is the
 * request — an `outputSchema` there, a session plan and a workspace here. It ARRIVES at `run()` rather
 * than at the constructor, because which CLI drives a turn is the thread's choice and the caller
 * resolves it from `AgentRunnerFactory`; the agent itself holds no I/O.
 *
 * ### `tools` is the DERIVED expansion of ONE declared scope (Fase 6)
 * `issue-handling`, expanded by the scan in `mcp/exposure.ts` and never typed out here. The base's template-method
 * `run()` is what turns that scope into an `AgentMcpInvocation` — minting the run token and pointing
 * the CLI at this daemon's MCP door — so the invariant §4.3 rule 7 states holds by construction:
 * `request.mcp` present ⟺ `tools.length > 0`.
 */
@injectable()
export class IssueWorkAgent extends Agent<typeof IssueWorkInputSchema> {
	static override readonly NAME = AgentName.ISSUE_WORK

	override readonly inputSchema = IssueWorkInputSchema

	/**
	 * The tool scope this agent declares — `issue-handling` and NOTHING else.
	 *
	 * `system` exists, is generated and is mounted, but no internal agent declares it: it carries
	 * `owner/*` and `workspace/*`, and this agent is driven by the text of an inbound WhatsApp message
	 * written by someone who is not the operator. Handing it those operations would put account
	 * administration one prompt injection away from a stranger.
	 *
	 * `tools` is the DERIVED expansion, never a hand-written list — declare `static mcpScopes` on a
	 * seventh controller and the argv changes with no edit here (AC-6.5's falsifier).
	 */
	/**
	 * `issueId` is REQUIRED — the security half, stated where the agent lives.
	 *
	 * This agent's tools are six WRITES performed on its own issue, and the destination-side check
	 * (`AgentIdentityMiddleware`) can only compare an axis the identity CARRIES. An identity without
	 * `issueId` gives no protection at all on an `issueId` argument, so a credential that could call
	 * these tools without naming its issue would be a credential confined to nothing.
	 *
	 * It is enforced at SPAWN, before `.issue(` — see `Agent.buildMcpInvocation`.
	 */
	static override readonly IdentitySchema = AgentRunIdentitySchema.extend({ issueId: z.uuid() })

	override readonly mcpScope = McpScope.ISSUE_HANDLING
	override readonly tools = toolsInScope(McpScope.ISSUE_HANDLING)

	constructor(
		identities: AgentIdentityService<AgentRunIdentity>,
		private readonly prompt: IssueWorkPromptBuilder,
	) {
		super(identities)
	}

	protected buildRequest(input: this['input']): Omit<AgentRunRequest, 'mcp' | 'agentName'> {
		return {
			cwd: input.cwd,
			systemPrompt: this.prompt.system(input),
			messages: [{ role: AgentMessageRole.USER, content: input.prompt }],
			model: input.model ?? AgentModelId.DEFAULT,
			session: input.session,
			binaryPath: input.binaryPath,
			caps: input.caps,
		}
	}
}
