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
}
