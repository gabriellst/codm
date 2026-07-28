import { describe, expect, test } from 'bun:test'
import { REPO } from '../../../template.config'
import { emitTsEnums, emitTsEvents, emitTsBarrel, emitTsInProcess, emitTsMaterialized, emitTsUnions } from './emit-wire-ts'
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

// Envelope names — mirrors what tryParseEvent derives: `ownFields` is the model's own
// declarations (payload source), `fields` the envelope+own merge. Tests declare `fields`
// and derive ownFields unless a case exercises redeclared envelope fields explicitly.
const ENVELOPE_NAMES = new Set(['name', 'entityId', 'ownerId', 'occurredAt'])
function withDerived(ev: Omit<ParsedEvent, 'ownFields' | 'unionSlots'> & Partial<ParsedEvent>): ParsedEvent {
	return {
		...ev,
		ownFields: ev.ownFields ?? ev.fields.filter(f => !ENVELOPE_NAMES.has(f.name) || f.name === 'name'),
		unionSlots: ev.unionSlots ?? [],
	}
}

describe('emitTsEvents', () => {
	const sample: ParsedEvent = withDerived({
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
	})

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
		const bad: ParsedEvent = withDerived({
			...sample,
			wireName: 'video.uploaded',
			fields: sample.fields.map(f => (f.name === 'name' ? { ...f, type: { kind: 'literal' as const, value: 'video.uploaded' } } : f)),
		})
		expect(() => emitTsEvents([bad])).toThrow(/VideoUploadedEvent.*"video\.uploaded".*must start with "integration\."/)
	})

	test('an array field emits z.array of the element schema', () => {
		const ev = withDerived({
			...sample,
			ownFields: undefined,
			fields: [
				...sample.fields,
				{ name: 'affectedMonitorIds', type: { kind: 'array' as const, items: { kind: 'string' as const } }, required: true },
			],
		})
		const f = emitTsEvents([ev])['video-uploaded.ts']!
		expect(f).toContain('affectedMonitorIds: z.array(z.string()),')
	})

	test('an array-of-enum field imports the element enum (recursion into array items)', () => {
		// Regression: a top-level-only import filter would emit z.array(z.enum(ProviderKind))
		// without importing ProviderKind. The collector descends into array element types.
		const ev = withDerived({
			...sample,
			ownFields: undefined,
			fields: [
				...sample.fields,
				{ name: 'providers', type: { kind: 'array' as const, items: { kind: 'enum-ref' as const, ref: 'ProviderKind' } }, required: true },
			],
		})
		const f = emitTsEvents([ev])['video-uploaded.ts']!
		expect(f).toContain('providers: z.array(z.enum(ProviderKind)),')
		expect(f).toContain(`import { ProviderKind, VideoStatus } from '../enums'`)
	})

	test('a union-ref field uses <Name>Schema imported from ../unions', () => {
		const ev = withDerived({
			...sample,
			ownFields: undefined,
			fields: [...sample.fields, { name: 'platform', type: { kind: 'union-ref' as const, ref: 'Platform' }, required: true }],
		})
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

describe('emitTsEvents — union-slot manifest + verbatim payload', () => {
	const slotted: ParsedEvent = withDerived({
		modelName: 'ChannelMessageReceivedEvent',
		wireName: 'integration.channel_message.received',
		fields: [
			{ name: 'name', type: { kind: 'literal', value: 'integration.channel_message.received' }, required: true },
			{ name: 'entityId', type: { kind: 'string' }, required: true },
			{ name: 'ownerId', type: { kind: 'string' }, required: true },
			{ name: 'occurredAt', type: { kind: 'date-time' }, required: true },
			{ name: 'channelId', type: { kind: 'uuid' }, required: true },
			{ name: 'content', type: { kind: 'unknown' }, required: false },
			{ name: 'platform', type: { kind: 'string' }, required: true },
		],
		ownFields: [
			{ name: 'name', type: { kind: 'literal', value: 'integration.channel_message.received' }, required: true },
			{ name: 'channelId', type: { kind: 'uuid' }, required: true },
			{ name: 'occurredAt', type: { kind: 'date-time' }, required: true },
			{ name: 'content', type: { kind: 'unknown' }, required: false },
			{ name: 'platform', type: { kind: 'string' }, required: true },
			{ name: 'ownerId', type: { kind: 'string' }, required: true },
		],
		unionSlots: [
			{
				field: 'content',
				discriminators: ['platform', 'messageType'],
				variants: [
					{ values: ['WHATSAPP', 'TEXT'], typeName: 'WhatsAppTextContent', owner: 'apiGo' },
					{ values: ['INTERNAL', 'TEXT'], typeName: 'InternalTextContent', owner: 'apiGo' },
				],
			},
		],
	})

	test('exports a union MANIFEST (slot → discriminators → [{values, typeName, owner}])', () => {
		const f = emitTsEvents([slotted])['channel-message-received.ts']!
		expect(f).toContain('export const ChannelMessageReceivedUnions = {')
		expect(f).toContain("discriminators: ['platform', 'messageType'],")
		expect(f).toContain("{ values: ['WHATSAPP', 'TEXT'], typeName: 'WhatsAppTextContent', owner: 'apiGo' },")
		expect(f).toContain("{ values: ['INTERNAL', 'TEXT'], typeName: 'InternalTextContent', owner: 'apiGo' },")
		expect(f).toContain('} as const')
	})

	test('payload keeps redeclared envelope fields + opaque slot as z.unknown() + uuid as z.uuid()', () => {
		const f = emitTsEvents([slotted])['channel-message-received.ts']!
		expect(f).toContain('ownerId: z.string(),')
		expect(f).toContain('occurredAt: z.date(),')
		expect(f).toContain('content: z.unknown().optional(),')
		expect(f).toContain('channelId: z.uuid(),')
	})

	test('an event without union slots exports no manifest', () => {
		const f = emitTsEvents([withDerived({ ...slotted, unionSlots: [] })])['channel-message-received.ts']!
		expect(f).not.toContain('Unions')
	})
})

describe('emitTsMaterialized — the manifest×aggregate join at the wire layer (union-slots §2.4)', () => {
	const workspaces = { apiGo: { alias: 'go' }, apiTs: { alias: 'typescript' } }
	const sdkPackage = '@codedm/client-typescript'

	const plain: ParsedEvent = withDerived({
		modelName: 'VideoUploadedEvent',
		wireName: 'integration.video.uploaded',
		fields: [
			{ name: 'name', type: { kind: 'literal', value: 'integration.video.uploaded' }, required: true },
			{ name: 'videoId', type: { kind: 'string' }, required: true },
		],
	})
	const slotted: ParsedEvent = withDerived({
		modelName: 'ChannelMessageReceivedEvent',
		wireName: 'integration.channel_message.received',
		fields: [
			{ name: 'name', type: { kind: 'literal', value: 'integration.channel_message.received' }, required: true },
			{ name: 'content', type: { kind: 'unknown' }, required: false },
			{ name: 'platform', type: { kind: 'string' }, required: true },
		],
		unionSlots: [
			{
				field: 'content',
				discriminators: ['platform'],
				variants: [{ values: ['WHATSAPP'], typeName: 'WhatsAppTextContent', owner: 'apiGo' }],
			},
		],
	})

	test('manifest event → payload swapped for the OWNER aggregate schema from the owner client subpath', () => {
		const out = emitTsMaterialized([slotted], workspaces, sdkPackage)
		expect(out).toContain("import { channelMessageReceivedPayloadSchema } from '@codedm/client-typescript/go'")
		expect(out).toContain(
			'export const ChannelMessageReceivedEventMaterializedSchema = ChannelMessageReceivedEventSchema.extend({ payload: channelMessageReceivedPayloadSchema })',
		)
	})

	test('manifest-less event → the pure contract schema, aliased (no client import)', () => {
		const out = emitTsMaterialized([plain], workspaces, sdkPackage)
		expect(out).toContain('export const VideoUploadedEventMaterializedSchema = VideoUploadedEventSchema')
		expect(out).not.toContain("from '@codedm/client-typescript")
	})

	test('tuple + union are wire-name sorted (deterministic openapi emission)', () => {
		// wire names: integration.channel_message.received < integration.video.uploaded
		const out = emitTsMaterialized([plain, slotted], workspaces, sdkPackage)
		const tupleBlock = out.slice(out.indexOf('materializedIntegrationEventSchemas'))
		expect(tupleBlock.indexOf('ChannelMessageReceivedEventMaterializedSchema')).toBeLessThan(
			tupleBlock.indexOf('VideoUploadedEventMaterializedSchema'),
		)
		expect(out).toContain("export const MaterializedIntegrationEventSchema = z.discriminatedUnion('name', [")
	})

	test('a manifest spanning two owners fails LOUD (no single aggregate payload exists)', () => {
		const twoOwners: ParsedEvent = {
			...slotted,
			unionSlots: [
				{
					field: 'content',
					discriminators: ['platform'],
					variants: [
						{ values: ['WHATSAPP'], typeName: 'WhatsAppTextContent', owner: 'apiGo' },
						{ values: ['INTERNAL'], typeName: 'InternalTextContent', owner: 'apiTs' },
					],
				},
			],
		}
		expect(() => emitTsMaterialized([twoOwners], workspaces, sdkPackage)).toThrow(/span 2 owners/)
	})

	test('an unknown owner id fails LOUD', () => {
		const badOwner: ParsedEvent = {
			...slotted,
			unionSlots: [{ field: 'content', discriminators: ['platform'], variants: [{ values: ['X'], typeName: 'T', owner: 'ghost' }] }],
		}
		expect(() => emitTsMaterialized([badOwner], workspaces, sdkPackage)).toThrow(/not a WORKSPACES id/)
	})

	test('the barrel re-exports the materialized surface', () => {
		expect(emitTsBarrel([plain])).toContain("export * from './materialized'")
	})
})

/**
 * `emitTsInProcess` — the SECOND materialization (contract scalars preserved).
 *
 * The whole reason it exists is that the wire materialization types dates as ISO strings, which is
 * right for SSE and wrong for a handler. So the load-bearing assertions here are (a) the arms extend
 * the CONTRACT payload object rather than importing the owner's aggregate, and (b) the cross-slot
 * join reproduces the Go emitter's rules — which are NOT self-evident and were mirrored deliberately
 * rather than reinvented.
 */
describe('emitTsInProcess — the in-process materialization', () => {
	const workspaces = { apiGo: { alias: 'go' }, apiTs: { alias: 'typescript' } }
	const sdkPackage = '@codedm/client-typescript'

	/** Two slots with DIFFERENT discriminator arity — the shape the pilot actually has. */
	const twoSlot = (slots: ParsedEvent['unionSlots']): ParsedEvent =>
		withDerived({
			modelName: 'ChannelMessageReceivedEvent',
			wireName: 'integration.channel_message.received',
			fields: [
				{ name: 'name', type: { kind: 'literal', value: 'integration.channel_message.received' }, required: true },
				{ name: 'channelId', type: { kind: 'uuid' }, required: true },
				{ name: 'occurredAt', type: { kind: 'date-time' }, required: true },
				{ name: 'messageType', type: { kind: 'enum-ref', ref: 'MessageType' }, required: true },
				{ name: 'content', type: { kind: 'unknown' }, required: false },
				{ name: 'platform', type: { kind: 'string' }, required: true },
				{ name: 'platformData', type: { kind: 'unknown' }, required: false },
			],
			ownFields: [
				{ name: 'name', type: { kind: 'literal', value: 'integration.channel_message.received' }, required: true },
				{ name: 'channelId', type: { kind: 'uuid' }, required: true },
				{ name: 'occurredAt', type: { kind: 'date-time' }, required: true },
				{ name: 'messageType', type: { kind: 'enum-ref', ref: 'MessageType' }, required: true },
				{ name: 'content', type: { kind: 'unknown' }, required: false },
				{ name: 'platform', type: { kind: 'string' }, required: true },
				{ name: 'platformData', type: { kind: 'unknown' }, required: false },
			],
			unionSlots: slots,
		})

	/** A slot-LESS event — the emitter must ignore it entirely. */
	const slotless: ParsedEvent = withDerived({
		modelName: 'ChannelConnectedEvent',
		wireName: 'integration.channel.connected',
		fields: [
			{ name: 'name', type: { kind: 'literal', value: 'integration.channel.connected' }, required: true },
			{ name: 'channelId', type: { kind: 'uuid' }, required: true },
		],
	})

	const CONTENT: ParsedEvent['unionSlots'][number] = {
		field: 'content',
		discriminators: ['platform', 'messageType'],
		variants: [
			{ values: ['WHATSAPP', 'TEXT'], typeName: 'WhatsAppTextContent', owner: 'apiGo' },
			{ values: ['WHATSAPP', 'IMAGE'], typeName: 'WhatsAppImageContent', owner: 'apiGo' },
			{ values: ['INTERNAL', 'TEXT'], typeName: 'InternalTextContent', owner: 'apiGo' },
		],
	}
	const PLATFORM_DATA: ParsedEvent['unionSlots'][number] = {
		field: 'platformData',
		discriminators: ['platform'],
		variants: [
			{ values: ['WHATSAPP'], typeName: 'WhatsAppPlatformData', owner: 'apiGo' },
			{ values: ['INTERNAL'], typeName: 'InternalPlatformData', owner: 'apiGo' },
		],
	}

	test('one arm per PRIMARY variant, extending the CONTRACT payload — never the owner aggregate', () => {
		const out = emitTsInProcess([twoSlot([CONTENT, PLATFORM_DATA])], workspaces, sdkPackage)
		// Three content variants ⇒ three arms. The `.shape.payload.extend` form is what preserves
		// `occurredAt: z.date()`; importing `channelMessageReceivedPayloadSchema` instead would be the
		// wire surface wearing a different name.
		expect(out.split('ChannelMessageReceivedEventSchema.shape.payload.extend({').length - 1).toBe(3)
		expect(out).not.toContain('channelMessageReceivedPayloadSchema')
		expect(out).toContain('export class ChannelMessageReceivedInProcessEvent')
		expect(out).toContain("static override readonly name = 'integration.channel_message.received' as const")
		// The scalars are NOT restated — they are inherited from the contract object. Sliced past the
		// header, whose prose legitimately names `occurredAt`.
		expect(out.slice(out.indexOf('export const'))).not.toContain('occurredAt')
	})

	test('the cross-slot join pins the secondary by the discriminators it SHARES with the primary', () => {
		const out = emitTsInProcess([twoSlot([CONTENT, PLATFORM_DATA])], workspaces, sdkPackage)
		// WHATSAPP arms take the WhatsApp platform data; the INTERNAL arm takes the internal one. A
		// broken join would emit a `z.union([...])` of both in every arm — the silent widening the
		// zero-match fallback is allowed to produce and this case must not.
		expect(out).toContain("platform: z.literal('WHATSAPP'),\n\t\t\tplatformData: whatsAppPlatformDataSchema.optional(),")
		expect(out).toContain("platform: z.literal('INTERNAL'),\n\t\t\tplatformData: internalPlatformDataSchema.optional(),")
		expect(out).not.toContain('z.union([whatsAppPlatformDataSchema, internalPlatformDataSchema])')
	})

	test('PRIMARY is argmax by VARIANT COUNT, independent of declaration order', () => {
		// The pilot's larger slot happens to be declared first, so declaration order would pass by
		// accident. `ChannelMessageSentPayload` on the Go side declares the SMALLER slot first — feeding
		// both orders is what keeps this emitter and `schema.go` agreeing when that one migrates.
		const a = emitTsInProcess([twoSlot([CONTENT, PLATFORM_DATA])], workspaces, sdkPackage)
		const b = emitTsInProcess([twoSlot([PLATFORM_DATA, CONTENT])], workspaces, sdkPackage)
		expect(b.split('.shape.payload.extend({').length - 1).toBe(3)
		expect(b).toBe(a)
	})

	test('a disjoint secondary slot widens to the full union rather than dropping the field', () => {
		// The zero-match fallback, mirrored verbatim from Go. Unreachable for the pilot (platformData's
		// discriminators are a strict subset of content's), so it ships covered only here.
		const disjoint: ParsedEvent['unionSlots'][number] = {
			field: 'platformData',
			discriminators: ['channelId'],
			variants: [
				{ values: ['a'], typeName: 'AData', owner: 'apiGo' },
				{ values: ['b'], typeName: 'BData', owner: 'apiGo' },
			],
		}
		const out = emitTsInProcess([twoSlot([CONTENT, disjoint])], workspaces, sdkPackage)
		expect(out).toContain('platformData: z.union([aDataSchema, bDataSchema]).optional(),')
	})

	test('an enum-backed discriminator emits the ENUM MEMBER, a string one a bare literal', () => {
		const out = emitTsInProcess([twoSlot([CONTENT, PLATFORM_DATA])], workspaces, sdkPackage)
		expect(out).toContain('messageType: z.literal(MessageType.TEXT),')
		expect(out).toContain("platform: z.literal('WHATSAPP'),")
		expect(out).toContain("import { MessageType } from '../enums'")
	})

	test('a contract with NO union slots emits an empty module and imports no client', () => {
		const out = emitTsInProcess([slotless], workspaces, sdkPackage)
		expect(out).toContain('export {}')
		expect(out).not.toContain("from '@codedm/client-typescript")
	})

	test('an unknown @variant owner fails LOUD', () => {
		const ghost: ParsedEvent['unionSlots'][number] = {
			field: 'content',
			discriminators: ['platform'],
			variants: [{ values: ['X'], typeName: 'T', owner: 'ghost' }],
		}
		expect(() => emitTsInProcess([twoSlot([ghost])], workspaces, sdkPackage)).toThrow(/not a WORKSPACES id/)
	})

	test('a slot that is not a payload field fails LOUD rather than silently widening', () => {
		const offEnvelope: ParsedEvent['unionSlots'][number] = {
			field: 'nope',
			discriminators: ['platform'],
			variants: [{ values: ['WHATSAPP'], typeName: 'WhatsAppTextContent', owner: 'apiGo' }],
		}
		expect(() => emitTsInProcess([twoSlot([offEnvelope])], workspaces, sdkPackage)).toThrow(/not a payload field/)
	})

	test('the barrel re-exports the in-process surface', () => {
		expect(emitTsBarrel([slotless])).toContain("export * from './in-process'")
	})
})
