import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import type Z from 'zod'
import { BaseIntegrationEvent, DrizzleClient, tryCatchAsync, z } from '@codedm/core-typescript'
import { issues, stops, threads } from '@codedm/contracts/db'
import { IssueStatus, StopKind, ThreadStatus } from '@codedm/contracts-typescript/wire/enums'
import {
	IssueOpenedEvent,
	IssueCompletedEvent,
	ThreadStopRaisedEvent,
	ThreadStopResolvedEvent,
	ChannelMessageReceivedEvent,
} from '@codedm/contracts-typescript/wire/events'
import { deriveThreadStatus } from '@shared/services'

/**
 * The `browser.*` SSE frames — DECLARED HERE, at their synthesizer. These are UI-only enriched views
 * (denormalized display fields computed at broadcast time), never wire facts: they ride no outbox,
 * cross no service, and are therefore correctly OUTSIDE `packages/contracts` (the codegen only emits
 * models that `extends IntegrationEvent`). This module is their single declared source; the SSE
 * controller composes `BrowserSseFrameSchema` into its output union and never redeclares a frame.
 * Field vocabulary stays contract-typed (`ThreadStatus` / `StopKind` from the wire enums).
 */
export const BrowserThreadStatusChangedFrameSchema = z.object({
	name: z.literal('browser.thread_status_changed'),
	threadId: z.string(),
	status: z.enum(ThreadStatus),
	agentsRunningNow: z.number().int(),
})

export const BrowserStopRaisedFrameSchema = z.object({
	name: z.literal('browser.stop_raised'),
	threadId: z.string(),
	threadDisplayName: z.string(),
	issueId: z.string(),
	issueKey: z.string(),
	stopKind: z.enum(StopKind),
})

/**
 * A message landed in a thread's transcript. Synthesized ONLY for the inbound gateway fact, which is
 * the one thread-scoped signal the browser cannot scope for itself: `integration.channel_message.received`
 * is addressed by `(channelId, remoteId)` — a WhatsApp JID — and carries no `threadId`. Resolving that
 * pair is a join, and a join belongs on this side of the wire; the alternative would be leaking
 * `contactExternalId` into a UI DTO so the browser could match JIDs, which is a worse contract.
 *
 * The console's own outbound half needs no frame: `integration.orchestrator.replied` already carries
 * `threadId` and the browser subscribes to it directly.
 */
export const BrowserThreadMessageIngestedFrameSchema = z.object({
	name: z.literal('browser.thread_message_ingested'),
	threadId: z.string(),
})

export const BrowserSseFrameSchema = z.discriminatedUnion('name', [
	BrowserThreadStatusChangedFrameSchema,
	BrowserStopRaisedFrameSchema,
	BrowserThreadMessageIngestedFrameSchema,
])

type ThreadStatusChangedFrame = Z.infer<typeof BrowserThreadStatusChangedFrameSchema>
type StopRaisedFrame = Z.infer<typeof BrowserStopRaisedFrameSchema>
type ThreadMessageIngestedFrame = Z.infer<typeof BrowserThreadMessageIngestedFrameSchema>
export type BrowserFrame = ThreadStatusChangedFrame | StopRaisedFrame | ThreadMessageIngestedFrame

