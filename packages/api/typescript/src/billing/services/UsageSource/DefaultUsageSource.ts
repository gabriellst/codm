import type { Transaction } from '@template/core-typescript'

import { UsageSource, type UsageWindow, type OwnerUsageWindow } from './UsageSource'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

/** A per-key counter this composer dispatches to — structurally identical to quota's own
 *  `QuotaCounter` port (both expose `count`/`countMany`), declared locally so this file needs no
 *  `@quota` import. Any `QuotaCounter` implementation satisfies this structurally — `countMany` has
 *  a concrete default on the `QuotaCounter` base class — so the shared merge root can hand the SAME
 *  counter instances to both `quota`'s `QuotaUsageSource` (gating) and this billing-owned port
 *  (overage pricing) without billing importing `@quota`. */
interface UsageCounter {
	count(ownerId: string, window?: UsageWindow, tx?: Transaction): Promise<number>
	countMany(windows: OwnerUsageWindow[], tx?: Transaction): Promise<Map<string, number>>
}

/** Composes per-key counters into one usage read — same generic shape as quota's own
 *  `DefaultQuotaUsageSource`. The counters map is built at the shared merge root; this class names
 *  no key. */
export class DefaultUsageSource extends UsageSource {
	constructor(private counters: Partial<Record<QuotaKey, UsageCounter>>) {
		super()
	}

	async usage(ownerId: string, key: QuotaKey, window?: UsageWindow, tx?: Transaction): Promise<number> {
		const counter = this.counters[key]
		if (!counter) return 0 // a key with no registered counter can't be over-used
		return counter.count(ownerId, window, tx)
	}

	async usageInWindows(windows: OwnerUsageWindow[], key: QuotaKey, tx?: Transaction): Promise<Map<string, number>> {
		const counter = this.counters[key]
		if (!counter) return new Map(windows.map(w => [w.ownerId, 0])) // no counter → nothing was used
		return counter.countMany(windows, tx)
	}
}
