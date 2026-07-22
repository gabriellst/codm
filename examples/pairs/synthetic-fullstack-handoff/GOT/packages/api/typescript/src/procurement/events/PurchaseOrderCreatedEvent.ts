import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { PurchaseOrderSchema } from '../entities/PurchaseOrder'

export const PurchaseOrderCreatedEventSchema = z.domainEvent({
	purchaseOrder: PurchaseOrderSchema.input(),
})

export class PurchaseOrderCreatedEvent extends BaseDomainEvent<typeof PurchaseOrderCreatedEventSchema> {
	static override readonly name = 'procurement.purchase_order.created' as const
	static readonly schema = PurchaseOrderCreatedEventSchema
}
