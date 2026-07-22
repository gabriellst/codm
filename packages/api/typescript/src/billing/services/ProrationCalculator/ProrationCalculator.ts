import { injectable } from 'tsyringe-neo'
import { PlanRegistry } from '@billing/objects'
import { PlanName } from '@template/contracts-typescript/wire/enums'

/** Half-up rounding for a non-negative amount of cents (Math.floor(x + 0.5) is exact half-up for x ≥ 0). */
const roundHalfUp = (value: number): number => Math.floor(value + 0.5)

export interface ProrationInput {
	currentPlan: PlanName
	targetPlan: PlanName
	/** Start of the currently-open paid period (the proration anchor). */
	periodStart: Date | null
	/** End of the currently-open paid period. */
	periodEnd: Date | null
	/** Evaluation instant (kept explicit so the service stays pure / deterministic). */
	now: Date
}

/**
 * Pure, exact mid-period proration calculator (no I/O, no Mock) — self-bound across every profile
 * like RefundPolicy / BillingClock. Replaces the old 30-day-cycle ESTIMATE now that the subscription
 * record carries the real period start/end (Phase D).
 *
 * The charge for switching plans mid-period is the price DIFFERENCE, prorated over the fraction of
 * the current period that remains:
 *
 *   remainingFraction = clamp((periodEnd − now) / (periodEnd − periodStart), 0, 1)
 *   amountDueNow      = round_half_up((targetPrice − currentPrice) × remainingFraction)   [upgrade]
 *                     = 0                                                                  [downgrade / same]
 *
 * Prices are the catalog base prices (integer cents). A downgrade (or same-price switch) owes
 * nothing now — the change is picked up next cycle. A missing/degenerate period window (either
 * anchor null, or periodEnd ≤ periodStart) can't be prorated, so nothing is due now.
 */
@injectable()
export class ProrationCalculator {
	amountDueNow(input: ProrationInput): number {
		const currentPrice = PlanRegistry.get(input.currentPlan).basePrice.amountCents
		const targetPrice = PlanRegistry.get(input.targetPlan).basePrice.amountCents
		const diffCents = targetPrice - currentPrice

		// Downgrade or same price — nothing due now (deferred to the next cycle).
		if (diffCents <= 0) return 0

		const fraction = this.remainingFraction(input.periodStart, input.periodEnd, input.now)
		return roundHalfUp(diffCents * fraction)
	}

	/** Fraction of the current period still ahead of `now`, clamped to [0, 1]. */
	private remainingFraction(periodStart: Date | null, periodEnd: Date | null, now: Date): number {
		// No period window to prorate over → nothing remaining to charge for.
		if (periodStart == null || periodEnd == null) return 0
		const totalMs = periodEnd.getTime() - periodStart.getTime()
		// Degenerate/backwards window — treat as nothing remaining.
		if (totalMs <= 0) return 0
		const remainingMs = periodEnd.getTime() - now.getTime()
		return Math.max(0, Math.min(1, remainingMs / totalMs))
	}
}
