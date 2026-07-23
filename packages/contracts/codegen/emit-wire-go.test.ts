import { describe, expect, test } from 'bun:test'
import { emitGoEnums, emitGoEnvelope, emitGoEvents, emitGoUnions } from './emit-wire-go'
import type { ParsedEnum, ParsedEvent, ParsedUnion } from './lib/parse-openapi'

// Mirrors what tryParseEvent derives: `ownFields` = the model's own declarations
// (payload-struct source), `fields` = envelope+own merge. Tests declare `fields` and
// derive ownFields; union-slot cases pass ownFields/unionSlots explicitly.
const ENVELOPE_NAMES = new Set(['name', 'entityId', 'ownerId', 'occurredAt'])
function withDerived(ev: Omit<ParsedEvent, 'ownFields' | 'unionSlots'> & Partial<ParsedEvent>): ParsedEvent {
	return {
		...ev,
		ownFields: ev.ownFields ?? ev.fields.filter(f => !ENVELOPE_NAMES.has(f.name) || f.name === 'name'),
		unionSlots: ev.unionSlots ?? [],
	}
}

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
	const sample: ParsedEvent = withDerived({
		modelName: 'VideoUploadedEvent',
		wireName: 'integration.video.uploaded',
		fields: [
			{ name: 'name', type: { kind: 'literal', value: 'integration.video.uploaded' }, required: true },
			{ name: 'entityId', type: { kind: 'string' }, required: true },
			{ name: 'ownerId', type: { kind: 'string' }, required: true },
			{ name: 'occurredAt', type: { kind: 'date-time' }, required: true },
			{ name: 'videoId', type: { kind: 'string' }, required: true },
		],
	})
	const bad: ParsedEvent = withDerived({
		...sample,
		wireName: 'video.uploaded',
		fields: sample.fields.map(f => (f.name === 'name' ? { ...f, type: { kind: 'literal' as const, value: 'video.uploaded' } } : f)),
	})

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
		const ev: ParsedEvent = withDerived({
			...sample,
			ownFields: undefined,
			fields: [...sample.fields, { name: 'affectedMonitorIds', type: { kind: 'array', items: { kind: 'string' } }, required: true }],
		})
		const out = emitGoEvents([ev])
		expect(out).toContain('AffectedMonitorIDs []string `json:"affectedMonitorIds"`')
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

describe('emitGoEvents — union-slot payload struct (stamped binding)', () => {
	// Pilot-shaped fixture: verbatim payload redeclares ownerId/occurredAt INSIDE the
	// payload; content/platformData are opaque slots declared @unionSlot in the contract.
	const slotted: ParsedEvent = withDerived({
		modelName: 'ChannelMessageReceivedEvent',
		wireName: 'integration.channel_message.received',
		fields: [
			{ name: 'name', type: { kind: 'literal', value: 'integration.channel_message.received' }, required: true },
			{ name: 'entityId', type: { kind: 'string' }, required: true },
			{ name: 'ownerId', type: { kind: 'string' }, required: true },
			{ name: 'occurredAt', type: { kind: 'date-time' }, required: true },
			{ name: 'channelId', type: { kind: 'uuid' }, required: true },
			{ name: 'isGroup', type: { kind: 'boolean' }, required: true },
			{ name: 'messageType', type: { kind: 'enum-ref', ref: 'MessageType' }, required: true },
			{ name: 'content', type: { kind: 'unknown' }, required: false },
			{ name: 'platform', type: { kind: 'string' }, required: true },
			{ name: 'platformData', type: { kind: 'unknown' }, required: false },
		],
		ownFields: [
			{ name: 'name', type: { kind: 'literal', value: 'integration.channel_message.received' }, required: true },
			{ name: 'channelId', type: { kind: 'uuid' }, required: true },
			{ name: 'isGroup', type: { kind: 'boolean' }, required: true },
			{ name: 'occurredAt', type: { kind: 'date-time' }, required: true },
			{ name: 'messageType', type: { kind: 'enum-ref', ref: 'MessageType' }, required: true },
			{ name: 'content', type: { kind: 'unknown' }, required: false },
			{ name: 'platform', type: { kind: 'string' }, required: true },
			{ name: 'platformData', type: { kind: 'unknown' }, required: false },
			{ name: 'ownerId', type: { kind: 'string' }, required: true },
		],
		unionSlots: [
			{
				field: 'content',
				discriminators: ['platform', 'messageType'],
				variants: [
					{ values: ['WHATSAPP', 'TEXT'], typeName: 'WhatsAppTextContent', owner: 'apiGo' },
					{ values: ['WHATSAPP', 'POLL'], typeName: 'WhatsAppPollContent', owner: 'apiGo' },
				],
			},
			{
				field: 'platformData',
				discriminators: ['platform'],
				variants: [{ values: ['WHATSAPP'], typeName: 'WhatsAppPD', owner: 'apiGo' }],
			},
		],
	})

	test('emits a payload struct stamped with medscall-grammar @union/@variant comments', () => {
		const out = emitGoEvents([slotted])
		expect(out).toContain('type ChannelMessageReceivedPayload struct {')
		expect(out).toContain('// @union field=Content discriminatedBy=Platform,MessageType')
		expect(out).toContain('// @variant Platform=WHATSAPP MessageType=TEXT type=WhatsAppTextContent')
		expect(out).toContain('// @variant Platform=WHATSAPP MessageType=POLL type=WhatsAppPollContent')
		expect(out).toContain('// @union field=PlatformData discriminatedBy=Platform')
		expect(out).toContain('// @variant Platform=WHATSAPP type=WhatsAppPD')
	})

	test('payload struct carries redeclared envelope fields (verbatim parity) — the flat event struct does not duplicate them', () => {
		const out = emitGoEvents([slotted])
		const payloadStruct = out.slice(out.indexOf('type ChannelMessageReceivedPayload struct {'))
		expect(payloadStruct).toContain('OwnerID string `json:"ownerId" validate:"required"`')
		expect(payloadStruct).toContain('OccurredAt time.Time `json:"occurredAt" validate:"required"`')
		// Flat wire struct: envelope fields appear exactly once (the envelope block).
		const flatStruct = out.slice(
			out.indexOf('type ChannelMessageReceivedEvent struct {'),
			out.indexOf('type ChannelMessageReceivedPayload'),
		)
		expect(flatStruct.match(/OwnerID/g)).toHaveLength(1)
		expect(flatStruct.match(/OccurredAt/g)).toHaveLength(1)
	})

	test('opaque union slots are nilable json.RawMessage (no *pointer), uuid fields map to uuid.UUID with the import', () => {
		const out = emitGoEvents([slotted])
		expect(out).toContain('Content json.RawMessage `json:"content,omitempty"`')
		expect(out).toContain('PlatformData json.RawMessage `json:"platformData,omitempty"`')
		expect(out).not.toContain('*json.RawMessage')
		expect(out).toContain('ChannelID uuid.UUID `json:"channelId" validate:"required"`')
		expect(out).toContain('"github.com/google/uuid"')
	})

	test('required bool flags carry NO validate:"required" — go-playground required rejects the zero value false', () => {
		const out = emitGoEvents([slotted])
		const payloadStruct = out.slice(out.indexOf('type ChannelMessageReceivedPayload struct {'))
		// Verbatim medscall parity: IsGroup=false (a non-group message) must stay valid under a
		// future validator.Struct call, so the tag is bare `json:"isGroup"` — never validate:"required".
		expect(payloadStruct).toContain('IsGroup bool `json:"isGroup"`')
		expect(payloadStruct).not.toContain('IsGroup bool `json:"isGroup" validate:"required"`')
	})
})

