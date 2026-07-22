import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { tryCatchAsync } from '@template/core-typescript'
import { forEachWithConcurrency } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import type { Transaction } from '@template/core-typescript'
import { ChargeRepository } from '@billing/repositories'
import { ChargeReconciler, OperatorAlert } from '@billing/services'
import { LoggingService } from '@template/core-typescript'

const ReconcilePendingChargesJobInputSchema = z.object({})

/**
 * BACKSTOP sweep for dropped settlement webhooks. The PRIMARY recovery is the per-charge delayed
 * command (`ReconcileChargeCommand`, scheduled transactionally when SubscriptionCharger records a
 * PENDING charge and canceled when the webhook settles it) — this sweep exists for the alarms that
 * mechanism can't guarantee: a lost delayed job (e.g. the BullMQ driver's non-transactional enqueue
 * racing a rollback), a PENDING charge created by a path that doesn't schedule, and the repeated
 * max-age still-pending operator alert. Both mechanisms run the IDENTICAL hardened logic
 * (`ChargeReconciler`) — loop-free, because each resolved charge transitions to an absorbing terminal
 * state and leaves listStalePending. Sibling of DunningRetryJob/BillingClockJob.
 */
@injectable()
export class ReconcilePendingChargesJob extends Handler<typeof ReconcilePendingChargesJobInputSchema> {
	readonly name = 'billing.reconcile-pending' as const
	readonly inputSchema = ReconcilePendingChargesJobInputSchema
	readonly outputSchema = z.void()

	constructor(
		private chargeRepository: ChargeRepository,
		private chargeReconciler: ChargeReconciler,
		private idempotencyGuard: IdempotencyGuard,
		private operatorAlert: OperatorAlert,
		private loggingService: LoggingService,
	) {
		super()
	}

	/** In-flight gateway status polls per tick (see DunningRetryJob.SWEEP_CONCURRENCY — same
	 *  rationale: the cost is the gateway round-trip; each reconcile opens its own small txs and is
	 *  idempotent per charge). */
	private static readonly SWEEP_CONCURRENCY = 5

	async handle(): Promise<void> {
		const now = new Date()
		const cutoff = new Date(now.getTime() - ProductConfig.env.BILLING_PENDING_RECONCILE_AFTER_MINUTES * 60_000)
		const stale = await this.chargeRepository.listStalePending(cutoff)
		await forEachWithConcurrency(stale, ReconcilePendingChargesJob.SWEEP_CONCURRENCY, async charge => {
			const result = await tryCatchAsync(() => this.chargeReconciler.reconcile(charge, now))
			if (!result.success) {
				// One charge's failed reconcile must not starve the rest of the sweep.
				this.loggingService.warn({
					content: {
						message: 'ReconcilePendingChargesJob failed to reconcile charge',
						gatewayTxId: charge.gatewayTxId,
						invoiceId: charge.invoiceId,
						error: result.error.message,
					},
				})
			}
		})

		await this.alertUnpollableStale(now)
	}

	/**
	 * Visibility for the sweep's blind spot: a PENDING charge with NO gatewayTxId can never be
	 * reconciled (there is no id to ask the gateway about — listStalePending filters it out), so
	 * without this it would strand its invoice silently forever. None should exist today (every
	 * `pending` gateway result stamps a txId); one appearing means a new gateway/path broke that
	 * assumption — alert operators exactly once per charge (claim-guarded) and keep it visible.
	 * Deliberately NEVER auto-failed: nothing can prove the money didn't move.
	 */
	private async alertUnpollableStale(now: Date): Promise<void> {
		const maxAgeCutoff = new Date(now.getTime() - ProductConfig.env.BILLING_PENDING_RECONCILE_MAX_AGE_HOURS * 60 * 60_000)
		const unpollable = await this.chargeRepository.listStaleUnpollablePending(maxAgeCutoff)
		if (unpollable.length === 0) return

		await this.withTransaction(undefined, async (tx: Transaction) => {
			for (const charge of unpollable) {
				const key = `unpollable:${charge.id.value}`
				if (await this.idempotencyGuard.claim(IdempotencyScope.RECONCILE_STALE_ALERT, key, tx)) {
					this.operatorAlert.emit({
						kind: 'charge-unpollable',
						key,
						runbook:
							'this charge has no gatewayTxId to poll — investigate why (a new gateway/path may have broken the invariant that every PENDING charge carries one) and resolve manually; never auto-fail it.',
						context: {
							chargeId: charge.id.value,
							ownerId: charge.ownerId.value,
							invoiceId: charge.invoiceId.value,
							maxAgeHours: ProductConfig.env.BILLING_PENDING_RECONCILE_MAX_AGE_HOURS,
						},
					})
				}
			}
		})
	}
}
