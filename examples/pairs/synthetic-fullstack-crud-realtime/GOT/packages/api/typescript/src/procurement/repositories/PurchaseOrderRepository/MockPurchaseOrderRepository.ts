import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codedm/core-typescript'
import { PurchaseOrder } from '../../entities/PurchaseOrder'
import { PurchaseOrderRepository } from './PurchaseOrderRepository'

@injectable()
export class MockPurchaseOrderRepository extends PurchaseOrderRepository {
	private rows = new Map<string, PurchaseOrder>()

	async findById(id: string, _tx?: Transaction): Promise<PurchaseOrder | undefined> {
		return this.rows.get(id)
	}

	async save(entity: PurchaseOrder, _tx?: Transaction): Promise<PurchaseOrder> {
		entity.incrementVersion()
		this.rows.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.rows.delete(id)
	}

	seed(entity: PurchaseOrder): void {
		this.rows.set(entity.id.value, entity)
	}

	clear(): void {
		this.rows.clear()
	}
}
