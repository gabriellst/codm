import { AggregateRoot, BaseError, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { PurchaseOrderStatus, type CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { Money } from '../../shared/objects'
import type { ProcurementDomainErrors } from '../errors'

export const PurchaseOrderSchema = z.object({
	storeId: z.instance(Id),
	supplierName: z.string().min(1).max(255),
	status: z.enum(PurchaseOrderStatus),
	totalAmount: z.instance(Money),
})

export type PurchaseOrderProps = Z.infer<typeof PurchaseOrderSchema>

/**
 * PurchaseOrder aggregate (Procurement BC).
 *
 * Lifecycle: DRAFT → PLACED → (terminal); any state → CANCELLED (terminal).
 * A CANCELLED order cannot be placed or cancelled again.
 */
export class PurchaseOrder extends AggregateRoot<typeof PurchaseOrderSchema> {
	static override schema = PurchaseOrderSchema

	static create(data: {
		storeId: string
		supplierName: string
		totalAmount: { amountCents: number; currency: CurrencyCode }
	}): PurchaseOrder {
		return new PurchaseOrder({
			storeId: data.storeId,
			supplierName: data.supplierName,
			status: PurchaseOrderStatus.DRAFT,
			totalAmount: data.totalAmount,
		})
	}

	place(): void {
		if (this.status === PurchaseOrderStatus.CANCELLED) {
			throw new BaseError<ProcurementDomainErrors>('PURCHASE_ORDER_ALREADY_CANCELLED', 'a cancelled order cannot be placed')
		}
		this.status = PurchaseOrderStatus.PLACED
		this.validate()
	}

	cancel(): void {
		if (this.status === PurchaseOrderStatus.CANCELLED) {
			throw new BaseError<ProcurementDomainErrors>('PURCHASE_ORDER_ALREADY_CANCELLED', 'purchase order is already cancelled')
		}
		this.status = PurchaseOrderStatus.CANCELLED
		this.validate()
	}
}

export interface PurchaseOrder extends PurchaseOrderProps {}
