import Z from 'zod'
import { z } from '@template/core-typescript'

/**
 * Pagar.me API v5 webhook schema — the auxiliary validator for PagarMeWebhookMapper.
 *
 * Modelled field-for-field on the v5 resource objects (charge / order) with literal-precise
 * enums. The official Node SDK (@pagarme/pagarme-nodejs-sdk) types API *responses*, not
 * inbound webhooks, and TS types can't validate at runtime — so webhook ingress is validated
 * with Zod here, aligned to the same v5 model the SDK exposes.
 *
 * Docs: https://docs.pagar.me/reference/eventos-de-webhook-1
 *       https://docs.pagar.me/reference/visão-geral-sobre-webhooks
 *       https://docs.pagar.me/reference/exemplo-de-webhook-1
 */

// The full v5 webhook event catalog. We only act on charge/order outcomes, but the union
// stays exhaustive so routing is literal-precise and self-documenting.
export const PagarMeEventTypeSchema = z.enum([
	'customer.created',
	'customer.updated',
	'card.created',
	'card.updated',
	'card.deleted',
	'card.expired',
	'address.created',
	'address.updated',
	'address.deleted',
	'plan.created',
	'plan.updated',
	'plan.deleted',
	'plan_item.created',
	'plan_item.updated',
	'plan_item.deleted',
	'subscription.created',
	'subscription.canceled',
	'subscription_item.created',
	'subscription_item.updated',
	'subscription_item.deleted',
	'discount.created',
	'discount.deleted',
	'increment.created',
	'increment.deleted',
	'order.created',
	'order.paid',
	'order.payment_failed',
	'order.canceled',
	'order.closed',
	'order.updated',
	'order_item.created',
	'order_item.updated',
	'order_item.deleted',
	'invoice.created',
	'invoice.updated',
	'invoice.paid',
	'invoice.payment_failed',
	'invoice.canceled',
	'charge.created',
	'charge.updated',
	'charge.paid',
	'charge.payment_failed',
	'charge.refunded',
	'charge.pending',
	'charge.processing',
	'charge.underpaid',
	'charge.overpaid',
	'charge.partial_canceled',
	'charge.chargedback',
	'charge.antifraud_approved',
	'charge.antifraud_reproved',
	'charge.antifraud_manual',
	'charge.antifraud_pending',
	'usage.created',
	'usage.deleted',
	'recipient.created',
	'recipient.updated',
	'recipient.deleted',
	'bank_account.created',
	'bank_account.updated',
	'bank_account.deleted',
	'checkout.created',
	'checkout.canceled',
	'checkout.closed',
])
export type PagarMeEventType = Z.infer<typeof PagarMeEventTypeSchema>

// charge.payment_method (v5)
export const PagarMePaymentMethodSchema = z.enum(['credit_card', 'debit_card', 'pix', 'boleto', 'voucher', 'cash', 'checkout'])
export type PagarMePaymentMethod = Z.infer<typeof PagarMePaymentMethodSchema>

// charge.status (v5)
export const PagarMeChargeStatusSchema = z.enum([
	'pending',
	'paid',
	'processing',
	'canceled',
	'failed',
	'overpaid',
	'underpaid',
	'refunded',
	'chargedback',
	'partial_canceled',
])
export type PagarMeChargeStatus = Z.infer<typeof PagarMeChargeStatusSchema>

// order.status (v5)
export const PagarMeOrderStatusSchema = z.enum(['pending', 'paid', 'payment_failed', 'canceled', 'processing', 'failed', 'closed'])
export type PagarMeOrderStatus = Z.infer<typeof PagarMeOrderStatusSchema>

const PagarMeCustomerSchema = z.object({
	id: z.string().optional(),
	name: z.string().optional(),
	email: z.string().optional(),
	document: z.string().optional(),
	type: z.string().optional(),
	// PAGARME-DOC-UNCERTAIN: the reference doesn't confirm the webhook echoes back the `code` we
	// upsert the gateway customer under (ensureCustomer + createCheckoutSession's
	// customer_settings both key it by `code: ownerId`). Modelled nullish so the mapper can
	// correlate a checkout-originated order back to its ownerId when the field is present,
	// without ever requiring it.
	code: z.string().nullish(),
})

