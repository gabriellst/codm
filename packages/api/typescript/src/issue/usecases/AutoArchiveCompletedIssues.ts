import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IssueArchiveReason } from '@template/contracts-typescript/wire/enums'
import { IssueRepository } from '../repositories/IssueRepository'
import { IssueArchivedEvent } from '../events'

export const AutoArchiveCompletedIssuesInputSchema = z.object({})
export const AutoArchiveCompletedIssuesOutputSchema = z.object({ archivedIssueIds: z.array(z.uuid()) })

/**
 * C28 AutoArchiveCompletedIssues — the scheduler sweep. Archives COMPLETED, non-archived issues
 * whose `completedAt <= now − 24h` with reason AUTO_24H; publishes `issue.archived` per issue
 * (→ `integration.issue.archived`). Driven by `AutoArchiveCompletedIssuesJob` (24h cadence).
 */
@injectable()
export class AutoArchiveCompletedIssues extends Handler<
	typeof AutoArchiveCompletedIssuesInputSchema,
	typeof AutoArchiveCompletedIssuesOutputSchema
> {
	readonly name = 'auto_archive_completed_issues' as const
	readonly inputSchema = AutoArchiveCompletedIssuesInputSchema
	readonly outputSchema = AutoArchiveCompletedIssuesOutputSchema

	static readonly WINDOW_MS = 24 * 60 * 60 * 1000

	constructor(private readonly issues: IssueRepository) {
		super()
	}

	protected async handle(_input: this['input'], tx?: Transaction): Promise<this['output']> {
		const cutoff = new Date(Date.now() - AutoArchiveCompletedIssues.WINDOW_MS)
		const due = await this.issues.completedBefore(cutoff)
		const archivedIssueIds: string[] = []

		await this.withTransaction(tx, async tx => {
			for (const issue of due) {
				issue.archive(IssueArchiveReason.AUTO_24H)
				await this.issues.save(issue, tx)
				await this.domainEventRepository.save(
					new IssueArchivedEvent({
						entityId: issue.id.value,
						ownerId: issue.ownerId,
						payload: { issueId: issue.id.value, threadId: issue.threadId, reason: IssueArchiveReason.AUTO_24H },
					}),
					tx,
				)
				archivedIssueIds.push(issue.id.value)
			}
		})

		return { archivedIssueIds }
	}
}
