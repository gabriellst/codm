import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { DunningSucceededEvent } from '@billing/events/DunningSucceededEvent'
import { DunningNotifier } from '@billing/services/DunningNotifier'

/**
 * Email-only reaction to a dunning cycle RECOVERING (the invoice settled after ≥1 failed
 * charge). Deliberately separate from DunningLifecycle (which only derives/emits the lifecycle
 * events) so a mail outage never blocks the dunning state machine, and vice versa (canon bp-03).
 */
@injectable()
export class DunningSucceededHandler extends EventHandler<typeof DunningSucceededEvent> {
	readonly event = DunningSucceededEvent

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private notifier: DunningNotifier,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		await this.withTransaction(undefined, async (tx: Transaction) => {
			// Outbox delivers at-least-once — one "succeeded" dunning email per invoice.
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_DUNNING, `succeeded:${event.payload.invoiceId}`, tx))) return

			await this.notifier.notify('succeeded', event.payload, tx)
		})
	}
}
