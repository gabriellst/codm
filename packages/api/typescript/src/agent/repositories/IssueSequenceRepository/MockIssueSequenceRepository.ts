import { injectable } from 'tsyringe-neo'
import { IssueSequenceRepository } from './IssueSequenceRepository'

/** In-memory twin: one counter per workspace, starting at 1. */
@injectable()
export class MockIssueSequenceRepository extends IssueSequenceRepository {
	private readonly last = new Map<string, number>()

	async next(workspaceId: string): Promise<number> {
		const seq = (this.last.get(workspaceId) ?? 0) + 1
		this.last.set(workspaceId, seq)
		return seq
	}
}
