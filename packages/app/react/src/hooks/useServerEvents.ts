import { useEffect, useRef } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { listenEventsQueryKey, type ListenEventsQueryResponse } from '@codm/client-typescript/typescript'
import { daemonBaseUrl } from '@/lib/config'
import { tryCatch } from '@/lib/utils'

/** String literal union of all SSE event names, derived from the SDK response type. */
export type ServerEventName = ListenEventsQueryResponse['name']

/** Narrows the SSE union to the variant matching event name K. */
type ServerEventByName<K extends ServerEventName> = Extract<ListenEventsQueryResponse, { name: K }>

/**
 * Establishes the owner-scoped SSE connection to `GET /ui/events`.
 * Mount ONCE at the layout that owns the scope (the `(app)` route layout) — every child
 * component then subscribes via `useServerEvents`. Frames are data-only JSON envelopes
 * ({ name, ownerId, payload }) re-dispatched as `document` CustomEvents keyed by `name`.
 */
export function useServerEventSource() {
	useEffect(() => {
		const controller = new AbortController()

		fetchEventSource(`${daemonBaseUrl()}${listenEventsQueryKey()[0].url}`, {
			credentials: 'include',
			signal: controller.signal,
			onmessage(msg) {
				if (!msg.data) return
				const result = tryCatch(() => JSON.parse(msg.data) as ListenEventsQueryResponse)
				if (!result.success) {
					console.error('[SSE] Failed to parse server event:', result.error, 'Raw data:', msg.data)
					return
				}
				document.dispatchEvent(new CustomEvent(result.data.name, { detail: result.data }))
			},
			onerror(err) {
				console.error('[SSE] Connection error:', err)
			},
		})

		return () => controller.abort()
	}, [])
}

/**
 * Subscribe to one or more server events. Pass a single name for a narrowed payload type,
 * or an array for a union — discriminate via `event.name`.
 *
 * Canonical callback shape: guard by payload scope first, then invalidate the SDK query
 * key — never mutate the query cache by hand (see "Real-time" in this package's CLAUDE.md).
 *
 * @example
 * useServerEvents('integration.billing.subscription_changed', event => {
 *   if (event.ownerId !== ownerId) return
 *   queryClient.invalidateQueries({ queryKey: listPlansQueryKey() })
 * })
 */
export function useServerEvents<K extends ServerEventName>(name: K | readonly K[], callback: (event: ServerEventByName<K>) => void) {
	const callbackRef = useRef(callback)
	callbackRef.current = callback

	useEffect(() => {
		const names = Array.isArray(name) ? name : [name]
		const listener = (e: Event) => {
			callbackRef.current((e as CustomEvent<ServerEventByName<K>>).detail)
		}
		for (const n of names) document.addEventListener(n, listener)
		return () => {
			for (const n of names) document.removeEventListener(n, listener)
		}
		// The joined-names key keeps the effect stable across unstable array identities;
		// callbackRef keeps the callback fresh without re-subscribing.
	}, [Array.isArray(name) ? name.join('|') : name])
}
