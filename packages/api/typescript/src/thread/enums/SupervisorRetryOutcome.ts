/**
 * WHAT BECAME OF THE SUPERVISOR'S RETRY of a task (fase 5, item 3 — `ApplySupervisorRetry`). Closed, so the agent
 * records a named reason when it did not act, never a string.
 *  - `APPLIED` — the task's open stall / provider-error stop was resolved with `AUTO_RETRY`.
 *  - `NO_STOP` — the task has no open stop the supervisor may retry (none raised, or someone resolved it first).
 *  - `PERSON_STOP` — a stop waiting on a person is open: the task is someone's to answer, never the supervisor's.
 */
export enum SupervisorRetryOutcome {
	APPLIED = 'APPLIED',
	NO_STOP = 'NO_STOP',
	PERSON_STOP = 'PERSON_STOP',
}
