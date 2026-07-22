import { injectable } from 'tsyringe-neo'
import { IssueStatus } from '@codedm/contracts-typescript/wire/enums'
import { Issue } from '../../entities/Issue'
import { IssueRepository } from './IssueRepository'

@injectable()
export class MockIssueRepository extends IssueRepository {
	private store = new Map<string, Issue>()

	async findById(id: string): Promise<Issue | undefined> {
		return this.store.get(id)
	}
	async findByThreadAndKey(threadId: string, key: string): Promise<Issue | undefined> {
		return [...this.store.values()].find(i => i.threadId === threadId && i.key === key)
	}
	async listByThread(threadId: string): Promise<Issue[]> {
		return [...this.store.values()].filter(i => i.threadId === threadId)
	}
	async existingKeys(threadId: string): Promise<string[]> {
		return [...this.store.values()].filter(i => i.threadId === threadId).map(i => i.key)
	}
	async completedBefore(cutoff: Date): Promise<Issue[]> {
		return [...this.store.values()].filter(
			i => i.status === IssueStatus.COMPLETED && !i.archived && i.completedAt !== undefined && i.completedAt <= cutoff,
		)
	}
	async save(entity: Issue): Promise<Issue> {
		entity.incrementVersion()
		this.store.set(entity.id.value, entity)
		return entity
	}
	async delete(id: string): Promise<void> {
		this.store.delete(id)
	}
}
