import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { Task } from '../../entities'
import { TaskRepository } from './TaskRepository'

@injectable()
export class MockTaskRepository extends TaskRepository {
	private store = new Map<string, Task>()

	async findById(id: string, _tx?: Transaction): Promise<Task | undefined> {
		return this.store.get(id)
	}

	async save(entity: Task, _tx?: Transaction): Promise<Task> {
		this.store.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.store.delete(id)
	}

	seed(entity: Task): void {
		this.store.set(entity.id.value, entity)
	}

	clear(): void {
		this.store.clear()
	}
}
