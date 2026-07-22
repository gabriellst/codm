// events/ExternalSubscriptionActivatedEvent.ts — "the settlement webhook reported the subscription as active" (provenance), primitives only.
import type Z from 'zod'
import { BaseDomainEvent, z } from '@template/core-typescript'

export const ExternalSubscriptionActivatedEventSchema = z.domainEvent({
	externalId: z.string().min(1), // settlement webhook event id — webhook dedup key
	ownerId: z.string().min(1),
	engineSubscriptionId: z.string().min(1),
})

export type ExternalSubscriptionActivatedEventPayload = Z.infer<typeof ExternalSubscriptionActivatedEventSchema>['payload']

export class ExternalSubscriptionActivatedEvent extends BaseDomainEvent<typeof ExternalSubscriptionActivatedEventSchema> {
	static override readonly name = 'billing.subscription.external_activated' as const
	static readonly schema = ExternalSubscriptionActivatedEventSchema
}
