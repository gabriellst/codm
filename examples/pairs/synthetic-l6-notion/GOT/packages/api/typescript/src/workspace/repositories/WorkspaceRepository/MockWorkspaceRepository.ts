import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { Workspace } from '../../entities/Workspace'
import { WorkspaceRepository } from './WorkspaceRepository'

@injectable()
export class MockWorkspaceRepository extends WorkspaceRepository {
	private rows = new Map<string, Workspace>()

	async findById(id: string, _tx?: Transaction): Promise<Workspace | undefined> {
		return this.rows.get(id)
	}

	async save(entity: Workspace, _tx?: Transaction): Promise<Workspace> {
		entity.incrementVersion()
		this.rows.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.rows.delete(id)
	}

	seed(entity: Workspace): void {
		this.rows.set(entity.id.value, entity)
	}

	clear(): void {
		this.rows.clear()
	}
}
