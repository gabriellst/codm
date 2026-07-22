import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { ProrationCalculator } from '@billing/services'

import { PlanRegistry } from '@billing/objects'
import { SubscriptionRepository } from '@billing/repositories'
import type { ApplicationErrors } from '@billing/errors'
import { PlanName } from '@template/contracts-typescript/wire/enums'

export const PreviewPlanChangeInputSchema = z.object({
	ownerId: z.string().min(1),
	targetPlan: z.enum(PlanName),
})

export const PreviewPlanChangeOutputSchema = z.object({
	amountDueNowCents: z.number().int(),
	nextCycleCents: z.number().int(),
})

/**
 * Read-only counterpart to ChangePlan — previews the billing impact of switching the owner's active
 * subscription to `targetPlan` without committing to anything. Phase D: the proration math is EXACT
 * and native — `ProrationCalculator` prorates the price difference over the real remaining fraction
 * of the current period (the record's `currentPeriodStart`/`currentPeriodEnd`), native (no external engine call) and
 * no 30-day-cycle estimate. `nextCycleCents` is simply the target plan's catalog base price.
 */
@injectable()
export class PreviewPlanChange extends Handler<typeof PreviewPlanChangeInputSchema, typeof PreviewPlanChangeOutputSchema> {
	readonly name = 'preview_plan_change' as const
	readonly inputSchema = PreviewPlanChangeInputSchema
	readonly outputSchema = PreviewPlanChangeOutputSchema

	constructor(
		private subscriptionRepository: SubscriptionRepository,
		private prorationCalculator: ProrationCalculator,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const sub = await this.subscriptionRepository.findByOwnerId(input.ownerId, tx)
			if (!sub) throw new BaseError<ApplicationErrors>('SUBSCRIPTION_NOT_FOUND')

			const amountDueNowCents = this.prorationCalculator.amountDueNow({
				currentPlan: sub.planName,
				targetPlan: input.targetPlan,
				periodStart: sub.currentPeriodStart,
				periodEnd: sub.currentPeriodEnd,
				now: new Date(),
			})
			const nextCycleCents = PlanRegistry.get(input.targetPlan).basePrice.amountCents

			return { amountDueNowCents, nextCycleCents }
		})
	}
}
