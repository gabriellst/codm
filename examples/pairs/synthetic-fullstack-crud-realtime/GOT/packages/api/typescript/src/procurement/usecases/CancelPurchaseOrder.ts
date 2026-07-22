import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z, type Transaction } from '@template/core-typescript'
import { PurchaseOrderRepository } from '../repositories/PurchaseOrderRepository'
import { PurchaseOrderCancelledEvent } from '../events'
import type { ProcurementApplicationErrors } from '../errors'

export const CancelPurchaseOrderInputSchema = z.object({
	userId: z.uuid(),
	purchaseOrderId: z.uuid(),
})

export const CancelPurchaseOrderOutputSchema = z.object({
	purchaseOrderId: z.uuid(),
})

@injectable()
export class CancelPurchaseOrder extends Handler<typeof CancelPurchaseOrderInputSchema, typeof CancelPurchaseOrderOutputSchema> {
	readonly name = 'cancel_purchase_order' as const
	readonly inputSchema = CancelPurchaseOrderInputSchema
	readonly outputSchema = CancelPurchaseOrderOutputSchema

	constructor(private readonly orders: PurchaseOrderRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const entity = await this.orders.findById(input.purchaseOrderId, tx)
			if (!entity) throw new BaseError<ProcurementApplicationErrors>('PURCHASE_ORDER_NOT_FOUND', `purchase order ${input.purchaseOrderId} not found`)

			entity.cancel()
			await this.orders.save(entity, tx)

			await this.domainEventRepository.save(
				new PurchaseOrderCancelledEvent({
					entityId: entity.id.value,
					ownerId: entity.storeId.value,
					payload: { purchaseOrderId: entity.id.value, purchaseOrder: entity.toJSON() },
				}),
				tx,
			)

			return { purchaseOrderId: entity.id.value }
		})
	}
}
