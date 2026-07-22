import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { IssueRepository } from '../repositories/IssueRepository'
import type { ApplicationErrors } from '../errors'

export const RestoreIssueInputSchema = z.object({ ownerId: z.uuid(), issueId: z.uuid() })
export const RestoreIssueOutputSchema = z.void()

/** C27 RestoreIssue — archived only (`ISSUE_NOT_ARCHIVED`). Context-private (no integration event). */
@injectable()
export class RestoreIssue extends Handler<typeof RestoreIssueInputSchema, typeof RestoreIssueOutputSchema> {
	readonly name = 'restore_issue' as const
	readonly inputSchema = RestoreIssueInputSchema
	readonly outputSchema = RestoreIssueOutputSchema

	constructor(private readonly issues: IssueRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const issue = await this.issues.findById(input.issueId)
		if (!issue || issue.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
		issue.restore()
		await this.withTransaction(tx, async tx => this.issues.save(issue, tx))
	}
}
