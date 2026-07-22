import { z } from '@template/core-typescript'
import type Z from 'zod'
import { PagBankLinkSchema } from './PagBankLink'

// Response of `POST /checkouts` — the hosted-checkout mint. `id` is the invariant (used directly
// as `sessionRef` and interpolated into error messages); `links` is `.nullish()` because the
// caller only needs the `rel: 'PAY'` entry, resolved defensively at the call site.
export const PagBankCheckoutResponseSchema = z.object({
	id: z.string(),
	links: z.array(PagBankLinkSchema).nullish(),
})

export type PagBankCheckoutResponse = Z.infer<typeof PagBankCheckoutResponseSchema>
