import type { Transaction } from '@template/core-typescript'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

export type KeptSelection = Partial<Record<QuotaKey, string[]>>

/**
 * Persists the per-quota-key "keep" selection captured atomically at downgrade request time (which
 * resources — of any governable quota key — the owner chose to keep). `save` replaces the owner's
 * whole selection; empty id-arrays are dropped.
 */
export abstract class PendingSelectionRepository {
	abstract save(ownerId: string, selection: KeptSelection, tx?: Transaction): Promise<void>
	abstract findByOwner(ownerId: string, tx?: Transaction): Promise<KeptSelection>
	abstract clear(ownerId: string, tx?: Transaction): Promise<void>
}
