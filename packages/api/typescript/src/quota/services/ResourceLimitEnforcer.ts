import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'

import { PendingSelectionRepository, type KeptSelection } from '@quota/repositories'
import { QuotaEntitlement } from './QuotaEntitlement'
import { ResourceGovernorRegistry } from './ResourceGovernorRegistry'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

/** Applies plan limits to grandfathered resources: keeps the chosen/oldest N active and locks the
 *  excess read-only; unlocks up to the limit on upgrade. NEVER deletes. Driven at the period turn by
 *  GovernResourcesOnSubscriptionChangedHandler (@quota/handlers). With an empty governor registry
 *  (the generic-context default) the loop is a no-op. */
@injectable()
export class ResourceLimitEnforcer {
	constructor(
		private governors: ResourceGovernorRegistry,
		private pending: PendingSelectionRepository,
		private entitlement: QuotaEntitlement,
	) {}

	async enforce(ownerId: string, tx?: Transaction): Promise<void> {
		const entitlement = await this.entitlement.entitlementFor(ownerId, tx)
		const selection = await this.pending.findByOwner(ownerId, tx)
		for (const key of this.governors.keys()) {
			await this.enforceKey(ownerId, key, entitlement[key]?.limit ?? null, selection, tx)
		}
		await this.pending.clear(ownerId, tx)
	}

	private async enforceKey(
		ownerId: string,
		key: QuotaKey,
		limit: number | null,
		selection: KeptSelection,
		tx?: Transaction,
	): Promise<void> {
		const governor = this.governors.for(key)
		const resources = await governor.list(ownerId, tx) // oldest-first
		const existingIds = new Set(resources.map(r => r.id))

		// Unlimited plan → unlock everything (one statement, not one per resource).
		if (limit === null) {
			await governor.unlockMany(
				ownerId,
				resources.filter(r => r.locked).map(r => r.id),
				tx,
			)
			return
		}

		// Reconcile the kept selection with reality; top up from oldest-first default to fill `limit`.
		const chosen: string[] = (selection[key] ?? []).filter(id => existingIds.has(id))
		const keep = new Set(chosen.slice(0, limit))
		for (const r of resources) {
			if (keep.size >= limit) break
			if (!keep.has(r.id)) keep.add(r.id) // resources is oldest-first → oldest fill the remainder
		}

		// Diff current state against the keep-set in memory, then apply each side as ONE batch.
		const toLock = resources.filter(r => !keep.has(r.id) && !r.locked).map(r => r.id)
		const toUnlock = resources.filter(r => keep.has(r.id) && r.locked).map(r => r.id)
		await governor.lockMany(ownerId, toLock, tx)
		await governor.unlockMany(ownerId, toUnlock, tx)
	}
}
