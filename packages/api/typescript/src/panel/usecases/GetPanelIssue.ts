import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { Handler, PgDatabaseDriver, z, BaseError } from '@codm/core-typescript'
import { panelIssues } from '@codm/contracts/db/pg'
import { IssueLifeState, IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { IssueTimelineItemSchema, PanelOpenStopSchema } from '@shared/schemas'
import type { ApplicationErrors } from '../errors'
import { parseOpenStops } from '../utils/openStops'
import { panelGroupByToken } from './panelGroupByToken'

export const GetPanelIssueInputSchema = z.object({ token: z.string().min(16).max(128), issueId: z.uuid() })
export const GetPanelIssueOutputSchema = z.object({
	issue: z.object({
		issueId: z.uuid(),
		key: z.string(),
		title: z.string(),
		status: z.enum(IssueStatus),
		lifeState: z.enum(IssueLifeState),
		waitingForProviderUntil: z.string().optional(),
		updatedAt: z.string(),
	}),
	timeline: z.array(IssueTimelineItemSchema),
	/**
	 * The issue's open stops the panel may answer, with the answers each admits there (fase 2, item 6b) — as
	 * the daemon last reported them with the roster. A LIST since fase 3: an issue can hold more than one
	 * open ask at once (D1 and D2). Empty when there is none.
	 */
	openStops: z.array(PanelOpenStopSchema.omit({ issueId: true })),
})

/**
 * Query — one issue of ONE group, with its timeline (public). An issue of another group answers exactly
 * like an unknown link (PANEL_NOT_FOUND): a token never reveals what exists outside its group.
 */
@injectable()
export class GetPanelIssue extends Handler<typeof GetPanelIssueInputSchema, typeof GetPanelIssueOutputSchema> {
	readonly name = 'get_panel_issue' as const
	readonly inputSchema = GetPanelIssueInputSchema
	readonly outputSchema = GetPanelIssueOutputSchema

	constructor(private readonly driver: PgDatabaseDriver) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const group = await panelGroupByToken(this.driver, input.token)
		const [issue] = group
			? await this.driver.db
					.select()
					.from(panelIssues)
					.where(
						and(eq(panelIssues.issueId, input.issueId), eq(panelIssues.threadId, group.threadId), eq(panelIssues.ownerId, group.ownerId)),
					)
					.limit(1)
			: []
		if (!issue) throw new BaseError<ApplicationErrors>('PANEL_NOT_FOUND', 'no panel for this link')
		const timeline = z.array(IssueTimelineItemSchema).safeParse(issue.timeline)
		const open = parseOpenStops(group?.openStops ?? []).filter(stop => stop.issueId === issue.issueId)
		return {
			issue: {
				issueId: issue.issueId,
				key: issue.key,
				title: issue.title,
				status: issue.status,
				lifeState: issue.lifeState,
				waitingForProviderUntil: issue.waitingForProviderUntil?.toISOString(),
				updatedAt: issue.updatedAt.toISOString(),
			},
			// Stored verbatim from a validated sync; a row that no longer parses shows no timeline rather than failing the page.
			timeline: timeline.success ? timeline.data : [],
			openStops: open.map(({ issueId: _issueId, ...stop }) => stop),
		}
	}
}
