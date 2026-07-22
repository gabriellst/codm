// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { Role } from '../enums/Role'
import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const OwnerMemberRoleChangedEventSchema = z.domainEvent({
	ownerId: z.string(),
	ownerMembershipId: z.string(),
	userId: z.uuid(),
	oldRole: z.enum(Role),
	newRole: z.enum(Role),
})

export class OwnerMemberRoleChangedEvent extends BaseDomainEvent<typeof OwnerMemberRoleChangedEventSchema> {
	static override readonly name = 'owner.member.role_changed' as const
	static readonly schema = OwnerMemberRoleChangedEventSchema
}
