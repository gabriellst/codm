/**
 * Terminal status of ONE tool invocation observed during an agent turn (GOAL-agent-abstraction §4.3,
 * `AgentToolCallEvent`).
 *
 * Only the TERMINAL states are members, and that is a modelling decision, not an omission:
 * `PENDING` / `RUNNING` are internal states of the accumulator's in-flight builder and never leave
 * it. Exactly one `AgentToolCallEvent` is emitted per invocation, at lifecycle end — when the
 * `tool_result` frame arrives (`COMPLETED`), or at `flush()` when the turn ends with a `tool_use`
 * that never got its result (`FAILED`, the orphan case §4.3 rule 2 names explicitly).
 *
 * CONTEXT-ORIGIN: medscall `packages/api/src/agent/enums/ChatEventStatus.ts` +
 * `events/ChatToolCallEvent.ts` @ c58ed45677c473b0415c03cfc741fea3a00946f4 — judgement copied
 * (emit once, at lifecycle end, with the orphan materialized as FAILED), not the file.
 *
 * Context-private (not a contracts enum): tool lifecycle is observability for the run panel; it never
 * crosses a service boundary.
 */
export enum AgentToolCallStatus {
	COMPLETED = 'COMPLETED',
	FAILED = 'FAILED',
}
