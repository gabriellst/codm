import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import { z } from '@template/core-typescript'

import { ChargeRepository } from '@billing/repositories'
import { ChargeReconciler, RECONCILE_CHARGE_COMMAND } from '@billing/services'
import { ChargeStatus } from '@template/contracts-typescript/wire/enums'

export const ReconcileChargeInputSchema = z.object({
	chargeId: z.string().min(1),
})

export const ReconcileChargeOutputSchema = z.void()

/**
 * The per-charge "alarm" for a dropped settlement webhook — the SCALABLE reconcile path (O(new
 * charges), no ledger sweep). A regular use case (one operation: reconcile THIS charge), invoked not
 * by a controller but by the CommandQueue: every use case is registered as a queue command at boot
 * (shared/index.ts → allUseCases), so SubscriptionCharger schedules it transactionally the moment a
 * charge is recorded PENDING (delay = BILLING_PENDING_RECONCILE_AFTER_MINUTES, jobId
 * `reconcile:<chargeId>`), and ChargeSettler CANCELS it when the live webhook settles/fails the
 * charge first — in the happy path this never runs.
 *
 * Idempotent under at-least-once delivery and lost cancel races: a charge already terminal (or gone)
 * is a no-op — only a still-PENDING charge is reconciled, via the same hardened `ChargeReconciler`
 * the backstop sweep uses. Still-pending at the gateway → no-op here too (no self-re-scheduling: the
 * low-frequency sweep owns the long tail + the max-age operator alert).
 */
@injectable()
export class ReconcileCharge extends Handler<typeof ReconcileChargeInputSchema, typeof ReconcileChargeOutputSchema> {
	readonly name = RECONCILE_CHARGE_COMMAND
	readonly inputSchema = ReconcileChargeInputSchema
	readonly outputSchema = ReconcileChargeOutputSchema

	constructor(
		private chargeRepository: ChargeRepository,
		private chargeReconciler: ChargeReconciler,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<void> {
		const charge = await this.chargeRepository.findById(input.chargeId)
		// Gone (rolled back / pruned) or already terminal (the webhook won the race — the normal case
		// when the cancel was lost): nothing to reconcile.
		if (!charge || charge.status !== ChargeStatus.PENDING) return
		await this.chargeReconciler.reconcile(charge, new Date())
	}
}
