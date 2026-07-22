// Internal (domain-event) handlers for the billing context — ALL of them registered here: every
// event they consume is a billing DOMAIN event dispatched through the InternalMediator (external.ts
// stays for cross-context integration events, of which billing consumes none). An exported class in
// this barrel is what BoundedContext.create registers; a handler file that is not exported here is
// DEAD wiring (the final-critic finding that motivated this list being exhaustive).

// Webhook-ingest facts → invoice/charge settlement ("derive, don't flip").
export { ExternalInvoiceIssuedHandler } from './ExternalInvoiceIssuedHandler'
export { ExternalInvoicePaidHandler } from './ExternalInvoicePaidHandler'
export { ExternalInvoicePaymentFailedHandler } from './ExternalInvoicePaymentFailedHandler'
export { ExternalCardChargeSucceededHandler } from './ExternalCardChargeSucceededHandler'
export { ExternalChargeFailedHandler } from './ExternalChargeFailedHandler'
export { ExternalCheckoutCompletedHandler } from './ExternalCheckoutCompletedHandler'
export { ExternalPixPaidHandler } from './ExternalPixPaidHandler'

// Settlement outcomes → subscription posture + dunning lifecycle.
export { InvoicePaidHandler } from './InvoicePaidHandler'
export { InvoicePaymentFailedHandler } from './InvoicePaymentFailedHandler'
export { DunningStartedHandler } from './DunningStartedHandler'
export { DunningAttemptFailedHandler } from './DunningAttemptFailedHandler'
export { DunningSucceededHandler } from './DunningSucceededHandler'
export { DunningFailedHandler } from './DunningFailedHandler'

// Dispute/refund credit-note handlers: each reacts to one CONFIRMED gateway fact and books/reverses
// an immutable credit note (or closes a Dispute PROCESS record).
export { ExternalChargeRefundedHandler } from './ExternalChargeRefundedHandler'
export { ExternalChargeDisputedHandler } from './ExternalChargeDisputedHandler'
export { ExternalChargeDisputeWonHandler } from './ExternalChargeDisputeWonHandler'
export { ExternalChargeDisputeLostHandler } from './ExternalChargeDisputeLostHandler'
export { ExternalInvoiceRefundedHandler } from './ExternalInvoiceRefundedHandler'