/**
 * The SSE enricher (phase-6b). The `ListenEvents` union DECLARES `browser.thread_status_changed` +
 * `browser.stop_raised` but the raw broadcaster only re-emits `integration.*` envelopes — nothing
 * synthesizes those two enriched frames. This service closes that gap: given one broadcast
 * integration fact it returns the enriched `browser.*` frame(s) to fan out (empty for facts that map
 * to neither). The broadcaster keeps its raw-envelope re-emit for everything else.
 *
 * Synthesis map (needs-you + live status, denormalized with display fields the raw envelope lacks):
 *   integration.thread.stop_raised       → browser.stop_raised (threadDisplayName + issueKey) AND
 *                                           browser.thread_status_changed(NEEDS_ATTENTION)  [needs-you]
 *   integration.issue.opened             → browser.thread_status_changed(RUNNING)           [agent live]
 *   integration.issue.completed          → browser.thread_status_changed(recomputed)
 *   integration.thread.stop_resolved     → browser.thread_status_changed(recomputed)    [needs-you cleared]
 *   integration.channel_message.received → browser.thread_message_ingested               [the thread JOIN]
 *
 * A fact is enriched here — rather than left for the browser to consume raw — for exactly one reason:
 * the browser cannot scope it to a thread on its own. Everything that already carries `threadId`
 * (orchestrator.replied, issue.created, artifact.recorded) is subscribed to raw, because adding a frame
 * for it would only be a second name for the same fact.
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

		// Narrowed on the DISCRIMINATOR, never on `instanceof`. A fact this daemon published is a class
		// instance; a fact the Go gateway published arrives through the ingress lane as the PLAIN OBJECT
		// `adaptWireEnvelope` returns, because JSON does not carry a prototype. `instanceof` is therefore
		// true for exactly half the surface — and it is the Go half that owns the inbound message, i.e.
		// the one fact this service most needs to see. The wire `name` is the only narrowing both shapes
		// answer to, and it is read from the contract class (never typed as a literal) so a renamed event
		// is a compile error rather than a branch that stops firing.
		switch (event.name) {
			case ThreadStopRaisedEvent.name: {
				const { threadId, issueId, kind } = this.payload<{ threadId: string; issueId: string; kind: StopKind }>(event)
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

			case IssueOpenedEvent.name: {
				const { threadId } = this.payload<{ threadId: string }>(event)
				const status = (await this.isPaused(threadId)) ? ThreadStatus.PAUSED : ThreadStatus.RUNNING
				const agentsRunningNow = Math.max(1, await this.agentsRunningNow(ownerId))
				return [{ name: 'browser.thread_status_changed', threadId, status, agentsRunningNow }]
			}

			case IssueCompletedEvent.name: {
				const { threadId, issueId } = this.payload<{ threadId: string; issueId: string }>(event)
				return [await this.statusFrame(ownerId, threadId, { excludeIssueId: issueId })]
			}

			case ThreadStopResolvedEvent.name: {
				const { issueId, stopId } = this.payload<{ issueId: string; stopId: string }>(event)
				const threadId = await this.threadIdForIssue(issueId)
				if (!threadId) return []
				return [await this.statusFrame(ownerId, threadId, { excludeStopId: stopId })]
			}

			/**
			 * The inbound message → the thread it landed in. Deliberately NOT filtered by `messageType` or
			 * by whether `ConsumeInboundMessage` went on to drop it: the enricher cannot know what the
			 * handler decided, and a frame for a message that produced no transcript row costs one refetch
			 * that returns the same data. Withholding one that DID produce a row costs a console showing a
			 * conversation the operator can see on their phone but not here, until something else happens.
			 *
			 * Safe to fan out AFTER the write, always: `dispatch` awaits every handler before it notifies a
			 * single callback, so by the time this frame reaches the browser the transcript row exists.
			 */
			case ChannelMessageReceivedEvent.name: {
				const { channelId, remoteId } = this.payload<{ channelId: string; remoteId: string }>(event)
				if (!channelId || !remoteId) return []
				const threadId = await this.threadIdForContact(channelId, remoteId)
				// An inbound for a contact no thread is attached to has no console destination — the same
				// drop `ConsumeInboundMessage` makes for the same reason.
				if (!threadId) return []
				return [{ name: 'browser.thread_message_ingested', threadId }]
			}

			default:
				return []
		}
	}

	/**
	 * The payload of an event that may be either shape. The cast is confined to this one place: both the
	 * class instance and the ingress plain object carry the SAME wire payload, and the discriminator
	 * checked at the call site is what makes the requested shape true.
	 */
	private payload<T>(event: BaseIntegrationEvent): T {
		return event.payload as T
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

	/**
	 * The precedence itself lives in `deriveThreadStatus` (shared) — this method's job is only to
	 * gather the three facts, and to gather them EXCLUDING the issue/stop the current event just
	 * resolved, so the frame reflects the transition without waiting on a read-after-write.
	 */
	private async deriveStatus(threadId: string, exclude: { excludeIssueId?: string; excludeStopId?: string }): Promise<ThreadStatus> {
		const openStops = await tryCatchAsync(async () =>
			this.db
				.select({ id: stops.id })
				.from(stops)
				.where(and(eq(stops.threadId, threadId), isNull(stops.resolvedAt))),
		)
		const working = await tryCatchAsync(async () =>
			this.db
				.select({ id: issues.id })
				.from(issues)
				.where(and(eq(issues.threadId, threadId), eq(issues.status, IssueStatus.WORKING), eq(issues.archived, false))),
		)

		return deriveThreadStatus({
			paused: await this.isPaused(threadId),
			hasOpenStop: openStops.success && openStops.data.some(s => s.id !== exclude.excludeStopId),
			hasWorkingIssue: working.success && working.data.some(i => i.id !== exclude.excludeIssueId),
		})
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

	/** The same `(channelId, contactExternalId)` predicate `ThreadRepository.findByChannelContact` uses —
	 *  read here directly because this needs one id, not a rehydrated aggregate, and BC-`ui` may not
	 *  import another context's repository for a read model. */
	private async threadIdForContact(channelId: string, remoteId: string): Promise<string | undefined> {
		const result = await tryCatchAsync(async () =>
			this.db
				.select({ id: threads.id })
				.from(threads)
				.where(and(eq(threads.channelId, channelId), eq(threads.contactExternalId, remoteId)))
				.limit(1),
		)
		return result.success ? result.data[0]?.id : undefined
	}

	private async threadIdForIssue(issueId: string): Promise<string | undefined> {
		const result = await tryCatchAsync(async () =>
			this.db.select({ threadId: issues.threadId }).from(issues).where(eq(issues.id, issueId)).limit(1),
		)
		return result.success ? result.data[0]?.threadId : undefined
	}
}
