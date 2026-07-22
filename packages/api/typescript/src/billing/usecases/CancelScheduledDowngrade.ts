import { Handler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { SubscriptionChangedEvent } from '@template/contracts-typescript/wire/events'
import { SubscriptionRepository } from '@billing/repositories'

export const CancelScheduledDowngradeInputSchema = z.object({ ownerId: z.string().min(1) })
export const CancelScheduledDowngradeOutputSchema = z.void()

/** "Manter plano atual" — drop a pending scheduled downgrade before it takes effect (feature a).
 *  Clears the schedule and announces the current (unchanged) plan so `unit` unlocks + drops the
 *  stale keep-selection. A no-op if nothing is scheduled. */
@injectable()
export class CancelScheduledDowngrade extends Handler<
	typeof CancelScheduledDowngradeInputSchema,
	typeof CancelScheduledDowngradeOutputSchema
> {
	readonly name = 'cancel_scheduled_downgrade' as const
	readonly inputSchema = CancelScheduledDowngradeInputSchema
	readonly outputSchema = CancelScheduledDowngradeOutputSchema

	constructor(private subscriptionRepository: SubscriptionRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		await this.withTransaction(tx, async tx => {
			const sub = await this.subscriptionRepository.findByOwnerId(input.ownerId, tx)
			if (!sub?.scheduledPlanName) return
			await this.subscriptionRepository.setScheduledPlan(input.ownerId, null, tx)
			await this.domainEventRepository.saveIntegrationEvent(new SubscriptionChangedEvent({ ownerId: input.ownerId, payload: {} }), tx)
		})
	}
}
