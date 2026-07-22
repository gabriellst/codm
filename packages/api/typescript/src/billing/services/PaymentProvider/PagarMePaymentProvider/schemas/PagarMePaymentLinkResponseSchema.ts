import type Z from 'zod'
import { z } from '@template/core-typescript'

// v5 paymentlinks response for `type: 'order'`. `id` + `url` are invariants — createCheckoutSession
// reads both unconditionally to build the CheckoutSessionResult; `expires_in` is optional — its
// absence just means the returned session carries no `expiresAt`.
export const PagarMePaymentLinkResponseSchema = z.object({
	id: z.string(),
	url: z.string(),
	expires_in: z.number().nullish(),
})

export type PagarMePaymentLinkResponse = Z.infer<typeof PagarMePaymentLinkResponseSchema>
