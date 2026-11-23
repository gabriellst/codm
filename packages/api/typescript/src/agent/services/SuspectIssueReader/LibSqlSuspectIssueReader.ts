import { injectable } from 'tsyringe-neo'
import { and, eq, gt, gte, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox, events, issues, stops, terminalLines } from '@codm/contracts/db'
import {
	IssueStatus,
	MailboxTargetKind,
	type ProviderKind,
	type StopKind,
	SupervisorVerdict,
	SuspicionReason,
} from '@codm/contracts-typescript/wire/enums'
import { IssueHold } from '@issue/services/IssueHold'
import { AgentIssueNudgedEvent } from '../../events/AgentIssueNudgedEvent'
import { AgentRunStartedEvent } from '../../events/AgentRunStartedEvent'
import { AgentSupervisorReviewedEvent, AgentSupervisorReviewedEventSchema } from '../../events/AgentSupervisorReviewedEvent'
import { DeclaredWaitReader } from '../DeclaredWaitReader'
import {
	NUDGE_LOOP_EPISODES,
	NUDGE_LOOP_WINDOW_MS,
	SILENT_TURN_MIN_MS,
	SILENT_TURN_QUIET_MS,
	SUPERVISOR_ACTION_WINDOW_MS,
	SUPERVISOR_COOLDOWN_MS,
	SUSPECT_STOP_AGE_MS,
	SUSPICION_OF_OPEN_STOP,
	SUSPICION_ORDER,
	SuspectIssueReader,
	type SuspectIssue,
} from './SuspectIssueReader'

/**
 * The rules over the store, in a handful of reads whatever the number of issues — the open issues, their open stops
 * (`issue_stops`, the thread's table), their unconsumed queue items, the nudges and reviews of the window (the agent's
 * own facts) and the last terminal line of the issues with a live turn. The hold and the declared wait are asked of
 * their ports for the few that survive the rules, so this reader and the dispatcher / reconciler never disagree.
 */
@injectable()
export class LibSqlSuspectIssueReader extends SuspectIssueReader {
	constructor(
		private readonly driver: LibSqlDatabaseDriver,
		private readonly hold: IssueHold,
		private readonly declared: DeclaredWaitReader,
	) {
		super()
	}

