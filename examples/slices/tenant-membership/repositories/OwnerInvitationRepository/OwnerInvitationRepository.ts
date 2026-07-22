// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { OwnerInvitation } from '../../entities/OwnerInvitation'

export abstract class OwnerInvitationRepository extends Repository<OwnerInvitation> {
	abstract findById(id: string, tx?: Transaction): Promise<OwnerInvitation | undefined>

	// INVITATION_ALREADY_PENDING gate for C15 InviteMember — filters
	// `acceptedAt IS NULL AND expiresAt > now()`.
	abstract findPendingByOwnerAndEmail(ownerId: string, email: string, tx?: Transaction): Promise<OwnerInvitation | undefined>

	abstract findPendingByOwnerId(ownerId: string, tx?: Transaction): Promise<OwnerInvitation[]>

	// AcceptInvitation (C16) looks up by the sha256(plainToken). Storage key
	// matches the `fcm_registration_tokens_token_unq`-style unique index.
	abstract findByToken(tokenHash: string, tx?: Transaction): Promise<OwnerInvitation | undefined>
}
