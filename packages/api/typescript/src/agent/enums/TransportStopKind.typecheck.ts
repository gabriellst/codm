/**
 * AC-6.7, the TYPE half — `TransportStopKind` DOES NOT ADMIT THE THREE DOMAIN KINDS.
 *
 * A COMPILE-TIME artifact, not a runtime suite. `tsconfig.build.json` includes `tests/**\/*.ts` and
 * excludes only `*.test.ts`, so `bun tsc` compiles everything below and **`bun tsc` going green IS the
 * assertion**. (Molde: `tests/architecture/agent-input.type-test.ts` and
 * `tests/architecture/union-narrowing.typecheck.ts`.)
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A TYPE TEST AND NOT A RUNTIME ONE
 * The property AC-6.7(b) states is *"a run with no tools cannot manufacture a DOMAIN stop"*, and the
 * goal is explicit that it holds **by type rather than by discipline**: `AgentRunResult.stop` is typed
 * with `TransportStopKind`, so the runner has no way to SAY `APPROVAL_NEEDED`. A runtime test can only
 * ever show that a particular runner did not do it today. This file shows that no runner CAN.
 *
 * WHY `@ts-expect-error` IS THE ASSERTION, AND WHY IT IS SELF-FALSIFYING
 * §8's AC-3.4 bans `@ts-expect-error` in PRODUCTION code; AC-6.7 permits it here and calls it the
 * assertion. The reason it is not a loophole: the directive is an error itself when the line below it
 * compiles cleanly (`TS2578: Unused '@ts-expect-error' directive`). So widening `TransportStopKind` to
 * accept a domain kind does not make this file pass quietly — it makes `bun tsc` RED, on this line, by
 * the same mechanism that makes it green today. There is no state of the world in which these
 * assertions are vacuous, which is exactly what §8 demands of a gate.
 *
 * MEASURED, so the claim above is not a story: replacing the type below with
 * `type Probe = StopKind` turns all three directives into `TS2578` and `bun tsc` exits 1.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { TRANSPORT_STOP_KINDS, isTransportStopKind, type TransportStopKind } from './TransportStopKind'
import type { AgentRunResult } from '../types/AgentRuntimeEvent'

// ── THE TWO TRANSPORT KINDS ARE ADMITTED ─────────────────────────────────────────────────────────
// The positive half runs first, and it is load-bearing: without it, a `TransportStopKind` that had
// collapsed to `never` would satisfy every rejection below while making the type useless.

export const authRequiredIsTransport: TransportStopKind = StopKind.AUTH_REQUIRED
export const serverErrorIsTransport: TransportStopKind = StopKind.SERVER_ERROR

// ── THE THREE DOMAIN KINDS ARE REJECTED ──────────────────────────────────────────────────────────
// Each is a stop only `RaiseStop` / `AskOperator` may originate — i.e. only a MODEL may declare, never
// a runner observe. `DeclareStop` enforces the same partition at runtime for the caller that CAN name
// the whole `StopKind` (D6-4, `src/agent/usecases/DeclareStop.test.ts`); here the runner side of the
// partition is enforced by the compiler, so there is nothing to enforce at runtime at all.

// @ts-expect-error — APPROVAL_NEEDED is a DOMAIN stop: the model asks, the runner cannot observe it.
export const approvalNeededIsNotTransport: TransportStopKind = StopKind.APPROVAL_NEEDED
// @ts-expect-error — HUMAN_REQUESTED is a DOMAIN stop: it is `AskOperator`'s fixed kind.
export const humanRequestedIsNotTransport: TransportStopKind = StopKind.HUMAN_REQUESTED
// @ts-expect-error — BLOCKED_BY_CLASSIFICATION is a DOMAIN stop: it is a routing verdict, not a process fact.
export const blockedByClassificationIsNotTransport: TransportStopKind = StopKind.BLOCKED_BY_CLASSIFICATION

// ── AND THE CONSEQUENCE, AT THE PLACE IT ACTUALLY MATTERS ────────────────────────────────────────

/**
 * `AgentRunResult.stop` — the ONE channel a runner has for reporting a stop — is typed with the
 * transport half. This is the assertion that carries the AC's substance: everything above is about a
 * type alias, this is about the seam a real `AgentRunner` writes into.
 */
export const runnerMayReportATransportStop: AgentRunResult['stop'] = {
	kind: StopKind.AUTH_REQUIRED,
	detail: 'the CLI asked for /login',
}

export const runnerMayNotReportADomainStop: AgentRunResult['stop'] = {
	// @ts-expect-error — a runner cannot report a DOMAIN stop through the seam, whatever it observed.
	kind: StopKind.APPROVAL_NEEDED,
	detail: 'this would be a declaration wearing an observation’s clothes',
}

// ── THE RUNTIME MEMBERSHIP TEST AGREES WITH THE TYPE ─────────────────────────────────────────────

/**
 * `isTransportStopKind` is the narrowing predicate `DeclareStop` and `RunIssueTurn` branch on. Pinned
 * here so the type and its runtime companion cannot drift: the parameter accepts the WHOLE `StopKind`
 * (it has to — it is asked about values that may be domain ones) and the result narrows to the subset
 * declared above.
 */
export function predicateNarrowsToTheSameSubset(kind: StopKind): TransportStopKind | undefined {
	return isTransportStopKind(kind) ? kind : undefined
}

/** And the iterable form carries exactly the type, member for member. */
export const transportKindsAreTyped: readonly TransportStopKind[] = TRANSPORT_STOP_KINDS
