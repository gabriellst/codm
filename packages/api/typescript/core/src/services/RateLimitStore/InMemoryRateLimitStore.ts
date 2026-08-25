import { RateLimitStore, type RateLimitResult } from './RateLimitStore'

/**
 * Process-local fixed-window counter. Backs the `mock` / `integration` DI
 * environments and unit tests so the suite needs no Redis. Not for production
 * (counters are per-process and lost on restart).
 */
export class InMemoryRateLimitStore extends RateLimitStore {
	private windows = new Map<string, { count: number; resetAt: number }>()

	async hit(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
		const now = Date.now()
		const existing = this.windows.get(key)
		if (!existing || existing.resetAt <= now) {
			this.windows.set(key, { count: 1, resetAt: now + windowMs })
			return { allowed: true, remaining: Math.max(0, max - 1) }
		}
		existing.count += 1
		return { allowed: existing.count <= max, remaining: Math.max(0, max - existing.count) }
	}
}
