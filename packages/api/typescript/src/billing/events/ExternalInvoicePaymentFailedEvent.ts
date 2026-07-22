// events/ExternalInvoicePaymentFailedEvent.ts — "the settlement webhook reported an invoice payment failure" (provenance), primitives only.
import type Z from 'zod'
import { BaseDomainEvent, z } from '@template/core-typescript'

export const ExternalInvoicePaymentFailedEventSchema = z.domainEvent({
	externalId: z.string().min(1), // settlement webhook event id — webhook dedup key
	ownerId: z.string().min(1),
	engineInvoiceId: z.string().min(1),
	reason: z.string(),
})

export type ExternalInvoicePaymentFailedEventPayload = Z.infer<typeof ExternalInvoicePaymentFailedEventSchema>['payload']

export class ExternalInvoicePaymentFailedEvent extends BaseDomainEvent<typeof ExternalInvoicePaymentFailedEventSchema> {
	static override readonly name = 'billing.invoice.external_payment_failed' as const
	static readonly schema = ExternalInvoicePaymentFailedEventSchema
}
