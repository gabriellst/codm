import { MockDomainEventRepository } from './MockDomainEventRepository'
import { BaseDomainEvent } from '../types/BaseDomainEvent'
import type { AnyIntegrationEvent } from '../types/BaseIntegrationEvent'
import type { Transaction } from '../services/UnitOfWork/UnitOfWork'
import { MockOutboxDispatcher } from '../services/OutboxDispatcher/MockOutboxDispatcher'
import { injectable } from 'tsyringe-neo'

@injectable()
export class OutboxAwareMockDomainEventRepository extends MockDomainEventRepository {
	constructor(private outbox: MockOutboxDispatcher) {
		super()
	}

	override async save(entity: BaseDomainEvent, tx?: Transaction): Promise<BaseDomainEvent> {
		const result = await super.save(entity, tx)
		this.outbox.enqueue(entity)
		return result
	}

	override async saveIntegrationEvent(event: AnyIntegrationEvent, tx?: Transaction): Promise<AnyIntegrationEvent> {
		const result = await super.saveIntegrationEvent(event, tx)
		this.outbox.enqueue(event)
		return result
	}
}
