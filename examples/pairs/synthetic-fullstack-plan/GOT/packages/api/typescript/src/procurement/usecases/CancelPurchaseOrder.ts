import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z, type Transaction } from '@template/core-typescript'
import { PurchaseOrderRepository } from '../repositories/PurchaseOrderRepository'
import { PurchaseOrderCancelledEvent } from '../events'
import type { ProcurementApplicationErrors } from '../errors'

export const CancelPurchaseOrderInputSchema = z.object({
	userId: z.uuid(),
	storeId: z.uuid(),
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

	constructor(private readonly purchaseOrders: PurchaseOrderRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const entity = await this.purchaseOrders.findById(input.purchaseOrderId, tx)
			if (!entity || entity.storeId.value !== input.storeId) {
				throw new BaseError<ProcurementApplicationErrors>('PURCHASE_ORDER_NOT_FOUND')
			}

			entity.cancel()
			await this.purchaseOrders.save(entity, tx)

			await this.domainEventRepository.save(
				new PurchaseOrderCancelledEvent({
					entityId: entity.id.value,
					ownerId: input.storeId,
					payload: { purchaseOrder: entity.toJSON() },
				}),
				tx,
			)

			return { purchaseOrderId: entity.id.value }
		})
	}
}
