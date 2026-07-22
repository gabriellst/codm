// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { Role } from '../enums/Role'
import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const OwnerMemberInvitedEventSchema = z.domainEvent({
	ownerId: z.string(),
	ownerInvitationId: z.string(),
	email: z.string(),
	role: z.enum(Role),
	// Plain invitation token — present ONLY on the event payload (handed off
	// to the email-delivery handler), never persisted. The aggregate owners
	// sha256(invitationToken) and verifies on accept().
	invitationToken: z.string(),
})

export class OwnerMemberInvitedEvent extends BaseDomainEvent<typeof OwnerMemberInvitedEventSchema> {
	static override readonly name = 'owner.member.invited' as const
	static readonly schema = OwnerMemberInvitedEventSchema
}
