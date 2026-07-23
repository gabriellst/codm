import type { Transaction } from '@codedm/core-typescript'

export interface StopPolicy {
	serverErrors: boolean
	blockedByClassification: boolean
	humanRequested: boolean
	approvalNeeded: boolean
	authRequired: boolean
}

export const DEFAULT_STOP_POLICY: StopPolicy = {
	serverErrors: true,
	blockedByClassification: true,
	humanRequested: true,
	approvalNeeded: true,
	authRequired: true,
}

/** The global (per-owner) stop-criteria toggles — demoted from an aggregate to a settings row. */
export abstract class StopPolicyConfigRepository {
	abstract get(ownerId: string, tx?: Transaction): Promise<StopPolicy>
	abstract upsert(ownerId: string, policy: StopPolicy, tx?: Transaction): Promise<void>
}
