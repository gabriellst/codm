import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { LibSqlDatabaseDriver, Handler, z, BaseError } from '@codm/core-typescript'
import { issues } from '@codm/contracts/db'
import { IssueTimelineItemSchema } from '@shared/schemas'
import type { ApplicationErrors } from '../errors'
import { assembleIssueTimeline } from '../utils/issueTimeline'

export const GetIssueTimelineInputSchema = z.object({ ownerId: z.uuid(), issueId: z.uuid() })
export const GetIssueTimelineOutputSchema = z.object({ items: z.array(IssueTimelineItemSchema) })

/**
 * Read — an issue's TIMELINE (fase 1, item 1), for the console. The assembly lives in
 * `assembleIssueTimeline`, shared with the panel publisher so the web panel shows the same history.
 *
 * Before this, the only per-issue view was a terminal tail held in memory and lost on restart, and the
 * answer to "what happened with X?" was scrolling a group chat.
 */
@injectable()
export class GetIssueTimeline extends Handler<typeof GetIssueTimelineInputSchema, typeof GetIssueTimelineOutputSchema> {
	readonly name = 'get_issue_timeline' as const
	readonly inputSchema = GetIssueTimelineInputSchema
	readonly outputSchema = GetIssueTimelineOutputSchema

	constructor(private readonly driver: LibSqlDatabaseDriver) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const [issue] = await this.driver.db
			.select({ ownerId: issues.ownerId, title: issues.title })
			.from(issues)
			.where(eq(issues.id, input.issueId))
			.limit(1)
		if (!issue || issue.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
		return { items: await assembleIssueTimeline(this.driver, input.issueId, issue.title) }
	}
}
