/**
 * THE envelope contract — the single module that knows what "envelope" means.
 *
 * Three facts live here and NOWHERE else (rust-wire spec §F1, 2026-07-30):
 *
 * 1. TRANSPORT_ENVELOPE — the canonical transport shape every service publishes and
 *    consumes: `{ id, ownerId, time, name, payload }`. This is what the Go side's
 *    `types.IntegrationEvent[T]` (core/types/events.go) puts on the wire and what the
 *    TS mediator's `BaseIntegrationEvent` consumes. The `.tsp` envelope (`entityId`,
 *    `occurredAt`) is a DECLARED envelope that no transport carries verbatim — the
 *    mapping between the two is recorded on each entry.
 *
 * 2. ENVELOPE_TSP_FIELDS — the property names `_base.tsp` declares on the envelope
 *    model. Emitters subtract these when deriving a FLAT event struct's payload
 *    section (the legacy origin-parity shape in emit-wire-go).
 *
 * 3. payloadFieldsOf — the canonical payload projection: the model's OWN declarations
 *    (declaration order), minus the wire discriminator (`name`) + `entityId`. Envelope
 *    fields a model explicitly REDECLARES (verbatim payloads carrying ownerId or
 *    occurredAt inside the payload) stay in. Every emitter derives its payload struct/
 *    schema from THIS function — a language binding whose payload diverges from the
 *    others is a bug this module exists to make impossible.
 */
import type { EventField, ParsedEvent } from './parse-openapi'

/** One transport-envelope entry: the wire property, the `.tsp` property it descends
 *  from (null = transport-only, synthesized at publish time), and its scalar kind. */
export interface TransportEnvelopeEntry {
	/** Property name on the wire (the JSON the gateway publishes). */
	wire: string
	/** Property name in `_base.tsp`, or null when the transport synthesizes it. */
	tsp: string | null
	/** Scalar kind, in parse-openapi FieldType vocabulary. */
	kind: 'uuid' | 'string' | 'date-time' | 'literal'
}

/**
 * The canonical transport envelope `{ id, ownerId, time, name, payload }` — mirror of
 * Go `types.IntegrationEvent[T]`. `payload` is not listed: it is the complement (see
 * payloadFieldsOf), not a field of its own.
 */
export const TRANSPORT_ENVELOPE: readonly TransportEnvelopeEntry[] = [
	{ wire: 'id', tsp: null, kind: 'uuid' },
	{ wire: 'ownerId', tsp: 'ownerId', kind: 'string' },
	{ wire: 'time', tsp: 'occurredAt', kind: 'date-time' },
	{ wire: 'name', tsp: 'name', kind: 'literal' },
] as const

/**
 * Property names `_base.tsp` declares on the envelope model (`IntegrationEvent`).
 * Used to subtract envelope properties when a FLAT event struct lists its payload
 * section. Includes `entityId`, which the transport does not carry — it is a declared
 * envelope field regardless.
 */
export const ENVELOPE_TSP_FIELDS: ReadonlySet<string> = new Set(['name', 'entityId', 'ownerId', 'occurredAt'])

/**
 * The canonical payload projection — own declarations minus discriminator + entityId.
 * Redeclared `ownerId`/`occurredAt` (verbatim payloads that carry them INSIDE the
 * payload) survive, in declaration order.
 */
export function payloadFieldsOf(ev: ParsedEvent): EventField[] {
	return ev.ownFields.filter(f => f.name !== 'name' && f.name !== 'entityId')
}
