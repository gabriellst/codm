import { injectable } from 'tsyringe-neo'
import { Loop } from '../../entities/Loop'
import { LoopRepository } from './LoopRepository'

@injectable()
export class MockLoopRepository extends LoopRepository {
	private store = new Map<string, Loop>()

	async findById(id: string): Promise<Loop | undefined> {
		return this.store.get(id)
	}

	async listByThread(threadId: string): Promise<Loop[]> {
		return [...this.store.values()]
			.filter(loop => loop.threadId === threadId)
			.sort((a, b) => (a.nextRunAt?.getTime() ?? Infinity) - (b.nextRunAt?.getTime() ?? Infinity))
	}

	/** `Loop.isDue` is the predicate — the same one the SQL encodes, so the double cannot drift from
	 *  the real repository by disagreeing about what "due" means. */
	async findDue(now: Date, limit: number): Promise<Loop[]> {
		return [...this.store.values()]
			.filter(loop => loop.isDue(now))
			.sort((a, b) => (a.nextRunAt?.getTime() ?? 0) - (b.nextRunAt?.getTime() ?? 0))
			.slice(0, limit)
	}

	async save(entity: Loop): Promise<Loop> {
		this.store.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id)
	}
}
