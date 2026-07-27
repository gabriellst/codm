/**
 * The tools the CodeDM MCP server exposes to an external agent CLI (GOAL-agent-abstraction §4.4).
 * FOUR, and the value IS the wire name the model calls — which is why the members carry the
 * `codedm__` prefix literally instead of a pretty name plus a mapping table.
 *
 * The prefix is LOad-BEARING, not cosmetic. Two separate mechanisms read it:
 *  1. `--allowedTools` scope: the runner passes these literals straight through from the agent's
 *     declared `tools` (§4.2) — a mapping layer would be one more place for a typo to become a
 *     silently-unavailable tool.
 *  2. ANTI-DOUBLE-PUBLISH (§4.3, rule 3): the turn-fact accumulator sees `tool_use`/`tool_result`
 *     frames for OUR tools too. On a `codedm__`-prefixed frame it emits the frame (observability)
 *     and NEVER a fact — the fact was already persisted by the use case that served the call. Without
 *     that guard one `complete_issue` publishes `integration.issue.completed` twice.
 *
 * Ownership is NOT uniform, and that is deliberate (§4.4 item (ii)): a tool is a thin controller of
 * the bounded context that OWNS the write it causes. `complete_issue` / `raise_stop` / `ask_operator`
 * are execution facts → this context. `record_artifact` is a write to the artifact catalogue → its
 * handler lives in the artifact context, dispatching the `RecordArtifact` use case that already exists.
 * The NAME is single-sourced here regardless, because `--allowedTools` is one flat list.
 *
 * Context-private: the MCP router is deliberately mounted OUTSIDE the emitted OpenAPI (§4.4), so the
 * wire-identity of these tools is guaranteed by this enum plus the Zod input schemas in
 * `schemas/AgentToolSchemas.ts` — that pair IS the contract, and AC-1.6 is what checks it.
 */
export enum AgentToolName {
	COMPLETE_ISSUE = 'codedm__complete_issue',
	RAISE_STOP = 'codedm__raise_stop',
	RECORD_ARTIFACT = 'codedm__record_artifact',
	ASK_OPERATOR = 'codedm__ask_operator',
}

/** The prefix every CodeDM-declared tool carries. The accumulator's anti-double-publish guard keys on it. */
export const CODEDM_TOOL_PREFIX = 'codedm__' as const
