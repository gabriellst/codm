import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'

import { QuotaOverride } from '@quota/entities'
import { QuotaOverrideRepository } from './QuotaOverrideRepository'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

/**
 * In-memory quota-override ledger — the same semantics as the Drizzle impl (idempotent on idemKey,
 * SUM of delta per owner+meter) without a database. Other contexts' tests can also `seed(...)` an
 * override directly. `tx` is accepted for signature parity and ignored.
 */
@injectable()
export class MockQuotaOverrideRepository extends QuotaOverrideRepository {
	// Keyed by idemKey so a replayed applyIfNew is a no-op, matching the UNIQUE(idem_key) constraint.
	private readonly overrides = new Map<string, QuotaOverride>()

	async applyIfNew(override: QuotaOverride, _tx?: Transaction): Promise<void> {
		if (this.overrides.has(override.idemKey)) return
		this.overrides.set(override.idemKey, override)
	}

	async currentDelta(ownerId: string, meter: QuotaKey, _tx?: Transaction): Promise<number> {
		let total = 0
		for (const o of this.overrides.values()) {
			if (o.ownerId === ownerId && o.meter === meter) total += o.delta
		}
		return total
	}

	async currentDeltaMany(ownerIds: string[], meter: QuotaKey, tx?: Transaction): Promise<Map<string, number>> {
		const result = new Map<string, number>()
		for (const ownerId of ownerIds) result.set(ownerId, await this.currentDelta(ownerId, meter, tx))
		return result
	}

	/** Test helper: seed an override directly (idempotent on idemKey, like `applyIfNew`). */
	seed(input: { ownerId: string; meter: QuotaKey; delta: number; idemKey: string }): void {
		if (this.overrides.has(input.idemKey)) return
		this.overrides.set(input.idemKey, QuotaOverride.create(input))
	}

	/** All applied overrides, for assertions. */
	get applied(): QuotaOverride[] {
		return [...this.overrides.values()]
	}

	clear(): void {
		this.overrides.clear()
	}
}
