import { tryCatch } from './TryCatch'

const encoder = new TextEncoder()

/**
 * Encodes a single SSE frame in the data-only format used by ListenEventsController.
 * Wire format:  data: <json>\n\n
 *
 * Consumers parse the JSON body and discriminate by the `name` field embedded inside.
 * We deliberately do NOT emit `event: <name>` lines so a single parser handles every
 * SSE endpoint in this codebase.
 */
export function encodeSSEFrame(payload: unknown): Uint8Array {
	return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
}

export const SSE_KEEPALIVE_FRAME: Uint8Array = encoder.encode(`: ping\n\n`)
export const SSE_KEEPALIVE_INTERVAL_MS = 15_000

export const SSE_CONNECTED_FRAME: Uint8Array = encoder.encode(`: connected\n\n`)

/**
 * AG-UI / TanStack AI stream completion marker. Sent as the last frame of a
 * `useChat`-compatible SSE response so the client knows the run is finished.
 */
export const SSE_DONE_FRAME: Uint8Array = encoder.encode(`data: [DONE]\n\n`)

/**
 * Handle passed to `createSSEResponse`'s `onStart` callback. Wraps a
 * `ReadableStreamDefaultController` with idempotent close/error semantics so
 * callers don't have to track "is the stream already torn down" state
 * themselves.
 */
export interface SSEStreamHandle {
	send: (frame: Uint8Array) => void
	close: () => void
	error: (err: unknown) => void
}

export interface SSEStreamOptions {
	/** Client abort signal — wired to `handle.close()` automatically. */
	signal: AbortSignal
	/** Extra response headers merged on top of the SSE defaults. */
	headers?: Record<string, string>
	/** Emit a `: ping\n\n` comment every `SSE_KEEPALIVE_INTERVAL_MS`. Default: true. */
	keepalive?: boolean
	/**
	 * Called synchronously when the stream starts. May return a teardown
	 * function that runs exactly once on close/error/abort.
	 */
	onStart: (handle: SSEStreamHandle) => undefined | (() => void)
}

/**
 * Builds a `text/event-stream` `Response` with keepalive, abort wiring, and
 * idempotent close/error baked in. Callers only write domain logic inside
 * `onStart` and return an optional teardown.
 */
export function createSSEResponse({ signal, headers, keepalive = true, onStart }: SSEStreamOptions): Response {
	let teardown: (() => void) | undefined
	let keepaliveTimer: ReturnType<typeof setInterval> | undefined
	let closed = false

	// Assigned inside `start` (which the ReadableStream constructor invokes synchronously) so `cancel`
	// below can reach the same handle.
	let close: () => void = () => undefined

	const stream = new ReadableStream<Uint8Array>({
		start: controller => {
			const finalize = () => {
				if (keepaliveTimer) clearInterval(keepaliveTimer)
				signal.removeEventListener('abort', handle.close)
				teardown?.()
			}

			const handle: SSEStreamHandle = {
				send: frame => {
					if (closed) return
					controller.enqueue(frame)
				},
				close: () => {
					if (closed) return
					closed = true
					finalize()
					tryCatch(() => controller.close())
				},
				error: err => {
					if (closed) return
					closed = true
					finalize()
					tryCatch(() => controller.error(err))
				},
			}

			close = handle.close

			if (keepalive) {
				keepaliveTimer = setInterval(() => handle.send(SSE_KEEPALIVE_FRAME), SSE_KEEPALIVE_INTERVAL_MS)
			}
			signal.addEventListener('abort', handle.close)

			teardown = onStart(handle) ?? undefined

			// ALREADY ABORTED — adding a listener to a fired `AbortSignal` never invokes it, so without
			// this line a client that vanished before the stream was built leaks whatever `onStart`
			// claimed, for the life of the process.
			//
			// This is reachable, not defensive: the controller runs asynchronously between the router
			// wiring the signal and this stream being constructed, and the disconnect the router listens
			// for (`req.raw`'s `aborted`) can land inside that window. It is the same leak the router fix
			// addresses, one layer up, and the two are independent — this one holds even if a future
			// consumer hands in a signal that was aborted before the call.
			//
			// Checked AFTER `onStart` so `teardown` is assigned and actually runs.
			if (signal.aborted) handle.close()
		},

		/**
		 * The consumer stopped reading — release the same claim. Reached when whatever adapts this web
		 * stream to the transport destroys its reader; idempotent with the paths above, since
		 * `handle.close` returns early once closed.
		 */
		cancel: () => close(),
	})

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			...headers,
		},
	})
}
