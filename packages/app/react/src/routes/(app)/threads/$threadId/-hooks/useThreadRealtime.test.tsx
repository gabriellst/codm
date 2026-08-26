import { afterEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query'
import {
	getIssueDetailQueryKey,
	getNeedsYouPanelQueryKey,
	getSessionChatQueryKey,
	getSessionIssuesQueryKey,
	listArtifactsQueryKey,
} from '@codm/client-typescript/typescript'
import { THREAD_REALTIME_EVENTS, threadInvalidations, useThreadRealtime, type ThreadRealtimeEvent } from './useThreadRealtime'

/**
 * AC-F2.1 — WHEN THE SSE FRAME ARRIVES, THE RIGHT QUERY GOES STALE.
 *
 * The founder's report was "a thread não atualiza": the page rendered whatever it had fetched when it
 * mounted and only moved again on a manual reload. The page DID have a subscription — to
 * `browser.thread_status_changed`, the one frame a new message never produces, because a message
 * changes no status. That is the shape of this bug and the shape of this test: a subscription that
 * exists but to the wrong fact fails silently, and passes any test that only checks a mapping.
 *
 * So both halves are asserted, and neither alone would be enough:
 *   - the WIRING, by mounting the real hook and dispatching the CustomEvent the SSE transport
 *     dispatches (`useServerEventSource` re-emits every frame on `document` under its own name), then
 *     reading which query keys React Query actually marked stale;
 *   - the MAP, exhaustively, as a pure function — cheap enough to cover every frame and every guard.
 *
 * B5: every frame is now a wire fact (`{ name, ownerId, payload }`) — the enriched `browser.*` shape
 * (`{ name, threadId, ... }` at the top level, no `payload`) is gone, so `wireFact` is the only factory
 * this file needs.
 */
const THREAD = '019e4d24-6524-7041-9e1c-8108180cddae'
const OTHER_THREAD = '019e4d24-6524-7041-9e1c-8108180cddbb'
const ISSUE = '019e4d24-6524-7041-9e1c-8108180cddaf'

/** A frame as it reaches a subscriber: the transport parses the SSE line and re-dispatches it here. */
function arrive(event: ThreadRealtimeEvent): void {
	act(() => {
		document.dispatchEvent(new CustomEvent(event.name, { detail: event }))
	})
}

const wireFact = (name: ThreadRealtimeEvent['name'], payload: Record<string, unknown>) =>
	({ name, ownerId: 'owner-1', payload }) as unknown as ThreadRealtimeEvent

describe('useThreadRealtime — the wiring', () => {
	let root: Root | null = null

	afterEach(() => {
		act(() => root?.unmount())
		root = null
	})

	/** Mounts the hook for `threadId` and returns the keys React Query invalidated, in arrival order. */
	function mount(threadId: string): QueryKey[] {
		const invalidated: QueryKey[] = []
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		// Recorded at the CLIENT, not by stubbing the hook: this is the call the component really makes,
		// and a test that spied on the mapping instead would keep passing if the hook stopped calling it.
		const realInvalidate = queryClient.invalidateQueries.bind(queryClient)
		queryClient.invalidateQueries = (filters => {
			if (filters?.queryKey) invalidated.push(filters.queryKey)
			return realInvalidate(filters)
		}) as typeof queryClient.invalidateQueries

		function Probe() {
			useThreadRealtime(threadId)
			return null
		}

		const host = document.createElement('div')
		document.body.appendChild(host)
		root = createRoot(host)
		act(() => {
			root!.render(
				<QueryClientProvider client={queryClient}>
					<Probe />
				</QueryClientProvider>,
			)
		})
		return invalidated
	}

	it('AC-F2.1 — an arriving message frame invalidates the thread chat query', () => {
		const invalidated = mount(THREAD)

		arrive(wireFact('integration.thread.message_ingested', { threadId: THREAD }))

		expect(invalidated).toEqual([getSessionChatQueryKey(THREAD)])
	})

	it('a stop being resolved clears the needs-you panel and stales the chat + issues', () => {
		const invalidated = mount(THREAD)

		arrive(wireFact('integration.thread.stop_resolved', { threadId: THREAD, issueId: ISSUE }))

		expect(invalidated).toEqual([getNeedsYouPanelQueryKey(THREAD), getSessionChatQueryKey(THREAD), getSessionIssuesQueryKey(THREAD)])
	})

	it('the orchestrator replying invalidates the chat — the reply is written BEFORE the frame is sent', () => {
		const invalidated = mount(THREAD)

		arrive(wireFact('integration.orchestrator.replied', { threadId: THREAD, text: 'pronto' }))

		expect(invalidated).toEqual([getSessionChatQueryKey(THREAD)])
	})

	/**
	 * The stream is owner-scoped, not thread-scoped, and an owner has many conversations. Without this
	 * guard every open thread page would refetch on every message anywhere.
	 */
	it('a frame for ANOTHER thread invalidates nothing on this one', () => {
		const invalidated = mount(THREAD)

		arrive(wireFact('integration.thread.message_ingested', { threadId: OTHER_THREAD }))
		arrive(wireFact('integration.issue.created', { threadId: OTHER_THREAD, issueId: ISSUE }))

		expect(invalidated).toEqual([])
	})

	it('unmounting stops the subscription — a frame after teardown invalidates nothing', () => {
		const invalidated = mount(THREAD)
		act(() => root?.unmount())
		root = null

		arrive(wireFact('integration.thread.message_ingested', { threadId: THREAD }))

		expect(invalidated).toEqual([])
	})
})

describe('threadInvalidations — the map', () => {
	it('an issue completing stales the conversation, the issue list AND the detail page', () => {
		const keys = threadInvalidations(wireFact('integration.issue.completed', { threadId: THREAD, issueId: ISSUE }), THREAD)

		expect(keys).toEqual([getSessionChatQueryKey(THREAD), getSessionIssuesQueryKey(THREAD), getIssueDetailQueryKey(ISSUE)])
	})

	it('a stop being raised stales the needs-you panel', () => {
		const keys = threadInvalidations(wireFact('integration.thread.stop_raised', { threadId: THREAD, issueId: ISSUE }), THREAD)

		expect(keys).toEqual([getNeedsYouPanelQueryKey(THREAD), getSessionChatQueryKey(THREAD), getSessionIssuesQueryKey(THREAD)])
	})

	/** The half the enricher never wired (see G-C in the plan): before B5 nothing invalidated the panel
	 *  on RESOLVE, so a cleared stop stayed on screen until something else refreshed the page. */
	it('a stop being resolved stales the SAME three keys — the panel must clear, not just fill', () => {
		const keys = threadInvalidations(wireFact('integration.thread.stop_resolved', { threadId: THREAD, issueId: ISSUE }), THREAD)

		expect(keys).toEqual([getNeedsYouPanelQueryKey(THREAD), getSessionChatQueryKey(THREAD), getSessionIssuesQueryKey(THREAD)])
	})

	it('an artifact stales only the artifacts list', () => {
		const keys = threadInvalidations(wireFact('integration.artifact.recorded', { threadId: THREAD, artifactId: 'a1' }), THREAD)

		expect(keys).toEqual([listArtifactsQueryKey(THREAD)])
	})

	/**
	 * Every subscribed name must map to at least one query. A name added to the subscription list with
	 * no case would compile (the `never` guard only catches a name the switch does not handle at all)
	 * but would return `[]` forever — a live subscription that refreshes nothing.
	 */
	it('every subscribed frame stales something — no dead subscriptions', () => {
		for (const name of THREAD_REALTIME_EVENTS) {
			const event = wireFact(name, { threadId: THREAD, issueId: ISSUE })

			expect(threadInvalidations(event, THREAD).length, `${name} maps to no query`).toBeGreaterThan(0)
		}
	})
})
