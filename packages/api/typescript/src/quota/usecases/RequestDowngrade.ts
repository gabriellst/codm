import { Handler, BaseError, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { ChangePlan } from '@billing/usecases/ChangePlan'

import { PlanRegistry } from '@billing/objects'
import { PendingSelectionRepository, type KeptSelection } from '@quota/repositories'
import { ResourceGovernorRegistry } from '@quota/services'

import type { ApplicationErrors } from '@quota/errors'
import { PlanName, QuotaKey } from '@template/contracts-typescript/wire/enums'

export const RequestDowngradeInputSchema = z.object({
	ownerId: z.string().min(1),
	targetPlan: z.enum(PlanName),
	keep: z.partialRecord(z.enum(QuotaKey), z.array(z.string())).default({}),
})
export const RequestDowngradeOutputSchema = z.object({ effectiveAtPeriodEnd: z.boolean() })

/**
 * Atomically request a paid→paid downgrade (→FREE is rejected — see the handle-time guard):
 * validate the owner's "keep" selection against the target plan's limits, schedule the downgrade
 * via `ChangePlan` (which SCHEDULES — doesn't flip anything now), and persist the keep-selection —
 * all in ONE transaction, so a rejected selection leaves neither a schedule nor a stored selection
 * behind. Atomicity here is a convenience, not a hard requirement (F1): a failed selection-save
 * would fall back to the enforcer's default oldest-N behavior.
 *
 * The governor's `list` already excludes the owner's own membership, so the owner never appears in
 * `owned` — the extra `owned.delete(input.ownerId)` below is harmless defense-in-depth, not the
 * primary guard.
 */
@injectable()
export class RequestDowngrade extends Handler<typeof RequestDowngradeInputSchema, typeof RequestDowngradeOutputSchema> {
	readonly name = 'request_downgrade' as const
	readonly inputSchema = RequestDowngradeInputSchema
	readonly outputSchema = RequestDowngradeOutputSchema

	constructor(
		private changePlan: ChangePlan,
		private pending: PendingSelectionRepository,
		private governors: ResourceGovernorRegistry,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// →FREE is not a downgrade this use case handles: ChangePlan routes a FREE target through
		// CancelSubscription, which announces the cancellation immediately — clearing the
		// just-saved keep-selection before the FREE period-turn would ever re-announce and let the
		// enforcer apply it. RequestDowngrade is for paid→paid downgrades only; →FREE goes through
		// cancellation instead.
		if (!PlanRegistry.isPaid(input.targetPlan)) throw new BaseError<ApplicationErrors>('DOWNGRADE_SELECTION_INVALID')

		return this.withTransaction(tx, async tx => {
			const keep: KeptSelection = {}
			const requestedKeep = input.keep as Partial<Record<QuotaKey, string[]>>
			for (const key of this.governors.keys()) {
				const limit = PlanRegistry.policy(input.targetPlan, key)?.limit ?? null
				const chosen = requestedKeep[key] ?? []

				const owned = new Set((await this.governors.for(key).list(input.ownerId, tx)).map(r => r.id))
				owned.delete(input.ownerId) // the owner's own seat is never selectable/lockable

				if (chosen.some(id => !owned.has(id))) throw new BaseError<ApplicationErrors>('DOWNGRADE_SELECTION_INVALID')
				if (limit !== null && chosen.length > limit) throw new BaseError<ApplicationErrors>('DOWNGRADE_SELECTION_INVALID')

				if (chosen.length > 0) keep[key] = chosen
			}

			// Validation passed for every key — now (and only now) write. Schedule + selection ride the
			// same transaction, so a later failure here would roll back both (though nothing past this
			// point can fail on business grounds; ChangePlan re-validates its own invariants).
			const result = await this.changePlan.execute({ ownerId: input.ownerId, planName: input.targetPlan }, tx)
			await this.pending.save(input.ownerId, keep, tx)

			return { effectiveAtPeriodEnd: result.effectiveAtPeriodEnd }
		})
	}
}
