import Z from 'zod'
import { z } from '@template/core-typescript'

/**
 * Asaas webhook schema — the auxiliary validator for AsaasWebhookMapper.
 *
 * Modelled on the v3 `payment` resource + the `checkout` sub-resource Asaas echoes on
 * CHECKOUT_PAID deliveries. We only act on a handful of the full Asaas event catalog (the
 * `event` enum below lists the full known catalog so routing stays literal-precise and
 * self-documenting, mirroring PagarMeWebhookSchema's posture) — any other event fails
 * safeParse's enum check and the mapper no-ops on it.
 *
 * ASAAS-DOC-UNCERTAIN: the "frozen" research (plan T3) confirms the event names
 * (PAYMENT_CONFIRMED/RECEIVED/REFUNDED/CHARGEBACK_*, CHECKOUT_PAID) and that the payload
 * carries `externalReference`, but not the exact envelope shape byte-for-byte. This schema is
 * built field-for-field on the DOCUMENTED v3 payment object shape; every field besides the
 * discriminating `event`/`id`s is `.nullish()` per the project's null-bearing-payload rule
 * (the `setup_intent: null` incident) — Asaas, like Stripe, serializes absent nested fields
 * as explicit `null` in several webhook samples.
 *
 * Docs: https://docs.asaas.com/docs/webhook-events
 *       https://docs.asaas.com/reference/webhook-checkout
 */

// The full known Asaas payment + checkout event catalog. Only a subset resolves to an outcome
// (see AsaasWebhookMapper.outcomeFor) — the rest safely no-op via the dispatch table.
export const AsaasEventTypeSchema = z.enum([
	'PAYMENT_CREATED',
	'PAYMENT_UPDATED',
	'PAYMENT_CONFIRMED',
	'PAYMENT_RECEIVED',
	'PAYMENT_OVERDUE',
	'PAYMENT_DELETED',
	'PAYMENT_RESTORED',
	'PAYMENT_REFUNDED',
	'PAYMENT_REFUND_IN_PROGRESS',
	'PAYMENT_RECEIVED_IN_CASH_UNDONE',
	'PAYMENT_CHARGEBACK_REQUESTED',
	'PAYMENT_CHARGEBACK_DISPUTE',
	'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
	'PAYMENT_DUNNING_RECEIVED',
	'PAYMENT_DUNNING_REQUESTED',
	'PAYMENT_CHECKOUT_VIEWED',
	'CHECKOUT_PAID',
	'CHECKOUT_EXPIRED',
	'CHECKOUT_CANCELED',
])
export type AsaasEventType = Z.infer<typeof AsaasEventTypeSchema>

// billingType — what rail actually settled the payment. 'UNDEFINED' is Asaas' own catch-all
// for a payment method not yet chosen (never a terminal state we act on).
export const AsaasBillingTypeSchema = z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'BOLETO', 'UNDEFINED'])
export type AsaasBillingType = Z.infer<typeof AsaasBillingTypeSchema>

// The card block on a payment resource. Asaas masks the PAN (only exposes the LAST four digits
// via `creditCardNumber`, itself already masked/truncated by the gateway) and does not return
// expiry on the webhook payload — AsaasWebhookMapper.instrumentFrom fills expMonth/expYear with
// placeholders (display-only fields; never used to authorize a charge).
const AsaasCreditCardSchema = z.object({
	creditCardNumber: z.string().nullish(),
	creditCardBrand: z.string().nullish(),
	// The vaultable, reusable token — MIT/CIT charges reference it via `creditCardToken` on
	// POST /payments. Present only when tokenization was enabled for the charge (checkout vault).
	creditCardToken: z.string().nullish(),
})

// A single refund record — Asaas does not report a cumulative "amount refunded so far" the way
// Stripe does; PAYMENT_REFUNDED reports the payment's own state plus (when present) the specific
// refund entries, so the mapper reads the LATEST entry's value for a partial refund.
const AsaasRefundSchema = z.object({
	id: z.string().nullish(),
	value: z.number().nullish(),
	status: z.string().nullish(),
})

// The v3 payment resource — superset of the fields the mapper reads. EVERY optional field is
// `.nullish()`, never bare `.optional()` — see file header.
const AsaasPaymentSchema = z
	.object({
		id: z.string(),
		customer: z.string().nullish(), // the Asaas customer id (cus_…) — half of the composite pmRef
		value: z.number().nullish(), // REAIS decimal, NOT cents
		netValue: z.number().nullish(),
		billingType: AsaasBillingTypeSchema.nullish(),
		status: z.string().nullish(),
		dueDate: z.string().nullish(),
		// Set by us at checkout/payment creation to engineInvoiceId — the mapper's ownership anchor.
		// NEVER trust ownerId off the payload; only this field, resolved through InvoiceRepository.
		externalReference: z.string().nullish(),
		// Present when this payment was produced by a hosted checkout session — the signal
		// AsaasWebhookMapper uses to route PAYMENT_CONFIRMED/RECEIVED into the checkout-completed
		// path (vault + settle) instead of the plain MIT/CIT settle path.
		checkoutSession: z.string().nullish(),
		creditCard: AsaasCreditCardSchema.nullish(),
		refunds: z.array(AsaasRefundSchema).nullish(),
	})
	.loose()
export type AsaasPayment = Z.infer<typeof AsaasPaymentSchema>

// The checkout sub-resource, present on CHECKOUT_* deliveries alongside (or instead of) `payment`.
const AsaasCheckoutSchema = z
	.object({
		id: z.string(),
		status: z.string().nullish(),
		externalReference: z.string().nullish(),
		value: z.number().nullish(),
	})
	.loose()
export type AsaasCheckout = Z.infer<typeof AsaasCheckoutSchema>

// The webhook envelope. ASAAS-DOC-UNCERTAIN: Asaas deliveries are not documented to carry a
// dedicated envelope id (unlike Stripe's `evt_…`/Pagar.me's `hook_…`) — `id` is therefore
// `.nullish()` and AsaasWebhookMapper synthesizes its own dedup key from `${event}:${payment.id}`
// (stable across redeliveries of the same fact).
export const AsaasWebhookSchema = z.object({
	id: z.string().nullish(),
	event: AsaasEventTypeSchema,
	dateCreated: z.string().nullish(),
	payment: AsaasPaymentSchema.nullish(),
	checkout: AsaasCheckoutSchema.nullish(),
})
export type AsaasWebhook = Z.infer<typeof AsaasWebhookSchema>
