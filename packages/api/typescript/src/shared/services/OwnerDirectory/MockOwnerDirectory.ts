import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { OwnerDirectory, type OwnerTenancy } from './OwnerDirectory'

@injectable()
export class MockOwnerDirectory extends OwnerDirectory {
	private owners = new Map<string, OwnerTenancy>()

	async getOwner(ownerId: string, _tx?: Transaction): Promise<OwnerTenancy | null> {
		return this.owners.get(ownerId) ?? null
	}

	/** Test helper: seed the tenancy `getOwner` should return for a given ownerId. */
	seed(ownerId: string, tenancy: OwnerTenancy): void {
		this.owners.set(ownerId, tenancy)
	}

	clear(): void {
		this.owners.clear()
	}
}
