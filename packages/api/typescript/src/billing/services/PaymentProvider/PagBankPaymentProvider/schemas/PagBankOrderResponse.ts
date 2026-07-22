import { z } from '@template/core-typescript'
import type Z from 'zod'
import { PagBankLinkSchema } from './PagBankLink'

// A single Pix qr_code entry on `POST /orders`. `text` (the copy-paste payload) is checked for
// presence explicitly by the provider and turned into PROVIDER_ERROR when absent — so it stays
// `.nullish()` here (the schema only enforces STRUCTURE, not that particular business invariant).
export const PagBankQrCodeSchema = z.object({
	text: z.string().nullish(),
	expiration_date: z.string().nullish(),
	links: z.array(PagBankLinkSchema).nullish(),
})

export type PagBankQrCode = Z.infer<typeof PagBankQrCodeSchema>

// Response of `POST /orders` — the one-off Pix mint. `id` is the invariant (used directly as
// `pixId`); `qr_codes` is `.nullish()` since an order can, in principle, come back without one.
export const PagBankOrderResponseSchema = z.object({
	id: z.string(),
	qr_codes: z.array(PagBankQrCodeSchema).nullish(),
})

export type PagBankOrderResponse = Z.infer<typeof PagBankOrderResponseSchema>
