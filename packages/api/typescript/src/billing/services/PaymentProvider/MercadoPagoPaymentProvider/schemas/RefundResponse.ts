import { z } from '@template/core-typescript'
import type Z from 'zod'

// Response of `POST /v1/payments/{id}/refunds`. cancelCharge reads no field off it — the refund
// is fire-and-forget once the gateway accepts it — but the body still passes through
// `parseGatewayResponse` so a malformed/error payload surfaces as PROVIDER_ERROR instead of
// silently succeeding. Both fields `.nullish()` since neither is consumed (no invariant to enforce).
export const MercadoPagoRefundResponseSchema = z.object({
	id: z.union([z.string(), z.number()]).nullish(),
	status: z.string().nullish(),
})

export type MercadoPagoRefundResponse = Z.infer<typeof MercadoPagoRefundResponseSchema>
