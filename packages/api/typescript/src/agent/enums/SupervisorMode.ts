/**
 * WHAT THE SUPERVISOR DOES with its verdicts (fase 5, item 3) — `CODM_AGENT_SUPERVISOR_MODE`.
 *  - `OFF` — the job is not registered.
 *  - `OBSERVE` — the model runs and every verdict is recorded (`acted: false`); nothing else happens.
 *  - `ACT` — the verdict is carried out, inside the supervisor's safety rails (retry, restart with notes, escalate
 *    by badge — never a merge, a publish, a priority change or a message to anyone). The owner's default (20/11).
 * Every verdict, acted or not, is recorded on `agent.supervisor.reviewed` — the audit trail.
 */
export enum SupervisorMode {
	OFF = 'OFF',
	OBSERVE = 'OBSERVE',
	ACT = 'ACT',
}
