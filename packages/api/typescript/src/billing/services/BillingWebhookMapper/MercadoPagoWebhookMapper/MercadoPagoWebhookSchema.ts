import Z from 'zod'
import { z } from '@template/core-typescript'

/**
 * MercadoPago webhook schema — the auxiliary validator for MercadoPagoWebhookMapper.
 *
 * MercadoPago's notification payload is intentionally THIN — it carries only `data.id` (the
 * resource id) + `type` (the topic, e.g. 'payment'); the mapper re-fetches the full resource via
 * `GET /v1/payments/{id}` (same posture as StripeWebhookMapper's PaymentIntent retrieve on the
 * charge.refunded/dispute paths). We only act on the 'payment' topic; other topics
 * (merchant_order, etc.) no-op in the mapper.
 *
 * EVERY field besides `data.id` is `.nullish()`, never bare `.optional()` — MercadoPago's own
 * example payload documents several fields as explicitly absent/null depending on delivery
 * version, and `.optional()` would reject an explicit `null` (the lesson from the Stripe
 * `setup_intent: null` incident).
 *
 * Docs: https://www.mercadopago.com.br/developers/en/docs/checkout-api/webhooks
 */
export const MercadoPagoWebhookSchema = z.object({
	id: z.union([z.string(), z.number()]).nullish(), // notification/delivery id — dedup fallback
	action: z.string().nullish(), // e.g. 'payment.created', 'payment.updated'
	api_version: z.string().nullish(),
	// The only field guaranteed present — the resource id the mapper re-fetches.
	data: z.object({ id: z.union([z.string(), z.number()]) }),
	date_created: z.string().nullish(),
	live_mode: z.boolean().nullish(),
	type: z.string().nullish(), // topic — 'payment' is the only one this mapper acts on
	user_id: z.union([z.string(), z.number()]).nullish(),
})
export type MercadoPagoWebhook = Z.infer<typeof MercadoPagoWebhookSchema>
