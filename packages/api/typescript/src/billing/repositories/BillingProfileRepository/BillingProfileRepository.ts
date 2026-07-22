import type { Transaction } from '@template/core-typescript'
import type { BillingProfile } from '../../entities'

export abstract class BillingProfileRepository {
	/** Write-once at onboarding — inserting the same ownerId again is a no-op. */
	abstract insertIfNew(profile: BillingProfile, tx?: Transaction): Promise<void>
	abstract findByOwnerId(ownerId: string, tx?: Transaction): Promise<BillingProfile | null>
	abstract save(profile: BillingProfile, tx?: Transaction): Promise<void>
}
