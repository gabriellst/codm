export interface EventLoopLagOptions {
	/** How often the timer is scheduled. */
	intervalMs: number
	/** How late a tick must fire before it is reported. */
	thresholdMs: number
	/** Called with how late the tick fired, in ms. */
	onLag: (lagMs: number) => void
}

/**
 * Report when the event loop was BLOCKED — a timer that fires `thresholdMs` later than it was due.
 *
 * ### Why the daemon needs it
 * The libsql client for a local file is SYNCHRONOUS: a statement that meets a held write lock waits out
 * `busy_timeout` (5s) inside the native call, and the whole process — HTTP server, pollers, timers —
 * waits with it. Measured 2026-10-30: two such stalls of 10–20s, invisible from inside the daemon (no
 * error until the wait ends, no log while it lasts), and visible from outside only as the desktop's
 * health probe giving up. This makes the stall a line in the daemon's own log, with its length, so the
 * next one can be lined up against the SQLite waits and the gateway's.
 *
 * Returns the stop function. The timer is `unref`'d: it never keeps a process alive on its own.
 */
export function startEventLoopLagMonitor(options: EventLoopLagOptions): () => void {
	let expected = Date.now() + options.intervalMs
	const timer = setInterval(() => {
		const now = Date.now()
		const lag = now - expected
		expected = now + options.intervalMs
		if (lag >= options.thresholdMs) options.onLag(lag)
	}, options.intervalMs)
	timer.unref?.()
	return () => clearInterval(timer)
}
