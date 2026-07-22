import { Repository } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { Owner } from '../../entities/Owner'

export abstract class OwnerRepository extends Repository<Owner> {
	abstract findById(id: string, tx?: Transaction): Promise<Owner | undefined>
	// Tenancy read for the OwnerDirectory port. `ownerId === id` (shared identity).
	abstract findByOwnerId(ownerId: string, tx?: Transaction): Promise<Owner | null>
	// All Owners this user answers for (Owner.responsibleUserId === userId). Feeds
	// GetUserInfo — the base's single-responsible-user replacement for a member list.
	abstract findByResponsibleUserId(userId: string, tx?: Transaction): Promise<Owner[]>
}
