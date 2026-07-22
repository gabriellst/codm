import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codedm/core-typescript'
import { purchaseOrders } from '@codedm/contracts/db'
import { PurchaseOrder, PurchaseOrderSchema } from '../../entities/PurchaseOrder'
import { PurchaseOrderRepository } from './PurchaseOrderRepository'

@injectable()
export class DrizzlePurchaseOrderRepository extends PurchaseOrderRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(id: string, tx?: DrizzleClient): Promise<PurchaseOrder | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async save(entity: PurchaseOrder, tx?: DrizzleClient): Promise<PurchaseOrder> {
		entity.incrementVersion()
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(purchaseOrders)
				.values(data)
				.onConflictDoUpdate({
					target: purchaseOrders.id,
					set: {
						supplierName: data.supplierName,
						status: data.status,
						totalAmountCents: data.totalAmountCents,
						currency: data.currency,
						updatedAt: new Date(),
						version: data.version,
					},
				})
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: DrizzleClient): Promise<void> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(purchaseOrders).where(eq(purchaseOrders.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof purchaseOrders.$inferSelect): PurchaseOrder {
		const parsed = PurchaseOrderSchema.parse({
			storeId: row.storeId,
			supplierName: row.supplierName,
			status: row.status,
			totalAmount: { amountCents: Number(row.totalAmountCents), currency: row.currency },
		})
		return new PurchaseOrder({
			...parsed,
			id: row.id,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: PurchaseOrder): typeof purchaseOrders.$inferInsert {
		return {
			id: entity.id.value,
			storeId: entity.storeId.value,
			supplierName: entity.supplierName,
			status: entity.status,
			totalAmountCents: BigInt(entity.totalAmount.amountCents),
			currency: entity.totalAmount.currency,
			version: entity.version,
		}
	}
}
