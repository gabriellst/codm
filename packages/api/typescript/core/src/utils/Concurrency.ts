/**
 * Run `fn` over every item with at most `limit` calls in flight — the sweep driver for
 * bounded-fan-out work (e.g. periodic jobs whose per-item cost is an external round-trip with no
 * batch API). Bounded concurrency cuts the sweep's wall-clock by ~`limit`× without stampeding the
 * downstream's rate limit; it deliberately does NOT change failure semantics — `fn` is expected to
 * handle its own errors (sweeps wrap each item in `tryCatchAsync`), so one item's rejection here is
 * a programming error and propagates.
 *
 * NOT for use inside a database transaction: a tx runs on a single connection, which cannot execute
 * queries concurrently. This drives items that each open their OWN small tx (pool connections).
 */
export async function forEachWithConcurrency<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
	const executing = new Set<Promise<void>>()
	for (const item of items) {
		const task = fn(item).finally(() => {
			executing.delete(task)
		})
		executing.add(task)
		if (executing.size >= limit) await Promise.race(executing)
	}
	await Promise.all(executing)
}
