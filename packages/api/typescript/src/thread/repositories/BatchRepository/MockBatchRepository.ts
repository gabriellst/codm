import { injectable } from 'tsyringe-neo'
import { BatchStatus } from '@codm/contracts-typescript/wire/enums'
import type { Batch } from '../../entities/Batch'
import { BatchRepository } from './BatchRepository'

@injectable()
export class MockBatchRepository extends BatchRepository {
	private store = new Map<string, Batch>()

	async findById(id: string): Promise<Batch | undefined> {
		return this.store.get(id)
	}

	async findByCode(threadId: string, code: string): Promise<Batch | undefined> {
		return [...this.store.values()].find(batch => batch.threadId === threadId && batch.code === code)
	}

	async findIncomplete(since: Date, until: Date): Promise<Batch[]> {
		return [...this.store.values()]
			.filter(
				batch =>
					batch.status === BatchStatus.INCOMPLETE &&
					batch.createdAt.getTime() >= since.getTime() &&
					batch.createdAt.getTime() <= until.getTime(),
			)
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
	}

	async save(entity: Batch): Promise<Batch> {
		this.store.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id)
	}
}
