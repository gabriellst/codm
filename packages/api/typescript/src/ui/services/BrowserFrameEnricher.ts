import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import type { z } from 'zod'
import { BaseIntegrationEvent, DrizzleClient, tryCatchAsync } from '@codedm/core-typescript'
import { issues, stops, threads } from '@codedm/contracts/db'
import { IssueStatus, ThreadStatus } from '@codedm/contracts-typescript/wire/enums'
import {
	IssueOpenedEvent,
	IssueCompletedEvent,
	IssueStopRaisedEvent,
	IssueStopResolvedEvent,
} from '@codedm/contracts-typescript/wire/events'
import type { BrowserThreadStatusChangedFrameSchema, BrowserStopRaisedFrameSchema } from '../controllers/ListenEvents'

type ThreadStatusChangedFrame = z.infer<typeof BrowserThreadStatusChangedFrameSchema>
type StopRaisedFrame = z.infer<typeof BrowserStopRaisedFrameSchema>
export type BrowserFrame = ThreadStatusChangedFrame | StopRaisedFrame

/**
 * The SSE enricher (phase-6b). The `ListenEvents` union DECLARES `browser.thread_status_changed` +
 * `browser.stop_raised` but the raw broadcaster only re-emits `integration.*` envelopes — nothing
 * synthesizes those two enriched frames. This service closes that gap: given one broadcast
 * integration fact it returns the enriched `browser.*` frame(s) to fan out (empty for facts that map
 * to neither). The broadcaster keeps its raw-envelope re-emit for everything else.
 *
 * Synthesis map (needs-you + live status, denormalized with display fields the raw envelope lacks):
 *   integration.issue.stop_raised    → browser.stop_raised (threadDisplayName + issueKey) AND
 *                                       browser.thread_status_changed(NEEDS_ATTENTION)  [needs-you]
 *   integration.issue.opened         → browser.thread_status_changed(RUNNING)           [agent live]
 *   integration.issue.completed      → browser.thread_status_changed(recomputed)
 *   integration.issue.stop_resolved  → browser.thread_status_changed(recomputed)        [needs-you cleared]
 *
 * Status is derived rather than read from `threads.status` (the write model only stamps it on
 * pause/resume): PAUSED (thread flag) > NEEDS_ATTENTION (an open stop) > RUNNING (a WORKING issue) >
 * IDLE. `stop_raised`/`opened` force NEEDS_ATTENTION/RUNNING from the fact itself so the frame is
 * correct even before the materialization consumer has written the row; `completed`/`stop_resolved`
 * recompute while EXCLUDING the just-resolved issue/stop, so the transition is reflected without a
 * read-after-write race. `agentsRunningNow` is the owner-global WORKING count (the header/dock badge).
 *
 * Every read is defensive (`tryCatchAsync` → safe fallback), like `DrizzleOpenIssuesReader`: this runs
 * inside the broadcaster's fire-and-forget callback, so a read hiccup must degrade the frame's display
 * fields, never throw an unhandled rejection into the SSE fan-out.
 */
@injectable()
export class BrowserFrameEnricher {
	constructor(private readonly db: DrizzleClient) {}

	async enrich(event: BaseIntegrationEvent): Promise<BrowserFrame[]> {
		const ownerId = event.ownerId || ''
		if (!ownerId) return []

		if (event instanceof IssueStopRaisedEvent) {
			const { threadId, issueId, kind } = event.payload
			const [displayName, issueKey, agentsRunningNow] = await Promise.all([
				this.threadDisplayName(threadId),
				this.issueKey(issueId),
				this.agentsRunningNow(ownerId),
			])
			return [
				{ name: 'browser.stop_raised', threadId, threadDisplayName: displayName, issueId, issueKey, stopKind: kind },
				{ name: 'browser.thread_status_changed', threadId, status: ThreadStatus.NEEDS_ATTENTION, agentsRunningNow },
			]
		}

		if (event instanceof IssueOpenedEvent) {
			const { threadId } = event.payload
			const status = (await this.isPaused(threadId)) ? ThreadStatus.PAUSED : ThreadStatus.RUNNING
			const agentsRunningNow = Math.max(1, await this.agentsRunningNow(ownerId))
			return [{ name: 'browser.thread_status_changed', threadId, status, agentsRunningNow }]
		}

		if (event instanceof IssueCompletedEvent) {
			const { threadId, issueId } = event.payload
			return [await this.statusFrame(ownerId, threadId, { excludeIssueId: issueId })]
		}

		if (event instanceof IssueStopResolvedEvent) {
			const { issueId, stopId } = event.payload
			const threadId = await this.threadIdForIssue(issueId)
			if (!threadId) return []
			return [await this.statusFrame(ownerId, threadId, { excludeStopId: stopId })]
		}

		return []
	}