	async suspects(now: Date, limit: number): Promise<SuspectIssue[]> {
		const db = this.driver.db
		const at = now.getTime()

		const open = await db
			.select({
				issueId: issues.id,
				ownerId: issues.ownerId,
				threadId: issues.threadId,
				key: issues.key,
				title: issues.title,
				provider: issues.provider,
			})
			.from(issues)
			.where(and(eq(issues.archived, false), ne(issues.status, IssueStatus.COMPLETED)))
		if (open.length === 0) return []
		const ids = open.map(issue => issue.issueId)

		const [openStops, pending, nudges, reviews] = await Promise.all([
			db
				.select({ issueId: stops.issueId, kind: stops.kind, raisedAt: stops.raisedAt })
				.from(stops)
				.where(and(inArray(stops.issueId, ids), isNull(stops.resolvedAt))),
			db
				.select({
					issueId: agentMailbox.targetId,
					claimedBy: agentMailbox.claimedBy,
					leaseUntil: agentMailbox.leaseUntil,
				})
				.from(agentMailbox)
				.where(
					and(
						eq(agentMailbox.targetKind, MailboxTargetKind.ISSUE),
						inArray(agentMailbox.targetId, ids),
						isNull(agentMailbox.consumedAt),
						isNull(agentMailbox.deadAt),
						gt(agentMailbox.leaseUntil, now),
					),
				),
			db
				.select({ issueId: events.entityId, occurredAt: events.occurredAt })
				.from(events)
				.where(
					and(
						eq(events.name, AgentIssueNudgedEvent.name),
						inArray(events.entityId, ids),
						gte(events.occurredAt, new Date(at - NUDGE_LOOP_WINDOW_MS)),
						sql`json_extract(${events.payload}, '$.ordinal') = 1`,
					),
				),
			db
				.select({ issueId: events.entityId, occurredAt: events.occurredAt, payload: events.payload })
				.from(events)
				.where(
					and(
						eq(events.name, AgentSupervisorReviewedEvent.name),
						inArray(events.entityId, ids),
						gte(events.occurredAt, new Date(at - Math.max(SUPERVISOR_COOLDOWN_MS, SUPERVISOR_ACTION_WINDOW_MS))),
					),
				),
		])

		const live = pending.filter(item => item.claimedBy !== null)
		// Deferred for ANY cause (a provider wait, a pause, a retry on its schedule): the queue has a plan for it.
		const deferred = new Set(pending.filter(item => item.claimedBy === null).map(item => item.issueId))
		const liveIds = [...new Set(live.map(item => item.issueId))]
		const [lastLine, runStart] = await Promise.all([this.lastTerminalLineOf(liveIds), this.lastRunStartOf(liveIds)])
		// The agent's own facts, parsed with the producer's schema; a row that does not parse counts for nothing.
		const reviewed = reviews.flatMap(row => {
			const payload = AgentSupervisorReviewedEventSchema.shape.payload.safeParse(row.payload)
			return payload.success && row.issueId ? [{ ...payload.data, issueId: row.issueId, at: row.occurredAt.getTime() }] : []
		})
		const cooling = new Set(
			reviewed.filter(review => at - review.at < SUPERVISOR_COOLDOWN_MS).map(review => `${review.issueId}:${review.reason}`),
		)
		const actedOf = (issueId: string): SupervisorVerdict[] =>
			reviewed
				.filter(review => review.issueId === issueId && review.acted && at - review.at < SUPERVISOR_ACTION_WINDOW_MS)
				.map(review => review.verdict)

		const found: SuspectIssue[] = []
		for (const issue of open) {
			if (deferred.has(issue.issueId)) continue
			const mine = openStops.filter(stop => stop.issueId === issue.issueId)
			// The column is CHECK-closed over `StopKind` (`issue_stops_kind_check`), so the row's kind indexes the table.
			const reasonOf = (kind: StopKind) => SUSPICION_OF_OPEN_STOP[kind]
			// A person's stop open: the task is waiting on someone — never suspect, whatever else it shows.
			if (mine.some(stop => reasonOf(stop.kind) === null)) continue

			const since = new Map<SuspicionReason, Date>()
			for (const stop of mine) {
				const reason = reasonOf(stop.kind)
				if (reason && at - stop.raisedAt.getTime() >= SUSPECT_STOP_AGE_MS) since.set(reason, stop.raisedAt)
			}
			const loop = nudges.filter(nudge => nudge.issueId === issue.issueId).map(nudge => nudge.occurredAt.getTime())
			if (loop.length >= NUDGE_LOOP_EPISODES) since.set(SuspicionReason.NUDGE_LOOP, new Date(Math.min(...loop)))
			// A LIVE turn, measured from the spawn of the CURRENT run (`agent.run.started`, persisted at spawn) — not from
			// the item's first claim, which a deferral and a re-claim would make look old the instant the turn restarts.
			// Quiet since the later of that spawn and the last terminal line.
			const started = live.some(item => item.issueId === issue.issueId) ? runStart.get(issue.issueId) : undefined
			const printed = lastLine.get(issue.issueId)
			const quietFrom = Math.max(started?.getTime() ?? 0, printed?.getTime() ?? 0)
			if (started && at - started.getTime() >= SILENT_TURN_MIN_MS && at - quietFrom >= SILENT_TURN_QUIET_MS)
				since.set(SuspicionReason.SILENT_TURN, started)

			const reason = SUSPICION_ORDER.find(candidate => since.has(candidate) && !cooling.has(`${issue.issueId}:${candidate}`))
			if (!reason) continue
			found.push({
				...issue,
				provider: issue.provider as ProviderKind,
				reason,
				since: since.get(reason) as Date,
				nudgesLastDay: loop.length,
				actedLastDay: actedOf(issue.issueId),
			})
		}

		found.sort((a, b) => a.since.getTime() - b.since.getTime())
		const waiting = await this.declared.waiting(found.map(suspect => suspect.issueId))
		const out: SuspectIssue[] = []
		for (const suspect of found) {
			if (out.length >= limit) break
			// A feedback asked waits without a deadline (owner, 20/11); a paused issue or conversation is held on purpose.
			if (waiting.has(suspect.issueId) || (await this.hold.isHeld(suspect.issueId))) continue
			out.push(suspect)
		}
		return out
	}

	/** The instant each issue's latest run was spawned (`agent.run.started`). */
	private async lastRunStartOf(issueIds: readonly string[]): Promise<Map<string, Date>> {
		if (issueIds.length === 0) return new Map()
		const rows = await this.driver.db
			.select({ issueId: events.entityId, at: sql<number>`max(${events.occurredAt})` })
			.from(events)
			.where(and(eq(events.name, AgentRunStartedEvent.name), inArray(events.entityId, [...issueIds])))
			.groupBy(events.entityId)
		return new Map(rows.flatMap(row => (row.issueId ? [[row.issueId, new Date(Number(row.at))] as const] : [])))
	}

	/** The instant of each issue's last terminal line — what a turn last printed. */
	private async lastTerminalLineOf(issueIds: readonly string[]): Promise<Map<string, Date>> {
		if (issueIds.length === 0) return new Map()
		const rows = await this.driver.db
			.select({ issueId: terminalLines.issueId, at: sql<number>`max(${terminalLines.at})` })
			.from(terminalLines)
			.where(and(inArray(terminalLines.issueId, [...issueIds]), isNotNull(terminalLines.at)))
			.groupBy(terminalLines.issueId)
		return new Map(rows.map(row => [row.issueId, new Date(Number(row.at))]))
	}
}
