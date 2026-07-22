import { describe, expect, test } from 'bun:test'
import { REPO } from '../../../template.config'
import { emitTsEnums, emitTsEvents, emitTsBarrel, emitTsUnions } from './emit-wire-ts'
import type { ParsedEnum, ParsedEvent, ParsedUnion } from './lib/parse-openapi'

describe('emitTsEnums', () => {
	test('produces ts enum WITHOUT a Schema export', () => {
		const e: ParsedEnum = { name: 'VideoStatus', values: ['UPLOADING', 'READY'], doc: 'Video lifecycle.' }
		const out = emitTsEnums([e])
		expect(out['video-status.ts']).toContain('export enum VideoStatus')
		expect(out['video-status.ts']).toContain("UPLOADING = 'UPLOADING'")
		expect(out['video-status.ts']).toContain("READY = 'READY'")
		expect(out['video-status.ts']).not.toContain('VideoStatusSchema')
		expect(out['video-status.ts']).not.toContain('z.nativeEnum')
		expect(out['video-status.ts']).not.toContain('import { z }')
		expect(out['index.ts']).toContain("export * from './video-status'")
	})

	test('produces kebab-case filenames', () => {
		const e: ParsedEnum = { name: 'NotificationKind', values: ['A', 'B'] }
		const out = emitTsEnums([e])
		expect(Object.keys(out)).toContain('notification-kind.ts')
	})

	test('dotted namespaced value strips leading segment before uppercasing', () => {
		// "sync.external_order_updated" → strip "sync." → "EXTERNAL_ORDER_UPDATED"
		// NOT "SYNC_EXTERNAL_ORDER_UPDATED" (which doubles the namespace prefix)
		const e: ParsedEnum = {
			name: 'SyncEventName',
			values: ['sync.external_order_updated', 'sync.external_product_updated'],
		}
		const out = emitTsEnums([e])
		expect(out['sync-event-name.ts']).toContain("EXTERNAL_ORDER_UPDATED = 'sync.external_order_updated'")
		expect(out['sync-event-name.ts']).toContain("EXTERNAL_PRODUCT_UPDATED = 'sync.external_product_updated'")
		// Must NOT produce the doubled-prefix form
		expect(out['sync-event-name.ts']).not.toContain('SYNC_EXTERNAL')
	})

	test('dotless values (e.g. "EXAMPLE") are used as-is (no-op)', () => {
		const e: ParsedEnum = { name: 'SalesPlatform', values: ['EXAMPLE', 'NUVEM_SHOP'] }
		const out = emitTsEnums([e])
		expect(out['sales-platform.ts']).toContain("EXAMPLE = 'EXAMPLE'")
		expect(out['sales-platform.ts']).toContain("NUVEM_SHOP = 'NUVEM_SHOP'")
	})

	test('digit-leading value gets an "_" prefix so the member stays a legal identifier', () => {
		// A TS enum member name cannot lead with a digit — "1m" → "1M" would be a syntax error.
		// The value is preserved exactly; only the value-derived member name is legalized.
		const e: ParsedEnum = { name: 'MonitorInterval', values: ['1m', '5m', '15m'] }
		const out = emitTsEnums([e])
		expect(out['monitor-interval.ts']).toContain("_1M = '1m'")
		expect(out['monitor-interval.ts']).toContain("_5M = '5m'")
		expect(out['monitor-interval.ts']).toContain("_15M = '15m'")
	})
})

