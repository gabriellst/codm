import { useEffect, useRef, useState } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { streamTerminalSessionQueryKey, type StreamTerminalSessionQueryResponse } from '@codm/client-typescript/typescript'
import { Config } from '@/lib/config'
import { tryCatch } from '@/lib/utils'

/** One SSE frame of an issue's live terminal session — the SDK's own materialized union. */
export type TerminalStreamFrame = StreamTerminalSessionQueryResponse

/** Narrows the union to the structured tool-call frame. */
export type TerminalActionFrame = Extract<TerminalStreamFrame, { name: 'browser.terminal_action_detected' }>

export interface TerminalStream {
	/** True once the daemon has accepted this browser as THE observer for the issue. */
	connected: boolean
	/** Frames in arrival order, oldest first. */
	frames: TerminalStreamFrame[]
}

/** Hard cap on retained frames — a long-running session must not grow the tab without bound. */
const MAX_FRAMES = 500

/** Reconnect delay. Short, because the common cause is a remount racing its own teardown. */
const RETRY_MS = 500

/**
 * Subscribe to ONE issue's live terminal session (`GET /v1/terminal/sessions/:issueId/stream`).
 *
 * This is a SECOND, issue-scoped SSE connection, deliberately separate from the owner-scoped
 * `useServerEventSource`: the frames here are TRANSPORT (what the CLI is doing, right now) and never
 * touch the outbox, so they carry no `ownerId` envelope and nothing invalidates a query cache. They
 * are rendered and forgotten by the browser. The daemon admits exactly one observer per issue, which
 * is why `connected` is part of the return type rather than an internal detail — a panel that has not
 * been accepted is a panel that is missing frames, and it should be able to say so.
 *
 * Since F3 the daemon KEEPS a bounded per-issue buffer and replays it right after the connected
 * frame, so opening a panel mid-run shows what already happened rather than starting blank, and
 * leaving the screen and coming back restores the tail. The consequence for this hook is that an open
 * is authoritative: every `onopen` clears `frames`, because the replay that follows is the complete
 * history and anything kept from a previous connection would be a duplicate of it.
 *
 * Frame identity is the SDK's, not a hand-written mirror: `StreamTerminalSessionQueryResponse` is
 * generated from the same OpenAPI the controller emits, so re-keying the action frame onto the real
 * tool name (Fase 7) surfaced here as a type error rather than as a silently blank column.
 */
export function useTerminalStream(issueId: string): TerminalStream {
	const [connected, setConnected] = useState(false)
	const [frames, setFrames] = useState<TerminalStreamFrame[]>([])
	// Frames are appended from a callback that must not re-subscribe on every arrival.
	const alive = useRef(true)

	useEffect(() => {
		alive.current = true
		const controller = new AbortController()
		setConnected(false)
		setFrames([])

		const url = `${Config.baseUrl}${streamTerminalSessionQueryKey(issueId)[0].url.replace(':issueId', issueId)}`

		fetchEventSource(url, {
			credentials: 'include',
			signal: controller.signal,
			// The daemon registers this browser as the issue's observer synchronously, BEFORE the
			// response headers are produced — so `onopen` resolving means the slot is already claimed and
			// a spec (or a user) can safely trigger the run it wants to watch.
			//
			// A non-OK response THROWS on purpose, into the retry path below. The interesting status is
			// 409 `issue already streaming`: the daemon admits one observer per issue, and a remount
			// (React's double-invoked effects in dev, a client-side navigation back onto the same issue)
			// re-opens the stream before the aborted request's teardown has released the slot. That is a
			// TRANSIENT — retrying gets it — and swallowing it here instead would leave a permanently
			// dead panel showing nothing, with no error to explain why.
			onopen: async response => {
				if (!response.ok) throw new Error(`terminal stream refused with ${response.status}`)
				if (!alive.current) return
				// CLEARED ON EVERY OPEN, not just on mount (F3). The daemon replays the issue's whole
				// buffer immediately after the connected frame, so an open delivers the complete history —
				// keeping what a previous connection accumulated would show every earlier frame twice. The
				// server's buffer is the ordering authority; this hook only mirrors it.
				setFrames([])
				setConnected(true)
			},
			onmessage(message) {
				if (!message.data) return
				const result = tryCatch(() => JSON.parse(message.data) as TerminalStreamFrame)
				if (!result.success) {
					console.error('[terminal-sse] failed to parse frame:', result.error, 'Raw data:', message.data)
					return
				}
				if (!alive.current) return
				// `[...previous, frame].slice(-MAX_FRAMES)` allocated TWICE per frame — the concat, then a
				// full copy — even while the buffer was still filling and the slice was a no-op. The trim
				// now only runs once there is something to trim. This is the small half of the fix: a
				// 500-pointer array is ~4KB of short-lived garbage, which a generational GC barely
				// notices. The expensive half was the 500 DOM rows it fed, and that is what the panel's
				// windowing addresses.
				setFrames(previous => {
					const next = [...previous, result.data]
					return next.length > MAX_FRAMES ? next.slice(next.length - MAX_FRAMES) : next
				})
			},
			onerror(err) {
				// A RETURNED delay (not a throw) keeps fetch-event-source retrying: a run that outlives a
				// blip — or a slot that is one teardown away from being free — should still reach the panel.
				// Throwing here would abandon the stream permanently on the first hiccup.
				console.error('[terminal-sse] connection error, retrying:', err)
				if (alive.current) setConnected(false)
				return RETRY_MS
			},
		})

		return () => {
			alive.current = false
			controller.abort()
		}
	}, [issueId])

	return { connected, frames }
}
