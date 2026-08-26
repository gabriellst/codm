import { BaseDomainEvent, z } from '@codm/core-typescript'

export const OwnerCreatedEventSchema = z.domainEvent({
	ownerId: z.string(),
	name: z.string(),
})

export class OwnerCreatedEvent extends BaseDomainEvent<typeof OwnerCreatedEventSchema> {
	static override readonly name = 'owner.created' as const
	static readonly schema = OwnerCreatedEventSchema
}
