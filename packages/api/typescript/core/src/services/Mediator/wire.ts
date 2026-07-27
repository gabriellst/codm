/**
 * The JSON boundary every cross-process integration event crosses on the way IN.
 *
 * Extracted from the Redis transport so the shared-outbox ingress (SqlExternalMediator) uses the
 * SAME two rules rather than a second, subtly different copy. Whoever eventually deletes the Redis
 * transport must check that this module survived it.
 */

// Envelope keys the Go egress marshals AROUND the domain payload (the wire struct is flat: the
// framework fields sit alongside the domain scalars). Everything NOT in this set is a payload field
// when re-nesting a flat Go wire event into the BaseIntegrationEvent `{ ownerId, payload }` shape.
const WIRE_ENVELOPE_KEYS = new Set(['name', 'id', 'entityId', 'ownerId', 'occurredAt', 'time'])

// Strict RFC3339 / ISO-8601 datetime (with a time component + zone) — Go marshals `time.Time` this
// way. Used as a JSON.parse reviver so wire date fields (receivedAt, pairedAt, qrExpiresAt, …)
// rehydrate to `Date`, which every downstream `z.date()` use-case input requires. Date-only strings
// and plain IDs never match, so no non-date field is coerced.
export const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

/**
 * JSON.parse reviver: turn a strict ISO-8601 datetime string into a `Date`. Go marshals `time.Time`
 * as RFC3339 (`2023-11-14T22:13:20Z`), but the TS wire event payloads type those fields `z.date()`
 * and the downstream use-case inputs (e.g. IngestChannelMessage's `receivedAt`) reject a string —
 * so the transport revives them here, at the one JSON boundary, for every consumer.
 *
 * This is NOT optional and it is NOT replaceable by drizzle's json column mode: that parses without
 * a reviver, so RFC3339 strings stay strings and EVERY `z.date()` input rejects — five attempts,
 * dead-letter, and a console that still says DISCONNECTED over an outbox full of poison.
 */
export function reviveIsoDates(_key: string, value: unknown): unknown {
	return typeof value === 'string' && ISO_DATETIME_RE.test(value) ? new Date(value) : value
}

/**
 * Normalize a decoded wire entry to the nested BaseIntegrationEvent envelope `{ name, ownerId,
 * payload }` the TS wire event classes construct from.
 *
 *   - Go egress → a FLAT wire struct (`{ name, entityId, ownerId, occurredAt, ...domainScalars }`);
 *     the domain scalars are folded under `payload` and the framework fields are dropped.
 *   - TS publish → already `{ name, id, time, payload, ownerId }`; returned untouched.
 *
 * Detection is by the presence of a `payload` object — a flat Go envelope never has one, a nested TS
 * envelope always does.
 */
export function adaptWireEnvelope(parsed: unknown): unknown {
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed
	const obj = parsed as Record<string, unknown>
	if ('payload' in obj && obj.payload !== null && typeof obj.payload === 'object') return obj
	if (!('name' in obj)) return obj

	const payload: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(obj)) {
		if (!WIRE_ENVELOPE_KEYS.has(key)) payload[key] = value
	}
	return { name: obj.name, ownerId: typeof obj.ownerId === 'string' ? obj.ownerId : '', payload }
}
