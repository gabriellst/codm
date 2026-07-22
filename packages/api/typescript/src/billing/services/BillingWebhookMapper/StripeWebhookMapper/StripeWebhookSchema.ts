import Z from 'zod'
import { z } from '@template/core-typescript'

/**
 * Stripe webhook schema — the auxiliary validator for StripeWebhookMapper.
 *
 * We only act on a handful of the ~250 Stripe event types, so the `type` enum lists ONLY those;
 * any other event fails safeParse and the mapper no-ops on it. The SDK types the objects, but a
 * Zod schema validates the inbound body at runtime (the same posture PagarMeWebhookSchema takes).
 *
 * Docs: https://docs.stripe.com/api/events/types
 */

// The event types that resolve to an internal outcome. The PI/charge/dispute family covers our
// own PaymentIntent pipeline; the Stripe Billing family (invoice.* / customer.subscription.*)
// covers gateway-managed subscriptions — those objects carry OUR ids via the same metadata-stamp
// convention as PaymentIntents (engineInvoiceId / engineSubscriptionId + ownerId), and resolve to
// the invoice-level / subscription-level External events (the B3 seam: ExternalInvoicePaid /
// PaymentFailed / Refunded, ExternalSubscriptionActivated / Canceled).
export const StripeEventTypeSchema = z.enum([
	'payment_intent.succeeded',
	'payment_intent.payment_failed',
	'charge.refunded',
	'charge.dispute.created',
	'charge.dispute.closed',
	'checkout.session.completed',
	'invoice.paid',
	'invoice.payment_failed',
	'invoice.voided',
	'customer.subscription.updated',
	'customer.subscription.deleted',
])
export type StripeEventType = Z.infer<typeof StripeEventTypeSchema>

// engineInvoiceId is set as metadata on every PaymentIntent we create; the mapper reads it off
// PI events and resolves ownerId from the Invoice by it — ownerId is NEVER trusted off the
// payload (the invoice is the single source of truth for invoice ownership), even though the
// provider also stamps it here for the off-session/CIT path.
const StripeMetadataSchema = z
	.object({
		ownerId: z.string().optional(),
		engineInvoiceId: z.string().optional(),
		// Stamped on gateway-managed Subscriptions at mint (same convention as engineInvoiceId on
		// PaymentIntents). customer.subscription.* events resolve OUR subscription through it —
		// verified against the stored Subscription record, never trusted alone.
		engineSubscriptionId: z.string().optional(),
	})
	.loose()

// Card details, present when the payment_method is expanded on the event.
const StripeCardSchema = z.object({
	brand: z.string().nullish(),
	last4: z.string().nullish(),
	exp_month: z.number().int().nullish(),
	exp_year: z.number().int().nullish(),
})

// payment_method may arrive as a bare id (string) or an expanded object.
const StripePaymentMethodSchema = z.object({
	id: z.string().nullish(),
	card: StripeCardSchema.nullish(),
})

// The event's data.object — a PaymentIntent or a Charge (superset of the fields we read). Pix is
// detected off `payment_method_types` / `payment_method_details.type`.
//
// EVERY optional field here is `.nullish()`, never bare `.optional()`: Stripe serializes absent
// fields as EXPLICIT `null` (a payment-mode Checkout Session carries `setup_intent: null`), and
// `.optional()` rejects null — which silently no-op'd every checkout.session.completed and left
// paid subscriptions INCOMPLETE (the synthetic test payloads omitted the fields, hiding it).
export const StripeEventObjectSchema = z
	.object({
		id: z.string(),
		amount: z.number().int().nonnegative().nullish(),
		amount_received: z.number().int().nonnegative().nullish(),
		amount_refunded: z.number().int().nonnegative().nullish(),
		// On an Invoice (invoice.paid) the amount actually collected — what ExternalInvoicePaidEvent
		// reports as amountCents (Stripe invoices are already in cents for BRL/USD-style currencies).
		amount_paid: z.number().int().nonnegative().nullish(),
		// On a Dispute (charge.dispute.*) the dispute's lifecycle status. `charge.dispute.closed`
		// with `won` restores the funds (→ DISPUTE_WON); `lost` closes the Dispute PROCESS record
		// without touching the chargeback CN (→ DISPUTE_LOST). `amount` on a Dispute is the disputed
		// amount. On a Subscription (customer.subscription.updated) the subscription's lifecycle
		// status — only `active` maps (→ ExternalSubscriptionActivatedEvent).
		status: z.string().nullish(),
		currency: z.string().nullish(),
		metadata: StripeMetadataSchema.nullish(),
		payment_method_types: z.array(z.string()).nullish(),
		payment_method: z.union([z.string(), StripePaymentMethodSchema]).nullish(),
		payment_method_details: z.object({ type: z.string().nullish(), card: StripeCardSchema.nullish() }).nullish(),
		// On a Charge (charge.refunded) or Dispute (charge.dispute.created) the PARENT PaymentIntent id.
		// Those objects carry NONE of our metadata, so the mapper retrieves the PI to read the
		// engineInvoiceId off it (may arrive as a bare id or, if expanded, an object).
		payment_intent: z.union([z.string(), z.object({ id: z.string().nullish() }).loose()]).nullish(),
		// On a Charge (charge.refunded) the refunds performed against it. Stripe's list objects are
		// ordered newest-first, so `.data[0].id` (re_…) is the refund THIS webhook fired for — the
		// canonical gateway refund id, the credit-note dedup key shared with reconciliation.
		refunds: z
			.object({ data: z.array(z.object({ id: z.string() }).loose()).nullish() })
			.loose()
			.nullish(),
		// Checkout Session fields (checkout.session.completed)
		mode: z.enum(['payment', 'setup', 'subscription']).nullish(),
		setup_intent: z.union([z.string(), z.object({ id: z.string().nullish() }).loose()]).nullish(),
		amount_total: z.number().int().nonnegative().nullish(),
	})
	.loose()
export type StripeEventObject = Z.infer<typeof StripeEventObjectSchema>

// The event envelope. `id` (evt_…) is the webhook dedup key.
export const StripeWebhookSchema = z.object({
	id: z.string(),
	object: z.literal('event').optional(),
	type: StripeEventTypeSchema,
	data: z.object({ object: StripeEventObjectSchema }),
})
export type StripeWebhook = Z.infer<typeof StripeWebhookSchema>
