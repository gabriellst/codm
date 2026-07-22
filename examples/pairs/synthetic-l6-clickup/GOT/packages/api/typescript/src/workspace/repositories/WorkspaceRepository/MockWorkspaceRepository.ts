import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { Workspace } from '../../entities'
import { WorkspaceRepository } from './WorkspaceRepository'

@injectable()
export class MockWorkspaceRepository extends WorkspaceRepository {
	private store = new Map<string, Workspace>()

	async findById(id: string, _tx?: Transaction): Promise<Workspace | undefined> {
		return this.store.get(id)
	}

	async save(entity: Workspace, _tx?: Transaction): Promise<Workspace> {
		this.store.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.store.delete(id)
	}

	seed(entity: Workspace): void {
		this.store.set(entity.id.value, entity)
	}

	clear(): void {
		this.store.clear()
	}
}
