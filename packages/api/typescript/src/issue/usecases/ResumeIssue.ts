import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueResumedEvent } from '../events/IssueResumedEvent'
import { IssueRepository } from '../repositories/IssueRepository'
import type { ApplicationErrors } from '../errors'
import { PauseIssueInputSchema } from './PauseIssue'

/** Same shape as the pause — who, from where, which issue. Composed, not redeclared. */
export const ResumeIssueInputSchema = PauseIssueInputSchema
export const ResumeIssueOutputSchema = z.void()

/**
 * ResumeIssue — lift the hold `PauseIssue` put on an issue ("continue" / "retome", or the console).
 *
 * Clearing the flag is what lets the dispatcher run the issue again; the `issue.resumed` fact only makes
 * it IMMEDIATE — `ReleaseIssueWorkOnResume` releases the items the dispatcher had deferred, instead of
 * leaving them until the next hold re-check. The lifecycle is untouched: a NEEDS_INPUT issue resumed is
 * still waiting for its person.
 */
@injectable()
export class ResumeIssue extends Handler<typeof ResumeIssueInputSchema, typeof ResumeIssueOutputSchema> {
	readonly name = 'resume_issue' as const
	readonly inputSchema = ResumeIssueInputSchema
	readonly outputSchema = ResumeIssueOutputSchema

	constructor(private readonly issues: IssueRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const issue = await this.issues.findById(input.issueId, tx)
		if (!issue || issue.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
		issue.resume()
		await this.withTransaction(tx, async tx => {
			await this.issues.save(issue, tx)
			await this.domainEventRepository.save(
				new IssueResumedEvent({
					entityId: issue.id.value,
					ownerId: issue.ownerId,
					payload: {
						issueId: issue.id.value,
						threadId: issue.threadId,
						source: input.source,
						requestedBy: input.requestedBy,
						requestedById: input.requestedById,
					},
				}),
				tx,
			)
		})
	}
}
