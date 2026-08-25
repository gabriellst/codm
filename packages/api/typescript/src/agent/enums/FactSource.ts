/**
 * How a domain fact about an agent run came to be known (GOAL-agent-abstraction §4.3, rule 6).
 *
 * - `DECLARED` — the agent CALLED one of our MCP tools (`TransitionIssueStatus`, …). Typed payload,
 *   no parsing, no heuristic. This is the source of truth the whole MCP inversion exists to buy.
 * - `INFERRED` — nobody declared anything; the fact was derived from the terminal outcome of the run.
 *   Legitimate in exactly two situations: an agent running with an EMPTY tool scope (the degraded
 *   mode, which must stay VISIBLE rather than silent), and TRANSPORT stops (`AUTH_REQUIRED`,
 *   `SERVER_ERROR`), which never depended on a tool at all and are therefore always inferred.
 *
 * Carried on the context-private domain events, never on the frozen integration events — so
 * "how many issues closed by inference?" is a `SELECT` over `shared_events`, not a promise.
 *
 * Context-private (not a contracts enum): it never crosses a service boundary. The bridge to
 * `integration.issue.completed` / `integration.thread.stop_raised` deliberately does NOT forward it.
 */
export enum FactSource {
	DECLARED = 'DECLARED',
	INFERRED = 'INFERRED',
}
