import { injectable } from 'tsyringe-neo'
import { Artifact } from '../../entities/Artifact'
import { ArtifactRepository } from './ArtifactRepository'

@injectable()
export class MockArtifactRepository extends ArtifactRepository {
	private store = new Map<string, Artifact>()

	async findById(id: string): Promise<Artifact | undefined> {
		return this.store.get(id)
	}
	async listByThread(threadId: string): Promise<Artifact[]> {
		return [...this.store.values()].filter(a => a.threadId === threadId)
	}
	async save(entity: Artifact): Promise<Artifact> {
		this.store.set(entity.id.value, entity)
		return entity
	}
	async delete(id: string): Promise<void> {
		this.store.delete(id)
	}
}
