/**
 * WHAT THE PROVIDER SAID about a usage window on a run (fase 4, item 2) — recorded on the
 * `agent.provider.limit_observed` fact the learned ceiling is cut from. Agent-only: it never leaves this
 * context (the wire carries `QuotaState`, the health badge, instead).
 *  - `REJECTED` — the provider refused the turn: the ceiling of that window is cut to what was spent.
 *  - `WARNING` — the provider warned the window is close: cut by a declared factor.
 *  - `ALLOWED` — the turn ran; only the window's reset instant is kept.
 */
export enum ProviderLimitStatus {
	REJECTED = 'REJECTED',
	WARNING = 'WARNING',
	ALLOWED = 'ALLOWED',
}