describe('emitTsEvents', () => {
	const sample: ParsedEvent = {
		modelName: 'VideoUploadedEvent',
		wireName: 'integration.video.uploaded',
		doc: 'Triggers transcoding.',
		fields: [
			{ name: 'name', type: { kind: 'literal', value: 'integration.video.uploaded' }, required: true },
			{ name: 'entityId', type: { kind: 'string' }, required: true },
			{ name: 'ownerId', type: { kind: 'string' }, required: true },
			{ name: 'occurredAt', type: { kind: 'date-time' }, required: true },
			{ name: 'videoId', type: { kind: 'string' }, required: true },
			{ name: 'byteSize', type: { kind: 'integer', format: 'int64' }, required: true },
			{ name: 'optional', type: { kind: 'string' }, required: false },
			{ name: 'status', type: { kind: 'enum-ref', ref: 'VideoStatus' }, required: true },
		],
	}

	test('emits schema using z.integrationEvent with payload-only fields', () => {
		const out = emitTsEvents([sample])
		const f = out['video-uploaded.ts']!
		expect(f).toContain(`import { z } from '${REPO.corePackage}/schema'`)
		expect(f).toContain(`z.integrationEvent('integration.video.uploaded', {`)
		expect(f).toContain('videoId: z.string()')
		expect(f).toContain('byteSize: z.number().int()')
		expect(f).toContain('optional: z.string().optional()')
		expect(f).toContain('status: z.enum(VideoStatus),')
		expect(f).toContain(`import { VideoStatus } from '../enums'`)
		expect(f).not.toContain('VideoStatusSchema')
		expect(f).not.toContain('entityId: z.string()')
		expect(f).not.toContain('ownerId: z.string()')
		expect(f).not.toContain('occurredAt: z.string().datetime()')
	})

	test('barrel emits discriminated union + IntegrationEvent type', () => {
		const out = emitTsBarrel([sample])
		expect(out).toContain("export * from './video-uploaded'")
		expect(out).toContain('export type IntegrationEvent = Z.infer<typeof IntegrationEventSchema>')
		expect(out).toContain('export const IntegrationEventSchema = z.discriminatedUnion')
	})

	test('throws (teaching, naming the event) when a wire name lacks the "integration." prefix', () => {
		// The outbox routes internal-vs-external by `name.startsWith('integration.')` — an unprefixed
		// wire name would be delivered in-process and never reach the other backend.
		const bad: ParsedEvent = {
			...sample,
			wireName: 'video.uploaded',
			fields: sample.fields.map(f => (f.name === 'name' ? { ...f, type: { kind: 'literal' as const, value: 'video.uploaded' } } : f)),
		}
		expect(() => emitTsEvents([bad])).toThrow(/VideoUploadedEvent.*"video\.uploaded".*must start with "integration\."/)
	})

	test('an array field emits z.array of the element schema', () => {
		const ev = {
			...sample,
			fields: [
				...sample.fields,
				{ name: 'affectedMonitorIds', type: { kind: 'array' as const, items: { kind: 'string' as const } }, required: true },
			],
		}
		const f = emitTsEvents([ev])['video-uploaded.ts']!
		expect(f).toContain('affectedMonitorIds: z.array(z.string()),')
	})

	test('a union-ref field uses <Name>Schema imported from ../unions', () => {
		const ev = {
			...sample,
			fields: [...sample.fields, { name: 'platform', type: { kind: 'union-ref' as const, ref: 'Platform' }, required: true }],
		}
		const f = emitTsEvents([ev])['video-uploaded.ts']!
		expect(f).toContain('platform: PlatformSchema,')
		expect(f).toContain(`import { PlatformSchema } from '../unions'`)
	})
})

describe('emitTsUnions', () => {
	const platform: ParsedUnion = { name: 'Platform', refs: ['SalesPlatform', 'MarketingPlatform'], doc: 'Cross-category.' }

	test('emits PlatformSchema as a z.union of the member enum schemas', () => {
		const out = emitTsUnions([platform])
		const f = out['platform.ts']!
		expect(f).toContain(`import { z } from '${REPO.corePackage}/schema'`)
		expect(f).toContain(`import { SalesPlatform, MarketingPlatform } from '../enums'`)
		expect(f).toContain('export const PlatformSchema = z.union([z.enum(SalesPlatform), z.enum(MarketingPlatform)])')
		expect(out['index.ts']).toContain("export * from './platform'")
	})
})
