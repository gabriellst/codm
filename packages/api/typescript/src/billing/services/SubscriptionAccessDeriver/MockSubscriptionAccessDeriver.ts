import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'

import { SubscriptionAccessDeriver, type DerivedAccess } from './SubscriptionAccessDeriver'
import { PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

/**
 * Seedable mock — other contexts' tests wire this in and `seed(ownerId, result)` the access they
 * want `derive` to return, instead of standing up records + invoices + charges. Unseeded owners
 * derive as no-access / FREE (the no-subscription default).
 */
@injectable()
export class MockSubscriptionAccessDeriver extends SubscriptionAccessDeriver {
	private readonly results = new Map<string, DerivedAccess>()

	async derive(ownerId: string, _now: Date, _tx?: Transaction): Promise<DerivedAccess> {
		return (
			this.results.get(ownerId) ?? {
				hasAccess: false,
				effectivePlan: PlanName.FREE,
				displayStatus: SubscriptionStatus.INCOMPLETE,
				paidThrough: null,
			}
		)
	}

	/** Test helper: seed the derived access `derive` should return for a given ownerId. */
	seed(ownerId: string, result: DerivedAccess): void {
		this.results.set(ownerId, result)
	}

	clear(): void {
		this.results.clear()
	}
}
