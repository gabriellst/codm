import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codm/core-typescript'
import { IssueArchivedEvent, IssueCompletedEvent } from '@codm/contracts-typescript/wire/events'
import { IssueAttributesRepository } from '../repositories/IssueAttributesRepository'

/**
 * THE TASK CLOSED (fase 4, item 1) — `integration.issue.completed` / `integration.issue.archived` stamp
 * `agent_issue_attributes.closed_at`, the start of the grace period after which the janitor (S3) may remove the
 * task's registered worktree.
 *
 * The instant is the fact's: the completion's declared `completedAt`, the archive's event time (the archive fact
 * carries no instant of its own). A task reopened and closed again moves the stamp forward. Reopening itself is not
 * read here: any queue item of the task newer than `closed_at` disqualifies the cleanup (spec, item 1).
 */
@injectable()
export class MarkIssueAttributesClosed extends EventHandler<readonly [typeof IssueCompletedEvent, typeof IssueArchivedEvent]> {
	readonly event = [IssueCompletedEvent, IssueArchivedEvent] as const

	constructor(private readonly attributes: IssueAttributesRepository) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const closedAt = event instanceof IssueCompletedEvent ? new Date(event.payload.completedAt) : new Date(event.time)
		const attributes = await this.attributes.findByIssueId(event.payload.issueId)
		// A task without a row (none: 0037 backfilled every issue, and every birth writes one) has nothing to stamp.
		if (!attributes) return
		attributes.close(closedAt)
		await this.attributes.save(attributes)
	}
}
