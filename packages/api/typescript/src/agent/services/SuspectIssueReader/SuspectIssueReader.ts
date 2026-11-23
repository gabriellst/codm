import { type ProviderKind, StopKind, type SupervisorVerdict, SuspicionReason } from '@codm/contracts-typescript/wire/enums'

/** An open `STALLED` / `SERVER_ERROR` stop older than this is suspect — a person had the time to see the notice first. */
export const SUSPECT_STOP_AGE_MS = 30 * 60_000
/** This many FIRST nudges (`ordinal = 1`) within `NUDGE_LOOP_WINDOW_MS` — episode after episode — is a loop. */
export const NUDGE_LOOP_EPISODES = 3
export const NUDGE_LOOP_WINDOW_MS = 24 * 60 * 60_000
/** A live turn held this long… */
export const SILENT_TURN_MIN_MS = 30 * 60_000
/** …with no terminal line for this long, is silent. Only ever flagged: the inactivity watchdog is the one that kills. */
export const SILENT_TURN_QUIET_MS = 20 * 60_000
/** The same `(issue, reason)` is not looked at again before this, read off its last `agent.supervisor.reviewed`. */
export const SUPERVISOR_COOLDOWN_MS = 60 * 60_000
/** The window of the per-task daily ceilings — the acted verdicts it counts. */
export const SUPERVISOR_ACTION_WINDOW_MS = 24 * 60 * 60_000

/**
 * WHAT AN OPEN STOP SAYS ABOUT SUSPICION (fase 5, item 3), total over `StopKind`:
 *  - a silent stall and a provider error that nobody answered are the two the supervisor may look at;
 *  - every other kind is a PERSON's stop (a decision, a question, an approval, a permission, a login, a block) — the
 *    task is waiting on someone, so it is never suspect, whatever else it shows (`null`).
 */
export const SUSPICION_OF_OPEN_STOP: Readonly<Record<StopKind, SuspicionReason | null>> = {
	[StopKind.STALLED]: SuspicionReason.STALLED_OPEN,
	[StopKind.SERVER_ERROR]: SuspicionReason.PROVIDER_ERROR_OPEN,
	[StopKind.BLOCKED_BY_CLASSIFICATION]: null,
	[StopKind.HUMAN_REQUESTED]: null,
	[StopKind.APPROVAL_NEEDED]: null,
	[StopKind.AUTH_REQUIRED]: null,
	[StopKind.PERMISSION_DENIED]: null,
	[StopKind.DECISION_REQUESTED]: null,
	[StopKind.QUESTION_ASKED]: null,
}

/**
 * Which reason an issue is looked at for when it shows several — one review per issue per pass, the first in this
 * order that is not cooling down. A stop the group was told about comes before a pattern only the queue shows.
 */
export const SUSPICION_ORDER: readonly SuspicionReason[] = [
	SuspicionReason.STALLED_OPEN,
	SuspicionReason.PROVIDER_ERROR_OPEN,
	SuspicionReason.NUDGE_LOOP,
	SuspicionReason.SILENT_TURN,
]

/** One suspect task, with what the supervisor needs to address it — never a rehydrated issue. */
export interface SuspectIssue {
	issueId: string
	ownerId: string
	threadId: string
	key: string
	title: string
	provider: ProviderKind
	reason: SuspicionReason
	/** Since when the suspicion holds (the stop raised, the first nudge of the loop, the turn claimed) — oldest first. */
	since: Date
	/** First nudges (`ordinal = 1`) the task got in the last 24 h. */
	nudgesLastDay: number
	/**
	 * The verdicts the supervisor CARRIED OUT on this task in the last 24 h (`agent.supervisor.reviewed` with
	 * `acted: true`) — what the per-task daily ceilings count.
	 */
	actedLastDay: SupervisorVerdict[]
}

/**
 * WHICH TASKS LOOK STUCK, by declared rule and persisted data only — no model (fase 5, item 3). Disjoint from what the
 * reconciler sees: it looks at issues with NOTHING in flight that never declared; this one at what stayed stuck after
 * that (an open stall or provider error nobody answered, episode after episode of nudges, a live turn gone quiet).
 *
 * Never suspect (each excluded by the reader, each with a test): the issue or its conversation paused (`IssueHold`), a
 * person's stop open (`SUSPICION_OF_OPEN_STOP`), a declared wait (`DeclaredWaitReader` — a feedback asked waits
 * without a deadline), work deferred for any cause, completed, archived. Cooling down: the same `(issue, reason)` is
 * skipped for `SUPERVISOR_COOLDOWN_MS` after its last review.
 */
export abstract class SuspectIssueReader {
	/** At most `limit` suspects at `now`, one reason each, oldest suspicion first. */
	abstract suspects(now: Date, limit: number): Promise<SuspectIssue[]>
}