describe('emitGoEvents — payload struct for EVERY event (flat-events generalization)', () => {
	// The union-slots pilot emitted payload structs only for slotted events; the
	// flat-events swap needs the `types.IntegrationEvent[wire.<X>Payload]`-compatible
	// binding for every hand-rolled envelope it replaces.
	const flat: ParsedEvent = withDerived({
		modelName: 'ChannelMessageDeliveredEvent',
		wireName: 'integration.channel_message.delivered',
		fields: [
			{ name: 'name', type: { kind: 'literal', value: 'integration.channel_message.delivered' }, required: true },
			{ name: 'entityId', type: { kind: 'string' }, required: true },
			{ name: 'ownerId', type: { kind: 'string' }, required: true },
			{ name: 'occurredAt', type: { kind: 'date-time' }, required: true },
			{ name: 'channelId', type: { kind: 'uuid' }, required: true },
			{ name: 'messageIds', type: { kind: 'array', items: { kind: 'string' } }, required: true },
			{ name: 'timestamp', type: { kind: 'integer', format: 'int64' }, required: true },
			{ name: 'platform', type: { kind: 'string' }, required: true },
		],
		ownFields: [
			{ name: 'name', type: { kind: 'literal', value: 'integration.channel_message.delivered' }, required: true },
			{ name: 'channelId', type: { kind: 'uuid' }, required: true },
			{ name: 'messageIds', type: { kind: 'array', items: { kind: 'string' } }, required: true },
			{ name: 'timestamp', type: { kind: 'integer', format: 'int64' }, required: true },
			{ name: 'platform', type: { kind: 'string' }, required: true },
			{ name: 'ownerId', type: { kind: 'string' }, required: true },
		],
	})

	test('a slot-less event emits a payload struct (no @union stamps), envelope-compatible', () => {
		const out = emitGoEvents([flat])
		const payloadStruct = out.slice(out.indexOf('type ChannelMessageDeliveredPayload struct {'))
		expect(payloadStruct).toContain('ChannelID uuid.UUID `json:"channelId" validate:"required"`')
		expect(payloadStruct).toContain('Timestamp int64 `json:"timestamp" validate:"required"`')
		// Redeclared ownerId rides INSIDE the payload (verbatim parity with the hand-rolled envelope).
		expect(payloadStruct).toContain('OwnerID string `json:"ownerId" validate:"required"`')
		// No union machinery on flat events.
		expect(payloadStruct).not.toContain('@union')
	})

	test('plural id arrays use the Go IDs initialism — alias-compatible with the hand-rolled field spelling', () => {
		const out = emitGoEvents([flat])
		expect(out).toContain('MessageIDs []string `json:"messageIds"`')
		expect(out).not.toContain('MessageIds')
	})
})
