import { describe, expect, test } from 'bun:test'
import { emitGoEnums, emitGoEnvelope, emitGoEvents, emitGoUnions } from './emit-wire-go'
import type { ParsedEnum, ParsedEvent, ParsedUnion } from './lib/parse-openapi'

describe('emitGoUnions', () => {
	const platform: ParsedUnion = { name: 'Platform', refs: ['SalesPlatform', 'MarketingPlatform'], doc: 'Cross-category.' }

	test('emits a typed-string with a @oneof bridge comment and a Valid() membership check', () => {
		const out = emitGoUnions([platform])
		expect(out).toContain('// @oneof values=SalesPlatform,MarketingPlatform')
		expect(out).toContain('type Platform string')
		expect(out).toContain('func (p Platform) Valid() bool {')
		expect(out).toContain('if _, err := ParseSalesPlatform(string(p)); err == nil {')
		expect(out).toContain('if _, err := ParseMarketingPlatform(string(p)); err == nil {')
		expect(out).toContain('package wire')
	})
})

describe('emitGoEvents / emitGoEnvelope — wire-name gate', () => {
	const sample: ParsedEvent = {
		modelName: 'VideoUploadedEvent',
		wireName: 'integration.video.uploaded',
		fields: [
			{ name: 'name', type: { kind: 'literal', value: 'integration.video.uploaded' }, required: true },
			{ name: 'entityId', type: { kind: 'string' }, required: true },
			{ name: 'ownerId', type: { kind: 'string' }, required: true },
			{ name: 'occurredAt', type: { kind: 'date-time' }, required: true },
			{ name: 'videoId', type: { kind: 'string' }, required: true },
		],
	}
	const bad: ParsedEvent = {
		...sample,
		wireName: 'video.uploaded',
		fields: sample.fields.map(f => (f.name === 'name' ? { ...f, type: { kind: 'literal' as const, value: 'video.uploaded' } } : f)),
	}

	test('a conforming "integration."-prefixed wire name emits normally', () => {
		const out = emitGoEvents([sample])
		expect(out).toContain('const VideoUploadedEventName = "integration.video.uploaded"')
	})

	test('throws (teaching, naming the event) when a wire name lacks the "integration." prefix', () => {
		// The outbox routes internal-vs-external by `name.startsWith('integration.')` — an unprefixed
		// wire name would be delivered in-process and never reach the other backend.
		expect(() => emitGoEvents([bad])).toThrow(/VideoUploadedEvent.*"video\.uploaded".*must start with "integration\."/)
		expect(() => emitGoEnvelope([bad])).toThrow(/must start with "integration\."/)
	})

	test('an array field emits a nilable slice (never a *[]T pointer), tag without omitempty when required', () => {
		const ev: ParsedEvent = {
			...sample,
			fields: [...sample.fields, { name: 'affectedMonitorIds', type: { kind: 'array', items: { kind: 'string' } }, required: true }],
		}
		const out = emitGoEvents([ev])
		expect(out).toContain('AffectedMonitorIds []string `json:"affectedMonitorIds"`')
		expect(out).not.toContain('*[]string')
	})
})

describe('emitGoEnums — toGoEnumIdent', () => {
	test('dotless values (e.g. "EXAMPLE") are used as-is (no-op)', () => {
		const e: ParsedEnum = { name: 'SalesPlatform', values: ['EXAMPLE', 'NUVEM_SHOP'] }
		const out = emitGoEnums([e])
		expect(out).toContain('SalesPlatformEXAMPLE SalesPlatform = "EXAMPLE"')
		expect(out).toContain('SalesPlatformNUVEM_SHOP SalesPlatform = "NUVEM_SHOP"')
	})

	test('dotted namespaced value strips leading segment before uppercasing', () => {
		// "sync.external_order_updated" → strip "sync." → "EXTERNAL_ORDER_UPDATED"
		// NOT "SYNC_EXTERNAL_ORDER_UPDATED" (which doubles the namespace prefix)
		const e: ParsedEnum = {
			name: 'SyncEventName',
			values: ['sync.external_order_updated', 'sync.external_product_updated'],
		}
		const out = emitGoEnums([e])
		expect(out).toContain('SyncEventNameEXTERNAL_ORDER_UPDATED SyncEventName = "sync.external_order_updated"')
		expect(out).toContain('SyncEventNameEXTERNAL_PRODUCT_UPDATED SyncEventName = "sync.external_product_updated"')
		// Must NOT produce the doubled-prefix form
		expect(out).not.toContain('SyncEventNameSYNC_EXTERNAL')
	})
})
