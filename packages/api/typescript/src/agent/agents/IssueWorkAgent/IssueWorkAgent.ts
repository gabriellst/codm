import { injectable } from 'tsyringe-neo'
import { AgentModelId } from '@codedm/contracts-typescript/wire/enums'
import { AgentMessageRole, AgentName } from '../../enums'
import { AgentRunner } from '../../services/AgentRunner'
import { Agent } from '../../types/Agent'
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
 * This and `ClassifyIssueAgent` inject the SAME `AgentRunner` (D3, satisfied structurally rather than
 * by convention): identical interface, identical transport, and the only difference is the request —
 * an `outputSchema` there, a session plan and a workspace here.
 *
 * ### `tools` is EMPTY until Fase 6, and that is a scheduling fact, not a stub
 * §4.8 gives this agent the four `codedm__*` tools. They arrive with the phase that births what they
 * talk to: the MCP router, the four tool handlers and the single implementation of `RunTokenService`
 * are all Fase 6 deliverables (§5.3's NASCEM list). Declaring the scope now would make the base build
 * an `AgentMcpInvocation` whose endpoint is a route that does not exist and whose token cannot be
 * minted — `RunTokenService` has no DI binding today, by contract ("contract only in Fase 1"). The
 * invariant §4.3 rule 7 states holds either way: `request.mcp` present ⟺ `tools.length > 0`.
 */
@injectable()
export class IssueWorkAgent extends Agent<typeof IssueWorkInputSchema> {
	static override readonly NAME = AgentName.ISSUE_WORK

	override readonly inputSchema = IssueWorkInputSchema

	constructor(
		runner: AgentRunner,
		private readonly prompt: IssueWorkPromptBuilder,
	) {
		super(runner)
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
