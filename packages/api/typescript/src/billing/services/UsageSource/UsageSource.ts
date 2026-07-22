import type { Transaction } from '@template/core-typescript'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

export interface UsageWindow {
	start: Date
	end: Date
}

/** One owner's usage window, for batch reads — each owner's period boundaries differ. */
export interface OwnerUsageWindow {
	ownerId: string
	start: Date
	end: Date
}

/** Billing-owned read-port: the owner's ACTUAL usage count for a metered key over an optional
 *  window — the overage-pricing counterpart to `QuotaEntitlement`'s policy read (`BillingClockJob`
 *  is the single caller, folding this against `PlanRegistry.policy(...).overage` at period close).
 *  Nothing under `billing` names which context counts which key; the real per-key counters are
 *  composed at the shared merge root (the composition root that legitimately knows every context),
 *  keeping this context free of any `@quota` import. */
export abstract class UsageSource {
	abstract usage(ownerId: string, key: QuotaKey, window?: UsageWindow, tx?: Transaction): Promise<number>

	/** Batch sibling of `usage` for the period-close sweep: one read for a whole chunk of owners,
	 *  each with its own window. Contract: every requested ownerId is present in the result (0 when
	 *  unused). */
	abstract usageInWindows(windows: OwnerUsageWindow[], key: QuotaKey, tx?: Transaction): Promise<Map<string, number>>
}
