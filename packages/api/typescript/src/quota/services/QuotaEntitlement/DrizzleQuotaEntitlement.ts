import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { PlanRegistry } from '@billing/objects'
import { SubscriptionAccessDeriver } from '@billing/services/SubscriptionAccessDeriver'
import { QuotaOverrideRepository } from '@quota/repositories/QuotaOverrideRepository'
import { QuotaEntitlement, type Entitlement } from './QuotaEntitlement'

/**
 * The real entitlement read — the accepted `@quota → @billing` import edge (bidirectional coupling).
 * Derives the effective plan via billing's `SubscriptionAccessDeriver`, reads its per-key policy from
 * billing's `PlanRegistry`, and RAISES metered keys by the running quota-override delta.
 */
@injectable()
export class DrizzleQuotaEntitlement extends QuotaEntitlement {
	constructor(
		private deriver: SubscriptionAccessDeriver,
		private overrides: QuotaOverrideRepository,
	) {
		super()
	}

	async entitlementFor(ownerId: string, tx?: Transaction): Promise<Entitlement> {
		const plan = (await this.deriver.derive(ownerId, new Date(), tx)).effectivePlan
		const out = {} as Entitlement
		for (const key of PlanRegistry.quotaKeys(plan)) {
			const policy = PlanRegistry.policy(plan, key)!
			const metered = policy.overage !== undefined
			// Overrides apply to metered keys only (QuotaOverrideRepository is keyed by the meter); a
			// null (unlimited) limit stays unlimited.
			const delta = metered ? await this.overrides.currentDelta(ownerId, key, tx) : 0
			out[key] = { limit: policy.limit === null ? null : policy.limit + delta, metered }
		}
		return out
	}
}
