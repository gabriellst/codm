import type Z from 'zod'
import { z } from '@template/core-typescript'

// Customer resource returned by `POST /customers` (create) and `POST /customers/{id}` (update —
// ASAAS-DOC-UNCERTAIN: no PUT verb documented for this resource). `id` is the only invariant the
// provider reads today.
export const AsaasCustomerResponseSchema = z.object({
	id: z.string(),
})

export type AsaasCustomerResponse = Z.infer<typeof AsaasCustomerResponseSchema>
