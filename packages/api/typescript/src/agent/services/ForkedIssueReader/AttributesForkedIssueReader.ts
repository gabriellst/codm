import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import { IssueAttributesRepository } from '../../repositories/IssueAttributesRepository'
import { ForkedIssueReader } from './ForkedIssueReader'

/**
 * The reader over the agent's own attributes table — the same in every environment, because the environment split
 * already lives in the repository it reads (`mock` in memory, `integration`/`real` on SQLite).
 */
@injectable()
export class AttributesForkedIssueReader extends ForkedIssueReader {
	constructor(private readonly attributes: IssueAttributesRepository) {
		super()
	}

	async isOfThread(issueId: string, threadId: string, tx?: Transaction): Promise<boolean> {
		const row = await this.attributes.findByIssueId(issueId, tx)
		return row?.threadId === threadId
	}
}
