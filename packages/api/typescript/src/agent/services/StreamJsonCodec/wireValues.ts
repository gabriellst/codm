/**
 * The three questions every wire decoder in this folder asks of an already-parsed value.
 *
 * They live here rather than once per decoder because there is now more than one decoder, and these
 * are the least interesting lines in either: "is this an object", "is this a string", "is this a
 * token count". Two copies of a type guard drift the way any re-declared shape drifts — one gets a
 * fix the other does not — and the fix that matters here is `count`'s, which decides what a MISSING
 * bucket means for billing.
 *
 * PURE, like everything in this folder (AC-2.5): no I/O, no clock, no spawn.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function str(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined
}

/** Non-negative integer or 0 — a missing bucket is arithmetically zero, never "unknown" (§4.3 rule 8). */
export function count(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}
