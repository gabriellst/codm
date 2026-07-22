import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { DunningStartedEvent } from '@billing/events/DunningStartedEvent'
import { DunningNotifier } from '@billing/services/DunningNotifier'

/**
 * Email-only reaction to the dunning cycle STARTING (first failed renewal charge on an invoice).
 * Deliberately separate from DunningLifecycle (which only derives/emits the lifecycle events) so
 * a mail outage never blocks the dunning state machine, and vice versa (canon bp-03). Replaces
 * PaymentFailedDunningHandler — email is now driven by the lifecycle events, not the raw
 * InvoicePaymentFailedEvent.
 */
@injectable()
export class DunningStartedHandler extends EventHandler<typeof DunningStartedEvent> {
	readonly event = DunningStartedEvent

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private notifier: DunningNotifier,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		await this.withTransaction(undefined, async (tx: Transaction) => {
			// Deploy-time compatibility: the removed PaymentFailedDunningHandler claimed the bare
			// `INVOICE_DUNNING:<invoiceId>` key (no phase prefix) for the exact same "started" email.
			// An invoice already mid-dunning when this handler shipped holds that legacy claim — honor
			// it here so we don't double-send. Claiming (not just peeking) also retires the legacy key
			// for good, so it can never collide again.
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_DUNNING, event.payload.invoiceId, tx))) return

			// Outbox delivers at-least-once — one "started" dunning email per invoice.
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_DUNNING, `started:${event.payload.invoiceId}`, tx))) return

			await this.notifier.notify('started', event.payload, tx)
		})
	}
}
