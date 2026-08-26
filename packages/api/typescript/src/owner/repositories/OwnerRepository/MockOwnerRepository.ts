import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import { Owner } from '../../entities/Owner'
import { OwnerRepository } from './OwnerRepository'

@injectable()
export class MockOwnerRepository extends OwnerRepository {
	private owners = new Map<string, Owner>()

	async findById(id: string, _tx?: Transaction): Promise<Owner | undefined> {
		return this.owners.get(id)
	}

	async findByOwnerId(ownerId: string, _tx?: Transaction): Promise<Owner | null> {
		return this.owners.get(ownerId) ?? null
	}

	async findByResponsibleUserId(userId: string, _tx?: Transaction): Promise<Owner[]> {
		return [...this.owners.values()].filter(o => o.responsibleUserId === userId)
	}

	async save(entity: Owner, _tx?: Transaction): Promise<Owner> {
		this.owners.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.owners.delete(id)
	}

	seed(owner: Owner): void {
		this.owners.set(owner.id.value, owner)
	}

	clear(): void {
		this.owners.clear()
	}
}
