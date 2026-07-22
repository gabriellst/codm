import { injectable } from 'tsyringe-neo'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { Handler, z, BaseError, DrizzleClient } from '@template/core-typescript'
import { issues, stops, terminalLines, transcriptEntries } from '@template/contracts/db'
import { IssueStatus, ProviderKind, StopKind, TranscriptKind, ClassificationMethod } from '@template/contracts-typescript/wire/enums'
import type { ApplicationErrors } from '../errors'

export const GetIssueDetailInputSchema = z.object({ ownerId: z.uuid(), issueId: z.uuid() })
export const GetIssueDetailOutputSchema = z.object({
	issue: z.object({
		issueId: z.uuid(),
		key: z.string(),
		title: z.string(),
		status: z.enum(IssueStatus),
		meta: z.string().optional(),
		archived: z.boolean(),
	}),
	provider: z.enum(ProviderKind),
	terminalLog: z.array(z.object({ at: z.string(), line: z.string() })),
	routedMessages: z.array(
		z.object({ entryId: z.uuid(), kind: z.enum(TranscriptKind), text: z.string(), at: z.string(), classification: z.enum(ClassificationMethod).optional() }),
	),
	stops: z.array(z.object({ stopId: z.uuid(), kind: z.enum(StopKind), title: z.string(), detail: z.string(), raisedAt: z.string() })),
})

/** Read — IssueDetail (T12). One issue drill-down: terminal session log, the messages routed here,
 *  and its open stops. */
@injectable()
export class GetIssueDetail extends Handler<typeof GetIssueDetailInputSchema, typeof GetIssueDetailOutputSchema> {
	readonly name = 'get_issue_detail' as const
	readonly inputSchema = GetIssueDetailInputSchema
	readonly outputSchema = GetIssueDetailOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const [issue] = await this.db.select().from(issues).where(eq(issues.id, input.issueId)).limit(1)
		if (!issue || issue.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)

		const lines = await this.db.select().from(terminalLines).where(eq(terminalLines.issueId, input.issueId)).orderBy(asc(terminalLines.seq))
		const routed = await this.db.select().from(transcriptEntries).where(eq(transcriptEntries.issueId, input.issueId)).orderBy(asc(transcriptEntries.at))
		const openStops = await this.db.select().from(stops).where(and(eq(stops.issueId, input.issueId), isNull(stops.resolvedAt)))

		return {
			issue: {
				issueId: issue.id,
				key: issue.key,
				title: issue.title,
				status: issue.status as IssueStatus,
				meta: issue.meta ?? undefined,
				archived: issue.archived,
			},
			provider: issue.provider as ProviderKind,
			terminalLog: lines.map(l => ({ at: l.at.toISOString(), line: l.line })),
			routedMessages: routed.map(e => ({
				entryId: e.id,
				kind: e.kind as TranscriptKind,
				text: e.text,
				at: e.at.toISOString(),
				classification: (e.classification ?? undefined) as ClassificationMethod | undefined,
			})),
			stops: openStops.map(s => ({ stopId: s.id, kind: s.kind as StopKind, title: s.title, detail: s.detail, raisedAt: s.raisedAt.toISOString() })),
		}
	}
}
