import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'

import { PendingSelectionRepository, type KeptSelection } from './PendingSelectionRepository'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

@injectable()
export class MockPendingSelectionRepository extends PendingSelectionRepository {
	private selections = new Map<string, KeptSelection>()

	async save(ownerId: string, selection: KeptSelection, _tx?: Transaction): Promise<void> {
		const entries = (Object.entries(selection) as [QuotaKey, string[]][]).filter(([, ids]) => ids.length > 0)
		if (entries.length === 0) {
			this.selections.delete(ownerId)
			return
		}
		const stored: KeptSelection = {}
		for (const [quotaKey, ids] of entries) stored[quotaKey] = [...ids]
		this.selections.set(ownerId, stored)
	}

	async findByOwner(ownerId: string, _tx?: Transaction): Promise<KeptSelection> {
		const stored = this.selections.get(ownerId)
		if (!stored) return {}
		const out: KeptSelection = {}
		for (const [quotaKey, ids] of Object.entries(stored) as [QuotaKey, string[]][]) out[quotaKey] = [...ids]
		return out
	}

	async clear(ownerId: string, _tx?: Transaction): Promise<void> {
		this.selections.delete(ownerId)
	}
}