	/** Recompute a thread's operating status (excluding the just-resolved issue/stop) into a frame. */
	private async statusFrame(
		ownerId: string,
		threadId: string,
		exclude: { excludeIssueId?: string; excludeStopId?: string },
	): Promise<ThreadStatusChangedFrame> {
		const status = await this.deriveStatus(threadId, exclude)
		const agentsRunningNow = await this.agentsRunningNow(ownerId, exclude.excludeIssueId)
		return { name: 'browser.thread_status_changed', threadId, status, agentsRunningNow }
	}

	private async deriveStatus(threadId: string, exclude: { excludeIssueId?: string; excludeStopId?: string }): Promise<ThreadStatus> {
		if (await this.isPaused(threadId)) return ThreadStatus.PAUSED

		const openStops = await tryCatchAsync(async () =>
			this.db.select({ id: stops.id }).from(stops).where(and(eq(stops.threadId, threadId), isNull(stops.resolvedAt))),
		)
		if (openStops.success && openStops.data.some(s => s.id !== exclude.excludeStopId)) return ThreadStatus.NEEDS_ATTENTION

		const working = await tryCatchAsync(async () =>
			this.db
				.select({ id: issues.id })
				.from(issues)
				.where(and(eq(issues.threadId, threadId), eq(issues.status, IssueStatus.WORKING), eq(issues.archived, false))),
		)
		if (working.success && working.data.some(i => i.id !== exclude.excludeIssueId)) return ThreadStatus.RUNNING

		return ThreadStatus.IDLE
	}

	private async agentsRunningNow(ownerId: string, excludeIssueId?: string): Promise<number> {
		const result = await tryCatchAsync(async () =>
			this.db
				.select({ id: issues.id })
				.from(issues)
				.where(and(eq(issues.ownerId, ownerId), eq(issues.status, IssueStatus.WORKING), eq(issues.archived, false))),
		)
		return result.success ? result.data.filter(r => r.id !== excludeIssueId).length : 0
	}

	private async isPaused(threadId: string): Promise<boolean> {
		const result = await tryCatchAsync(async () =>
			this.db.select({ paused: threads.paused }).from(threads).where(eq(threads.id, threadId)).limit(1),
		)
		return result.success ? (result.data[0]?.paused ?? false) : false
	}

	private async threadDisplayName(threadId: string): Promise<string> {
		const result = await tryCatchAsync(async () =>
			this.db.select({ name: threads.contactDisplayName }).from(threads).where(eq(threads.id, threadId)).limit(1),
		)
		return result.success ? (result.data[0]?.name ?? 'Thread') : 'Thread'
	}

	private async issueKey(issueId: string): Promise<string> {
		const result = await tryCatchAsync(async () => this.db.select({ key: issues.key }).from(issues).where(eq(issues.id, issueId)).limit(1))
		return result.success ? (result.data[0]?.key ?? '') : ''
	}

	private async threadIdForIssue(issueId: string): Promise<string | undefined> {
		const result = await tryCatchAsync(async () =>
			this.db.select({ threadId: issues.threadId }).from(issues).where(eq(issues.id, issueId)).limit(1),
		)
		return result.success ? result.data[0]?.threadId : undefined
	}
}
