import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import {
	getIssueDetailQueryKey,
	getNeedsYouPanelQueryKey,
	getSessionChatQueryKey,
	getSessionIssuesQueryKey,
	listArtifactsQueryKey,
	type ListenEventsQueryResponse,
} from '@codedm/client-typescript/typescript'
import { useServerEvents, type ServerEventName } from '@/hooks'

/**
 * The frames that can change what a thread page is showing. Named as a `const` tuple so the array is
 * the ONE list — `useServerEvents` subscribes to it and `threadInvalidations` switches on it, and a
 * name added to one without the other is a tsc error rather than a subscription that fires into a
 * function with no case for it.
 *
 * Every frame here carries `threadId` directly on its wire payload (B5: the enriched `browser.*`
 * frames — synthesized by a `BrowserFrameEnricher` that resolved a thread scope the raw fact could not
 * express on its own — are gone). `integration.thread.message_ingested` replaces
 * `browser.thread_message_ingested`; `integration.thread.stop_resolved` replaces the half of
 * `browser.thread_status_changed` this page actually needed (clearing the needs-you panel).
 */
export const THREAD_REALTIME_EVENTS = [
	'integration.thread.message_ingested',
	'integration.orchestrator.replied',
	'integration.thread.stop_raised',
	'integration.thread.stop_resolved',
	'integration.issue.created',
	'integration.issue.opened',
	'integration.issue.completed',
	'integration.issue.archived',
	'integration.artifact.recorded',
] as const satisfies readonly ServerEventName[]

/** The SSE frame union narrowed to the names above — the SDK's own type, never a hand-written mirror. */
export type ThreadRealtimeEvent = Extract<ListenEventsQueryResponse, { name: (typeof THREAD_REALTIME_EVENTS)[number] }>

/**
 * Which of THIS thread's queries a frame makes stale — a pure function of the frame, so the mapping
 * can be asserted without a render, a network, or a fake SSE transport.
 *
 * Returns `[]` for a frame belonging to another thread. That guard is not redundant with the server's
 * tenancy filter: the stream is scoped to the OWNER, and an owner has many conversations, so a message
 * in one thread would otherwise refetch every open thread page.
 */
export function threadInvalidations(event: ThreadRealtimeEvent, threadId: string): QueryKey[] {
	if (threadIdOf(event) !== threadId) return []

	switch (event.name) {
		// A message landed — inbound or the orchestrator's own reply. Both write a transcript row
		// BEFORE the browser is notified: the mediator awaits every handler and only then runs the
		// callbacks the SSE broadcaster is one of, so a refetch triggered here can never read the
		// transcript from before the write.
		case 'integration.thread.message_ingested':
		case 'integration.orchestrator.replied':
			return [getSessionChatQueryKey(threadId)]

		// A stop raising OR resolving both change what the needs-you panel and the chat/issues tabs
		// show — the panel must FILL on raise and CLEAR on resolve, so both facts invalidate the same
		// three keys.
		case 'integration.thread.stop_raised':
		case 'integration.thread.stop_resolved':
			return [getNeedsYouPanelQueryKey(threadId), getSessionChatQueryKey(threadId), getSessionIssuesQueryKey(threadId)]

		// An issue's birth and death both show up in the conversation (the ack, then the composed
		// result) and in the issues tab. `completed`/`archived` additionally stale the DETAIL page the
		// operator may be standing on right now.
		case 'integration.issue.created':
		case 'integration.issue.opened':
			return [getSessionChatQueryKey(threadId), getSessionIssuesQueryKey(threadId)]

		case 'integration.issue.completed':
		case 'integration.issue.archived':
			return [getSessionChatQueryKey(threadId), getSessionIssuesQueryKey(threadId), getIssueDetailQueryKey(event.payload.issueId)]

		case 'integration.artifact.recorded':
			return [listArtifactsQueryKey(threadId)]

		default: {
			// Exhaustiveness: a name added to THREAD_REALTIME_EVENTS with no case here fails to compile.
			const _exhaustive: never = event
			return _exhaustive
		}
	}
}

/** The thread a frame belongs to — every frame carries `threadId` on its wire `payload` since B5 (the
 *  enriched `browser.*` frames, which put it at the top level instead, are gone). */
function threadIdOf(event: ThreadRealtimeEvent): string {
	return event.payload.threadId
}

/**
 * Keep one thread page fresh from the server's own facts (F2).
 *
 * Mounted ONCE, by the `$threadId` layout — not by each section. The three tabs (chat, issues,
 * artifacts) are one conversation, and a single issue completing staled all three plus the header; a
 * per-component subscription meant the same frame arriving at four listeners that each invalidated an
 * overlapping set, and — worse — that a tab not currently mounted simply never learned anything. This
 * is the thread-scoped twin of `useServerEventSource`, which the `(app)` layout mounts for the owner
 * scope, and it holds the freshness policy in one readable place.
 *
 * Invalidate only — never `setQueryData`. The backend read models stay the single source of truth.
 */
export function useThreadRealtime(threadId: string): void {
	const queryClient = useQueryClient()

	useServerEvents(THREAD_REALTIME_EVENTS, event => {
		for (const queryKey of threadInvalidations(event, threadId)) queryClient.invalidateQueries({ queryKey })
	})
}
