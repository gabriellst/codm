/**
 * WHY THE SUPERVISOR'S VERDICT WAS REPLACED (fase 5, item 3) — by `LEAVE` when it fails closed ("falha fechada"), or by
 * the one escalation a daily ceiling allows (`CAPPED`). Recorded on
 * `agent.supervisor.reviewed` so the audit trail tells a model that chose to leave a task from one that could not
 * answer. Closed, so a new way of failing is named here before it can be recorded.
 *  - `NOT_ENTITLED` / `PROVIDER_NOT_DETECTED` — no run was started (no login, no CLI).
 *  - `TIMEOUT` — the run did not answer within `SUPERVISOR_TIMEOUT_MS` (and was aborted).
 *  - `FAILED` — the run ended in error.
 *  - `UNPARSEABLE` — what came back is not `{ verdict, confidence }`.
 *  - `NOT_ADMITTED` — a verdict the suspicion does not admit (`VERDICTS_BY_REASON`).
 *  - `LOW_CONFIDENCE` — below the verdict's floor (`SUPERVISOR_MIN_CONFIDENCE`).
 *  - `CAPPED` — past a per-task daily ceiling: escalated once, then left.
 *
 * The safety rails re-checked when the verdict is carried out (fase 5, S5 — the model call sits between the rule and
 * the action, so what held then may not hold now). Each leaves the task alone, recorded `acted: false`:
 *  - `CLOSED` — the task was completed or archived since the rule saw it.
 *  - `HELD` — the issue or its conversation is paused (`IssueHold`).
 *  - `WAITING` — the last turn asked for feedback (`DeclaredWaitReader`): a wait without a deadline.
 *  - `PERSON_STOP` — a stop waiting on a person is open (`OpenStopReader`, for every verdict — an escalation included;
 *    `SupervisorRetryOutcome.PERSON_STOP` is the retry's backstop).
 *  - `LIVE_TURN` — a turn of the task is running, or work for it is queued / deferred: the supervisor never starts a
 *    turn beside one, and never stops one (only `ESCALATE` flags a live turn).
 *  - `NO_STOP` — the stall / provider error the suspicion was about is no longer open (someone resolved it first),
 *    for every verdict; or the retry found none to resolve.
 */
export enum SupervisorFallback {
	NOT_ENTITLED = 'NOT_ENTITLED',
	PROVIDER_NOT_DETECTED = 'PROVIDER_NOT_DETECTED',
	TIMEOUT = 'TIMEOUT',
	FAILED = 'FAILED',
	UNPARSEABLE = 'UNPARSEABLE',
	NOT_ADMITTED = 'NOT_ADMITTED',
	LOW_CONFIDENCE = 'LOW_CONFIDENCE',
	CAPPED = 'CAPPED',
	CLOSED = 'CLOSED',
	HELD = 'HELD',
	WAITING = 'WAITING',
	PERSON_STOP = 'PERSON_STOP',
	LIVE_TURN = 'LIVE_TURN',
	NO_STOP = 'NO_STOP',
}
