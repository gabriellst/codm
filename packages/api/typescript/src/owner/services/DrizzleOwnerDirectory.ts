import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { OwnerDirectory, type OwnerTenancy } from '@shared/services'
import { OwnerRepository } from '@owner/repositories'

/**
 * The canonical adapter for the kernel tenancy port: one read on the tenant
 * aggregate, zero branching — the polymorphic ownerId finally has an aggregate
 * to answer for it. Port of medscall@f04e8a0f `DrizzleOwnerDirectory`.
 */
@injectable()
export class DrizzleOwnerDirectory extends OwnerDirectory {
	constructor(private owners: OwnerRepository) {
		super()
	}

	async getOwner(ownerId: string, tx?: Transaction): Promise<OwnerTenancy | null> {
		const owner = await this.owners.findByOwnerId(ownerId, tx)
		if (!owner) return null
		return { kind: owner.kind, responsibleUserId: owner.responsibleUserId }
	}
}
