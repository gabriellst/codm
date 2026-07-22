import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { pendingSelections } from '@template/contracts/db'

import { PendingSelectionRepository, type KeptSelection } from './PendingSelectionRepository'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

@injectable()
export class DrizzlePendingSelectionRepository extends PendingSelectionRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	private client(tx?: Transaction): DrizzleClient {
		return (tx as DrizzleClient | undefined) ?? this.db
	}

	async save(ownerId: string, selection: KeptSelection, tx?: Transaction): Promise<void> {
		const dbClient = this.client(tx)
		await dbClient.delete(pendingSelections).where(eq(pendingSelections.ownerId, ownerId))
		const rows = (Object.entries(selection) as [QuotaKey, string[]][])
			.filter(([, ids]) => ids.length > 0)
			.map(([quotaKey, keptIds]) => ({ ownerId, quotaKey, keptIds }))
		if (rows.length > 0) await dbClient.insert(pendingSelections).values(rows)
	}

	async findByOwner(ownerId: string, tx?: Transaction): Promise<KeptSelection> {
		const dbClient = this.client(tx)
		const rows = await dbClient.select().from(pendingSelections).where(eq(pendingSelections.ownerId, ownerId))
		const out: KeptSelection = {}
		for (const r of rows) out[r.quotaKey as QuotaKey] = r.keptIds
		return out
	}

	async clear(ownerId: string, tx?: Transaction): Promise<void> {
		const dbClient = this.client(tx)
		await dbClient.delete(pendingSelections).where(eq(pendingSelections.ownerId, ownerId))
	}
}
