import { Repository } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { PurchaseOrder } from '../../entities/PurchaseOrder'

export abstract class PurchaseOrderRepository extends Repository<PurchaseOrder> {
	abstract findById(id: string, tx?: Transaction): Promise<PurchaseOrder | undefined>
}
