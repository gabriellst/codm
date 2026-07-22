import { injectable } from 'tsyringe-neo'
import { PlanRegistry } from '@billing/objects'
import { PlanName, QuotaKey } from '@template/contracts-typescript/wire/enums'

export interface OverageInput {
	/** The plan whose included allowance + overage unit price apply. */
	planName: PlanName
	/** The metered quota dimension being billed (EXAMPLE_KEY today). */
	key: QuotaKey
	/** Usage counted over the CLOSED period (the durable rollup snapshot). */
	usedInPeriod: number
	/** The running quota-override delta (signed) that raises/lowers the included allowance. */
	overrideDelta: number
}

export interface OverageResult {
	/** Billable units beyond the effective included allowance (never negative). */
	quantity: number
	/** `quantity × plan overage unit price` (integer cents). */
	amountCents: number
}

/**
 * Pure, exact overage calculator (no I/O, no Mock) — self-bound across every profile like
 * RefundPolicy / ProrationCalculator. At period close the native BillingClock asks it how much
 * usage exceeded the owner's effective allowance, and prices the excess at the plan's per-unit
 * overage rate.
 *
 *   effectiveIncluded = plan.policy(key).limit + overrideDelta
 *   quantity          = max(0, usedInPeriod − effectiveIncluded)
 *   amountCents       = quantity × (plan.policy(key).overage?.amountCents ?? 0)   (cents per unit)
 *
 * A quota override raises the included allowance, so it reduces (or fully absorbs) the overage. A
 * `null` limit means the plan carries the key unlimited — nothing
 * to meter, so overage is always zero. Usage within the allowance, or a plan/key whose overage price
 * is 0 (e.g. FREE), also yields zero cents (though the excess quantity is still counted). Deterministic:
 * same input, same output — the same class is correct everywhere.
 */
@injectable()
export class OverageCalculator {
	compute(input: OverageInput): OverageResult {
		const policy = PlanRegistry.policy(input.planName, input.key)
		// No policy for this plan/key, or an unlimited (null) limit → nothing to meter as overage.
		if (!policy || policy.limit === null) return { quantity: 0, amountCents: 0 }

		// Clamp the effective allowance to ≥ 0: a negative override delta larger than the base limit would
		// otherwise make `effectiveIncluded` negative, so even ZERO usage would compute as billable overage
		// (used − (−n) = n). A revoked allowance floors at 0 included, never a phantom debt.
		const effectiveIncluded = Math.max(0, policy.limit + input.overrideDelta)
		const quantity = Math.max(0, input.usedInPeriod - effectiveIncluded)
		const amountCents = quantity * (policy.overage?.amountCents ?? 0)
		return { quantity, amountCents }
	}
}
