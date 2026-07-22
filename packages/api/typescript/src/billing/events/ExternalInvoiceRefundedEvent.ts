// events/ExternalInvoiceRefundedEvent.ts — "the settlement webhook reported an invoice as refunded/voided" (provenance), primitives only.
import type Z from 'zod'
import { BaseDomainEvent, z } from '@template/core-typescript'

export const ExternalInvoiceRefundedEventSchema = z.domainEvent({
	externalId: z.string().min(1), // settlement webhook event id — webhook dedup key
	ownerId: z.string().min(1),
	engineInvoiceId: z.string().min(1),
})

export type ExternalInvoiceRefundedEventPayload = Z.infer<typeof ExternalInvoiceRefundedEventSchema>['payload']

export class ExternalInvoiceRefundedEvent extends BaseDomainEvent<typeof ExternalInvoiceRefundedEventSchema> {
	static override readonly name = 'billing.invoice.external_refunded' as const
	static readonly schema = ExternalInvoiceRefundedEventSchema
}
