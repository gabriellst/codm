import type { Transaction } from '@codm/core-typescript'

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

/**
 * The global (per-owner) stop-criteria toggles — demoted from an aggregate to a settings row.
 *
 * Lives in `thread/` since B4. A settings row has no parent aggregate to justify it in, which is why
 * this justification sits on the repository itself; what B4 fixes is the ADDRESS — the policy now sits
 * in the context that owns the stops it gates, and `Thread.raiseStop`'s caller reads it from here.
 */
export abstract class StopPolicyConfigRepository {
	abstract get(ownerId: string, tx?: Transaction): Promise<StopPolicy>
	abstract upsert(ownerId: string, policy: StopPolicy, tx?: Transaction): Promise<void>
}
