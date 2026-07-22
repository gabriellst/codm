import { injectable } from 'tsyringe-neo'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@codedm/core-typescript'
import { threads, issues, stops, transcriptEntries, workspaces, channels } from '@codedm/contracts/db'
import { ThreadStatus, ChannelKind, ChannelStatus, IssueStatus, ProviderKind, StopKind } from '@codedm/contracts-typescript/wire/enums'

const ThreadSummarySchema = z.object({
	threadId: z.uuid(),
	displayName: z.string(),
	channelKind: z.enum(ChannelKind),
	workspacePath: z.string(),
	providers: z.array(z.enum(ProviderKind)),
	status: z.enum(ThreadStatus),
	lastActivity: z.string(),
})

export const GetHomeDashboardInputSchema = z.object({ ownerId: z.uuid() })
export const GetHomeDashboardOutputSchema = z.object({
	agentsRunningNow: z.number().int(),
	needsYou: z
		.object({ threadId: z.uuid(), threadDisplayName: z.string(), stopKinds: z.array(z.enum(StopKind)) })
		.optional(),
	activeSessions: z.array(ThreadSummarySchema),
	latestActivity: z.array(z.object({ title: z.string(), subtitle: z.string(), threadId: z.uuid(), at: z.string() })),
	today: z.object({ issuesOpened: z.number().int(), issuesClosed: z.number().int(), medianResponseSeconds: z.number() }),
	channels: z.array(z.object({ kind: z.enum(ChannelKind), status: z.enum(ChannelStatus) })),
})

/**
 * Read — HomeDashboard (T03). The cross-context operating overview (BFF query in the ui context —
 * spans BC1/BC2/BC4/BC5). Aggregates agents-running, the Needs-You callout, active sessions, latest
 * activity, today's metrics, and channel health from the read tables directly.
 */
@injectable()
export class GetHomeDashboard extends Handler<typeof GetHomeDashboardInputSchema, typeof GetHomeDashboardOutputSchema> {
	readonly name = 'get_home_dashboard' as const
	readonly inputSchema = GetHomeDashboardInputSchema
	readonly outputSchema = GetHomeDashboardOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const allIssues = await this.db.select().from(issues).where(eq(issues.ownerId, input.ownerId))
		const agentsRunningNow = allIssues.filter(i => i.status === IssueStatus.WORKING && !i.archived).length

		const threadRows = await this.db
			.select({
				threadId: threads.id,
				displayName: threads.contactDisplayName,
				workspacePath: workspaces.path,
				channelKind: channels.kind,
				providers: threads.providers,
				status: threads.status,
				updatedAt: threads.updatedAt,
			})
			.from(threads)
			.leftJoin(workspaces, eq(threads.workspaceId, workspaces.id))
			.leftJoin(channels, eq(threads.channelId, channels.id))
			.where(eq(threads.ownerId, input.ownerId))

		const activeSessions = threadRows
			.filter(t => t.status === ThreadStatus.RUNNING || t.status === ThreadStatus.NEEDS_ATTENTION)
			.map(t => ({
				threadId: t.threadId,
				displayName: t.displayName,
				channelKind: (t.channelKind ?? ChannelKind.WHATSAPP) as ChannelKind,
				workspacePath: t.workspacePath ?? '',
				providers: t.providers as ProviderKind[],
				status: t.status as ThreadStatus,
				lastActivity: t.updatedAt.toISOString(),
			}))

		const openStops = await this.db.select().from(stops).where(and(eq(stops.ownerId, input.ownerId), isNull(stops.resolvedAt)))
		const needsYou = this.buildNeedsYou(openStops, threadRows)

		const recent = await this.db
			.select({ text: transcriptEntries.text, threadId: transcriptEntries.threadId, at: transcriptEntries.at, kind: transcriptEntries.kind })
			.from(transcriptEntries)
			.where(eq(transcriptEntries.ownerId, input.ownerId))
			.orderBy(desc(transcriptEntries.at))
			.limit(8)
		const latestActivity = recent.map(r => ({ title: r.kind, subtitle: r.text.slice(0, 120), threadId: r.threadId, at: r.at.toISOString() }))

		const dayStart = new Date(new Date().setHours(0, 0, 0, 0))
		const issuesOpened = allIssues.filter(i => i.createdAt >= dayStart).length
		const issuesClosed = allIssues.filter(i => i.completedAt !== null && i.completedAt !== undefined && i.completedAt >= dayStart).length

		const channelRows = await this.db.select({ kind: channels.kind, status: channels.status }).from(channels).where(eq(channels.ownerId, input.ownerId))

		return {
			agentsRunningNow,
			needsYou,
			activeSessions,
			latestActivity,
			today: { issuesOpened, issuesClosed, medianResponseSeconds: 0 },
			channels: channelRows.map(c => ({ kind: c.kind as ChannelKind, status: c.status as ChannelStatus })),
		}
	}

	private buildNeedsYou(
		openStops: { threadId: string; kind: string }[],
		threadRows: { threadId: string; displayName: string }[],
	): { threadId: string; threadDisplayName: string; stopKinds: StopKind[] } | undefined {
		if (openStops.length === 0) return undefined
		const threadId = openStops[0]!.threadId
		const kinds = openStops.filter(s => s.threadId === threadId).map(s => s.kind as StopKind)
		const display = threadRows.find(t => t.threadId === threadId)?.displayName ?? 'Thread'
		return { threadId, threadDisplayName: display, stopKinds: kinds }
	}
}
