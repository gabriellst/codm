import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { SubscriptionChangedEvent } from '@template/contracts-typescript/wire/events'
import { SubscriptionRepository } from '@billing/repositories'
import type { ApplicationErrors } from '@billing/errors'

export const ResumeSubscriptionInputSchema = z.object({ ownerId: z.string().min(1) })
export const ResumeSubscriptionOutputSchema = z.void()

/**
 * "Reativar assinatura" — suspend a pending scheduled cancellation (`cancelAtPeriodEnd`), restoring
 * the subscription to normal active state. The entity method (`resumeScheduledCancellation`) clears
 * BOTH `cancelAtPeriodEnd` and `canceledAt` — access re-derives from that pair — and throws
 * `SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION` if nothing was scheduled. After persisting, we
 * announce the thin `SubscriptionChangedEvent` trigger so `unit` re-queries current access.
 */
@injectable()
export class ResumeSubscription extends Handler<typeof ResumeSubscriptionInputSchema, typeof ResumeSubscriptionOutputSchema> {
	readonly name = 'resume_subscription' as const
	readonly inputSchema = ResumeSubscriptionInputSchema
	readonly outputSchema = ResumeSubscriptionOutputSchema

	constructor(private subscriptionRepository: SubscriptionRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		await this.withTransaction(tx, async tx => {
			const subscription = await this.subscriptionRepository.findByOwnerId(input.ownerId, tx)
			if (!subscription) {
				throw new BaseError<ApplicationErrors>('SUBSCRIPTION_NOT_FOUND')
			}

			// Entity invariant: throws SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION if nothing is scheduled.
			subscription.resumeScheduledCancellation()
			await this.subscriptionRepository.save(subscription, tx)

			await this.domainEventRepository.saveIntegrationEvent(new SubscriptionChangedEvent({ ownerId: input.ownerId, payload: {} }), tx)
		})
	}
}
