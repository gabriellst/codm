import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleDatabaseDriver, Handler, z } from '@codm/core-typescript'
import { issues } from '@codm/contracts/db'
import { IssueStatus } from '@codm/contracts-typescript/wire/enums'

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
	/* D5 — no `autoArchiveNote`. It was a fixed English sentence carrying no server data, shipped on
	   every read so the console could print it verbatim; the console owns that copy now, in the
	   operator's language. Same removal as `GetSessionChat.autonomyCaption`. */
})

/** Read — SessionIssues (T11). One thread's issues grouped by status + the archived list. */
@injectable()
export class GetSessionIssues extends Handler<typeof GetSessionIssuesInputSchema, typeof GetSessionIssuesOutputSchema> {
	readonly name = 'get_session_issues' as const
	readonly inputSchema = GetSessionIssuesInputSchema
	readonly outputSchema = GetSessionIssuesOutputSchema

	constructor(private readonly driver: DrizzleDatabaseDriver) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const rows = await this.driver.db.select().from(issues).where(eq(issues.threadId, input.threadId))
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
		}
	}
}
