import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueArchiveReason } from '@codm/contracts-typescript/wire/enums'
import { IssueRepository } from '../repositories/IssueRepository'
import { IssueArchivedEvent } from '../events/IssueArchivedEvent'
import type { ApplicationErrors } from '../errors'

export const ArchiveIssueInputSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	// MANUAL (operator) by default; THREAD_DETACHED / AUTO_24H come from their own drivers.
	reason: z.enum(IssueArchiveReason).default(IssueArchiveReason.MANUAL),
})
export const ArchiveIssueOutputSchema = z.void()

/** C26 ArchiveIssue — hides the issue from active lists; publishes `issue.archived` →
 *  `integration.issue.archived` (BC4 issue-list projections). */
@injectable()
export class ArchiveIssue extends Handler<typeof ArchiveIssueInputSchema, typeof ArchiveIssueOutputSchema> {
	readonly name = 'archive_issue' as const
	readonly inputSchema = ArchiveIssueInputSchema
	readonly outputSchema = ArchiveIssueOutputSchema

	constructor(private readonly issues: IssueRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const issue = await this.issues.findById(input.issueId)
		if (!issue || issue.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
		issue.archive(input.reason)
		await this.withTransaction(tx, async tx => {
			await this.issues.save(issue, tx)
			await this.domainEventRepository.save(
				new IssueArchivedEvent({
					entityId: issue.id.value,
					ownerId: issue.ownerId,
					payload: { issueId: issue.id.value, threadId: issue.threadId, reason: input.reason },
				}),
				tx,
			)
		})
	}
}
