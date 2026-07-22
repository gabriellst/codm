import { describe, it, expect, beforeEach } from 'bun:test'

import { SubscriptionAccessDeriver, type DerivedAccess } from '@billing/services/SubscriptionAccessDeriver'
import { MockQuotaOverrideRepository } from '@quota/repositories'
import { DrizzleQuotaEntitlement } from './DrizzleQuotaEntitlement'
import { MockQuotaEntitlement } from './MockQuotaEntitlement'
import { PlanName, QuotaKey, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

// Unit test for the entitlement read (the accepted @quota → @billing edge). A fake
// SubscriptionAccessDeriver pins the effective plan, so the assertion exercises DrizzleQuotaEntitlement's
// real logic — read billing's PlanRegistry policy per key, RAISE metered keys by the override delta —
// against the real PlanRegistry catalog, without standing up a subscription + invoice + charge chain.
class FakeAccessDeriver extends SubscriptionAccessDeriver {
	constructor(private plan: PlanName) {
		super()
	}
	async derive(): Promise<DerivedAccess> {
		return { hasAccess: this.plan !== PlanName.FREE, effectivePlan: this.plan, displayStatus: SubscriptionStatus.ACTIVE, paidThrough: null }
	}
}

describe('DrizzleQuotaEntitlement', () => {
	let overrides: MockQuotaOverrideRepository

	const OWNER = 'o1'

	beforeEach(() => {
		overrides = new MockQuotaOverrideRepository()
	})

	it('metered key: effective limit = plan limit + override delta (PRO EXAMPLE_KEY is metered)', async () => {
		overrides.seed({ ownerId: OWNER, meter: QuotaKey.EXAMPLE_KEY, delta: 100, idemKey: 'k1' })
		const entitlement = new DrizzleQuotaEntitlement(new FakeAccessDeriver(PlanName.PRO), overrides)

		const ent = await entitlement.entitlementFor(OWNER)

		// PlanRegistry PRO: EXAMPLE_KEY = { limit: 5000, overage } → metered, raised by the 100 delta.
		expect(ent[QuotaKey.EXAMPLE_KEY]).toEqual({ limit: 5100, metered: true })
	})

	it('non-metered key ignores overrides (FREE EXAMPLE_KEY is a hard limit)', async () => {
		overrides.seed({ ownerId: OWNER, meter: QuotaKey.EXAMPLE_KEY, delta: 100, idemKey: 'k1' })
		const entitlement = new DrizzleQuotaEntitlement(new FakeAccessDeriver(PlanName.FREE), overrides)

		const ent = await entitlement.entitlementFor(OWNER)

		// PlanRegistry FREE: EXAMPLE_KEY = { limit: 50 } → non-metered, override delta ignored.
		expect(ent[QuotaKey.EXAMPLE_KEY]).toEqual({ limit: 50, metered: false })
	})
})

describe('MockQuotaEntitlement', () => {
	it('returns the seeded entitlement for a seeded owner and the empty floor otherwise', async () => {
		const mock = new MockQuotaEntitlement()
		mock.seed('seeded', { [QuotaKey.EXAMPLE_KEY]: { limit: 7, metered: false } } as never)

		expect(await mock.entitlementFor('seeded')).toEqual({
			[QuotaKey.EXAMPLE_KEY]: { limit: 7, metered: false },
		} as import('./QuotaEntitlement').Entitlement)
		expect(await mock.entitlementFor('unseeded')).toEqual({} as import('./QuotaEntitlement').Entitlement)
	})
})
