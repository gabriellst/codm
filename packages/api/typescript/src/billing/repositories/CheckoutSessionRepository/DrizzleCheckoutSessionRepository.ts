import { injectable } from 'tsyringe-neo'
import { eq, and, asc, lt, sql } from 'drizzle-orm'
import { DrizzleClient, saveWithOptimisticLock, tryCatchAsync } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { checkoutSession } from '@template/contracts/db'
import { CheckoutSessionRepository } from './CheckoutSessionRepository'
import { CheckoutSession } from '../../entities'
import { BillingPlatform, CheckoutIntent, CheckoutSessionStatus } from '@template/contracts-typescript/wire/enums'

@injectable()
export class DrizzleCheckoutSessionRepository extends CheckoutSessionRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	private client(tx?: Transaction): DrizzleClient {
		return (tx as DrizzleClient | undefined) ?? this.db
	}

	async insert(entity: CheckoutSession, transaction?: Transaction): Promise<void> {
		const result = await tryCatchAsync(async () => {
			const dbClient = this.client(transaction)
			await dbClient.insert(checkoutSession).values(this.toPersistence(entity))
		})
		if (!result.success) throw result.error
	}

	async findBySessionRef(sessionRef: string, transaction?: Transaction): Promise<CheckoutSession | undefined> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(checkoutSession).where(eq(checkoutSession.sessionRef, sessionRef)).limit(1)
			return rows[0]
		})
		if (!result.success) throw result.error
		if (!result.data) return undefined
		return this.toDomain(result.data)
	}

	async save(entity: CheckoutSession, transaction?: Transaction): Promise<CheckoutSession> {
		const previousVersion = entity.version
		entity.incrementVersion()

		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			const dbClient = this.client(transaction)

			await saveWithOptimisticLock({
				db: dbClient,
				table: checkoutSession,
				data,
				conflictTarget: checkoutSession.id,
				set: {
					ownerId: sql`excluded.owner_id`,
					sessionRef: sql`excluded.session_ref`,
					platform: sql`excluded.platform`,
					intent: sql`excluded.intent`,
					engineInvoiceId: sql`excluded.engine_invoice_id`,
					status: sql`excluded.status`,
					mintedAt: sql`excluded.minted_at`,
					expiresAt: sql`excluded.expires_at`,
					updatedAt: sql`excluded.updated_at`,
					version: sql`excluded.version`,
				},
				versionColumn: checkoutSession.version,
				previousVersion,
			})

			return entity
		})

		if (!result.success) throw result.error
		return result.data
	}

	async listStalePending(cutoff: Date, transaction?: Transaction): Promise<CheckoutSession[]> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			return dbClient
				.select()
				.from(checkoutSession)
				.where(and(eq(checkoutSession.status, CheckoutSessionStatus.PENDING), lt(checkoutSession.mintedAt, cutoff)))
				.orderBy(asc(checkoutSession.mintedAt))
		})
		if (!result.success) throw result.error
		return result.data.map(row => this.toDomain(row))
	}

	async findPendingByInvoiceId(engineInvoiceId: string, transaction?: Transaction): Promise<CheckoutSession | undefined> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient
				.select()
				.from(checkoutSession)
				.where(and(eq(checkoutSession.engineInvoiceId, engineInvoiceId), eq(checkoutSession.status, CheckoutSessionStatus.PENDING)))
				.limit(1)
			return rows[0]
		})
		if (!result.success) throw result.error
		if (!result.data) return undefined
		return this.toDomain(result.data)
	}

	private toDomain(row: typeof checkoutSession.$inferSelect): CheckoutSession {
		return new CheckoutSession({
			id: row.id,
			ownerId: row.ownerId,
			sessionRef: row.sessionRef,
			platform: row.platform as BillingPlatform,
			intent: row.intent as CheckoutIntent,
			engineInvoiceId: row.engineInvoiceId ?? undefined,
			status: row.status as CheckoutSessionStatus,
			mintedAt: row.mintedAt,
			expiresAt: row.expiresAt ?? undefined,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: CheckoutSession): typeof checkoutSession.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId.value,
			sessionRef: entity.sessionRef,
			platform: entity.platform,
			intent: entity.intent,
			engineInvoiceId: entity.engineInvoiceId?.value ?? null,
			status: entity.status,
			mintedAt: entity.mintedAt,
			expiresAt: entity.expiresAt ?? null,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
