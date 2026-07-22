import type { Transaction } from '@template/core-typescript'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

export type Entitlement = Record<QuotaKey, { limit: number | null; metered: boolean }>

/**
 * The owner's EFFECTIVE per-key entitlement — the derived effective plan's policy limit raised by
 * the running quota-override delta, plus whether the key is metered. The single read `QuotaGate` /
 * `ResourceLimitEnforcer` call; nothing else needs the raw catalog.
 *
 * billing↔quota is a bidirectional accepted coupling: the Drizzle implementation reads billing's
 * catalog (`PlanRegistry`) and access deriver (`SubscriptionAccessDeriver`) — billing remains the
 * entitlement AUTHORITY, quota is the enforcement mechanism reading it (medscall@f04e8a0f).
 */
export abstract class QuotaEntitlement {
	abstract entitlementFor(ownerId: string, tx?: Transaction): Promise<Entitlement>
}
