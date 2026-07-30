import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import {
	getHomeDashboardQueryKey,
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
 * Everything here carries a thread scope the browser can check for itself: either `threadId` in the
 * payload, or (for the inbound message, which is addressed by WhatsApp JID) a `browser.*` frame the
 * `BrowserFrameEnricher` already resolved to a thread.
 */
export const THREAD_REALTIME_EVENTS = [
	'browser.thread_message_ingested',
	'browser.thread_status_changed',
	'browser.stop_raised',
	'integration.orchestrator.replied',
	'integration.issue.created',
	'integration.issue.opened',
	'integration.issue.completed',
	'integration.issue.archived',
	'integration.thread.stop_raised',
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
		// A message landed — inbound (enriched, because only the server can resolve a JID to a thread)
		// or the orchestrator's own reply. Both write a transcript row BEFORE the browser is notified:
		// the mediator awaits every handler and only then runs the callbacks the SSE broadcaster is one
		// of, so a refetch triggered here can never read the transcript from before the write.
		case 'browser.thread_message_ingested':
		case 'integration.orchestrator.replied':
			return [getSessionChatQueryKey(threadId)]

		// The composer's mode and the header's status live in the chat payload, so a status change is a
		// chat change too — this is the frame that used to be the page's only subscription.
		case 'browser.thread_status_changed':
			return [getSessionChatQueryKey(threadId), getSessionIssuesQueryKey(threadId), getHomeDashboardQueryKey()]

		case 'browser.stop_raised':
		case 'integration.thread.stop_raised':
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

/** The thread a frame belongs to — `threadId` sits on the payload for wire facts and at the top level
 *  for the enriched `browser.*` frames, which are UI shapes and carry no envelope. */
function threadIdOf(event: ThreadRealtimeEvent): string {
	return 'payload' in event ? event.payload.threadId : event.threadId
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
