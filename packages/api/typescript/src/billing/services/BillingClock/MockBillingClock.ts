import { injectable } from 'tsyringe-neo'
import { BillingClock } from './BillingClock'

/**
 * Test double for BillingClock. The clock is pure, so the default behavior is identical to the real
 * one (it just calls `super`); a seeded `nowOverride`/`nextPeriodEndOverride` lets a test pin
 * deterministic boundaries when it doesn't want to reason about real calendar math.
 */
@injectable()
export class MockBillingClock extends BillingClock {
	nextPeriodEndOverride: Date | null = null

	override nextPeriodEnd(from: Date, interval: 'monthly' = 'monthly'): Date {
		return this.nextPeriodEndOverride ?? super.nextPeriodEnd(from, interval)
	}
}
