import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient } from '@template/core-typescript'
import { stopPolicyConfig } from '@template/contracts/db'
import { StopPolicyConfigRepository, type StopPolicy, DEFAULT_STOP_POLICY } from './StopPolicyConfigRepository'

@injectable()
export class DrizzleStopPolicyConfigRepository extends StopPolicyConfigRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async get(ownerId: string, tx?: DrizzleClient): Promise<StopPolicy> {
		const dbc = tx ?? this.db
		const rows = await dbc.select().from(stopPolicyConfig).where(eq(stopPolicyConfig.ownerId, ownerId)).limit(1)
		const row = rows[0]
		if (!row) return { ...DEFAULT_STOP_POLICY }
		return {
			serverErrors: row.serverErrors,
			blockedByClassification: row.blockedByClassification,
			humanRequested: row.humanRequested,
			approvalNeeded: row.approvalNeeded,
		}
	}

	async upsert(ownerId: string, policy: StopPolicy, tx?: DrizzleClient): Promise<void> {
		const dbc = tx ?? this.db
		await dbc
			.insert(stopPolicyConfig)
			.values({ ownerId, ...policy })
			.onConflictDoUpdate({ target: stopPolicyConfig.ownerId, set: { ...policy, updatedAt: new Date() } })
	}
}
