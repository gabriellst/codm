/**
 * The internal agents this context runs, as IDENTITY — `static readonly NAME` on the agent class,
 * `agentName` on `AgentRunRequest`, the label on every log line / span / run-token claim
 * (GOAL-agent-abstraction §4.8).
 *
 * NEVER a resolution key. Agents are resolved by DI class token (`container.resolve(IssueWorkAgent)`);
 * there is no name→agent map and no factory. A map would reintroduce the stringly-typed registry the
 * origin-fork agent context deleted, and would make "which agent ran" a runtime lookup instead of a type.
 *
 * Context-private (not a contracts enum): the agent identity never crosses a service boundary — the
 * integration events carry the FACT (issue completed, stop raised), never who produced it.
 */
export enum AgentName {
	CLASSIFY_ISSUE = 'CLASSIFY_ISSUE',
	ISSUE_WORK = 'ISSUE_WORK',
	/**
	 * The thread's resident conversationalist (orchestrator pivot, 28-jul). One per thread, with a
	 * persistent session: it talks to the operator, forks issues on request, and composes a finished
	 * subagent's outcome into an answer in the voice of the conversation. It never does issue work
	 * itself — conversing is deciding, not acting, the same split the Fase-4.5 critique drew between
	 * the classifier agent and the routing policy.
	 */
	ORCHESTRATOR = 'ORCHESTRATOR',
}
