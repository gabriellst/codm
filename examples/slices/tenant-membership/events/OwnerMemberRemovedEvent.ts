// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { BaseDomainEvent, z } from '@template/core-typescript'

export const OwnerMemberRemovedEventSchema = z.domainEvent({
	ownerId: z.string(),
	ownerMembershipId: z.string(),
	userId: z.uuid(),
})

export class OwnerMemberRemovedEvent extends BaseDomainEvent<typeof OwnerMemberRemovedEventSchema> {
	static override readonly name = 'owner.member.removed' as const
	static readonly schema = OwnerMemberRemovedEventSchema
}
