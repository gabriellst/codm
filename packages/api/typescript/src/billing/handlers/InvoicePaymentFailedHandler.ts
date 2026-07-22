import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { InvoicePaymentFailedEvent } from '@billing/events/InvoicePaymentFailedEvent'
import { SubscriptionRepository, InvoiceRepository, ChargeRepository } from '@billing/repositories'

import { DunningLifecycle } from '@billing/services'
import { SubscriptionChangedEvent } from '@template/contracts-typescript/wire/events'
import { PlanName } from '@template/contracts-typescript/wire/enums'
import { Subscription } from '../entities/Subscription'

/**
 * Read-model maintenance on a failed invoice charge. Two branches, ONE handler (no ordering
 * hazard between sibling subscribers):
 *
 *  - Optimistic-UPGRADE proration declined (`upgradedFromPlan` on the event — flow state
 *    forwarded by the charge saga, never persisted): the plan flip is REVERTED and the
 *    proration invoice is voided — the upgrade simply didn't happen; the owner keeps the plan
 *    they were on, backed by the invoice they already paid. No PAST_DUE: their paid period is
 *    intact. (Money always wins: a charge that somehow succeeded blocks the revert.)
 *  - Every other failure (renewal/first invoice): the Subscription moves to PAST_DUE (dunning).
 *
 * Both branches announce cross-context so the access gate re-queries.
 */
@injectable()
export class InvoicePaymentFailedHandler extends EventHandler<typeof InvoicePaymentFailedEvent> {
	readonly event = InvoicePaymentFailedEvent

	constructor(
		private subscriptionRepository: SubscriptionRepository,
		private invoiceRepository: InvoiceRepository,
		private chargeRepository: ChargeRepository,
		private idempotencyGuard: IdempotencyGuard,
		private dunningLifecycle: DunningLifecycle,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const { ownerId, invoiceId, upgradedFromPlan, upgradedToPlan } = event.payload
		const eventId = event.id

		await this.withTransaction(undefined, async (tx: Transaction) => {
			// Outbox delivers at-least-once — skip if this event was already processed.
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_EVENT, eventId, tx))) return

			// A voided invoice has nothing to dun. This races the optimistic-upgrade revert: the
			// synchronous decline voids the proration invoice, then the SAME decline re-arrives via
			// webhook (GATEWAY_CHARGE_FAILED) — without this guard that second delivery would flip
			// the subscription to PAST_DUE over an invoice that no longer exists as a debt (the
			// observed "upgraded-plan + PAST_DUE + unpaid invoice" state). Money still wins: a settled
			// invoice isn't voided, so this only skips genuinely-cancelled debts.
			const invoice = await this.invoiceRepository.findByEngineInvoiceId(invoiceId, tx)
			if (invoice?.voidedAt) return

			// Never-dun-a-payer: a SUCCEEDED charge on this invoice means it's already paid. A stale/late
			// decline (a dunning retry that raced a manual payment, an out-of-order webhook) must NOT flip
			// a paid ACTIVE subscription to PAST_DUE — that would feed the dunning sweep and re-charge/cancel
			// a customer who already paid. Money wins; mirrors failCharge / revertOptimisticUpgrade.
			if (await this.chargeRepository.findSucceededByInvoiceId(invoiceId, tx)) return

			if (upgradedFromPlan && upgradedToPlan) {
				const reverted = await this.revertOptimisticUpgrade(ownerId, invoiceId, { fromPlan: upgradedFromPlan, toPlan: upgradedToPlan }, tx)
				if (reverted) {
					await this.domainEventRepository.saveIntegrationEvent(new SubscriptionChangedEvent({ ownerId, payload: {} }), tx)
					// An upgrade-revert failure is never dunning (Decision 8) — onChargeFailed
					// no-ops on isUpgrade=true, kept here only for a single, consistent call site.
					await this.dunningLifecycle.onChargeFailed(ownerId, invoiceId, true, tx)
					return
				}
				// Couldn't safely revert (money moved / plan changed again / terminal) — fall
				// through to the ordinary dunning path below.
			}

			await this.subscriptionRepository.markPastDue(ownerId, tx)
			// Cross-context recipients (e.g. `unit`) re-query current access without importing
			// `@billing` — the thin trigger carries no plan/limits payload (Task 4).
			// Announce the change cross-context via the outbox (same tx) instead of a
			// post-commit externalMediator.publish — a crash between commit and publish
			// used to drop the announcement; now it's at-least-once with the rest.
			await this.domainEventRepository.saveIntegrationEvent(new SubscriptionChangedEvent({ ownerId, payload: {} }), tx)
			// Derives the dunning phase from the Charge ledger and emits Started/AttemptFailed.
			// isUpgrade=true here means the pair was present but the revert fell through (stale
			// flip / money already moved) — still not dunning (Decision 8), onChargeFailed no-ops.
			await this.dunningLifecycle.onChargeFailed(ownerId, invoiceId, Boolean(upgradedFromPlan && upgradedToPlan), tx)
		})
	}

	/** True when the plan was reverted (and the proration invoice voided). */
	private async revertOptimisticUpgrade(
		ownerId: string,
		invoiceId: string,
		upgrade: { fromPlan: PlanName; toPlan: PlanName },
		tx: Transaction,
	): Promise<boolean> {
		// Money always wins: a SUCCEEDED charge for the proration (racing retry/manual pay) means
		// the upgrade WAS collected — never revert a paid upgrade.
		if (await this.chargeRepository.findSucceededByInvoiceId(invoiceId, tx)) return false

		const subscription = await this.subscriptionRepository.findByOwnerId(ownerId, tx)
		if (!subscription || Subscription.isTerminalStatus(subscription.status)) return false
		// Only revert the EXACT flip this proration charged for: if the owner changed plans again
		// since (a newer flip owns the record now), this stale failure must not clobber it.
		if (subscription.planName !== upgrade.toPlan) return false

		await this.subscriptionRepository.changePlan(ownerId, upgrade.fromPlan, tx)
		// The declined proration must not linger as an open PENDING invoice — void it (append-once
		// fact; derived VOID; hidden from the listing).
		await this.invoiceRepository.void(invoiceId, tx)
		return true
	}
}
