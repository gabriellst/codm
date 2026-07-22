import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { DunningFailedEvent } from '@billing/events/DunningFailedEvent'
import { DunningNotifier } from '@billing/services/DunningNotifier'

/**
 * Email-only reaction to the dunning cycle's TERMINAL failure (window exhausted, subscription
 * canceled). Deliberately separate from the DunningRetryJob scan (which only writes `canceledAt`
 * + emits the lifecycle event) so a mail outage never blocks the cancellation, and vice versa
 * (canon bp-03).
 */
@injectable()
export class DunningFailedHandler extends EventHandler<typeof DunningFailedEvent> {
	readonly event = DunningFailedEvent

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private notifier: DunningNotifier,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		await this.withTransaction(undefined, async (tx: Transaction) => {
			// Outbox delivers at-least-once — one "failed" dunning email per invoice.
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_DUNNING, `failed:${event.payload.invoiceId}`, tx))) return

			await this.notifier.notify('failed', event.payload, tx)
		})
	}
}
