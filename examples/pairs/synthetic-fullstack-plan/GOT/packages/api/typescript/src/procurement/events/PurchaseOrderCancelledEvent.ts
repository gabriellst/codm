import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { PurchaseOrderSchema } from '../entities/PurchaseOrder'

export const PurchaseOrderCancelledEventSchema = z.domainEvent({
	purchaseOrder: PurchaseOrderSchema.input(),
})

export class PurchaseOrderCancelledEvent extends BaseDomainEvent<typeof PurchaseOrderCancelledEventSchema> {
	static override readonly name = 'procurement.purchase_order.cancelled' as const
	static readonly schema = PurchaseOrderCancelledEventSchema
}
