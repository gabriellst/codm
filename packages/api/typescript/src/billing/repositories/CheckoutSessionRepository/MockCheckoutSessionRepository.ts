import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { CheckoutSessionRepository } from './CheckoutSessionRepository'
import { CheckoutSession } from '../../entities'
import { CheckoutSessionStatus } from '@template/contracts-typescript/wire/enums'

@injectable()
export class MockCheckoutSessionRepository extends CheckoutSessionRepository {
	private sessions = new Map<string, CheckoutSession>()

	async insert(entity: CheckoutSession, _transaction?: Transaction): Promise<void> {
		this.sessions.set(entity.id.value, entity)
	}

	async findBySessionRef(sessionRef: string, _transaction?: Transaction): Promise<CheckoutSession | undefined> {
		return Array.from(this.sessions.values()).find(s => s.sessionRef === sessionRef)
	}

	async save(entity: CheckoutSession, _transaction?: Transaction): Promise<CheckoutSession> {
		entity.incrementVersion()
		this.sessions.set(entity.id.value, entity)
		return entity
	}

	async listStalePending(cutoff: Date, _transaction?: Transaction): Promise<CheckoutSession[]> {
		return Array.from(this.sessions.values())
			.filter(s => s.status === CheckoutSessionStatus.PENDING && s.mintedAt < cutoff)
			.sort((a, b) => a.mintedAt.getTime() - b.mintedAt.getTime())
	}

	async findPendingByInvoiceId(engineInvoiceId: string, _transaction?: Transaction): Promise<CheckoutSession | undefined> {
		return Array.from(this.sessions.values()).find(
			s => s.engineInvoiceId?.value === engineInvoiceId && s.status === CheckoutSessionStatus.PENDING,
		)
	}

	clear(): void {
		this.sessions.clear()
	}
}
