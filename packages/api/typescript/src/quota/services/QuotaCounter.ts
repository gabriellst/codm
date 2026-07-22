import type { Transaction } from '@template/core-typescript'

export interface UsageWindow {
	start: Date
	end: Date
}

/** One owner's usage window, for batch counting — each owner's period boundaries differ. */
export interface OwnerUsageWindow {
	ownerId: string
	start: Date
	end: Date
}

/** Counts the current usage of ONE quota key for an owner. Window-aware for metered keys (a period
 *  snapshot); hard-limit counters ignore the window (always the current count). Implemented by the
 *  owning product context — the quota kernel names no key. */
export abstract class QuotaCounter {
	abstract count(ownerId: string, window?: UsageWindow, tx?: Transaction): Promise<number>

	/**
	 * Batch sibling of `count` for sweeps (a metering tick prices a whole chunk of owners).
	 * Contract: EVERY requested ownerId is present in the result (0 when unused). The default folds
	 * `count` per owner — correct everywhere; counters on a hot sweep path override with a single
	 * GROUP BY statement.
	 */
	async countMany(windows: OwnerUsageWindow[], tx?: Transaction): Promise<Map<string, number>> {
		const result = new Map<string, number>()
		for (const w of windows) {
			result.set(w.ownerId, await this.count(w.ownerId, { start: w.start, end: w.end }, tx))
		}
		return result
	}
}
