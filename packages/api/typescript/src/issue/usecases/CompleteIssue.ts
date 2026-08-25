import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { IssueRepository } from '../repositories/IssueRepository'

export const CompleteIssueInputSchema = z.object({ issueId: z.uuid(), meta: z.string().optional() })
export const CompleteIssueOutputSchema = z.void()

/**
 * C23 CompleteIssue — driven by the terminal's `integration.issue.completed`. Stamps COMPLETED +
 * completedAt; the 24h auto-archive clock is the periodic `AutoArchiveCompletedIssuesJob` sweep
 * (completedAt <= now − 24h). Idempotent (a redelivered completion is a no-op). BC5 does NOT
 * re-publish issue.completed — the terminal engine owns that execution fact.
 */
@injectable()
export class CompleteIssue extends Handler<typeof CompleteIssueInputSchema, typeof CompleteIssueOutputSchema> {
	readonly name = 'complete_issue' as const
	readonly inputSchema = CompleteIssueInputSchema
	readonly outputSchema = CompleteIssueOutputSchema

	constructor(private readonly issues: IssueRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const issue = await this.issues.findById(input.issueId)
		if (!issue || issue.status === IssueStatus.COMPLETED) return // idempotent
		issue.complete(input.meta)
		await this.withTransaction(tx, async tx => {
			await this.issues.save(issue, tx)
		})
	}
}
