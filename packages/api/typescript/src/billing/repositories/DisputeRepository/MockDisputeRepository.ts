import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { DisputeRepository } from './DisputeRepository'
import { Dispute } from '../../entities'
import { BillingPlatform } from '@template/contracts-typescript/wire/enums'

@injectable()
export class MockDisputeRepository extends DisputeRepository {
	private disputes = new Map<string, Dispute>()

	private key(gatewayDisputeRef: string, platform: BillingPlatform): string {
		return `${gatewayDisputeRef}:${platform}`
	}

	async insert(entity: Dispute, _transaction?: Transaction): Promise<void> {
		const key = this.key(entity.gatewayDisputeRef, entity.platform)
		if (this.disputes.has(key)) {
			throw new Error(`Dispute already exists for ref ${entity.gatewayDisputeRef} on platform ${entity.platform}`)
		}
		this.disputes.set(key, entity)
	}

	async insertIfNew(entity: Dispute, _transaction?: Transaction): Promise<void> {
		const key = this.key(entity.gatewayDisputeRef, entity.platform)
		if (this.disputes.has(key)) return // duplicate — silent no-op, parity with onConflictDoNothing
		this.disputes.set(key, entity)
	}

	async findByRef(gatewayDisputeRef: string, platform: BillingPlatform, _transaction?: Transaction): Promise<Dispute | undefined> {
		return this.disputes.get(this.key(gatewayDisputeRef, platform))
	}

	async save(entity: Dispute, _transaction?: Transaction): Promise<Dispute> {
		entity.incrementVersion()
		this.disputes.set(this.key(entity.gatewayDisputeRef, entity.platform), entity)
		return entity
	}

	async listRefsByInvoiceId(invoiceId: string, _transaction?: Transaction): Promise<string[]> {
		return Array.from(this.disputes.values())
			.filter(d => d.invoiceId.value === invoiceId)
			.map(d => d.gatewayDisputeRef)
	}

	clear(): void {
		this.disputes.clear()
	}
}
