import type { Transaction } from '@template/core-typescript'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

/**
 * The NATIVE per-period usage rollup (Phase E). `snapshotUsage` folds the same `events` stream the
 * live enforcement counter reads (the metered-usage event count per owner) but over an explicit
 * `[periodStart, periodEnd)` window, and UPSERTs the total into `billing_usage_rollups`. This is the
 * DURABLE snapshot the overage computation + audits read — the live enforcement fold stays inline in
 * the quota counter; this is its persisted period record.
 *
 * Idempotent per (ownerId, meter, periodStart) via the table's UNIQUE constraint: the first
 * snapshot for a period WINS (onConflictDoNothing), so a re-run never overwrites it and returns the
 * already-persisted quantity.
 */
/** One period snapshot to persist in a batch — quantity PRE-COMPUTED by the caller. */
export interface UsageSnapshot {
	ownerId: string
	periodStart: Date
	periodEnd: Date
	quantity: number
}

export abstract class UsageRollup {
	abstract snapshotUsage(ownerId: string, meter: QuotaKey, periodStart: Date, periodEnd: Date, tx?: Transaction): Promise<number>

	/**
	 * Batch sibling of `snapshotUsage` for the period-close sweep. Takes the quantity PRE-COMPUTED
	 * (the sweep already read usage via `UsageSource.usageInWindows` — re-counting here would double
	 * the fold, which is exactly what the single-row method does today). Same first-wins idempotency
	 * per (owner, meter, periodStart); no return value — the sweep's audit snapshot is fire-and-record.
	 */
	abstract snapshotUsageMany(snapshots: UsageSnapshot[], meter: QuotaKey, tx?: Transaction): Promise<void>
}
