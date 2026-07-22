import { z } from '@template/core-typescript'
import type Z from 'zod'

// Response of `POST /charges/:id/cancel`. Neither field is read by the provider today (the call
// is fire-and-forget) — both stay `.nullish()` so a lean/changed cancel payload never trips
// PROVIDER_ERROR on a call site that doesn't depend on the shape.
export const PagBankChargeCancelResponseSchema = z.object({
	id: z.string().nullish(),
	status: z.string().nullish(),
})

export type PagBankChargeCancelResponse = Z.infer<typeof PagBankChargeCancelResponseSchema>
