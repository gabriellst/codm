import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@codedm/core-typescript'
import { issues, threads } from '@codedm/contracts/db'
import { IssueStatus } from '@codedm/contracts-typescript/wire/enums'

const IssueItemSchema = z.object({
	issueId: z.uuid(),
	key: z.string(),
	title: z.string(),
	status: z.enum(IssueStatus),
	meta: z.string().optional(),
	archived: z.boolean(),
	threadId: z.uuid(),
	threadDisplayName: z.string(),
})

export const GetIssuesOverviewInputSchema = z.object({ ownerId: z.uuid(), includeArchived: z.boolean().default(false) })
export const GetIssuesOverviewOutputSchema = z.object({
	statsLine: z.object({ awaitingInput: z.number().int(), working: z.number().int(), completed: z.number().int(), archived: z.number().int() }),
	groups: z.array(z.object({ status: z.enum(IssueStatus), items: z.array(IssueItemSchema) })),
	archived: z.array(IssueItemSchema),
})

/** Read — IssuesOverview (T04). All issues across every thread, grouped by status + an archived
 *  section, each carrying its thread of origin. Cross-thread read (BFF join issues ⋈ threads). */
@injectable()
export class GetIssuesOverview extends Handler<typeof GetIssuesOverviewInputSchema, typeof GetIssuesOverviewOutputSchema> {
	readonly name = 'get_issues_overview' as const
	readonly inputSchema = GetIssuesOverviewInputSchema
	readonly outputSchema = GetIssuesOverviewOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const rows = await this.db
			.select({
				issueId: issues.id,
				key: issues.key,
				title: issues.title,
				status: issues.status,
				meta: issues.meta,
				archived: issues.archived,
				threadId: issues.threadId,
				threadDisplayName: threads.contactDisplayName,
			})
			.from(issues)
			.innerJoin(threads, eq(issues.threadId, threads.id))
			.where(eq(issues.ownerId, input.ownerId))

		const items = rows.map(r => ({
			issueId: r.issueId,
			key: r.key,
			title: r.title,
			status: r.status as IssueStatus,
			meta: r.meta ?? undefined,
			archived: r.archived,
			threadId: r.threadId,
			threadDisplayName: r.threadDisplayName,
		}))

		const active = items.filter(i => !i.archived)
		const archived = items.filter(i => i.archived)
		const byStatus = (s: IssueStatus) => active.filter(i => i.status === s)

		return {
			statsLine: {
				awaitingInput: byStatus(IssueStatus.NEEDS_INPUT).length,
				working: byStatus(IssueStatus.WORKING).length,
				completed: byStatus(IssueStatus.COMPLETED).length,
				archived: archived.length,
			},
			groups: [IssueStatus.NEEDS_INPUT, IssueStatus.WORKING, IssueStatus.COMPLETED].map(status => ({ status, items: byStatus(status) })),
			archived: input.includeArchived ? archived : [],
		}
	}
}
