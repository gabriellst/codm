import { injectable } from 'tsyringe-neo'

import type { Transaction } from '@template/core-typescript'
import { UsageRollup, type UsageSnapshot } from './UsageRollup'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

/**
 * In-memory usage rollup for the mock profile. Records the first snapshot per
 * (ownerId, meter, periodStart) and returns it thereafter — same idempotent-first-wins
 * semantics as the Drizzle impl, minus the DB. `seed()` lets a test preset a period's usage.
 */
@injectable()
export class MockUsageRollup extends UsageRollup {
	private readonly snapshots = new Map<string, number>()

	private key(ownerId: string, meter: QuotaKey, periodStart: Date): string {
		return `${ownerId}:${meter}:${periodStart.getTime()}`
	}

	/** Test helper: preset the usage a snapshot should record for a period. */
	seed(ownerId: string, meter: QuotaKey, periodStart: Date, quantity: number): void {
		this.snapshots.set(this.key(ownerId, meter, periodStart), quantity)
	}

	async snapshotUsage(ownerId: string, meter: QuotaKey, periodStart: Date, _periodEnd: Date, _tx?: Transaction): Promise<number> {
		const k = this.key(ownerId, meter, periodStart)
		const existing = this.snapshots.get(k)
		if (existing !== undefined) return existing
		this.snapshots.set(k, 0)
		return 0
	}

	async snapshotUsageMany(snapshots: UsageSnapshot[], meter: QuotaKey, _tx?: Transaction): Promise<void> {
		for (const s of snapshots) {
			const k = this.key(s.ownerId, meter, s.periodStart)
			if (!this.snapshots.has(k)) this.snapshots.set(k, s.quantity) // first-wins, like the UNIQUE constraint
		}
	}

	clear(): void {
		this.snapshots.clear()
	}
}
