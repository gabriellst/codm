import { injectable } from 'tsyringe-neo'
import { Handler, z, type Transaction } from '@codedm/core-typescript'
import { MoneySchema } from '../../shared/objects'
import { PurchaseOrder } from '../entities/PurchaseOrder'
import { PurchaseOrderRepository } from '../repositories/PurchaseOrderRepository'
import { PurchaseOrderCreatedEvent } from '../events'

export const CreatePurchaseOrderInputSchema = z.object({
	userId: z.uuid(),
	storeId: z.uuid(),
	supplierName: z.string().min(1).max(255),
	totalAmount: MoneySchema,
})

export const CreatePurchaseOrderOutputSchema = z.object({
	purchaseOrderId: z.uuid(),
})

@injectable()
export class CreatePurchaseOrder extends Handler<typeof CreatePurchaseOrderInputSchema, typeof CreatePurchaseOrderOutputSchema> {
	readonly name = 'create_purchase_order' as const
	readonly inputSchema = CreatePurchaseOrderInputSchema
	readonly outputSchema = CreatePurchaseOrderOutputSchema

	constructor(private readonly orders: PurchaseOrderRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const entity = PurchaseOrder.create({
				storeId: input.storeId,
				supplierName: input.supplierName,
				totalAmount: input.totalAmount,
			})
			await this.orders.save(entity, tx)

			await this.domainEventRepository.save(
				new PurchaseOrderCreatedEvent({
					entityId: entity.id.value,
					ownerId: input.storeId,
					payload: { purchaseOrderId: entity.id.value, purchaseOrder: entity.toJSON() },
				}),
				tx,
			)

			return { purchaseOrderId: entity.id.value }
		})
	}
}
