import type { Transaction } from '@template/core-typescript'

export interface GovernableResource {
	id: string
	createdAt: Date
	locked: boolean
}

export abstract class ResourceGovernor {
	abstract list(ownerId: string, tx?: Transaction): Promise<GovernableResource[]>
	abstract lock(ownerId: string, resourceId: string, tx?: Transaction): Promise<void>
	abstract unlock(ownerId: string, resourceId: string, tx?: Transaction): Promise<void>

	// Batch siblings for the enforcer (one statement per lock/unlock SET instead of one per
	// resource). The defaults fold the single-resource methods — correct for any governor, and they
	// preserve subclass guards (e.g. a seat governor's never-lock-the-owner check); implementations
	// with a batch-capable repository override them.

	async lockMany(ownerId: string, resourceIds: string[], tx?: Transaction): Promise<void> {
		for (const resourceId of resourceIds) await this.lock(ownerId, resourceId, tx)
	}

	async unlockMany(ownerId: string, resourceIds: string[], tx?: Transaction): Promise<void> {
		for (const resourceId of resourceIds) await this.unlock(ownerId, resourceId, tx)
	}
}
