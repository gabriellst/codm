// bootPhase.ts — the ONE crumb-trail primitive for the boot choreography (`src/index.ts`,
// `composition/server.ts`). Not a logger: a wrapper that turns "this step started" and "this step
// finished (or blew up) after Nms" into ONE line each, on `console`, which is exactly what
// `shell.log` already mirrors line-by-line from the sidecar's stdout/stderr.
//
// WHY NOT THE STRUCTURED LoggingService: it is not resolvable until `bindContexts` has run (it is
// a token in the `shared` registry — see `shared/registry.ts`), so the two earliest, most
// hang-prone phases (the data-dir lock, `bindContexts` itself) have nothing to resolve it FROM.
// Worse, once it IS resolvable, its `real` binding (`DefaultLoggingService`) picks between two
// delegates at CONSTRUCTION time (`Config.env.OTEL_COLLECTOR_LOG_URL`): configured, it ships lines
// to the OTLP collector over the network and prints NOTHING to stdout — exactly the boot that
// produced the 84-byte log this file exists to fix would have stayed silent a second time, because
// phase crumbs are needed most on the machine where the collector is unreachable or unset. Plain
// `console.log`/`console.error` is the one sink guaranteed to reach `shell.log` at every phase,
// which is the only property that matters here.
//
// ONE line to start (so a HANG points at the exact phase that never printed its second line), one
// line on success WITH the elapsed time (so a merely SLOW boot is legible too, not just a stuck
// one), and on failure the failure is logged BEFORE the error is re-thrown — a phase that throws
// must never look, from the log alone, like it silently vanished.
export async function phase<T>(name: string, fn: () => Promise<T> | T, describeResult?: (result: T) => string): Promise<T> {
	console.log(`[boot] ${name} — starting`)
	const startedAt = Date.now()

	try {
		const result = await fn()
		const elapsedMs = Date.now() - startedAt
		const detail = describeResult?.(result)
		console.log(`[boot] ${name} — done (${elapsedMs}ms)${detail ? ` — ${detail}` : ''}`)
		return result
	} catch (error) {
		const elapsedMs = Date.now() - startedAt
		console.error(`[boot] ${name} — FAILED after ${elapsedMs}ms:`, error)
		throw error
	}
}
