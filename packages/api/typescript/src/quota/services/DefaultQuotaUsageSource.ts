import type { Transaction } from '@template/core-typescript'

import { QuotaUsageSource } from './QuotaUsageSource'
import type { QuotaCounter, UsageWindow } from './QuotaCounter'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

/** Composes per-key counters into one usage read. The counters map is built at the shared merge root
 *  (the composition root that legitimately knows every context) — this class names no key. */
export class DefaultQuotaUsageSource extends QuotaUsageSource {
	constructor(private counters: Partial<Record<QuotaKey, QuotaCounter>>) {
		super()
	}

	async usage(ownerId: string, key: QuotaKey, window?: UsageWindow, tx?: Transaction): Promise<number> {
		const counter = this.counters[key]
		if (!counter) return 0 // a key with no registered counter can't be over-used
		return counter.count(ownerId, window, tx)
	}
}
