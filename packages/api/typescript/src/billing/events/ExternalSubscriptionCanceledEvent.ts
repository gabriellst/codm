// events/ExternalSubscriptionCanceledEvent.ts — "the settlement webhook reported the subscription as terminated" (provenance), primitives only.
import type Z from 'zod'
import { BaseDomainEvent, z } from '@template/core-typescript'

export const ExternalSubscriptionCanceledEventSchema = z.domainEvent({
	externalId: z.string().min(1), // settlement webhook event id — webhook dedup key
	ownerId: z.string().min(1),
	engineSubscriptionId: z.string().min(1),
})

export type ExternalSubscriptionCanceledEventPayload = Z.infer<typeof ExternalSubscriptionCanceledEventSchema>['payload']

export class ExternalSubscriptionCanceledEvent extends BaseDomainEvent<typeof ExternalSubscriptionCanceledEventSchema> {
	static override readonly name = 'billing.subscription.external_canceled' as const
	static readonly schema = ExternalSubscriptionCanceledEventSchema
}
