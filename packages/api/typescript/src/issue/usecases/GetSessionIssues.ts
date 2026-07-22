import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@template/core-typescript'
import { issues } from '@template/contracts/db'
import { IssueStatus } from '@template/contracts-typescript/wire/enums'

const IssueSummarySchema = z.object({
	issueId: z.uuid(),
	key: z.string(),
	title: z.string(),
	status: z.enum(IssueStatus),
	meta: z.string().optional(),
	archived: z.boolean(),
})

export const GetSessionIssuesInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })
export const GetSessionIssuesOutputSchema = z.object({
	statsLine: z.object({ awaitingInput: z.number().int(), working: z.number().int(), completed: z.number().int() }),
	groups: z.array(z.object({ status: z.enum(IssueStatus), items: z.array(IssueSummarySchema) })),
	archived: z.array(IssueSummarySchema),
	autoArchiveNote: z.string(),
})

/** Read — SessionIssues (T11). One thread's issues grouped by status + archived list + the
 *  auto-archive note. */
@injectable()
export class GetSessionIssues extends Handler<typeof GetSessionIssuesInputSchema, typeof GetSessionIssuesOutputSchema> {
	readonly name = 'get_session_issues' as const
	readonly inputSchema = GetSessionIssuesInputSchema
	readonly outputSchema = GetSessionIssuesOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const rows = await this.db.select().from(issues).where(eq(issues.threadId, input.threadId))
		const items = rows.map(r => ({
			issueId: r.id,
			key: r.key,
			title: r.title,
			status: r.status as IssueStatus,
			meta: r.meta ?? undefined,
			archived: r.archived,
		}))
		const active = items.filter(i => !i.archived)
		const byStatus = (s: IssueStatus) => active.filter(i => i.status === s)

		return {
			statsLine: {
				awaitingInput: byStatus(IssueStatus.NEEDS_INPUT).length,
				working: byStatus(IssueStatus.WORKING).length,
				completed: byStatus(IssueStatus.COMPLETED).length,
			},
			groups: [IssueStatus.NEEDS_INPUT, IssueStatus.WORKING, IssueStatus.COMPLETED].map(status => ({ status, items: byStatus(status) })),
			archived: items.filter(i => i.archived),
			autoArchiveNote: 'Completed issues auto-archive after 24 hours.',
		}
	}
}
