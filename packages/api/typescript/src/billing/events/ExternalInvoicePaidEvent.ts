// events/ExternalInvoicePaidEvent.ts — "the settlement webhook reported an invoice as paid" (provenance), primitives only.
import type Z from 'zod'
import { BaseDomainEvent, z } from '@template/core-typescript'

export const ExternalInvoicePaidEventSchema = z.domainEvent({
	externalId: z.string().min(1), // settlement webhook event id — webhook dedup key
	ownerId: z.string().min(1),
	engineInvoiceId: z.string().min(1),
	amountCents: z.number().int().nonnegative(),
})

export type ExternalInvoicePaidEventPayload = Z.infer<typeof ExternalInvoicePaidEventSchema>['payload']

export class ExternalInvoicePaidEvent extends BaseDomainEvent<typeof ExternalInvoicePaidEventSchema> {
	static override readonly name = 'billing.invoice.external_paid' as const
	static readonly schema = ExternalInvoicePaidEventSchema
}
