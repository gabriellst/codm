import type Z from 'zod'
import { z } from '@template/core-typescript'

// Checkout session resource returned by `POST /checkouts` — `id` is the session ref the hosted
// checkout URL (`checkoutSession/show?id=`) is built from.
export const AsaasCheckoutResponseSchema = z.object({
	id: z.string(),
})

export type AsaasCheckoutResponse = Z.infer<typeof AsaasCheckoutResponseSchema>
