import { Repository } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { Issue } from '../../entities/Issue'

export abstract class IssueRepository extends Repository<Issue> {
	abstract findById(id: string, tx?: Transaction): Promise<Issue | undefined>
	abstract findByThreadAndKey(threadId: string, key: string, tx?: Transaction): Promise<Issue | undefined>
	abstract listByThread(threadId: string, tx?: Transaction): Promise<Issue[]>
	abstract existingKeys(threadId: string, tx?: Transaction): Promise<string[]>
	// Auto-archive sweep: COMPLETED, not archived, completedAt <= cutoff.
	abstract completedBefore(cutoff: Date, tx?: Transaction): Promise<Issue[]>
}
