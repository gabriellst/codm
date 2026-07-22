import Z from 'zod'
import { z } from '@template/core-typescript'

/**
 * PagBank/PagSeguro webhook schema — the auxiliary validator for PagBankWebhookMapper.
 *
 * Unlike Stripe/Pagar.me, PagBank has no discrete event envelope (no `id`/`type` wrapper) — every
 * delivery IS the full Order (`reference_id` + `charges[]`, plus `qr_codes[]` when the order was
 * minted for Pix), re-posted whenever a charge/qr_code changes state. `charges[]` carries BOTH
 * hosted-checkout card outcomes (this provider never charges a card any other way — see
 * PagBankPaymentProvider, chargeOffSession/chargeStoredOnSession both throw
 * PROVIDER_CAPABILITY_UNSUPPORTED) and Pix outcomes.
 *
 * EVERY optional field is `.nullish()`, never bare `.optional()` — PagBank, like Stripe, is known
 * to serialize absent fields as explicit `null` rather than omitting them (the same class of
 * incident `.nullish()` was introduced to prevent: a `.optional()` field carrying an explicit
 * `null` fails safeParse and the whole webhook silently no-ops).
 *
 * Docs: https://developer.pagbank.com.br/reference/webhook-de-pedidos
 */

export const PagBankChargeStatusSchema = z.enum(['AUTHORIZED', 'PAID', 'IN_ANALYSIS', 'DECLINED', 'CANCELED', 'WAITING'])
export type PagBankChargeStatus = Z.infer<typeof PagBankChargeStatusSchema>

export const PagBankPaymentMethodTypeSchema = z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'BOLETO'])
export type PagBankPaymentMethodType = Z.infer<typeof PagBankPaymentMethodTypeSchema>

const PagBankCardSchema = z
	.object({
		brand: z.string().nullish(),
		first_digits: z.string().nullish(),
		last_digits: z.string().nullish(),
		exp_month: z.string().nullish(),
		exp_year: z.string().nullish(),
	})
	.loose()

const PagBankPaymentMethodSchema = z
	.object({
		type: PagBankPaymentMethodTypeSchema.nullish(),
		installments: z.number().int().nullish(),
		card: PagBankCardSchema.nullish(),
	})
	.loose()

// The acquirer decline detail — `code` is the structured signal a mapper could classify into
// DeclineReason; ExternalChargeFailedEvent carries no failure detail today (same posture as the
// Stripe/Pagar.me webhook paths — see ExternalChargeFailedHandler), so it isn't consumed yet.
const PagBankPaymentResponseSchema = z
	.object({
		code: z.string().nullish(),
		message: z.string().nullish(),
		reference: z.string().nullish(),
	})
	.loose()

const PagBankAmountSchema = z.object({
	value: z.number().int().nonnegative(),
	currency: z.string().nullish(),
})

const PagBankChargeSchema = z
	.object({
		id: z.string(),
		reference_id: z.string().nullish(),
		status: PagBankChargeStatusSchema.nullish(),
		created_at: z.string().nullish(),
		paid_at: z.string().nullish(),
		amount: PagBankAmountSchema,
		payment_method: PagBankPaymentMethodSchema.nullish(),
		payment_response: PagBankPaymentResponseSchema.nullish(),
	})
	.loose()
export type PagBankCharge = Z.infer<typeof PagBankChargeSchema>

const PagBankLinkSchema = z
	.object({
		rel: z.string().nullish(),
		href: z.string().nullish(),
	})
	.loose()

const PagBankQrCodeSchema = z
	.object({
		id: z.string().nullish(),
		amount: PagBankAmountSchema.nullish(),
		expiration_date: z.string().nullish(),
		text: z.string().nullish(),
		links: z.array(PagBankLinkSchema).nullish(),
	})
	.loose()

// The webhook envelope — the full Order. `id` is the order/checkout id (the checkout dedup key —
// `ExternalCheckoutCompletedEvent.sessionRef`); `reference_id` is the engine invoice id.
export const PagBankWebhookSchema = z
	.object({
		id: z.string(),
		reference_id: z.string().nullish(),
		created_at: z.string().nullish(),
		charges: z.array(PagBankChargeSchema).nullish(),
		qr_codes: z.array(PagBankQrCodeSchema).nullish(),
	})
	.loose()
export type PagBankWebhook = Z.infer<typeof PagBankWebhookSchema>
