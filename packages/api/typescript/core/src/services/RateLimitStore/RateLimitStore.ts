/**
 * Fixed-window request counter. `hit` increments the counter for `key` inside a
 * `windowMs` window and reports whether the caller is still under `max`. The
 * window starts on the first hit and the counter resets when it elapses.
 *
 * Implementations must make the increment atomic so concurrent hits to the same
 * key within the window share one counter (no lost increments).
 */
export interface RateLimitResult {
	/** True while the count for this window is <= max. */
	allowed: boolean
	/** Remaining hits in the current window (never negative). */
	remaining: number
}

export abstract class RateLimitStore {
	abstract hit(key: string, windowMs: number, max: number): Promise<RateLimitResult>
}