const PagarMeCardSchema = z.object({
	id: z.string().optional(),
	first_six_digits: z.string().optional(),
	last_four_digits: z.string().optional(),
	brand: z.string().optional(),
	exp_month: z.number().int().optional(),
	exp_year: z.number().int().optional(),
	holder_name: z.string().optional(),
})

// charge.last_transaction — superset of the card + pix fields we read. The gateway only
// populates the ones relevant to the charge's payment_method, so all are optional.
const PagarMeLastTransactionSchema = z.object({
	id: z.string().optional(),
	transaction_type: z.string().optional(),
	gateway_id: z.string().optional(),
	amount: z.number().int().nonnegative().optional(),
	status: z.string().optional(),
	success: z.boolean().optional(),
	// pix
	qr_code: z.string().optional(),
	qr_code_url: z.string().optional(),
	expires_at: z.string().optional(),
	end_to_end_id: z.string().optional(),
	// card
	installments: z.number().int().positive().optional(),
	acquirer_tid: z.string().optional(),
	acquirer_nsu: z.string().optional(),
	acquirer_auth_code: z.string().optional(),
	acquirer_message: z.string().optional(),
	card: PagarMeCardSchema.optional(),
})

// A v5 charge.
export const PagarMeChargeSchema = z.object({
	object: z.literal('charge').optional(),
	id: z.string(),
	code: z.string().optional(),
	gateway_id: z.string().optional(),
	amount: z.number().int().nonnegative().optional(),
	paid_amount: z.number().int().nonnegative().optional(),
	// The amount canceled/refunded on this charge. Confirmed against the official docs/SDK v5:
	// there is NO 'refunded' charge status — a refund is represented as status:"canceled" +
	// `canceled_amount > 0` (a `canceled` charge with no `canceled_amount` is a pure cancel).
	// Used by PagarMeEventSource to discriminate refund from pure-cancel on the window sweep.
	canceled_amount: z.number().int().nonnegative().optional(),
	currency: z.string().optional(),
	status: PagarMeChargeStatusSchema.optional(),
	payment_method: PagarMePaymentMethodSchema.optional(),
	paid_at: z.string().optional(),
	created_at: z.string().optional(),
	customer: PagarMeCustomerSchema.optional(),
	last_transaction: PagarMeLastTransactionSchema.optional(),
})
export type PagarMeCharge = Z.infer<typeof PagarMeChargeSchema>

// PAGARME-DOC-UNCERTAIN: the v5 webhook reference doesn't document whether/how an order
// created from a Payment Link (`POST /core/v5/paymentlinks`) back-references the link's id
// (`pl_…`) on the resulting order payload. Modelled as a nullish nested object (best-guess
// shape) so the mapper can *try* to correlate the checkout session to the link id when present,
// and gracefully fall back to `order:<id>` when it isn't — see PagarMeWebhookMapper.
const PagarMeCheckoutRefSchema = z.object({
	id: z.string().nullish(),
})

// A v5 order — carries its charges[]. `charges` is required so the envelope union below can
// distinguish an order (order.* events) from a bare charge (charge.* events).
export const PagarMeOrderSchema = z.object({
	object: z.literal('order').optional(),
	id: z.string(),
	code: z.string().optional(),
	amount: z.number().int().nonnegative().optional(),
	currency: z.string().optional(),
	status: PagarMeOrderStatusSchema.optional(),
	closed: z.boolean().optional(),
	customer: PagarMeCustomerSchema.optional(),
	charges: z.array(PagarMeChargeSchema),
	// PAGARME-DOC-UNCERTAIN — see PagarMeCheckoutRefSchema above.
	checkout: PagarMeCheckoutRefSchema.nullish(),
})
export type PagarMeOrder = Z.infer<typeof PagarMeOrderSchema>

// The webhook envelope. `data` is an order (order.* events, has the required `charges`) or a
// charge (charge.* events) — order is tried first so a bare charge falls through to the charge schema.
export const PagarMeWebhookSchema = z.object({
	id: z.string(),
	account: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
	type: PagarMeEventTypeSchema,
	created_at: z.string().optional(),
	data: z.union([PagarMeOrderSchema, PagarMeChargeSchema]),
})
export type PagarMeWebhook = Z.infer<typeof PagarMeWebhookSchema>
