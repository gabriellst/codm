import { z } from '@template/core-typescript'
import type Z from 'zod'

// A HATEOAS link entry PagBank attaches to checkouts/orders/qr_codes (`rel` selects the link's
// purpose — e.g. 'PAY', 'QRCODE.PNG', 'SELF'). Both fields are `.nullish()`: PagBank's link list
// shape is stable, but individual entries carrying a missing rel/href aren't an invariant this
// provider depends on — the call sites already `?.find()`/optional-chain around absence.
export const PagBankLinkSchema = z.object({
	rel: z.string().nullish(),
	href: z.string().nullish(),
})

export type PagBankLink = Z.infer<typeof PagBankLinkSchema>
