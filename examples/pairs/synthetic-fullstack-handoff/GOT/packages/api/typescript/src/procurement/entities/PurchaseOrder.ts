import { AggregateRoot, BaseError, Id, z } from '@codedm/core-typescript'
import Z from 'zod'
import { PurchaseOrderStatus, type CurrencyCode } from '@codedm/contracts-typescript/wire/enums'
import { Money } from '../../shared/objects'
import type { ProcurementDomainErrors } from '../errors'

export const PurchaseOrderSchema = z.object({
	storeId: z.instance(Id),
	supplierName: z.string().min(1).max(255),
	status: z.enum(PurchaseOrderStatus),
	totalAmount: z.instance(Money).refine(m => m.amountCents > 0, {
		error: 'INVALID_AMOUNT' as ProcurementDomainErrors,
	}),
})

export type PurchaseOrderProps = Z.infer<typeof PurchaseOrderSchema>

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
			status: PurchaseOrderStatus.PLACED,
			totalAmount: data.totalAmount,
		})
	}

	cancel(): void {
		if (this.status === PurchaseOrderStatus.CANCELLED) {
			throw new BaseError<ProcurementDomainErrors>('PURCHASE_ORDER_ALREADY_CANCELLED')
		}
		this.status = PurchaseOrderStatus.CANCELLED
		this.validate()
	}

	get isCancelled(): boolean {
		return this.status === PurchaseOrderStatus.CANCELLED
	}
}

export interface PurchaseOrder extends PurchaseOrderProps {}
