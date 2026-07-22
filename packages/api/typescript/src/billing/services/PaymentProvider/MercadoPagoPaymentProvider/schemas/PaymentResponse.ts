import { z } from '@template/core-typescript'
import type Z from 'zod'

// Response of `POST /v1/payments` — the Pix payment mint. `id` is the invariant (consumed
// directly via `String(r.id)` as `pixId`, no fallback); everything else is `.nullish()` because
// createPix already degrades gracefully — empty qr/copyPaste + a computed 24h expiry — when the
// gateway omits `point_of_interaction`/`date_of_expiration`.
export const MercadoPagoPaymentResponseSchema = z.object({
	id: z.union([z.string(), z.number()]),
	status: z.string().nullish(),
	point_of_interaction: z
		.object({
			transaction_data: z
				.object({
					qr_code: z.string().nullish(),
					qr_code_base64: z.string().nullish(),
				})
				.nullish(),
		})
		.nullish(),
	date_of_expiration: z.string().nullish(),
	// GET /v1/payments/{id} refund-status fields — used by getRefundStatus (RefundReconcileJob's
	// gateway poll). `transaction_amount_refunded` is the ACCUMULATED total (reais decimal, not
	// cents) refunded to date on this payment — confirmed against the official Payments API
	// (2026-07-15). `refunds[]` lists each individual refund with its own `id` (canonical — the
	// same id a webhook would carry for this refund) and `amount` (reais decimal).
	// `id` is `.nullish()` (not required): a refund entry arriving without one must not fail the
	// WHOLE payment parse (that would make getRefundStatus throw on an otherwise-healthy payload).
	// getRefundStatus is the one that decides what to do with an id-less refund entry — it excludes
	// it from `refunds[]` (never fabricate an id) while the total still comes from the accumulated
	// `transaction_amount_refunded`, not from summing this array.
	transaction_amount_refunded: z.number().nullish(),
	refunds: z
		.array(
			z.object({
				id: z.union([z.string(), z.number()]).nullish(),
				amount: z.number().nullish(),
			}),
		)
		.nullish(),
})

export type MercadoPagoPaymentResponse = Z.infer<typeof MercadoPagoPaymentResponseSchema>
