import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codedm/core-typescript'
import { AgentSession } from '../../entities/AgentSession'
import { AgentSessionRepository } from './AgentSessionRepository'

@injectable()
export class MockAgentSessionRepository extends AgentSessionRepository {
	private store = new Map<string, AgentSession>()

	async findById(id: string, _tx?: Transaction): Promise<AgentSession | undefined> {
		return this.store.get(id)
	}

	async findByIssueId(issueId: string, _tx?: Transaction): Promise<AgentSession | undefined> {
		for (const s of this.store.values()) {
			if (s.issueId === issueId) return s
		}
		return undefined
	}

	async save(entity: AgentSession, _tx?: Transaction): Promise<AgentSession> {
		entity.incrementVersion()
		this.store.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.store.delete(id)
	}
}
