import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'

import { SubscriptionRepository } from '@billing/repositories'
import { SubscriptionAccessDeriver } from '@billing/services'
import { SubscriptionChangedEvent } from '@template/contracts-typescript/wire/events'
import type { ApplicationErrors } from '@billing/errors'
import { SubscriptionStatus } from '@template/contracts-typescript/wire/enums'
import { Subscription } from '../entities/Subscription'

export const CancelSubscriptionInputSchema = z.object({
	ownerId: z.string().min(1),
	/**
	 * When true, access ends now (the derivation revokes it immediately). Default false: the
	 * cancellation is scheduled for the current period's end, so access continues until then.
	 */
	immediate: z.boolean().default(false),
})

export const CancelSubscriptionOutputSchema = z.object({
	/** The DERIVED status after recording: CANCELED for an immediate cancel; still ACTIVE/etc. while access holds to period end. */
	status: z.enum(SubscriptionStatus),
	/** True when the cancellation is scheduled for period end (access continues until then). */
	cancelAtPeriodEnd: z.boolean(),
	canceledAt: z.string(),
})

/**
 * Cancel an owner's subscription by recording cancellation intent ON THE RECORD — native (no external engine call). The
 * subscription record is authoritative (Phase D): access is DERIVED from these cancellation facts,
 * not from a flipped status.
 *
 *  - default (`immediate: false`): `cancelAtPeriodEnd = true` + `canceledAt = now`. The owner keeps
 *    access until `currentPeriodEnd` — `SubscriptionAccessDeriver` treats the cancellation as
 *    effective only once the period closes.
 *  - `immediate: true`: `cancelAtPeriodEnd = false` + `canceledAt = now`. Access ends now, because
 *    the derivation treats a non-deferred cancellation as effective at `canceledAt`.
 *
 * After recording, we DERIVE the resulting access (for the returned status) and announce the thin
 * `SubscriptionChangedEvent` trigger (same tx, through the outbox) so the `unit` projection
 * re-queries current access without importing `@billing`.
 */
@injectable()
export class CancelSubscription extends Handler<typeof CancelSubscriptionInputSchema, typeof CancelSubscriptionOutputSchema> {
	readonly name = 'cancel_subscription' as const
	readonly inputSchema = CancelSubscriptionInputSchema
	readonly outputSchema = CancelSubscriptionOutputSchema

	constructor(
		private subscriptionRepository: SubscriptionRepository,
		private subscriptionAccessDeriver: SubscriptionAccessDeriver,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const sub = await this.subscriptionRepository.findByOwnerId(input.ownerId, tx)
			// Nothing non-terminal to cancel — an absent or already-terminal record.
			if (!sub || Subscription.isTerminalStatus(sub.status)) {
				throw new BaseError<ApplicationErrors>('SUBSCRIPTION_NOT_FOUND')
			}

			const now = new Date()

			// Tell-Don't-Ask: the entity owns the cancellation invariant (immediate → finalize CANCELED;
			// scheduled → keep status; set the facts; preserve scheduledPlanName). The use case just loads,
			// tells it to cancel, and persists.
			sub.cancel(input.immediate, now)
			await this.subscriptionRepository.save(sub, tx)

			// Derive the resulting access (used for the returned status below) and announce the
			// change cross-context — `unit` re-queries current access without importing `@billing`.
			const derived = await this.subscriptionAccessDeriver.derive(input.ownerId, now, tx)
			await this.domainEventRepository.saveIntegrationEvent(new SubscriptionChangedEvent({ ownerId: input.ownerId, payload: {} }), tx)

			return { status: derived.displayStatus, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, canceledAt: now.toISOString() }
		})
	}
}
