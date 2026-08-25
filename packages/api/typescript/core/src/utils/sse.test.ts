import { describe, expect, it } from 'bun:test'
import { createSSEResponse } from './sse'

/**
 * REGRESSION (Fase 7) — an SSE endpoint leaked whatever its `onStart` claimed whenever the client
 * disconnected before the Response was built.
 *
 * `FastifyHttpRouter` aborts the request signal from the response socket's `close` event. A client
 * that vanishes after the request is parsed but before the controller returns therefore fires that
 * abort BEFORE `createSSEResponse` runs — and `addEventListener('abort', …)` on an ALREADY-FIRED
 * `AbortSignal` is never invoked. The teardown consequently never ran.
 *
 * That is not an exotic window. React's double-invoked effects open, abort and re-open a stream
 * within the same handful of milliseconds, so the console's terminal panel hit it on every single
 * mount: the first connection claimed the issue's one observer slot, the abort silently failed to
 * release it, and every reconnect answered 409 `issue already streaming` until the daemon restarted.
 * Measured against a booted daemon before the fix: reconnect answered 200 for a disconnect at 0-8ms
 * (too early to reach the controller) and 409 from ~32ms on, indefinitely.
 */
describe('createSSEResponse teardown', () => {
	it('runs the teardown when the signal aborts DURING the stream', () => {
		const controller = new AbortController()
		let torndown = false

		createSSEResponse({
			signal: controller.signal,
			keepalive: false,
			onStart: () => () => {
				torndown = true
			},
		})

		expect(torndown).toBe(false)
		controller.abort()
		expect(torndown).toBe(true)
	})

	it('runs the teardown when the signal was ALREADY aborted before the stream was built', () => {
		const controller = new AbortController()
		controller.abort()
		let torndown = false

		createSSEResponse({
			signal: controller.signal,
			keepalive: false,
			onStart: () => () => {
				torndown = true
			},
		})

		// The claim `onStart` made — an observer registration, a slot, a subscription — is released
		// immediately rather than held until the process dies.
		expect(torndown).toBe(true)
	})

	it('tears down exactly once when an already-aborted signal is aborted again', () => {
		const controller = new AbortController()
		controller.abort()
		let teardowns = 0

		createSSEResponse({
			signal: controller.signal,
			keepalive: false,
			onStart: () => () => {
				teardowns += 1
			},
		})
		controller.abort()

		expect(teardowns).toBe(1)
	})
})
