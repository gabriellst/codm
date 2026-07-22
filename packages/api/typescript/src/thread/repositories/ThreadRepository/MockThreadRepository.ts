import { injectable } from 'tsyringe-neo'
import { Thread } from '../../entities/Thread'
import { ThreadRepository } from './ThreadRepository'

@injectable()
export class MockThreadRepository extends ThreadRepository {
	private store = new Map<string, Thread>()

	async findById(id: string): Promise<Thread | undefined> {
		return this.store.get(id)
	}

	async findByChannelContact(channelId: string, contactExternalId: string): Promise<Thread | undefined> {
		for (const t of this.store.values()) {
			if (t.channelId === channelId && t.contactRef.externalId === contactExternalId) return t
		}
		return undefined
	}

	async listByOwner(ownerId: string): Promise<Thread[]> {
		return [...this.store.values()].filter(t => t.ownerId === ownerId)
	}

	async save(entity: Thread): Promise<Thread> {
		entity.incrementVersion()
		this.store.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id)
	}
}
