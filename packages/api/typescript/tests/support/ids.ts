// Canonical test-identifier factory. Replaces hardcoded UUID literals (bp-18).
// Deterministic ids share the project's locked `ID_NAMESPACE` via Id.fromSeed,
// so a named fixture is stable across runs; pass no segments for a random id.
import { Id } from '@codm/core-typescript'

/**
 * `testId('store', 'a')` → deterministic UUIDv5 for that tuple (stable across runs).
 * `testId()`             → fresh random UUIDv7 (for not-found / uniqueness cases).
 */
export function testId(...segments: string[]): string {
	return segments.length === 0 ? Id.value() : Id.fromSeed(...segments).value
}
