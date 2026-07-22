import type Z from 'zod'
import { z } from '@template/core-typescript'

// Payment resource returned by `POST /payments` (card charge + PIX creation), by
// `POST /payments/{id}/refund` (the refund sub-resource returns the same Payment shape), and by
// `GET /payments/{id}` (used by getRefundStatus — RefundReconcileJob's gateway poll — and by
// getChargebackStatus — ChargebackReconcileJob's gateway poll).
// `refunds[]` — each refund entry's OWN `id` field is NOT a stable/reliable identifier per Asaas
// docs; `endToEndIdentifier` is the stable canonical id — the same id a real webhook would carry
// for this refund (identity doctrine). Only `status: 'DONE'` refunds are effectuated;
// PENDING/CANCELLED/unknown stay out of getRefundStatus's total (fail-safe, false-negative
// preferred in money code). `value` is REAIS decimal, never cents.
// `status` (payment-level, not refund-level) is used by getChargebackStatus: a chargeback in
// progress moves the PAYMENT's own status to one of CHARGEBACK_REQUESTED/CHARGEBACK_DISPUTE/
// AWAITING_CHARGEBACK_REVERSAL.
export const AsaasPaymentResponseSchema = z.object({
	id: z.string(),
	status: z.string().nullish(),
	refunds: z
		.array(
			z.object({
				value: z.number().nullish(),
				status: z.string().nullish(),
				endToEndIdentifier: z.string().nullish(),
				id: z.string().nullish(),
			}),
		)
		.nullish(),
})

export type AsaasPaymentResponse = Z.infer<typeof AsaasPaymentResponseSchema>
