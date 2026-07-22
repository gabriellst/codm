import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { PaymentMethodRepository } from './PaymentMethodRepository'
import { PaymentMethod } from '../../entities'
import { PaymentMethodStatus } from '@template/contracts-typescript/wire/enums'

@injectable()
export class MockPaymentMethodRepository extends PaymentMethodRepository {
	private paymentMethods = new Map<string, PaymentMethod>()

	async findById(id: string, _transaction?: Transaction): Promise<PaymentMethod | undefined> {
		return this.paymentMethods.get(id) ?? undefined
	}

	async findActiveByOwnerId(ownerId: string, _transaction?: Transaction): Promise<PaymentMethod | undefined> {
		return Array.from(this.paymentMethods.values())
			.filter(pm => pm.ownerId === ownerId && pm.status === PaymentMethodStatus.ACTIVE)
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
	}

	async findDefaultByOwnerId(ownerId: string, _transaction?: Transaction): Promise<PaymentMethod | null> {
		return (
			Array.from(this.paymentMethods.values()).find(
				pm => pm.ownerId === ownerId && pm.isDefault && pm.status === PaymentMethodStatus.ACTIVE,
			) ?? null
		)
	}

	async clearDefault(ownerId: string, _transaction?: Transaction): Promise<void> {
		for (const pm of this.paymentMethods.values()) {
			if (pm.ownerId === ownerId && pm.isDefault) {
				pm.demoteDefault()
			}
		}
	}

	async findAllByOwnerId(ownerId: string, _transaction?: Transaction): Promise<PaymentMethod[]> {
		return Array.from(this.paymentMethods.values())
			.filter(pm => pm.ownerId === ownerId && (pm.status === PaymentMethodStatus.ACTIVE || pm.status === PaymentMethodStatus.EXPIRED))
			.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.createdAt.getTime() - a.createdAt.getTime())
	}

	async setDefault(id: string, ownerId: string, _transaction?: Transaction): Promise<void> {
		for (const pm of this.paymentMethods.values()) {
			if (pm.ownerId === ownerId && pm.isDefault) pm.demoteDefault()
		}
		const target = this.paymentMethods.get(id)
		if (target && target.ownerId === ownerId) target.makeDefault()
	}

	async save(entity: PaymentMethod, _transaction?: Transaction): Promise<PaymentMethod> {
		entity.incrementVersion()
		this.paymentMethods.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _transaction?: Transaction): Promise<void> {
		this.paymentMethods.delete(id)
	}

	clear(): void {
		this.paymentMethods.clear()
	}
}
