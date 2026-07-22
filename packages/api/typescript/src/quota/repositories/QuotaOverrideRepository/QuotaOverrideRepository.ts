import type { Transaction } from '@template/core-typescript'

import type { QuotaOverride } from '@quota/entities'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

/**
 * The NATIVE quota-override ledger (medscall@f04e8a0f port). `ApplyQuotaOverride` `applyIfNew`s a
 * signed `delta` here (idempotent on `idemKey`), and `QuotaEntitlement` reads the running
 * `currentDelta(ownerId, meter)` back to RAISE the effective included/limit — so an override
 * actually loosens enforcement rather than being silently dropped.
 *
 * No shared `Repository<T>` base — this is an atomic-ops grant ledger (same posture as a
 * ProjectionRepository), not a find→mutate→save aggregate store. It never rehydrates an individual
 * `QuotaOverride`; the only reads are the SUMs below.
 */
export abstract class QuotaOverrideRepository {
	/**
	 * Persist a quota-override grant. Idempotent: a duplicate `idemKey` is a no-op (onConflictDoNothing),
	 * so a redelivered command doesn't double-apply. Runs inside the caller's transaction when one is
	 * threaded through (this is a native DB write, no off-tx external call).
	 */
	abstract applyIfNew(override: QuotaOverride, tx?: Transaction): Promise<void>

	/** The running SUM of `delta` for an owner+meter (0 when none) — added to the plan's included/limit. */
	abstract currentDelta(ownerId: string, meter: QuotaKey, tx?: Transaction): Promise<number>

	/** Batch sibling of `currentDelta` for the period-close sweep: one GROUP BY for a whole chunk of
	 *  owners. Contract: every requested ownerId is present in the result (0 when no override). */
	abstract currentDeltaMany(ownerIds: string[], meter: QuotaKey, tx?: Transaction): Promise<Map<string, number>>
}
