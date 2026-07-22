import { injectable } from 'tsyringe-neo'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { DrizzleClient } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { quotaOverride } from '@template/contracts/db'

import type { QuotaOverride as QuotaOverrideEntity } from '@quota/entities'
import { QuotaOverrideRepository } from './QuotaOverrideRepository'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

/**
 * The real (DB-backed) quota-override ledger. Inserts each grant into `quota.quota_overrides`
 * (idempotent on `idem_key` via onConflictDoNothing) and SUMs `delta` per owner+meter on read.
 * @quota owns the override ledger end to end (entity, repo, usecase, table).
 */
@injectable()
export class DrizzleQuotaOverrideRepository extends QuotaOverrideRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	private client(tx?: Transaction): DrizzleClient {
		return (tx as DrizzleClient | undefined) ?? this.db
	}

	async applyIfNew(override: QuotaOverrideEntity, tx?: Transaction): Promise<void> {
		const dbClient = this.client(tx)
		// Idempotent: a replayed command with the same idemKey is a no-op — the UNIQUE on idem_key
		// makes the second insert conflict, and we swallow it (never double-apply the same delta).
		await dbClient
			.insert(quotaOverride)
			.values({
				id: override.id.value,
				ownerId: override.ownerId,
				meter: override.meter,
				delta: override.delta,
				idemKey: override.idemKey,
			})
			.onConflictDoNothing({ target: quotaOverride.idemKey })
	}

	async currentDelta(ownerId: string, meter: QuotaKey, tx?: Transaction): Promise<number> {
		const dbClient = this.client(tx)
		const rows = await dbClient
			.select({ total: sql<number>`coalesce(sum(${quotaOverride.delta}), 0)::int` })
			.from(quotaOverride)
			.where(and(eq(quotaOverride.ownerId, ownerId), eq(quotaOverride.meter, meter)))

		return rows[0]?.total ?? 0
	}

	async currentDeltaMany(ownerIds: string[], meter: QuotaKey, tx?: Transaction): Promise<Map<string, number>> {
		if (ownerIds.length === 0) return new Map()
		const dbClient = this.client(tx)
		const rows = await dbClient
			.select({ ownerId: quotaOverride.ownerId, total: sql<number>`coalesce(sum(${quotaOverride.delta}), 0)::int` })
			.from(quotaOverride)
			.where(and(inArray(quotaOverride.ownerId, ownerIds), eq(quotaOverride.meter, meter)))
			.groupBy(quotaOverride.ownerId)
		// GROUP BY only returns owners WITH overrides — fill the rest with 0 (contract: every requested
		// ownerId is present).
		const result = new Map(ownerIds.map(id => [id, 0]))
		for (const row of rows) result.set(row.ownerId, row.total)
		return result
	}
}
