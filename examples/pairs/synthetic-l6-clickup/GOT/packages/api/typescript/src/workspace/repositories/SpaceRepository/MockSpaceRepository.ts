import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { Space } from '../../entities'
import { SpaceRepository } from './SpaceRepository'

@injectable()
export class MockSpaceRepository extends SpaceRepository {
	private store = new Map<string, Space>()

	async findById(id: string, _tx?: Transaction): Promise<Space | undefined> {
		return this.store.get(id)
	}

	async save(entity: Space, _tx?: Transaction): Promise<Space> {
		this.store.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.store.delete(id)
	}

	seed(entity: Space): void {
		this.store.set(entity.id.value, entity)
	}

	clear(): void {
		this.store.clear()
	}
}
