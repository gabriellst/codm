import { injectable } from 'tsyringe-neo'
import { IssueSequence } from './IssueSequence'

/** In-memory twin: one counter per workspace, starting at 1. */
@injectable()
export class MockIssueSequence extends IssueSequence {
	private readonly last = new Map<string, number>()

	async next(workspaceId: string): Promise<number> {
		const seq = (this.last.get(workspaceId) ?? 0) + 1
		this.last.set(workspaceId, seq)
		return seq
	}
}
