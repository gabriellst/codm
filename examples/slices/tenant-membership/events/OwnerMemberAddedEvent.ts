// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { Role } from '../enums/Role'
import { BaseDomainEvent, z } from '@template/core-typescript'

export const OwnerMemberAddedEventSchema = z.domainEvent({
	ownerId: z.string(),
	ownerMembershipId: z.string(),
	userId: z.uuid(),
	role: z.enum(Role),
})

export class OwnerMemberAddedEvent extends BaseDomainEvent<typeof OwnerMemberAddedEventSchema> {
	static override readonly name = 'owner.member.added' as const
	static readonly schema = OwnerMemberAddedEventSchema
}
