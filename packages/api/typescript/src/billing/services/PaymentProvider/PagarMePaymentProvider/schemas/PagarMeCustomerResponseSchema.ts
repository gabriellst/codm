import type Z from 'zod'
import { z } from '@template/core-typescript'

// v5 customers upsert response (POST /core/v5/customers, keyed by `code`). ensureCustomer never
// reads a field off this response — the upsert itself is the effect — but a malformed body should
// still fail loud instead of being silently accepted, so `id` stays as the one invariant confirming
// this is really a customer object.
export const PagarMeCustomerResponseSchema = z.object({
	id: z.string(),
})

export type PagarMeCustomerResponse = Z.infer<typeof PagarMeCustomerResponseSchema>
