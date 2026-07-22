/**
 * Dependency-free resilience wrapper for outbound provider calls (HTTP, SDKs, …):
 * timeout + bounded retry (only when the caller says the operation is safe to repeat) +
 * a minimal per-label circuit breaker.
 *
 * Intentionally not a generic "everything" wrapper — no jitter strategies to pick, no
 * pluggable breaker policies. Just the three knobs the payment-provider adapters need.
 */

export interface ResilienceOptions {
	/** Abort + fail the attempt after this many ms. Default 8000. */
	timeoutMs?: number
	/** Max retry attempts *after* the first. Default 2 (so up to 3 attempts total). */
	retries?: number
	/** Base backoff between retries; doubles per attempt (`backoffMs * 2^n`) + small jitter. Default 200. */
	backoffMs?: number
	/** Only retryable operations are retried — e.g. an Idempotency-Key makes a POST safe to repeat. Default false. */
	retryable?: boolean
	/** Circuit-breaker bucket. Calls sharing a label share failure/open state. Omit to skip the breaker. */
	label?: string
}

const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_RETRIES = 2
const DEFAULT_BACKOFF_MS = 200

const BREAKER_FAILURE_THRESHOLD = 5
const BREAKER_COOLDOWN_MS = 30_000

export class TimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`operation timed out after ${timeoutMs}ms`)
		this.name = 'TimeoutError'
	}
}

export class CircuitOpenError extends Error {
	constructor(label: string) {
		super(`circuit breaker open for "${label}"`)
		this.name = 'CircuitOpenError'
	}
}

interface BreakerState { consecutiveFailures: number; openedAt: number | null }

// Module-level so all callers sharing a label (e.g. one per provider) share breaker state.
const breakers = new Map<string, BreakerState>()

function getBreaker(label: string): BreakerState {
	let breaker = breakers.get(label)
	if (!breaker) {
		breaker = { consecutiveFailures: 0, openedAt: null }
		breakers.set(label, breaker)
	}
	return breaker
}

/** Test-only escape hatch: breaker state is module-level and otherwise leaks across tests. */
export function _resetBreaker(label: string): void {
	breakers.delete(label)
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}

/** Races `fn` against a timeout. Aborts the signal too, so a well-behaved `fn` (e.g. fetch) can bail early. */
async function runOnce<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
	const controller = new AbortController()
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			const error = new TimeoutError(timeoutMs)
			controller.abort(error)
			reject(error)
		}, timeoutMs)
	})
	try {
		return await Promise.race([fn(controller.signal), timeout])
	} finally {
		clearTimeout(timer)
	}
}

export async function withResilience<T>(fn: (signal: AbortSignal) => Promise<T>, opts: ResilienceOptions = {}): Promise<T> {
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
	const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS
	const retries = opts.retryable ? (opts.retries ?? DEFAULT_RETRIES) : 0
	const breaker = opts.label ? getBreaker(opts.label) : undefined

	if (breaker) {
		const isOpen = breaker.openedAt !== null && Date.now() - breaker.openedAt < BREAKER_COOLDOWN_MS
		if (isOpen) throw new CircuitOpenError(opts.label as string)
	}

	let lastError: unknown
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const result = await runOnce(fn, timeoutMs)
			if (breaker) {
				breaker.consecutiveFailures = 0
				breaker.openedAt = null
			}
			return result
		} catch (error) {
			lastError = error
			if (breaker) {
				breaker.consecutiveFailures += 1
				if (breaker.consecutiveFailures >= BREAKER_FAILURE_THRESHOLD) breaker.openedAt = Date.now()
			}
			const isLastAttempt = attempt === retries
			if (isLastAttempt) break
			const jitter = Math.random() * backoffMs * 0.1
			await sleep(backoffMs * 2 ** attempt + jitter)
		}
	}
	throw lastError
}
