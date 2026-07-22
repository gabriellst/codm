// events/ExternalPixPaidEvent.ts — "the gateway settled a one-off Pix payment" (provenance), primitives only.
import type Z from 'zod'
import { BaseDomainEvent, z } from '@template/core-typescript'

export const ExternalPixPaidEventSchema = z.domainEvent({
	externalId: z.string().min(1), // provider event id (hook_…) — webhook dedup key
	ownerId: z.string().min(1),
	engineInvoiceId: z.string().min(1),
	amountCents: z.number().int().nonnegative(),
	gatewayTxId: z.string().min(1),
})

export type ExternalPixPaidEventPayload = Z.infer<typeof ExternalPixPaidEventSchema>['payload']

export class ExternalPixPaidEvent extends BaseDomainEvent<typeof ExternalPixPaidEventSchema> {
	static override readonly name = 'billing.payment.external_pix_paid' as const
	static readonly schema = ExternalPixPaidEventSchema
}
