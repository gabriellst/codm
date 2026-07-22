// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { Repository } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { OwnerMembership } from '../../entities/OwnerMembership'

export abstract class OwnerMembershipRepository extends Repository<OwnerMembership> {
	// Composite-PK lookup: storage PK is (ownerId, userId).
	abstract findByOwnerAndUser(ownerId: string, userId: string, tx?: Transaction): Promise<OwnerMembership | undefined>

	// `findById` accepts the composite encoded as `${ownerId}:${userId}`.
	// Throws nothing — returns undefined if the encoded id can't be unpacked
	// or no row matches. Keeps the polyglot Repository<T> shape happy.
	abstract findById(membershipId: string, tx?: Transaction): Promise<OwnerMembership | undefined>

	abstract findByOwnerId(ownerId: string, tx?: Transaction): Promise<OwnerMembership[]>
	abstract findByUserId(userId: string, tx?: Transaction): Promise<OwnerMembership[]>

	// CANNOT_REMOVE_LAST_OWNER / CANNOT_DEMOTE_LAST_OWNER use-case guard.
	abstract countOwnersByOwnerId(ownerId: string, tx?: Transaction): Promise<number>

	// ALREADY_A_MEMBER check for InviteMember (C15): join via auth.users.email.
	abstract findByOwnerAndEmail(ownerId: string, email: string, tx?: Transaction): Promise<OwnerMembership | undefined>

	abstract removeByOwnerAndUser(ownerId: string, userId: string, tx?: Transaction): Promise<void>
}
