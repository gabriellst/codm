import type Z from 'zod'
import { z } from '@template/core-typescript'
import { AsaasCustomerResponseSchema } from './AsaasCustomerResponseSchema'

// Envelope returned by `GET /customers?externalReference=...` — the provider only reads the
// first match (if any) to resolve an existing gateway customer keyed by ownerId.
export const AsaasCustomerSearchResponseSchema = z.object({
	data: z.array(AsaasCustomerResponseSchema),
})

export type AsaasCustomerSearchResponse = Z.infer<typeof AsaasCustomerSearchResponseSchema>
