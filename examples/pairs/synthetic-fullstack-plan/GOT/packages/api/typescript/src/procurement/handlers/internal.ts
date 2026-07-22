import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import { PurchaseOrderRecordedEvent } from '@codedm/contracts-typescript/wire/events'
import type { PurchaseOrderStatus, CurrencyCode } from '@codedm/contracts-typescript/wire/enums'
import { PurchaseOrderCreatedEvent, PurchaseOrderCancelledEvent } from '../events'

type AnyPOEventInput = {
	ownerId?: string
	entityId?: string
	payload: {
		purchaseOrder: {
			supplierName: string
			status: PurchaseOrderStatus
			totalAmount: { amountCents: number; currency: CurrencyCode }
		}
	}
}

async function publishRecorded(mediator: ExternalMediator, event: AnyPOEventInput): Promise<void> {
	const po = event.payload.purchaseOrder
	await mediator.publish(
		new PurchaseOrderRecordedEvent({
			ownerId: event.ownerId ?? '',
			payload: {
				storeId: event.ownerId ?? '',
				purchaseOrderId: event.entityId ?? '',
				supplierName: po.supplierName,
				status: po.status,
				totalAmountCents: po.totalAmount.amountCents,
				totalAmountCurrency: po.totalAmount.currency,
			},
		}),
	)
}

/** Publishes PurchaseOrderRecordedEvent when a purchase order is created. */
@injectable()
export class PurchaseOrderCreatedRecordedHandler extends EventHandler<typeof PurchaseOrderCreatedEvent> {
	readonly event = PurchaseOrderCreatedEvent

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		await publishRecorded(this.mediator, event)
	}
}

/** Publishes PurchaseOrderRecordedEvent when a purchase order is cancelled. */
@injectable()
export class PurchaseOrderCancelledRecordedHandler extends EventHandler<typeof PurchaseOrderCancelledEvent> {
	readonly event = PurchaseOrderCancelledEvent

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		await publishRecorded(this.mediator, event)
	}
}
