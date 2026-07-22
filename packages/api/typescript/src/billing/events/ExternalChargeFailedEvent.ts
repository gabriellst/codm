// events/ExternalChargeFailedEvent.ts — "the gateway reported a failed charge" (provenance), primitives only.
import type Z from 'zod'
import { BaseDomainEvent, z } from '@template/core-typescript'

export const ExternalChargeFailedEventSchema = z.domainEvent({
	externalId: z.string().min(1), // provider event id (hook_…) — webhook dedup key
	ownerId: z.string().min(1),
	engineInvoiceId: z.string().min(1),
	amountCents: z.number().int().nonnegative(),
	gatewayTxId: z.string().min(1),
})

export type ExternalChargeFailedEventPayload = Z.infer<typeof ExternalChargeFailedEventSchema>['payload']

export class ExternalChargeFailedEvent extends BaseDomainEvent<typeof ExternalChargeFailedEventSchema> {
	static override readonly name = 'billing.payment.external_charge_failed' as const
	static readonly schema = ExternalChargeFailedEventSchema
}
