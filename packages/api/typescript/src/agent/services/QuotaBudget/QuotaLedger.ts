import type { ProviderLimitWindow, UsageRole } from '@codm/contracts-typescript/wire/enums'
import type { ProviderLimitStatus } from '../../enums/ProviderLimitStatus'

/**
 * WHAT THE BUDGET KNOWS — the facts it is derived from, already reduced to what it reads (fase 4, item 2). Epoch ms
 * everywhere: the budget is arithmetic over instants, and the reader converts once.
 *
 * Built by `QuotaLedgerReader` from `shared_events` (only usage facts that carry a `role` — a row written before fase
 * 4 is never guessed into one) and by the acceptance replay from the anonymized fixture. Nothing here is stored:
 * the ceiling, the reserve and the windows are recomputed from it.
 */
export interface QuotaLedger {
	/** `agent.turn.usage` with a role, priced in the budget's unit — time order. */
	usage: readonly QuotaUsageFact[]
	/** `agent.provider.limit_observed` — refusals and warnings, time order. */
	limits: readonly QuotaLimitFact[]
	/**
	 * `agent.quota.held` / `agent.quota.released` — the transitions of the ISSUE lane under the budget: from the
	 * instant it held (or, in observation, would have held) until it admitted again. Time order.
	 */
	holds: readonly QuotaHoldFact[]
	/** `agent.run.started` of issue turns — what was in flight when the provider refused. */
	issueRunStarts: readonly QuotaRunStart[]
	/** The first usage fact with a role the store has at all (not only inside this ledger) — absent ⇒ none yet. */
	firstRoleFactAt?: number
}

export interface QuotaUsageFact {
	at: number
	/** The issue (an ISSUE turn) or the conversation (orchestrator, triage). */
	entityId: string
	role: UsageRole
	/** What the turn cost, in the budget's unit (`UsageCost`). */
	cost: number
	/** Window boundaries the CLI reported during the run: when each window resets. */
	windows: readonly { window: ProviderLimitWindow; resetsAt: number }[]
}

export interface QuotaLimitFact {
	at: number
	window: ProviderLimitWindow
	status: ProviderLimitStatus
	resetsAt?: number
}

export interface QuotaHoldFact {
	at: number
	/** The window that held — on a release, the one that had held. */
	window: ProviderLimitWindow
	/** `true` when the lane started being held; `false` when it was released. */
	holding: boolean
	/** `false` in observation mode: it would have held. Counted the same by the upward probe (revisão 2). */
	enforced: boolean
}

export interface QuotaRunStart {
	at: number
	entityId: string
}

export const EMPTY_QUOTA_LEDGER: QuotaLedger = { usage: [], limits: [], holds: [], issueRunStarts: [] }
