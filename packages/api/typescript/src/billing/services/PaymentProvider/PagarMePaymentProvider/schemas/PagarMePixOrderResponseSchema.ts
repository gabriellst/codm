import type Z from 'zod'
import { z } from '@template/core-typescript'

// v5 order response when `payments: [{ payment_method: 'pix' }]` — only the Pix-specific fields
// createPix reads off `charges[0].last_transaction`. `id` is the only invariant (always returned
// as `pixId`); the qr/expiry fields are lenient — createPix already falls back when they're absent.
export const PagarMePixOrderResponseSchema = z.object({
	id: z.string(),
	charges: z
		.array(
			z.object({
				last_transaction: z
					.object({
						qr_code: z.string().nullish(),
						qr_code_url: z.string().nullish(),
						expires_at: z.string().nullish(),
					})
					.nullish(),
			}),
		)
		.nullish(),
})

export type PagarMePixOrderResponse = Z.infer<typeof PagarMePixOrderResponseSchema>
