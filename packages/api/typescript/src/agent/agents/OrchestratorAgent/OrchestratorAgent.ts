import { injectable } from 'tsyringe-neo'
import { AgentModelId, McpScope } from '@codedm/contracts-typescript/wire/enums'
import { AgentIdentityService } from '@codedm/core-typescript'
import { AgentMessageRole, AgentName } from '../../enums'
import { Agent } from '../../types/Agent'
import { AgentRunIdentitySchema, type AgentRunIdentity } from '../../types/AgentRunIdentity'
import { TOOLS_IN_SCOPE } from '../../mcp/manifest'
import type { AgentRunRequest } from '../../types'
import { OrchestratorPromptBuilder } from './prompt'
import { OrchestratorInputSchema } from './types'

/**
 * The thread's resident conversationalist (orchestrator pivot §7.1) — ONE per conversation, with a
 * persistent session, driving the turns the `MailboxDispatcher` schedules for a `THREAD` target.
 *
 * ### No `outputSchema`, like `IssueWorkAgent` and for the same reason
 * A conversational turn produces a stream and a reply, not a parsed object. `collect()` would be
 * meaningless (its `output` phantom is `never`), so this agent exposes nothing beyond the inherited
 * `run()` and does not even implement that — the base's template method is concrete and
 * `buildRequest` is the only variation point.
 *
 * ### Why it CAN declare a scope with no `issueId`, which was the blocker
 * The base used to refuse to issue a run credential for any scoped agent without an `issueId` ("a run
 * token must be confined to an issue"). This agent is keyed by THREAD and structurally has none (§6.1
 * — its session row is the one with `issue_id IS NULL`), so that rule would have killed every turn at
 * spawn time. Confinement is now declared by the AGENT, as its own `static IdentitySchema` — and this
 * one omits the field entirely.
 *
 * ### The tools it does NOT get, and why the omission is the design
 * `issue-handling`'s six writes are absent: this agent converses, forks and reads — it never does
 * issue work (§3, "o orquestrador nunca executa trabalho de issue"). Two consequences follow that are
 * easy to miss. First, a thread-confined token has NO generic protection on an `issueId` argument
 * (`assertIdentityMatchesClaims` skips an absent claim rather than rejecting it), so every tool in
 * this scope that takes one confines itself — which is affordable for three read/create operations
 * and would not be for six writes on somebody's repository. Second, the prompt tells this agent not
 * to edit files, and that instruction is the ONLY thing standing between it and the CLI's own
 * Read/Write/Edit/Bash surface: `--allowedTools` is passed only alongside an MCP config, while
 * `--permission-mode auto` is unconditional.
 */
@injectable()
export class OrchestratorAgent extends Agent<typeof OrchestratorInputSchema> {
	static override readonly NAME = AgentName.ORCHESTRATOR

	override readonly inputSchema = OrchestratorInputSchema

	/**
	 * NO `issueId` — not "optional", ABSENT. The orchestrator is keyed by THREAD and structurally has
	 * no issue, and the field's absence is what tells the destination-side comparison there is nothing
	 * to compare on that axis. The consequence is named, not hidden: every tool in this scope that
	 * ACCEPTS an `issueId` verifies ownership in its own handler (`SteerIssueTurn` does exactly that),
	 * because no generic check can help where there is no claim.
	 */
	static override readonly IdentitySchema = AgentRunIdentitySchema.omit({ issueId: true })

	override readonly mcpScope = McpScope.orchestration
	/** DERIVED, never hand-written — add a tool to the manifest and the argv follows with no edit here. */
	override readonly tools = TOOLS_IN_SCOPE[McpScope.orchestration]

	constructor(
		identities: AgentIdentityService<AgentRunIdentity>,
		private readonly prompt: OrchestratorPromptBuilder,
	) {
		super(identities)
	}

	protected buildRequest(input: this['input']): Omit<AgentRunRequest, 'mcp' | 'agentName'> {
		return {
			cwd: input.cwd,
			systemPrompt: this.prompt.system(input),
			// ONE user message per turn: the elapsed window plus the item being answered. The split
			// between this and `systemPrompt` is what lets a RESUMED session carry only the tail — the
			// standing instructions are already in the CLI's own session.
			messages: [{ role: AgentMessageRole.USER, content: this.prompt.user(input) }],
			model: input.model ?? AgentModelId.DEFAULT,
			session: input.session,
			binaryPath: input.binaryPath,
			caps: input.caps,
		}
	}
}
