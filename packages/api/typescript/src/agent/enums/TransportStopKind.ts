import { StopKind } from '@codm/contracts-typescript/wire/enums'

/**
 * The TRANSPORT half of the frozen `StopKind` value-set (GOAL-agent-abstraction §4.3).
 *
 * NOT A NEW ENUM — and that is the whole point. §8 rule 5 forbids redeclaring a value-set that
 * contracts already owns, so this is a `type` + an `as const` tuple built FROM `StopKind`. Adding a
 * member here is impossible without adding it to `stop-kind.tsp` first; the compiler enforces it.
 *
 * The partition it encodes, and why the partition is real:
 *
 * | group     | values                                                          | who raises it                                             | FactSource |
 * |-----------|-----------------------------------------------------------------|-----------------------------------------------------------|------------|
 * | TRANSPORT | AUTH_REQUIRED, SERVER_ERROR                                     | the RUNNER, observing the process/stream (CLI asked for   | INFERRED   |
 * |           |                                                                 | `/login`, the process died, the stream broke)             |            |
 * | DOMAIN    | APPROVAL_NEEDED, HUMAN_REQUESTED, BLOCKED_BY_CLASSIFICATION     | ONLY `RaiseStop` / `AskOperator` (§4.4) | DECLARED   |
 *
 * `AgentRunResult.stop` is typed with THIS type, not with `StopKind`, so the type system states the
 * consequence the goal spells out: a run with NO tool scope can still end in `AUTH_REQUIRED` — a
 * transport stop never needed a tool — but it can never manufacture a DOMAIN stop, because
 * `raise_stop` does not exist without tools.
 */
export type TransportStopKind = typeof StopKind.AUTH_REQUIRED | typeof StopKind.SERVER_ERROR

/** Iterable form of the same subset — for exhaustiveness checks and runtime membership tests. */
export const TRANSPORT_STOP_KINDS = [StopKind.AUTH_REQUIRED, StopKind.SERVER_ERROR] as const

/** True when a wire `StopKind` belongs to the transport half — i.e. the runner is allowed to raise it. */
export function isTransportStopKind(kind: StopKind): kind is TransportStopKind {
	return (TRANSPORT_STOP_KINDS as readonly StopKind[]).includes(kind)
}
