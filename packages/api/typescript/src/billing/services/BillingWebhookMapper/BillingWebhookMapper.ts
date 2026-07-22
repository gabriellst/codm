import type { BillingWebhookSource } from '@billing/enums'
import type { ExternalCardChargeSucceededEvent } from '@billing/events/ExternalCardChargeSucceededEvent'
import type { ExternalCheckoutCompletedEvent } from '@billing/events/ExternalCheckoutCompletedEvent'
import type { ExternalPixPaidEvent } from '@billing/events/ExternalPixPaidEvent'
import type { ExternalChargeFailedEvent } from '@billing/events/ExternalChargeFailedEvent'
import type { ExternalChargeRefundedEvent } from '@billing/events/ExternalChargeRefundedEvent'
import type { ExternalInvoiceIssuedEvent } from '@billing/events/ExternalInvoiceIssuedEvent'
import type { ExternalInvoicePaidEvent } from '@billing/events/ExternalInvoicePaidEvent'
import type { ExternalInvoicePaymentFailedEvent } from '@billing/events/ExternalInvoicePaymentFailedEvent'
import type { ExternalInvoiceRefundedEvent } from '@billing/events/ExternalInvoiceRefundedEvent'
import type { ExternalSubscriptionActivatedEvent } from '@billing/events/ExternalSubscriptionActivatedEvent'
import type { ExternalSubscriptionCanceledEvent } from '@billing/events/ExternalSubscriptionCanceledEvent'

// The platform-neutral External-prefixed events any billing webhook maps to.
// All carry `payload.externalId` (the ingest dedup key).
export type ExternalBillingEvent =
	| ExternalCardChargeSucceededEvent
	| ExternalCheckoutCompletedEvent
	| ExternalPixPaidEvent
	| ExternalChargeFailedEvent
	| ExternalChargeRefundedEvent
	| ExternalInvoiceIssuedEvent
	| ExternalInvoicePaidEvent
	| ExternalInvoicePaymentFailedEvent
	| ExternalInvoiceRefundedEvent
	| ExternalSubscriptionActivatedEvent
	| ExternalSubscriptionCanceledEvent

/**
 * One mapper per source. Receives the whole inbound `Request`, validates the body
 * against a source-specific Zod schema, and returns the External-prefixed events
 * the webhook implies. Returns [] for webhook types we don't act on (no-op, not error).
 * Resolved per source by BillingWebhookMapperFactory.
 */
export abstract class BillingWebhookMapper {
	abstract readonly source: BillingWebhookSource
	abstract map(request: Request): Promise<ExternalBillingEvent[]>
}
