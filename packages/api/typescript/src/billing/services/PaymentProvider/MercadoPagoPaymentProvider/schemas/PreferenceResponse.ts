import { z } from '@template/core-typescript'
import type Z from 'zod'

// Response of `POST /checkout/preferences` — the Checkout Pro session mint. Both fields are
// invariants: `id` is returned directly as `sessionRef` and `init_point` as the redirect `url` —
// neither has a fallback at the call site, so a missing field must fail loud instead of handing
// the caller `undefined`.
export const MercadoPagoPreferenceResponseSchema = z.object({
	id: z.string(),
	init_point: z.string(),
})

export type MercadoPagoPreferenceResponse = Z.infer<typeof MercadoPagoPreferenceResponseSchema>
