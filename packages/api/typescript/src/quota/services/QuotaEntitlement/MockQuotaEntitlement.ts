import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { QuotaEntitlement, type Entitlement } from './QuotaEntitlement'

// Genericization mandate (medscall@f04e8a0f shipped a product FREE floor here — UNITS:1 /
// COLLABORATORS:1 / AGENT_MESSAGES:50): the template ships an EMPTY floor. A generic quota context
// names no key, so an unseeded owner has no entitlements — the gate/enforcer treat an absent key as
// "never blocks / nothing to govern". A downstream product either seeds per-owner in its tests or
// replaces this floor with its real FREE plan.
// `Record<QuotaKey, …>` over the single placeholder key would require EXAMPLE_KEY; the empty floor
// is the deliberate generic default, so cast (same `{} as Entitlement` posture DrizzleQuotaEntitlement
// uses when building the record incrementally).
const EMPTY_FLOOR = {} as Entitlement

/**
 * Seedable mock — other contexts' tests wire this in and `seed(ownerId, entitlement)` the
 * entitlement they want `entitlementFor` to return, instead of standing up a subscription + invoice
 * + override chain. Unseeded owners get the empty floor.
 */
@injectable()
export class MockQuotaEntitlement extends QuotaEntitlement {
	private readonly entitlements = new Map<string, Entitlement>()

	async entitlementFor(ownerId: string, _tx?: Transaction): Promise<Entitlement> {
		return this.entitlements.get(ownerId) ?? EMPTY_FLOOR
	}

	/** Test helper: seed the entitlement `entitlementFor` should return for a given ownerId. */
	seed(ownerId: string, entitlement: Entitlement): void {
		this.entitlements.set(ownerId, entitlement)
	}

	clear(): void {
		this.entitlements.clear()
	}
}
