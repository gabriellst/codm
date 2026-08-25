import { injectable } from 'tsyringe-neo'
import { Workspace } from '../../entities/Workspace'
import { WorkspaceRepository } from './WorkspaceRepository'

@injectable()
export class MockWorkspaceRepository extends WorkspaceRepository {
	private store = new Map<string, Workspace>()

	async findById(id: string): Promise<Workspace | undefined> {
		return this.store.get(id)
	}

	async findByOwnerAndPath(ownerId: string, path: string): Promise<Workspace | undefined> {
		for (const w of this.store.values()) {
			if (w.ownerId === ownerId && w.path === path) return w
		}
		return undefined
	}

	async listByOwner(ownerId: string): Promise<Workspace[]> {
		return [...this.store.values()].filter(w => w.ownerId === ownerId)
	}

	async save(entity: Workspace): Promise<Workspace> {
		entity.incrementVersion()
		this.store.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id)
	}
}
