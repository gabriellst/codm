import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { Handler, PgDatabaseDriver, z, BaseError } from '@codm/core-typescript'
import { panelDaemons, panelIssues } from '@codm/contracts/db/pg'
import { IssueLifeState, IssueStatus } from '@codm/contracts-typescript/wire/enums'
import type { ApplicationErrors } from '../errors'
import { panelGroupByToken } from './panelGroupByToken'

export const GetPanelBoardInputSchema = z.object({ token: z.string().min(16).max(128) })
export const GetPanelBoardOutputSchema = z.object({
	group: z.object({ name: z.string() }),
	/** When the owner's daemon last reported (ISO) — absent if it never did. The panel says "sem contato há N min". */
	daemonLastSeenAt: z.string().optional(),
	issues: z.array(
		z.object({
			issueId: z.uuid(),
			key: z.string(),
			title: z.string(),
			status: z.enum(IssueStatus),
			lifeState: z.enum(IssueLifeState),
			waitingForProviderUntil: z.string().optional(),
			updatedAt: z.string(),
		}),
	),
})

/** Query — the board of ONE group, by its link token (public). Archived issues are off the board. */
@injectable()
export class GetPanelBoard extends Handler<typeof GetPanelBoardInputSchema, typeof GetPanelBoardOutputSchema> {
	readonly name = 'get_panel_board' as const
	readonly inputSchema = GetPanelBoardInputSchema
	readonly outputSchema = GetPanelBoardOutputSchema

	constructor(private readonly driver: PgDatabaseDriver) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const group = await panelGroupByToken(this.driver, input.token)
		if (!group) throw new BaseError<ApplicationErrors>('PANEL_NOT_FOUND', 'no panel for this link')
		const [issues, [daemon]] = await Promise.all([
			this.driver.db
				.select()
				.from(panelIssues)
				.where(and(eq(panelIssues.threadId, group.threadId), eq(panelIssues.ownerId, group.ownerId), eq(panelIssues.archived, false))),
			this.driver.db.select().from(panelDaemons).where(eq(panelDaemons.ownerId, group.ownerId)).limit(1),
		])
		return {
			group: { name: group.name },
			daemonLastSeenAt: daemon?.lastSeenAt.toISOString(),
			issues: issues.map(issue => ({
				issueId: issue.issueId,
				key: issue.key,
				title: issue.title,
				status: issue.status,
				lifeState: issue.lifeState,
				waitingForProviderUntil: issue.waitingForProviderUntil?.toISOString(),
				updatedAt: issue.updatedAt.toISOString(),
			})),
		}
	}
}
