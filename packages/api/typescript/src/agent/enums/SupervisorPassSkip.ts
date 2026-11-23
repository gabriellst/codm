/**
 * WHY A SUPERVISOR PASS LOOKED AT NOTHING (fase 5, item 3) — the job's output, for the log.
 *  - `OFF` — `CODM_AGENT_SUPERVISOR_MODE=OFF`.
 *  - `PROVIDER_PAUSED` — the provider is refusing the account; a review would be refused like every turn.
 *  - `BUDGET_HELD` — the quota budget holds the task lane for real; the supervisor's spend waits with it.
 */
export enum SupervisorPassSkip {
	OFF = 'OFF',
	PROVIDER_PAUSED = 'PROVIDER_PAUSED',
	BUDGET_HELD = 'BUDGET_HELD',
}
