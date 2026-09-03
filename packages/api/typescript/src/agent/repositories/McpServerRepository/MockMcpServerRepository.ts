// packages/api/typescript/src/agent/repositories/McpServerRepository/MockMcpServerRepository.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import type { McpServer } from '../../entities/McpServer'
import { McpServerRepository } from './McpServerRepository'

@injectable()
export class MockMcpServerRepository extends McpServerRepository {
	private readonly rows = new Map<string, McpServer>()

	async findById(id: string, _tx?: Transaction): Promise<McpServer | undefined> {
		return this.rows.get(id)
	}

	async findByKey(ownerId: string, key: string, _tx?: Transaction): Promise<McpServer | undefined> {
		return [...this.rows.values()].find(s => s.ownerId === ownerId && s.key === key)
	}

	async listByOwner(ownerId: string, _tx?: Transaction): Promise<McpServer[]> {
		return [...this.rows.values()].filter(s => s.ownerId === ownerId)
	}

	async listEnabledByOwner(ownerId: string, _tx?: Transaction): Promise<McpServer[]> {
		return [...this.rows.values()].filter(s => s.ownerId === ownerId && s.enabled)
	}

	async save(entity: McpServer, _tx?: Transaction): Promise<McpServer> {
		entity.incrementVersion()
		this.rows.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.rows.delete(id)
	}
}
