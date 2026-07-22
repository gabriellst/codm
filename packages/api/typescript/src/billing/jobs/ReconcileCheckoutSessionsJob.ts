import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { tryCatchAsync } from '@template/core-typescript'
import { forEachWithConcurrency } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { CheckoutSessionRepository } from '@billing/repositories'
import { CheckoutSessionReconciler } from '@billing/services'
import { LoggingService } from '@template/core-typescript'

const ReconcileCheckoutSessionsJobInputSchema = z.object({})

/**
 * BACKSTOP sweep for dropped checkout-completion webhooks. The PRIMARY recovery is the per-session
 * delayed command (`RECONCILE_CHECKOUT_COMMAND`, scheduled transactionally when
 * `CheckoutSessionRecorder` records a PENDING session and canceled when the webhook completes it) —
 * this sweep exists for the alarms that mechanism can't guarantee: a lost delayed job (e.g. the
 * BullMQ driver's non-transactional enqueue racing a rollback), a PENDING session created by a path
 * that doesn't schedule, and the repeated max-age still-pending operator alert. Both mechanisms run
 * the IDENTICAL hardened logic (`CheckoutSessionReconciler`) — loop-free, because each resolved
 * session transitions to an absorbing terminal state and leaves `listStalePending`. Molde
 * `ReconcilePendingChargesJob`; sibling of the other billing sweep jobs.
 */
@injectable()
export class ReconcileCheckoutSessionsJob extends Handler<typeof ReconcileCheckoutSessionsJobInputSchema> {
	readonly name = 'billing.reconcile-checkout-sessions' as const
	readonly inputSchema = ReconcileCheckoutSessionsJobInputSchema
	readonly outputSchema = z.void()

	constructor(
		private checkoutSessionRepository: CheckoutSessionRepository,
		private checkoutSessionReconciler: CheckoutSessionReconciler,
		private loggingService: LoggingService,
	) {
		super()
	}

	/** In-flight gateway status polls per tick (see DunningRetryJob.SWEEP_CONCURRENCY — same
	 *  rationale: the cost is the gateway round-trip; each reconcile opens its own small txs and is
	 *  idempotent per session). */
	private static readonly SWEEP_CONCURRENCY = 5

	async handle(): Promise<void> {
		const now = new Date()
		const cutoff = new Date(now.getTime() - ProductConfig.env.BILLING_CHECKOUT_RECONCILE_AFTER_MINUTES * 60_000)
		const stale = await this.checkoutSessionRepository.listStalePending(cutoff)
		await forEachWithConcurrency(stale, ReconcileCheckoutSessionsJob.SWEEP_CONCURRENCY, async session => {
			const result = await tryCatchAsync(() => this.checkoutSessionReconciler.reconcile(session, now))
			if (!result.success) {
				// One session's failed reconcile must not starve the rest of the sweep (AC-7).
				this.loggingService.warn({
					content: {
						message: 'ReconcileCheckoutSessionsJob failed to reconcile checkout session',
						sessionRef: session.sessionRef,
						error: result.error.message,
					},
				})
			}
		})
	}
}
