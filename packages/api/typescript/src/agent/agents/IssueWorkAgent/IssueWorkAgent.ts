import { injectable } from 'tsyringe-neo'
import { AgentModelId, McpScope } from '@codm/contracts-typescript/wire/enums'
import { AgentIdentityService, z } from '@codm/core-typescript'
import { AgentMessageRole, AgentName, type AgentToolName } from '../../enums'
import { Agent } from '../../types/Agent'
import { AgentRunIdentitySchema, type AgentRunIdentity } from '../../types/AgentRunIdentity'
import { toolsInScope } from '../../mcp/exposure'
import { wireToolName } from '../../mcp/wire'
import { upstreamToolName } from '../../mcp/upstream'
import { McpUpstreamRegistry } from '../../services/McpUpstreamRegistry'
import type { AgentRunRequest } from '../../types/AgentRunRequest'
import { IssueWorkPromptBuilder } from './prompt'
import { IssueWorkInputSchema } from './types'

/** Our own DERIVED expansion — the `tools` field always holds exactly this, never an owner-specific augmentation. */
const OWN_TOOLS = toolsInScope(McpScope.ISSUE_HANDLING)

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
 * ### `tools` is the DERIVED expansion of ONE declared scope (Fase 6); `resolveTools` ADDS upstream, per run (Task T5)
 * `tools` itself stays exactly `issue-handling`, expanded by the scan in `mcp/exposure.ts` and never
 * typed out here. What THIS run's `--allowedTools` carries is wider: `resolveTools` (overridden from
 * `Agent`, see its docblock) appends the wire names of whichever third-party tools this run's OWNER
 * has enabled, read fresh from `McpUpstreamRegistry` on every call — no cache, no lag, so the very
 * first turn of a fresh issue sees the same tools a hundredth turn would. The base's template-method
 * `run()` is what turns the resolved list into an `AgentMcpInvocation` — minting the run token and
 * pointing the CLI at this daemon's MCP door — so the invariant §4.3 rule 7 states holds by
 * construction: `request.mcp` present ⟺ `this.mcpScope` declared.
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

	/**
	 * Our own DERIVED expansion — nothing else. Owner-specific upstream tools are NOT folded in here;
	 * see `resolveTools` below for why `tools` itself stays this narrow.
	 */
	override readonly tools: readonly AgentToolName[] = OWN_TOOLS

	/**
	 * `mcpUpstream` is OPTIONAL for the same reason `McpDoorController.mcpUpstream` is (see that
	 * class's constructor docblock): `agent/registry.ts` always resolves it through the container in
	 * every DI env, but the existing suite in `IssueWorkAgent.test.ts` constructs this class by hand
	 * with `new IssueWorkAgent(identities, prompt)`, two arguments, several times over — a required
	 * third parameter would fail those call sites to COMPILE. `resolveTools`'s optional-chained read
	 * below is what makes the optionality sound: absent, this run simply resolves to `tools` unchanged.
	 */
	constructor(
		identities: AgentIdentityService<AgentRunIdentity>,
		private readonly prompt: IssueWorkPromptBuilder,
		private readonly mcpUpstream?: McpUpstreamRegistry,
	) {
		super(identities)
	}

	/**
	 * Overrides `Agent.resolveTools` (see its docblock) — THIS run's `--allowedTools`, read fresh on
	 * every call rather than cached across runs. `Agent.run()` awaits this before minting the run
	 * token, so the result is complete before the CLI ever spawns: the first turn of a fresh issue
	 * gets exactly the same list a later turn would.
	 *
	 * `McpUpstreamRegistry.listTools` already swallows a broken upstream into an empty list
	 * (`DefaultMcpUpstreamRegistry.safeListTools`); the `.catch` below is a second line of defence so
	 * that even a registry that does throw can never shrink this run below the derived expansion.
	 */
	protected override async resolveTools(input: this['input']): Promise<readonly AgentToolName[]> {
		const upstream = await this.mcpUpstream?.listTools(input.ownerId).catch(() => [])
		if (!upstream || upstream.length === 0) return this.tools
		return [...this.tools, ...upstream.map(tool => wireToolName(upstreamToolName(tool)))]
	}

	protected buildRequest(input: this['input']): Omit<AgentRunRequest, 'mcp' | 'agentName'> {
		return {
			cwd: input.cwd,
			systemPrompt: this.prompt.system(input),
			// RENDERED, not passed through. The turn's message carries an author, an instant and a kind
			// (brief vs amendment), and turning those into text is the prompt builder's job — `buildRequest`
			// assembles. Same split `OrchestratorAgent` has always had, for the same reason.
			messages: [{ role: AgentMessageRole.USER, content: this.prompt.user(input) }],
			model: input.model ?? AgentModelId.DEFAULT,
			session: input.session,
			binaryPath: input.binaryPath,
			caps: input.caps,
		}
	}
}
