import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codedm/core-typescript'
import { TerminalLLMSession } from '../../entities/TerminalLLMSession'
import { TerminalLLMSessionRepository } from './TerminalLLMSessionRepository'

@injectable()
export class MockTerminalLLMSessionRepository extends TerminalLLMSessionRepository {
	private store = new Map<string, TerminalLLMSession>()

	async findById(id: string, _tx?: Transaction): Promise<TerminalLLMSession | undefined> {
		return this.store.get(id)
	}

	async findByIssueId(issueId: string, _tx?: Transaction): Promise<TerminalLLMSession | undefined> {
		for (const s of this.store.values()) {
			if (s.issueId === issueId) return s
		}
		return undefined
	}

	async save(entity: TerminalLLMSession, _tx?: Transaction): Promise<TerminalLLMSession> {
		entity.incrementVersion()
		this.store.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.store.delete(id)
	}
}
