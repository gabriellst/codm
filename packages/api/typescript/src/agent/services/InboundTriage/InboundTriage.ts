import { injectable } from 'tsyringe-neo'
import { DAEMON_BOOT } from '@codm/core-typescript'
import type { IssueStatus, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { TriageDecision } from '../../enums'

/**
 * How long the triage itself may take before the message goes to the orchestrator anyway. A small
 * model answers a one-message triage in seconds; past this the parallel path stopped paying for itself.
 */
export const TRIAGE_TIMEOUT_MS = 20_000

/**
 * How long the orchestrator's item waits for the triage — the HOLD (`EnqueueMailboxItem.hold`). The
 * timeout plus a margin for the CLI to spawn and the verdict to commit: past it the hold lapses and the
 * orchestrator claims the item, whatever the triage is still doing (its late verdict is then dropped).
 */
export const TRIAGE_HOLD_MS = TRIAGE_TIMEOUT_MS + 10_000

/**
 * WHO holds a held item — this daemon's triage. Boot-scoped so a second daemon on the same file can never
 * settle this one's hold; a dead boot's holds are freed by the dispatcher's boot sweep like its claims.
 */
export const TRIAGE_HOLDER = `triage:${DAEMON_BOOT.id}`

/** A `STEER` below this confidence goes to the orchestrator instead — a wrong steer misplaces somebody's words. */
export const TRIAGE_STEER_MIN_CONFIDENCE = 0.8

/**
 * A `NO_ACTION` below this goes to the orchestrator. Stricter than the steer's floor: the cost of a wrong
 * "nothing to do" is silence on a real request, which nobody can see happen.
 */
export const TRIAGE_NO_ACTION_MIN_CONFIDENCE = 0.9

/** What one triage is handed — names and texts only; no address, phone or JID ever reaches the model. */
export interface InboundTriageRequest {
	ownerId: string
	threadId: string
	/** The conversation's provider — the triage runs on that provider's SMALL model. */
	provider: ProviderKind
	/** The bound workspace path — the CLI's cwd, never `process.cwd()`. */
	cwd: string
	message: { speaker: string; text: string; quoted?: { speaker: string; text: string } }
	openIssues: { key: string; title: string; status: IssueStatus; lastActivityAt: Date }[]
	recent: { speaker: string; text: string; at: Date }[]
	now: Date
}

/**
 * The verdict AFTER policy — what the caller acts on. `STEER` and `NO_ACTION` only reach here above
 * their confidence floors; everything uncertain, failed or timed out is `ORCHESTRATOR`, with `fallback`
 * saying why the model's own answer was not taken (absent when the model itself chose it).
 */
export type TriageVerdict = { confidence: number | undefined; latencyMs: number; fallback?: string } & (
	| { decision: TriageDecision.STEER; issueKey: string }
	| { decision: TriageDecision.NEW_TASK; title: string }
	| { decision: TriageDecision.ORCHESTRATOR }
	| { decision: TriageDecision.NO_ACTION }
)

/**
 * THE PARALLEL TRIAGE'S POLICY (fase 2, triagem paralela) — the service next to `TriageAgent`: which
 * model, how long, how sure is sure enough, and what a failure becomes (always: the orchestrator).
 *
 * `holdMs` is the per-env DECLARATION of whether this deployment triages at all: `undefined` ⇒ it does
 * not, and the ingest queues the orchestrator's turn exactly as before. Bound per env in `registry.ts`
 * (on in `real`, off in `mock` / `integration` / `e2e`, where a suite that exercises the triage overrides
 * the binding) — never a flag read at the call site.
 *
 * `decide` NEVER throws: whatever goes wrong is an `ORCHESTRATOR` verdict, because the orchestrator is the
 * path every message already had.
 */
export abstract class InboundTriage {
	abstract readonly holdMs: number | undefined
	abstract decide(request: InboundTriageRequest): Promise<TriageVerdict>
}

/** The env that does not triage: no hold, and a verdict that is always "the orchestrator, as before". */
@injectable()
export class NoInboundTriage extends InboundTriage {
	readonly holdMs = undefined

	async decide(_request: InboundTriageRequest): Promise<TriageVerdict> {
		return { decision: TriageDecision.ORCHESTRATOR, confidence: undefined, latencyMs: 0, fallback: 'triage disabled in this env' }
	}
}
