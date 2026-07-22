import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'

import { SubscriptionRepository } from '@billing/repositories'
import { SubscriptionAccessDeriver } from '@billing/services'
import { PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

export const GetSubscriptionInputSchema = z.object({
	ownerId: z.string().min(1),
})

export const GetSubscriptionOutputSchema = z.object({
	planName: z.enum(PlanName),
	status: z.enum(SubscriptionStatus),
	currentPeriodEnd: z.date().nullable(),
	// Whether a cancellation is scheduled for the current period's end — access continues until
	// `currentPeriodEnd`, then drops (by derivation). Lets the UI show "cancels on {date}".
	cancelAtPeriodEnd: z.boolean(),
	// A scheduled paid→paid downgrade applied at currentPeriodEnd (feature a). Null = none.
	scheduledPlanName: z.enum(PlanName).nullable(),
})

const FREE = {
	planName: PlanName.FREE,
	status: SubscriptionStatus.ACTIVE,
	currentPeriodEnd: null,
	cancelAtPeriodEnd: false,
	scheduledPlanName: null,
} as const

/**
 * BFF read: the current plan + status for an owner, DERIVED from facts (the subscription +
 * the invoice ledger) via SubscriptionAccessDeriver — "derive, don't flip", never a stored status.
 * The paid plan is reported ONLY while the derivation grants access (a live trial, or a paid invoice
 * within its dunning grace, and not canceled). With no subscription (never subscribed), a canceled/expired
 * one, or an INCOMPLETE one (created but awaiting its first payment), `derive` yields no access and an
 * effective plan of FREE — reported as FREE/ACTIVE so the app treats them as active-on-free. This is
 * the gate that stops a just-created (unpaid) subscription from surfacing its paid plan before the
 * invoice is paid.
 */
@injectable()
export class GetSubscription extends Handler<typeof GetSubscriptionInputSchema, typeof GetSubscriptionOutputSchema> {
	readonly name = 'get_subscription' as const
	readonly inputSchema = GetSubscriptionInputSchema
	readonly outputSchema = GetSubscriptionOutputSchema

	constructor(
		private subscriptionRepository: SubscriptionRepository,
		private subscriptionAccessDeriver: SubscriptionAccessDeriver,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const derived = await this.subscriptionAccessDeriver.derive(input.ownerId, new Date())
		if (!derived.hasAccess) {
			return { ...FREE }
		}

		// Prefer the record's own currentPeriodEnd (the subscription's period anchor); fall back to the
		// derivation's paidThrough when the record carries none. Same DTO field as before.
		const subscription = await this.subscriptionRepository.findByOwnerId(input.ownerId)
		return {
			planName: derived.effectivePlan,
			status: derived.displayStatus,
			currentPeriodEnd: subscription?.currentPeriodEnd ?? derived.paidThrough ?? null,
			cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
			scheduledPlanName: subscription?.scheduledPlanName ?? null,
		}
	}
}
