import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { DunningAttemptFailedEvent } from '@billing/events/DunningAttemptFailedEvent'
import { DunningNotifier } from '@billing/services/DunningNotifier'

/**
 * Email-only reaction to a dunning RETRY attempt failing. Deliberately separate from
 * DunningLifecycle (which only derives/emits the lifecycle events) so a mail outage never blocks
 * the dunning state machine, and vice versa (canon bp-03).
 */
@injectable()
export class DunningAttemptFailedHandler extends EventHandler<typeof DunningAttemptFailedEvent> {
	readonly event = DunningAttemptFailedEvent

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private notifier: DunningNotifier,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		await this.withTransaction(undefined, async (tx: Transaction) => {
			// Outbox delivers at-least-once — one email per (invoice, attemptNo); a later attemptNo
			// on the same invoice is a distinct key, so it still gets its own email.
			if (
				!(await this.idempotencyGuard.claim(
					IdempotencyScope.INVOICE_DUNNING,
					`attempt:${event.payload.invoiceId}:${event.payload.attemptNo}`,
					tx,
				))
			)
				return

			await this.notifier.notify('attempt', event.payload, tx)
		})
	}
}
