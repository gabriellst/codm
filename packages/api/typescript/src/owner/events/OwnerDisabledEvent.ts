import { BaseDomainEvent, z } from '@template/core-typescript'

export const OwnerDisabledEventSchema = z.domainEvent({
	ownerId: z.string(),
	disabledAt: z.iso.datetime({ offset: true }),
	disabledReason: z.string().optional(),
})

export class OwnerDisabledEvent extends BaseDomainEvent<typeof OwnerDisabledEventSchema> {
	static override readonly name = 'owner.disabled' as const
	static readonly schema = OwnerDisabledEventSchema
}
