import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const OwnerEnabledEventSchema = z.domainEvent({
	ownerId: z.string(),
	enabledAt: z.iso.datetime({ offset: true }),
})

export class OwnerEnabledEvent extends BaseDomainEvent<typeof OwnerEnabledEventSchema> {
	static override readonly name = 'owner.enabled' as const
	static readonly schema = OwnerEnabledEventSchema
}
