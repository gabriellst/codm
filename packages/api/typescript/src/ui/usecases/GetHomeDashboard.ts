import { injectable } from 'tsyringe-neo'
import { and, asc, desc, eq, gte, inArray, isNull } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@codm/core-typescript'
import { threads, issues, stops, transcriptEntries, workspaces, channels } from '@codm/contracts/db'
import {
	ThreadStatus,
	ChannelKind,
	ChannelStatus,
	IssueStatus,
	ProviderKind,
	StopKind,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { ThreadStatusDeriver } from '@thread/services/ThreadStatusDeriver'

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
	needsYou: z.object({ threadId: z.uuid(), threadDisplayName: z.string(), stopKinds: z.array(z.enum(StopKind)) }).optional(),
	/**
	 * EVERY thread of the owner — the sidebar's conversation list (F1).
	 *
	 * Distinct from `activeSessions`, which answers a different question and filters to
	 * `RUNNING | NEEDS_ATTENTION`. The sidebar read that filtered list, so a thread sitting `IDLE` —
	 * the normal state of a conversation nobody is currently being answered in — showed as "Nenhuma
	 * conversa ainda" while the row plainly existed. Two questions, two fields; the home page shows both.
	 */
	threads: z.array(ThreadSummarySchema),
	activeSessions: z.array(ThreadSummarySchema),
	/**
	 * Recent transcript lines. `kind` is the ENUM, not a pre-rendered label — this used to ship as
	 * `title: z.string()` carrying the raw `TranscriptKind`, which is how "CONTACT" and "SYSTEM" came
	 * to be printed verbatim in a Portuguese list. Typed as the enum the browser runs it through
	 * `enumLabel` and the i18n rail can see it; as a bare `string` it was invisible to both.
	 */
	latestActivity: z.array(z.object({ kind: z.enum(TranscriptKind), subtitle: z.string(), threadId: z.uuid(), at: z.string() })),
	/**
	 * `medianResponseSeconds` is HOW LONG THE CONTACT WAITED, in seconds, for the median reply sent
	 * today — measured on the transcript, from the first message of an unanswered inbound burst to the
	 * line that answered it. It shipped as a literal `0`, so the card read "0s" forever: a number the
	 * operator cannot distinguish from "we answer instantly", which is precisely the reading that makes
	 * the stat worth nothing.
	 */
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

	constructor(
		private readonly db: DrizzleClient,
		private readonly statuses: ThreadStatusDeriver,
	) {
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
				channelKind: channels.platform,
				providers: threads.providers,
				paused: threads.paused,
				updatedAt: threads.updatedAt,
			})
			.from(threads)
			.leftJoin(workspaces, eq(threads.workspaceId, workspaces.id))
			.leftJoin(channels, eq(threads.channelId, channels.id))
			// Apagadas are out (thread-deletion spec, decision 5). This one predicate covers BOTH `threads`
			// and `activeSessions` below, because the second is derived from the first.
			.where(and(eq(threads.ownerId, input.ownerId), isNull(threads.deletedAt)))

		// PROJECTED, not `select()` — the join below would otherwise nest the row per table
		// (`{ issue_stops: …, thread_threads: … }`) and silently change what `buildNeedsYou` reads. Only
		// the two columns it uses travel.
		const openStops = await this.db
			.select({ threadId: stops.threadId, kind: stops.kind })
			.from(stops)
			// Stops are read owner-wide here, so the join is how a deleted thread's stop is kept out of the
			// Needs-you callout — the same reason `GetNeedsYouPanel` grew one.
			.innerJoin(threads, and(eq(stops.threadId, threads.id), isNull(threads.deletedAt)))
			.where(and(eq(stops.ownerId, input.ownerId), isNull(stops.resolvedAt)))

		// Status is DERIVED, never read from `threads.status` — that column only ever holds IDLE or
		// PAUSED (nothing stamps it when work starts), so filtering it for RUNNING/NEEDS_ATTENTION
		// matched nothing and "active sessions" was permanently empty while the headline right above it
		// counted a working agent. One batched call for the whole owner (B4, spec decision 7): the three
		// reads behind the precedence live in `ThreadStatusDeriver`, not here.
		const statuses = await this.statuses.forOwner(input.ownerId)

		const toSummary = (t: (typeof threadRows)[number]) => ({
			threadId: t.threadId,
			displayName: t.displayName,
			channelKind: (t.channelKind ?? ChannelKind.WHATSAPP) as ChannelKind,
			workspacePath: t.workspacePath ?? '',
			providers: t.providers as ProviderKind[],
			status: statuses.get(t.threadId) ?? ThreadStatus.IDLE,
			lastActivity: t.updatedAt.toISOString(),
		})

		// Most recently active first: the sidebar is a conversation list, and a conversation list that
		// does not surface the one you were just in is a list you have to search.
		const allThreads = [...threadRows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map(toSummary)
		const activeSessions = allThreads.filter(t => t.status === ThreadStatus.RUNNING || t.status === ThreadStatus.NEEDS_ATTENTION)

		const needsYou = this.buildNeedsYou(openStops, threadRows)

		const recent = await this.db
			.select({
				text: transcriptEntries.text,
				threadId: transcriptEntries.threadId,
				at: transcriptEntries.at,
				kind: transcriptEntries.kind,
			})
			.from(transcriptEntries)
			// THE READ THE SPEC NAMES BY HAND (thread-deletion spec, decision 5): this one reads the
			// TRANSCRIPT, so a sweep that walks `from(threads)` never visits it — and without the join the
			// home screen prints the words of a conversation the operator believes they deleted. Inner join
			// because every entry has a NOT NULL `thread_id` whose row exists.
			.innerJoin(threads, and(eq(transcriptEntries.threadId, threads.id), isNull(threads.deletedAt)))
			.where(eq(transcriptEntries.ownerId, input.ownerId))
			.orderBy(desc(transcriptEntries.at))
			.limit(8)
		const latestActivity = recent.map(r => ({
			kind: r.kind as TranscriptKind,
			subtitle: r.text.slice(0, 120),
			threadId: r.threadId,
			at: r.at.toISOString(),
		}))

		const dayStart = new Date(new Date().setHours(0, 0, 0, 0))
		const issuesOpened = allIssues.filter(i => i.createdAt >= dayStart).length
		const issuesClosed = allIssues.filter(i => i.completedAt !== null && i.completedAt !== undefined && i.completedAt >= dayStart).length

		const medianResponseSeconds = await this.medianResponse(input.ownerId, dayStart)

		const channelRows = await this.db
			.select({ kind: channels.platform, status: channels.status })
			.from(channels)
			.where(eq(channels.ownerId, input.ownerId))

		return {
			agentsRunningNow,
			needsYou,
			threads: allThreads,
			activeSessions,
			latestActivity,
			today: { issuesOpened, issuesClosed, medianResponseSeconds },
			channels: channelRows.map(c => ({ kind: c.kind as ChannelKind, status: c.status as ChannelStatus })),
		}
	}

	/**
	 * TODAY'S MEDIAN RESPONSE, in seconds, off the transcript.
	 *
	 * A "response" is one inbound burst answered: the clock starts at the FIRST contact line nobody had
	 * answered yet and stops at the next line this side put on the channel. Starting it at the first
	 * message of the burst rather than the last is the whole point — a contact who writes four lines in
	 * a row waited from the first one, and pairing each line with the same reply would report four
	 * responses for one, three of them flatteringly short.
	 *
	 * OUTBOUND IS `SYSTEM | DIRECT` — the two kinds that reach the contact. `WHISPER` is an in-app steer
	 * that never leaves the console and `ACTION` is an audit line; counting either would stop the clock
	 * on a reply the contact never saw.
	 *
	 * The window is today, same `dayStart` as the two counters beside it, so the three numbers on the
	 * card describe the same day. A burst that opened before midnight and was answered after it is
	 * therefore not counted — the alternative is a stat whose window silently differs from its label.
	 *
	 * Median, not mean: one conversation left overnight would drag an average past every number the
	 * operator recognises.
	 */
	private async medianResponse(ownerId: string, dayStart: Date): Promise<number> {
		const OUTBOUND = [TranscriptKind.SYSTEM, TranscriptKind.DIRECT]

		const entries = await this.db
			.select({ threadId: transcriptEntries.threadId, kind: transcriptEntries.kind, at: transcriptEntries.at })
			.from(transcriptEntries)
			// Same join as `latestActivity` above, for the same reason: a deleted thread's lines must not
			// speak for the owner's numbers either.
			.innerJoin(threads, and(eq(transcriptEntries.threadId, threads.id), isNull(threads.deletedAt)))
			.where(
				and(
					eq(transcriptEntries.ownerId, ownerId),
					gte(transcriptEntries.at, dayStart),
					inArray(transcriptEntries.kind, [TranscriptKind.CONTACT, ...OUTBOUND]),
				),
			)
			// Chronological, because the pairing below walks each thread forward in time.
			.orderBy(asc(transcriptEntries.at))

		const waitingSince = new Map<string, Date>()
		const waits: number[] = []
		for (const entry of entries) {
			if (entry.kind === TranscriptKind.CONTACT) {
				// First line of the burst wins — a later one in the same burst must not reset the clock.
				if (!waitingSince.has(entry.threadId)) waitingSince.set(entry.threadId, entry.at)
				continue
			}
			const since = waitingSince.get(entry.threadId)
			// No pending inbound ⇒ this is us opening the conversation, not answering it.
			if (!since) continue
			waits.push((entry.at.getTime() - since.getTime()) / 1000)
			waitingSince.delete(entry.threadId)
		}

		// Nothing was answered today: 0 is the honest reading of an empty set here, and it is what the
		// card already renders for a quiet morning.
		if (waits.length === 0) return 0
		const sorted = [...waits].sort((a, b) => a - b)
		const mid = Math.floor(sorted.length / 2)
		return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
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
