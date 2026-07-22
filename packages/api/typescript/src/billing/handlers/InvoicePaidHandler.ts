import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { InvoicePaidEvent } from '@billing/events/InvoicePaidEvent'
import { SubscriptionRepository, InvoiceRepository } from '@billing/repositories'
import { BillingClock, DunningLifecycle } from '@billing/services'
import { RecoveredVia } from '@billing/enums/RecoveredVia'
import { SubscriptionChangedEvent } from '@template/contracts-typescript/wire/events'

/**
 * Read-model maintenance: a paid invoice flips the Subscription to ACTIVE
 * and advances the access window, then announces the change cross-context.
 *
 * NOTE: implemented as an ordinary internal EventHandler (not a Projector) —
 * the medscall codebase has no Projector type, and BoundedContext.create only
 * wires internal/external handlers + jobs. Handlers are the supported path.
 */
@injectable()
export class InvoicePaidHandler extends EventHandler<typeof InvoicePaidEvent> {
	readonly event = InvoicePaidEvent

	constructor(
		private subscriptionRepository: SubscriptionRepository,
		private invoiceRepository: InvoiceRepository,
		private idempotencyGuard: IdempotencyGuard,
		private clock: BillingClock,
		private dunningLifecycle: DunningLifecycle,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.payload.ownerId
		const invoiceId = event.payload.invoiceId
		const eventId = event.id

		await this.withTransaction(undefined, async (tx: Transaction) => {
			// Outbox delivers at-least-once — skip if this event was already processed.
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_EVENT, eventId, tx))) return

			// The access window comes from the PAID INVOICE's own periodEnd — the issuer already
			// computed the correct window for its purpose: a RENEWAL carries the advanced end
			// (BillingClockJob), a FIRST invoice carries now+1mo (CreateSubscription), and an UPGRADE
			// carries the UNCHANGED current end (ChangePlan — a mid-period plan change must NOT roll
			// the renewal forward). Re-advancing the clock here rolled the period forward on every
			// paid upgrade (the "cancels in 60 days" / 2-month window bug). Fallback to a clock
			// advance only when the invoice carries no period (engine-sourced invoices).
			const invoice = await this.invoiceRepository.findByEngineInvoiceId(invoiceId, tx)
			const subscription = await this.subscriptionRepository.findByOwnerId(ownerId, tx)
			const now = new Date()
			const nextPeriodEnd = invoice?.periodEnd ?? this.clock.nextPeriodEnd(subscription?.currentPeriodEnd ?? now, 'monthly')
			await this.subscriptionRepository.activate(ownerId, nextPeriodEnd, tx)
			// Cross-context recipients (e.g. `unit`) re-query current access without importing
			// `@billing` — the thin trigger carries no plan/limits payload (Task 4).
			// Announce the change cross-context via the outbox (same tx) instead of a
			// post-commit externalMediator.publish — a crash between commit and publish
			// used to drop the announcement; now it's at-least-once with the rest.
			await this.domainEventRepository.saveIntegrationEvent(new SubscriptionChangedEvent({ ownerId, payload: {} }), tx)
			// Every settle path funnels through here (ChargeSettler raises the single InvoicePaidEvent).
			// The recovery label rides on the event: RETRY when an off-session automatic re-charge
			// settled it (stamped by ExternalCardChargeSucceededHandler), else MANUAL (PIX / checkout /
			// ad-hoc pay-now, and any path that doesn't set it). onSettled only uses this when the invoice
			// had prior FAILED charges (a real dunning recovery).
			await this.dunningLifecycle.onSettled(ownerId, invoiceId, event.payload.recoveredVia ?? RecoveredVia.MANUAL, tx)
		})
	}
}
