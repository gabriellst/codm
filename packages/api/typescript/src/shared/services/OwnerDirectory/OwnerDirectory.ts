import type { Transaction } from '@codedm/core-typescript'
import type { OwnerKind } from '@codedm/contracts-typescript/wire/enums'

/**
 * TENANCY facts behind an ownerId — what kind of tenant it is and which user
 * answers for it. This is all the kernel knows about an owner; rich identity
 * (billing name/email/document, product profile) lives in the owning context's
 * own aggregate, read internally there.
 */
export interface OwnerTenancy {
	kind: OwnerKind
	responsibleUserId: string
}

/**
 * Kernel port for resolving the tenancy behind an `ownerId` without any context
 * reaching into another. The REAL adapter lives in the owner context
 * (`DrizzleOwnerDirectory` — owner owns the tenant aggregate) and is bound by the
 * owner registry; consumers (billing's responsible-guard, ui) depend only on
 * this abstraction. Port of the medscall@f04e8a0f owner-context design.
 */
export abstract class OwnerDirectory {
	/** Returns null when no Owner aggregate backs the ownerId. */
	abstract getOwner(ownerId: string, tx?: Transaction): Promise<OwnerTenancy | null>
}
