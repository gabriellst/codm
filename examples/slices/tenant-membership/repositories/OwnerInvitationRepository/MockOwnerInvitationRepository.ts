// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { OwnerInvitation } from '../../entities/OwnerInvitation'
import { OwnerInvitationRepository } from './OwnerInvitationRepository'

@injectable()
export class MockOwnerInvitationRepository extends OwnerInvitationRepository {
	private invitations = new Map<string, OwnerInvitation>()

	async findById(id: string, _tx?: Transaction): Promise<OwnerInvitation | undefined> {
		return this.invitations.get(id)
	}

	async findPendingByOwnerAndEmail(ownerId: string, email: string, _tx?: Transaction): Promise<OwnerInvitation | undefined> {
		for (const inv of this.invitations.values()) {
			if (inv.ownerId.value === ownerId && inv.email === email && inv.isPending()) return inv
		}
		return undefined
	}

	async findPendingByOwnerId(ownerId: string, _tx?: Transaction): Promise<OwnerInvitation[]> {
		const out: OwnerInvitation[] = []
		for (const inv of this.invitations.values()) {
			if (inv.ownerId.value === ownerId && inv.isPending()) out.push(inv)
		}
		return out
	}

	async findByToken(tokenHash: string, _tx?: Transaction): Promise<OwnerInvitation | undefined> {
		for (const inv of this.invitations.values()) {
			if (inv.token === tokenHash) return inv
		}
		return undefined
	}

	async save(entity: OwnerInvitation, _tx?: Transaction): Promise<OwnerInvitation> {
		this.invitations.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.invitations.delete(id)
	}

	seed(inv: OwnerInvitation): void {
		this.invitations.set(inv.id.value, inv)
	}

	clear(): void {
		this.invitations.clear()
	}
}
