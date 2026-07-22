// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { AggregateRoot, Id, z } from '@codedm/core-typescript'
import Z from 'zod'
import { Role as OwnerRole } from '../enums/Role'

const OwnerMembershipSchema = z.object({
	ownerId: z.instance(Id),
	userId: z.instance(Id),
	role: z.enum(OwnerRole),
	lastAccess: z.date().optional(),
})

export type OwnerMembershipProps = Z.infer<typeof OwnerMembershipSchema>

export class OwnerMembership extends AggregateRoot<typeof OwnerMembershipSchema> {
	static override schema = OwnerMembershipSchema

	static forOwner(data: { ownerId: string; userId: string }): OwnerMembership {
		return new OwnerMembership({
			ownerId: data.ownerId,
			userId: data.userId,
			role: OwnerRole.RESPONSIBLE,
			lastAccess: new Date(),
		})
	}

	static forInvitee(data: { ownerId: string; userId: string; role: OwnerRole }): OwnerMembership {
		return new OwnerMembership({
			ownerId: data.ownerId,
			userId: data.userId,
			role: data.role,
		})
	}

	// Pure setter — the CANNOT_DEMOTE_LAST_OWNER guard lives in the use case
	// where `countOwnersByOwnerId` is available (entity has no global state).
	changeRole(newRole: OwnerRole): void {
		this.role = newRole
		this.validate()
	}

	touchAccess(at: Date = new Date()): void {
		this.lastAccess = at
		this.validate()
	}
}

export interface OwnerMembership extends OwnerMembershipProps {}
