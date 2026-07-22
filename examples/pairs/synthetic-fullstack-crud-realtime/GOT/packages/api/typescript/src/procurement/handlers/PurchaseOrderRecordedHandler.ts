import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import { PurchaseOrderRecordedEvent } from '@codedm/contracts-typescript/wire/events'
import { PurchaseOrderCreatedEvent } from '../events/PurchaseOrderCreatedEvent'
import { PurchaseOrderCancelledEvent } from '../events/PurchaseOrderCancelledEvent'

/**
 * Bridges `procurement.purchase_order.created` → `integration.shared.purchase_order.recorded`.
 * storeId comes from event.ownerId (set by CreatePurchaseOrder to input.storeId).
 */
@injectable()
export class PurchaseOrderCreatedRecordedHandler extends EventHandler<typeof PurchaseOrderCreatedEvent> {
	readonly event = PurchaseOrderCreatedEvent

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const po = event.payload.purchaseOrder
		const storeId = event.ownerId ?? ''
		await this.mediator.publish(
			new PurchaseOrderRecordedEvent({
				ownerId: storeId,
				payload: {
					purchaseOrderId: event.payload.purchaseOrderId,
					storeId,
					supplierName: po.supplierName,
					status: po.status,
					totalAmountCents: po.totalAmount.amountCents,
					currency: po.totalAmount.currency,
				},
			}),
		)
	}
}

/**
 * Bridges `procurement.purchase_order.cancelled` → `integration.shared.purchase_order.recorded`.
 * storeId comes from event.ownerId (set by CancelPurchaseOrder to entity.storeId.value).
 */
@injectable()
export class PurchaseOrderCancelledRecordedHandler extends EventHandler<typeof PurchaseOrderCancelledEvent> {
	readonly event = PurchaseOrderCancelledEvent

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const po = event.payload.purchaseOrder
		const storeId = event.ownerId ?? ''
		await this.mediator.publish(
			new PurchaseOrderRecordedEvent({
				ownerId: storeId,
				payload: {
					purchaseOrderId: event.payload.purchaseOrderId,
					storeId,
					supplierName: po.supplierName,
					status: po.status,
					totalAmountCents: po.totalAmount.amountCents,
					currency: po.totalAmount.currency,
				},
			}),
		)
	}
}
