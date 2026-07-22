import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { BillingClock, ProrationCalculator } from '@billing/services'
import { SubscriptionChangedEvent } from '@template/contracts-typescript/wire/events'

import { PlanRegistry } from '@billing/objects'
import { SubscriptionRepository } from '@billing/repositories'
import { ExternalInvoiceIssuedEvent } from '@billing/events/ExternalInvoiceIssuedEvent'
import { CancelSubscription } from './CancelSubscription'
import type { ApplicationErrors } from '@billing/errors'
import { PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'
import { Subscription } from '../entities/Subscription'

export const ChangePlanInputSchema = z.object({
	ownerId: z.string().min(1),
	planName: z.enum(PlanName),
})

export const ChangePlanOutputSchema = z.object({
	planName: z.enum(PlanName),
	status: z.enum(SubscriptionStatus),
	// True when the change only takes effect at the end of the current paid period
	// (a downgrade to FREE cancels at period end via CancelSubscription).
	effectiveAtPeriodEnd: z.boolean(),
})

/**
 * Switch an owner between plans — Phase D: the subscription record is authoritative, so every path
 * writes the record directly — native (no external engine call).
 *
 *  - paid → paid UPGRADE (target basePrice > current): applied IMMEDIATELY. The record's `planName`
 *    is flipped now (`repo.changePlan`) and a native PRORATION invoice is issued for the
 *    amount-due-now (`ProrationCalculator.amountDueNow` over the real remaining period) — the same
 *    native-invoice + charge-saga path CreateSubscription uses for the first invoice. A zero
 *    proration (e.g. no open period window) issues no invoice.
 *  - paid → paid DOWNGRADE (target basePrice < current): SCHEDULED for the next renewal — the
 *    record's `planName` is left untouched now and `scheduledPlanName` is set instead
 *    (`repo.setScheduledPlan`). We do NOT announce, because announcing would make the `unit`
 *    projection re-derive and lock the lower limits immediately, defeating the point of deferring.
 *    The clock applies the scheduled plan and announces at the period turn; `effectiveAtPeriodEnd`
 *    is true and the returned `planName` is the still-current (unchanged) plan. An upgrade issued
 *    later clears any pending scheduled downgrade.
 *  - paid → FREE: recorded as a period-end cancellation via `CancelSubscription` (non-immediate) —
 *    the owner keeps paid access until `currentPeriodEnd`, after which the derivation reports FREE.
 *  - FREE → paid: rejected here (no active subscription) — going FREE → paid needs a first-invoice
 *    payment, which is the `CreateSubscription` flow, not a bare plan swap.
 *
 * After any subscription mutation that changes the plan NOW, we announce the thin
 * `SubscriptionChangedEvent` trigger so the `unit` projection re-queries current access. A scheduled
 * downgrade does not announce until it actually takes effect at the period turn.
 *
 * DEVIATION (v1): a paid→paid downgrade issues NO credit for the unused remainder of the higher
 * tier — it simply waits for the period turn to apply the lower plan, matching what the owner
 * already paid for.
 */
@injectable()
export class ChangePlan extends Handler<typeof ChangePlanInputSchema, typeof ChangePlanOutputSchema> {
	readonly name = 'change_plan' as const
	readonly inputSchema = ChangePlanInputSchema
	readonly outputSchema = ChangePlanOutputSchema

	constructor(
		private subscriptionRepository: SubscriptionRepository,
		private prorationCalculator: ProrationCalculator,
		private cancelSubscription: CancelSubscription,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const target = PlanRegistry.get(input.planName)

		return this.withTransaction(tx, async tx => {
			const subscription = await this.subscriptionRepository.findByOwnerId(input.ownerId, tx)
			const active = subscription && !Subscription.isTerminalStatus(subscription.status) ? subscription : null

			// Downgrade to FREE — record a period-end cancellation, native (no external engine call). Access holds until period end.
			if (!PlanRegistry.isPaid(input.planName)) {
				if (!active) {
					// Already on FREE — nothing to cancel.
					return { planName: PlanName.FREE, status: SubscriptionStatus.ACTIVE, effectiveAtPeriodEnd: false }
				}
				await this.cancelSubscription.execute({ ownerId: input.ownerId, immediate: false }, tx)
				return { planName: active.planName, status: active.status, effectiveAtPeriodEnd: true }
			}

			// Target is a paid plan but there's no active subscription to switch — go via CreateSubscription.
			if (!active) throw new BaseError<ApplicationErrors>('SUBSCRIPTION_NOT_FOUND')

			// Same plan — re-choosing the CURRENT plan means "stay put": clear any pending scheduled
			// downgrade (otherwise the response reads "nothing scheduled" while the old downgrade
			// still fires at renewal), then no-op.
			if (active.planName === input.planName) {
				if (active.scheduledPlanName) await this.subscriptionRepository.setScheduledPlan(input.ownerId, null, tx)
				return { planName: input.planName, status: active.status, effectiveAtPeriodEnd: false }
			}

			const current = PlanRegistry.get(active.planName)
			const isUpgrade = target.basePrice.amountCents > current.basePrice.amountCents

			// DOWNGRADE (paid→paid): schedule it for the next renewal — do NOT flip the plan now, do NOT
			// announce (announcing would make `unit` re-project the lower limits and lock immediately). The
			// clock applies it + announces at the period turn. No money moves.
			if (!isUpgrade) {
				// Entity invariant: refuses when cancelAtPeriodEnd — see Subscription.scheduleDowngrade.
				active.scheduleDowngrade(input.planName)
				await this.subscriptionRepository.save(active, tx)
				return { planName: active.planName, status: active.status, effectiveAtPeriodEnd: true }
			}

			// UPGRADE: apply immediately, cancel any still-pending scheduled downgrade, and issue a native
			// proration invoice for the amount due now (charged by the existing saga). Then announce.
			// Capture the PREVIOUS plan before mutating — the entity method flips `active.planName` in
			// place, but the proration + ledger payload below need the plan being upgraded FROM.
			const previousPlanName = active.planName
			// Entity invariant: refuses when cancelAtPeriodEnd — see Subscription.changePlan.
			active.changePlan(input.planName)
			await this.subscriptionRepository.save(active, tx)

			const now = new Date()
			const amountCents = this.prorationCalculator.amountDueNow({
				currentPlan: previousPlanName,
				targetPlan: input.planName,
				periodStart: active.currentPeriodStart,
				periodEnd: active.currentPeriodEnd,
				now,
			})
			if (amountCents > 0) {
				const engineInvoiceId = BillingClock.nativeInvoiceId(input.ownerId, now.getTime())
				await this.domainEventRepository.save(
					new ExternalInvoiceIssuedEvent({
						entityId: engineInvoiceId,
						ownerId: input.ownerId,
						payload: {
							externalId: `${engineInvoiceId}:issued`,
							ownerId: input.ownerId,
							engineInvoiceId,
							amountCents,
							number: null,
							dueDate: null,
							// Forward the period the proration was computed over — the ledger row persists
							// it and paid-through (max paid periodEnd) stays derivable for upgrades too.
							periodStart: active.currentPeriodStart?.toISOString() ?? null,
							periodEnd: active.currentPeriodEnd?.toISOString() ?? null,
							overageCents: 0,
							overageQty: 0,
							attemptNo: 0,
							// Optimistic upgrade: the flip pair — a declined proration reverts FROM←TO.
							upgradedFromPlan: previousPlanName,
							upgradedToPlan: input.planName,
						},
					}),
					tx,
				)
			}

			await this.domainEventRepository.saveIntegrationEvent(new SubscriptionChangedEvent({ ownerId: input.ownerId, payload: {} }), tx)
			return { planName: input.planName, status: active.status, effectiveAtPeriodEnd: false }
		})
	}
}
