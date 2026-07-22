import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import type { BillingProfile } from '../../entities'
import { BillingProfileRepository } from './BillingProfileRepository'

@injectable()
export class MockBillingProfileRepository extends BillingProfileRepository {
	private rows = new Map<string, BillingProfile>()

	async insertIfNew(profile: BillingProfile, _tx?: Transaction): Promise<void> {
		if (!this.rows.has(profile.ownerId)) this.rows.set(profile.ownerId, profile)
	}

	async findByOwnerId(ownerId: string, _tx?: Transaction): Promise<BillingProfile | null> {
		return this.rows.get(ownerId) ?? null
	}

	async save(profile: BillingProfile, _tx?: Transaction): Promise<void> {
		this.rows.set(profile.ownerId, profile)
	}

	/** Test helper: seed the profile the code under test should read. */
	seed(profile: BillingProfile): void {
		this.rows.set(profile.ownerId, profile)
	}

	clear(): void {
		this.rows.clear()
	}
}
