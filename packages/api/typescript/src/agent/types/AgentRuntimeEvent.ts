import type { AgentRunOutcome, TransportStopKind } from '../enums'
import type { AgentTurnFact } from '../events'
import type { AgentFrame } from './AgentFrame'

/**
 * What ONE `run()` produced, delivered as the last event of the iteration — exactly one per run.
 *
 * `failed` is the reason this record exists instead of a thrown error. §4.3 rule 4: structured-output
 * validation NEVER throws mid-drain; a validation failure becomes THIS record with `failed: true`, so
 * a consumer that is halfway through draining frames can finish draining and then decide. A throw
 * would strand the consumer's partial state and, in the runner, leak the child process whose stdin
 * has not been closed yet.
 *
 * `stop` is TRANSPORT-only, and the type says so: `TransportStopKind` is the `{AUTH_REQUIRED,
 * SERVER_ERROR}` half of the frozen `StopKind` value-set — the half the runner is allowed to raise by
 * observing the process. DOMAIN stops (`APPROVAL_NEEDED`, `HUMAN_REQUESTED`,
 * `BLOCKED_BY_CLASSIFICATION`) can only ever come from a `codedm__raise_stop` tool call (Fase 6), so
 * they are unrepresentable here by construction rather than by convention.
 */
export interface AgentRunResult {
	outcome: AgentRunOutcome
	replyText: string
	sessionId: string | null
	/** Present iff an `outputSchema` was passed AND it validated. */
	output?: unknown
	/** Structural validation failed — never thrown, always reported. */
	failed: boolean
	failure?: string
	stop?: { kind: TransportStopKind; detail: string }
}

/**
 * The single seam event type of `run()` (GOAL-agent-abstraction §4.3).
 *
 * Three categories, and keeping them apart IS the section:
 *  - `frame` — TRANSPORT. Goes to SSE, never to the outbox.
 *  - `fact`  — an OBSERVED domain fact, folded out of frames by the pure accumulator. Outbox-bound.
 *  - `finished` — exactly ONE, always last.
 *
 * The THIRD signal category — a DECLARED fact (`codedm__complete_issue` and friends) — is deliberately
 * absent: it does not travel this stream at all. It arrives as an MCP tool call on a separate
 * transport and is persisted by the use case that serves it (Fase 6). Routing it through here too is
 * exactly the double-publish §4.3 rule 3 exists to prevent.
 */
export type AgentRuntimeEvent =
	| { type: 'frame'; frame: AgentFrame }
	| { type: 'fact'; fact: AgentTurnFact }
	| { type: 'finished'; result: AgentRunResult }
