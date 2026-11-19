/**
 * WHETHER THE QUOTA BUDGET HOLDS OR ONLY WATCHES (fase 4, item 2 — decisão do dono de 19/11: observar uma semana
 * antes). Read from `CODM_AGENT_QUOTA_ENFORCE` (off by default).
 *  - `ENFORCE` — a denied admission closes the task lane, the group is told (`BUDGET_HELD`) and the board shows
 *    `WAITING_BUDGET`.
 *  - `OBSERVE` — nothing is held and nothing is said; the transition is recorded as `agent.quota.held { enforced:
 *    false }` — the "would have held" the week of observation measures, and the upward probe counts.
 */
export enum QuotaMode {
	ENFORCE = 'ENFORCE',
	OBSERVE = 'OBSERVE',
}
