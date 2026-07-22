import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import type { BaseInfrastructureErrors } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { BillingWebhookSource } from '@billing/enums'
import type { ExternalBillingEvent } from '@billing/services/BillingWebhookMapper'

const SCOPE_BY_SOURCE: Record<BillingWebhookSource, IdempotencyScope> = {
	[BillingWebhookSource.PAGARME]: IdempotencyScope.WEBHOOK_PAGARME,
	[BillingWebhookSource.STRIPE]: IdempotencyScope.WEBHOOK_STRIPE,
	[BillingWebhookSource.ASAAS]: IdempotencyScope.WEBHOOK_ASAAS,
	[BillingWebhookSource.GETNET]: IdempotencyScope.WEBHOOK_GETNET,
	[BillingWebhookSource.MERCADOPAGO]: IdempotencyScope.WEBHOOK_MERCADOPAGO,
	[BillingWebhookSource.PAGBANK]: IdempotencyScope.WEBHOOK_PAGBANK,
	[BillingWebhookSource.INFINITEPAY]: IdempotencyScope.WEBHOOK_INFINITEPAY,
	[BillingWebhookSource.REDE]: IdempotencyScope.WEBHOOK_REDE,
}

// Inert schema pair — BillingEventIngest is never dispatched via execute()/Mediator (no use-case
// name, no controller/dispatch-table entry). It extends Handler ONLY to reuse withTransaction()/
// domainEventRepository from the base class (and to ride the bindContainer cascade when injected
// into another Handler, e.g. HandleBillingWebhook / the future WindowReconcileJob) — same idiom
// as SubscriptionCharger. ingest() below is the sole entry point.
const BillingEventIngestInputSchema = z.object({})

/**
 * The single ingest of external billing facts — the claim(WEBHOOK_<SOURCE>:externalId) + outbox
 * loop extracted from HandleBillingWebhook, now shared by the webhook (inbound, real-time) and the
 * window-reconciliation sweep (outbound, periodic). An event already seen (same externalId, same
 * source) is a no-op; the returned count is "accepted" — the sweep's "lost webhook recovered"
 * signal when the caller is the sweep and accepted > 0.
 */
@injectable()
export class BillingEventIngest extends Handler<typeof BillingEventIngestInputSchema> {
	readonly name = 'billing_event_ingest' as const
	readonly inputSchema = BillingEventIngestInputSchema
	readonly outputSchema = z.void()

	constructor(private idempotencyGuard: IdempotencyGuard) {
		super()
	}

	async ingest(source: BillingWebhookSource, events: ExternalBillingEvent[], tx?: Transaction): Promise<number> {
		const scope = SCOPE_BY_SOURCE[source]
		return this.withTransaction(tx, async tx => {
			let accepted = 0
			for (const event of events) {
				if (await this.idempotencyGuard.claim(String(scope), event.payload.externalId, tx)) {
					await this.domainEventRepository.save(event, tx)
					accepted++
				}
			}
			return accepted
		})
	}

	protected async handle(): Promise<void> {
		// Unreachable — BillingEventIngest is a directly-injected service (ingest()), never
		// dispatched via execute()/Mediator. See the class doc comment.
		throw new BaseError<BaseInfrastructureErrors>('NOT_IMPLEMENTED', 'BillingEventIngest.handle() is unreachable — call ingest() directly')
	}
}
