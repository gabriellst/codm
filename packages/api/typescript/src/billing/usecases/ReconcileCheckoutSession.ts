import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import { z } from '@template/core-typescript'

import { CheckoutSessionRepository } from '@billing/repositories'
import { CheckoutSessionReconciler, RECONCILE_CHECKOUT_COMMAND } from '@billing/services'
import { CheckoutSessionStatus } from '@template/contracts-typescript/wire/enums'

export const ReconcileCheckoutSessionInputSchema = z.object({
	sessionRef: z.string().min(1),
})

export const ReconcileCheckoutSessionOutputSchema = z.void()

/**
 * The per-session "alarm" for a dropped checkout-completion webhook — the SCALABLE reconcile path
 * (O(new sessions), no ledger sweep). A regular use case (one operation: reconcile THIS session),
 * invoked not by a controller but by the CommandQueue: every use case is registered as a queue
 * command at boot (shared/index.ts → allUseCases), so `CheckoutSessionRecorder` schedules it
 * transactionally the moment a session is recorded PENDING (delay =
 * `BILLING_CHECKOUT_RECONCILE_AFTER_MINUTES`, jobId `reconcile-checkout:<sessionRef>`), and
 * `ExternalCheckoutCompletedHandler` CANCELS it when the live webhook completes the session first —
 * in the happy path this never runs. Molde `ReconcileCharge`.
 *
 * Idempotent under at-least-once delivery and lost cancel races: a session already terminal (or
 * gone) is a no-op — only a still-PENDING session is reconciled, via the same hardened
 * `CheckoutSessionReconciler` the backstop sweep uses. Still-open at the gateway → no-op here too
 * (no self-re-scheduling: the low-frequency sweep owns the long tail + the max-age operator alert).
 */
@injectable()
export class ReconcileCheckoutSession extends Handler<
	typeof ReconcileCheckoutSessionInputSchema,
	typeof ReconcileCheckoutSessionOutputSchema
> {
	readonly name = RECONCILE_CHECKOUT_COMMAND
	readonly inputSchema = ReconcileCheckoutSessionInputSchema
	readonly outputSchema = ReconcileCheckoutSessionOutputSchema

	constructor(
		private checkoutSessionRepository: CheckoutSessionRepository,
		private checkoutSessionReconciler: CheckoutSessionReconciler,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<void> {
		const session = await this.checkoutSessionRepository.findBySessionRef(input.sessionRef)
		// Gone (rolled back) or already terminal (the webhook won the race — the normal case when the
		// cancel was lost): nothing to reconcile.
		if (!session || session.status !== CheckoutSessionStatus.PENDING) return
		await this.checkoutSessionReconciler.reconcile(session, new Date())
	}
}
