import { describe, expect, test } from 'bun:test'
import { ENVELOPE_TSP_FIELDS, TRANSPORT_ENVELOPE, payloadFieldsOf } from './envelope'
import type { ParsedEvent } from './parse-openapi'

const mkEvent = (ownFields: ParsedEvent['ownFields']): ParsedEvent => ({
	modelName: 'ThingHappenedEvent',
	wireName: 'integration.thing.happened',
	fields: ownFields,
	ownFields,
	unionSlots: [],
})

describe('TRANSPORT_ENVELOPE', () => {
	test('is the Go types.IntegrationEvent[T] shape: id, ownerId, time, name', () => {
		expect(TRANSPORT_ENVELOPE.map(e => e.wire)).toEqual(['id', 'ownerId', 'time', 'name'])
	})

	test('maps occurredAt→time and marks id as transport-synthesized', () => {
		const time = TRANSPORT_ENVELOPE.find(e => e.wire === 'time')
		expect(time?.tsp).toBe('occurredAt')
		const id = TRANSPORT_ENVELOPE.find(e => e.wire === 'id')
		expect(id?.tsp).toBeNull()
	})
})

describe('ENVELOPE_TSP_FIELDS', () => {
	test('lists exactly the _base.tsp envelope property names', () => {
		expect([...ENVELOPE_TSP_FIELDS].sort()).toEqual(['entityId', 'name', 'occurredAt', 'ownerId'])
	})
})

describe('payloadFieldsOf', () => {
	test('drops name + entityId, keeps everything else in declaration order', () => {
		const ev = mkEvent([
			{ name: 'name', type: { kind: 'literal', value: 'integration.thing.happened' }, required: true },
			{ name: 'entityId', type: { kind: 'string' }, required: true },
			{ name: 'thingId', type: { kind: 'string' }, required: true },
			{ name: 'count', type: { kind: 'integer', format: 'int32' }, required: false },
		])
		expect(payloadFieldsOf(ev).map(f => f.name)).toEqual(['thingId', 'count'])
	})

	test('REDECLARED ownerId/occurredAt survive inside the payload (verbatim-payload rule)', () => {
		const ev = mkEvent([
			{ name: 'name', type: { kind: 'literal', value: 'integration.thing.happened' }, required: true },
			{ name: 'ownerId', type: { kind: 'string' }, required: true },
			{ name: 'occurredAt', type: { kind: 'date-time' }, required: true },
			{ name: 'thingId', type: { kind: 'string' }, required: true },
		])
		expect(payloadFieldsOf(ev).map(f => f.name)).toEqual(['ownerId', 'occurredAt', 'thingId'])
	})
})
