import { injectable } from 'tsyringe-neo'
import { eq, and, sql } from 'drizzle-orm'
import { DrizzleClient, saveWithOptimisticLock, tryCatchAsync } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { dispute } from '@template/contracts/db'
import { DisputeRepository } from './DisputeRepository'
import { Dispute } from '../../entities'
import { BillingPlatform, DisputeStatus } from '@template/contracts-typescript/wire/enums'

@injectable()
export class DrizzleDisputeRepository extends DisputeRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	private client(tx?: Transaction): DrizzleClient {
		return (tx as DrizzleClient | undefined) ?? this.db
	}

	async insert(entity: Dispute, transaction?: Transaction): Promise<void> {
		const result = await tryCatchAsync(async () => {
			await this.client(transaction).insert(dispute).values(this.toPersistence(entity))
		})
		if (!result.success) throw result.error
	}

	async insertIfNew(entity: Dispute, transaction?: Transaction): Promise<void> {
		const result = await tryCatchAsync(async () => {
			await this.client(transaction)
				.insert(dispute)
				.values(this.toPersistence(entity))
				.onConflictDoNothing({ target: [dispute.gatewayDisputeRef, dispute.platform] })
		})
		if (!result.success) throw result.error
	}

	async findByRef(gatewayDisputeRef: string, platform: BillingPlatform, transaction?: Transaction): Promise<Dispute | undefined> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient
				.select()
				.from(dispute)
				.where(and(eq(dispute.gatewayDisputeRef, gatewayDisputeRef), eq(dispute.platform, platform)))
				.limit(1)
			return rows[0]
		})
		if (!result.success) throw result.error
		if (!result.data) return undefined
		return this.toDomain(result.data)
	}

	async save(entity: Dispute, transaction?: Transaction): Promise<Dispute> {
		const previousVersion = entity.version
		entity.incrementVersion()

		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)

			await saveWithOptimisticLock({
				db: this.client(transaction),
				table: dispute,
				data,
				conflictTarget: dispute.id,
				set: {
					ownerId: sql`excluded.owner_id`,
					gatewayDisputeRef: sql`excluded.gateway_dispute_ref`,
					platform: sql`excluded.platform`,
					gatewayTxId: sql`excluded.gateway_tx_id`,
					invoiceId: sql`excluded.invoice_id`,
					amountCents: sql`excluded.amount_cents`,
					status: sql`excluded.status`,
					openedAt: sql`excluded.opened_at`,
					closedAt: sql`excluded.closed_at`,
					updatedAt: sql`excluded.updated_at`,
					version: sql`excluded.version`,
				},
				versionColumn: dispute.version,
				previousVersion,
			})

			return entity
		})

		if (!result.success) throw result.error
		return result.data
	}

	async listRefsByInvoiceId(invoiceId: string, transaction?: Transaction): Promise<string[]> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select({ ref: dispute.gatewayDisputeRef }).from(dispute).where(eq(dispute.invoiceId, invoiceId))
			return rows.map(r => r.ref)
		})
		if (!result.success) throw result.error
		return result.data
	}

	private toDomain(row: typeof dispute.$inferSelect): Dispute {
		return new Dispute({
			id: row.id,
			gatewayDisputeRef: row.gatewayDisputeRef,
			platform: row.platform as BillingPlatform,
			ownerId: row.ownerId,
			gatewayTxId: row.gatewayTxId,
			invoiceId: row.invoiceId,
			amountCents: row.amountCents,
			status: row.status as DisputeStatus,
			openedAt: row.openedAt,
			closedAt: row.closedAt ?? undefined,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: Dispute): typeof dispute.$inferInsert {
		return {
			id: entity.id.value,
			gatewayDisputeRef: entity.gatewayDisputeRef,
			platform: entity.platform,
			ownerId: entity.ownerId.value,
			gatewayTxId: entity.gatewayTxId,
			invoiceId: entity.invoiceId.value,
			amountCents: entity.amountCents,
			status: entity.status,
			openedAt: entity.openedAt,
			closedAt: entity.closedAt ?? null,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
