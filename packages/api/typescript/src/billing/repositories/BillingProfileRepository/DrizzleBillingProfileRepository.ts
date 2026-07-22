import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { billingProfile } from '@template/contracts/db'
import { Language } from '@template/contracts-typescript/wire/enums'
import { BillingProfile } from '../../entities'
import { BillingProfileRepository } from './BillingProfileRepository'

@injectable()
export class DrizzleBillingProfileRepository extends BillingProfileRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	private client(tx?: Transaction): DrizzleClient {
		return (tx as DrizzleClient | undefined) ?? this.db
	}

	async insertIfNew(profile: BillingProfile, tx?: Transaction): Promise<void> {
		const dbClient = this.client(tx)
		await dbClient.insert(billingProfile).values(this.toPersistence(profile)).onConflictDoNothing({ target: billingProfile.ownerId })
	}

	async findByOwnerId(ownerId: string, tx?: Transaction): Promise<BillingProfile | null> {
		const dbClient = this.client(tx)
		const [row] = await dbClient.select().from(billingProfile).where(eq(billingProfile.ownerId, ownerId)).limit(1)
		if (!row) return null
		return new BillingProfile({
			ownerId: row.ownerId,
			name: row.name,
			email: row.email,
			document: row.document,
			language: row.language as Language,
		})
	}

	async save(profile: BillingProfile, tx?: Transaction): Promise<void> {
		const dbClient = this.client(tx)
		await dbClient.update(billingProfile).set(this.toPersistence(profile)).where(eq(billingProfile.ownerId, profile.ownerId))
	}

	private toPersistence(profile: BillingProfile): typeof billingProfile.$inferInsert {
		return {
			ownerId: profile.ownerId,
			name: profile.name,
			email: profile.email,
			document: profile.document,
			language: profile.language,
		}
	}
}
