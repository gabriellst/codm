import { BaseDomainEvent, z } from '@template/core-typescript'
import { PlanName } from '@template/contracts-typescript/wire/enums'

export const SubscriptionCreatedEventSchema = z.domainEvent({
	ownerId: z.string().min(1),
	planName: z.enum(PlanName),
	subscriptionId: z.string().min(1),
})

export class SubscriptionCreatedEvent extends BaseDomainEvent<typeof SubscriptionCreatedEventSchema> {
	static override readonly name = 'billing.subscription.created' as const
	static readonly schema = SubscriptionCreatedEventSchema
}
