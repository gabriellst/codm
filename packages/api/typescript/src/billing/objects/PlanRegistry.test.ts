import { describe, it, expect } from 'bun:test'
import { PlanRegistry } from './PlanRegistry'
import { PlanName, QuotaKey } from '@template/contracts-typescript/wire/enums'

// Boot validation of the config-as-code catalog (medscall@f04e8a0f port, generic-plug edition):
// every PlanName has an entry, quotas cover every QuotaKey the plan carries, prices are
// non-negative integer-cents Money.
describe('PlanRegistry', () => {
	it('is a catalog keyed by PlanName (FREE first) with integer-cents money', () => {
		expect(PlanRegistry.names()).toEqual([PlanName.FREE, PlanName.STARTER, PlanName.PRO])
		expect(PlanRegistry.get(PlanName.PRO).basePrice.amountCents).toBe(29900)
		expect(PlanRegistry.get(PlanName.FREE).basePrice.amountCents).toBe(0)
	})

	it('treats FREE as the only non-paid plan', () => {
		expect(PlanRegistry.isPaid(PlanName.FREE)).toBe(false)
		expect(PlanRegistry.isPaid(PlanName.STARTER)).toBe(true)
		expect(PlanRegistry.isPaid(PlanName.PRO)).toBe(true)
	})

	it('exposes per-key quota policies via the generic quotas map, and no displayName', () => {
		expect(PlanRegistry.get(PlanName.PRO).quotas[QuotaKey.EXAMPLE_KEY]?.limit).toBe(5000)
		expect(PlanRegistry.get(PlanName.FREE).quotas[QuotaKey.EXAMPLE_KEY]?.limit).toBe(50)
		expect('displayName' in PlanRegistry.get(PlanName.PRO)).toBe(false)
	})

	it('has no trial on any plan today (trialDays: 0)', () => {
		for (const name of PlanRegistry.names()) {
			expect(PlanRegistry.trialDays(name)).toBe(0)
			expect(PlanRegistry.get(name).trialDays).toBe(0)
		}
	})

	it('prices are non-negative on every plan', () => {
		for (const name of PlanRegistry.names()) {
			expect(PlanRegistry.get(name).basePrice.amountCents).toBeGreaterThanOrEqual(0)
		}
	})
})

describe('PlanRegistry — generic quotas', () => {
	it('exposes the three policy archetypes: hard-limit (FREE), metered (STARTER/PRO)', () => {
		expect(PlanRegistry.policy(PlanName.FREE, QuotaKey.EXAMPLE_KEY)).toEqual({ limit: 50 })
		const starter = PlanRegistry.policy(PlanName.STARTER, QuotaKey.EXAMPLE_KEY)
		expect(starter?.limit).toBe(1000)
		expect(starter?.overage?.amountCents).toBe(5)
		const pro = PlanRegistry.policy(PlanName.PRO, QuotaKey.EXAMPLE_KEY)
		expect(pro?.limit).toBe(5000)
		expect(pro?.overage?.amountCents).toBe(4)
	})

	it('quotaKeys lists every dimension the plan carries', () => {
		for (const name of PlanRegistry.names()) {
			expect(PlanRegistry.quotaKeys(name)).toEqual([QuotaKey.EXAMPLE_KEY])
		}
	})
})
