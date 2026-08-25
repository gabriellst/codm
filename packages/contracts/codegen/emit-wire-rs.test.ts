import { describe, expect, test } from 'bun:test'
import { emitRsEnums, emitRsEnvelope, emitRsEvents, emitRsSlots, emitRsUnions } from './emit-wire-rs'
import type { EventField, ParsedEvent, ParsedUnion } from './lib/parse-openapi'

const mkEvent = (over: Partial<ParsedEvent> & { ownFields: EventField[] }): ParsedEvent => ({
	modelName: 'ThingHappenedEvent',
	wireName: 'integration.thing.happened',
	fields: [
		{ name: 'name', type: { kind: 'literal', value: over.wireName ?? 'integration.thing.happened' }, required: true },
		{ name: 'entityId', type: { kind: 'string' }, required: true },
		{ name: 'ownerId', type: { kind: 'string' }, required: true },
		{ name: 'occurredAt', type: { kind: 'date-time' }, required: true },
		...over.ownFields,
	],
	unionSlots: [],
	...over,
})

describe('emitRsEnums', () => {
	test('pure serde enum: derives, per-variant serde+strum renames, no server deps', () => {
		const out = emitRsEnums([{ name: 'VideoStatus', values: ['UPLOADING', 'READY'], doc: 'Lifecycle status.' }])
		expect(out).toContain('pub enum VideoStatus')
		expect(out).toContain('/// Lifecycle status.')
		expect(out).toContain('serde::Serialize')
		expect(out).toContain('serde::Deserialize')
		expect(out).toContain('strum::EnumString')
		expect(out).toContain('#[serde(rename = "UPLOADING")]')
		expect(out).toContain('#[strum(serialize = "UPLOADING")]')
		// server-only derives must NOT leak into the pure wire crate
		expect(out).not.toContain('utoipa')
		expect(out).not.toContain('template_core')
	})

	test('dotted values strip the namespace segment for the ident; wire value stays exact', () => {
		const out = emitRsEnums([{ name: 'SyncEventName', values: ['sync.external_order_updated'] }])
		expect(out).toContain('EXTERNAL_ORDER_UPDATED,')
		expect(out).toContain('#[serde(rename = "sync.external_order_updated")]')
	})

	test('digit-leading values get an underscore prefix', () => {
		const out = emitRsEnums([{ name: 'BufferSize', values: ['25', '200'] }])
		expect(out).toContain('_25,')
		expect(out).toContain('#[serde(rename = "25")]')
	})
})

describe('emitRsUnions', () => {
	const u: ParsedUnion = { name: 'AnyPlatform', refs: ['ChannelKind', 'SalesKind'], doc: 'Cross-category union.' }

	test('untagged enum over member enums with an Unknown(String) forward-compat arm', () => {
		const out = emitRsUnions([u])
		expect(out).toContain('#[serde(untagged)]')
		expect(out).toContain('pub enum AnyPlatform')
		expect(out).toContain('ChannelKind(ChannelKind),')
		expect(out).toContain('SalesKind(SalesKind),')
		expect(out).toContain('Unknown(String),')
		expect(out).toContain('/// Cross-category union.')
	})

	test('as_str + is_known helpers', () => {
		const out = emitRsUnions([u])
		expect(out).toContain('pub fn as_str(&self) -> &str')
		expect(out).toContain('pub fn is_known(&self) -> bool')
	})
})

describe('emitRsEvents — type matrix', () => {
	const matrix = mkEvent({
		modelName: 'MatrixEvent',
		wireName: 'integration.matrix.tested',
		doc: 'Exercises every FieldType kind.',
		ownFields: [
			{ name: 'name', type: { kind: 'literal', value: 'integration.matrix.tested' }, required: true },
			{ name: 'entityId', type: { kind: 'string' }, required: true },
			{ name: 'plainString', type: { kind: 'string' }, required: true },
			{ name: 'anId', type: { kind: 'uuid' }, required: true },
			{ name: 'status', type: { kind: 'enum-ref', ref: 'VideoStatus' }, required: true },
			{ name: 'platform', type: { kind: 'union-ref', ref: 'AnyPlatform' }, required: true },
			{ name: 'flag', type: { kind: 'boolean' }, required: true },
			{ name: 'small', type: { kind: 'integer', format: 'int32' }, required: true },
			{ name: 'big', type: { kind: 'integer', format: 'int64' }, required: true },
			{ name: 'plainInt', type: { kind: 'integer' }, required: true },
			{ name: 'ratio', type: { kind: 'number' }, required: true },
			{ name: 'when', type: { kind: 'date-time' }, required: true },
			{ name: 'link', type: { kind: 'url' }, required: true },
			{ name: 'tags', type: { kind: 'array', items: { kind: 'string' } }, required: true },
			{ name: 'kinds', type: { kind: 'array', items: { kind: 'enum-ref', ref: 'VideoStatus' } }, required: true },
			{ name: 'blob', type: { kind: 'unknown' }, required: true },
			{ name: 'optString', type: { kind: 'string' }, required: false },
			{ name: 'optWhen', type: { kind: 'date-time' }, required: false },
			{ name: 'optTags', type: { kind: 'array', items: { kind: 'string' } }, required: false },
			{ name: 'optBlob', type: { kind: 'unknown' }, required: false },
		],
	})

	test('every kind maps to its pure-Rust type', () => {
		const out = emitRsEvents([matrix])
		expect(out).toContain('pub plain_string: String,')
		expect(out).toContain('pub an_id: uuid::Uuid,')
		expect(out).toContain('pub status: VideoStatus,')
		expect(out).toContain('pub platform: AnyPlatform,')
		expect(out).toContain('pub flag: bool,')
		expect(out).toContain('pub small: i32,')
		expect(out).toContain('pub big: i64,')
		expect(out).toContain('pub plain_int: i64,')
		expect(out).toContain('pub ratio: f64,')
		expect(out).toContain('pub when: chrono::DateTime<chrono::Utc>,')
		expect(out).toContain('pub link: String,')
		expect(out).toContain('pub tags: Vec<String>,')
		expect(out).toContain('pub kinds: Vec<VideoStatus>,')
		expect(out).toContain('pub blob: serde_json::Value,')
	})

	test('float32 maps to f32 — never String (the proven template defect)', () => {
		// TypeSpec float32 reaches OpenAPI as `format: float` (verified in dist).
		const ev = mkEvent({
			modelName: 'ViewRecordedEvent',
			wireName: 'integration.view.recorded',
			ownFields: [
				{ name: 'completionRatio', type: { kind: 'number', format: 'float' }, required: true },
				{ name: 'preciseRatio', type: { kind: 'number', format: 'float64' }, required: true },
			],
		})
		const out = emitRsEvents([ev])
		expect(out).toContain('pub completion_ratio: f32,')
		expect(out).toContain('pub precise_ratio: f64,')
		expect(out).not.toContain('completion_ratio: String')
	})

	test('optional scalar → Option<T> + skip_serializing_if; optional array → Vec + default (nil-slice parity)', () => {
		const out = emitRsEvents([matrix])
		expect(out).toContain('pub opt_string: Option<String>,')
		expect(out).toContain('pub opt_when: Option<chrono::DateTime<chrono::Utc>>,')
		expect(out).toMatch(/skip_serializing_if = "Option::is_none"\)\]\n\tpub opt_string/)
		// arrays mirror Go: absent == empty, never Option<Vec<T>>
		expect(out).toContain('pub opt_tags: Vec<String>,')
		expect(out).not.toContain('Option<Vec<String>>')
		expect(out).toMatch(/#\[serde\(default, skip_serializing_if = "Vec::is_empty"\)\]\n\tpub opt_tags/)
	})

	test('payload struct is Envelope-composable: type alias + wire-name const + camelCase rename_all', () => {
		const out = emitRsEvents([matrix])
		expect(out).toContain('pub struct MatrixPayload {')
		expect(out).toContain('pub type MatrixEvent = super::envelope::Envelope<MatrixPayload>;')
		expect(out).toContain('pub const MATRIX_EVENT_NAME: &str = "integration.matrix.tested";')
		expect(out).toContain('#[serde(rename_all = "camelCase")]')
	})

	test('docs land as /// on the struct — never as unused macro doc', () => {
		const out = emitRsEvents([matrix])
		expect(out).toContain('/// Exercises every FieldType kind.')
	})

	test('envelope fields never leak into the payload struct', () => {
		const out = emitRsEvents([matrix])
		expect(out).not.toContain('pub entity_id')
		expect(out).not.toContain('pub owner_id')
		expect(out).not.toContain('pub occurred_at')
		expect(out).not.toMatch(/pub name:/)
	})

	test('rust keyword field names become raw idents; wire tag untouched by rename_all', () => {
		const ev = mkEvent({
			ownFields: [
				{ name: 'type', type: { kind: 'string' }, required: true },
				{ name: 'match', type: { kind: 'string' }, required: false },
			],
		})
		const out = emitRsEvents([ev])
		expect(out).toContain('pub r#type: String,')
		expect(out).toContain('pub r#match: Option<String>,')
	})

	test('acronym-bearing camelCase fields snake correctly', () => {
		const ev = mkEvent({
			ownFields: [
				{ name: 'hlsUrl', type: { kind: 'url' }, required: true },
				{ name: 'messageIds', type: { kind: 'array', items: { kind: 'string' } }, required: true },
			],
		})
		const out = emitRsEvents([ev])
		expect(out).toContain('pub hls_url: String,')
		expect(out).toContain('pub message_ids: Vec<String>,')
	})

	test('inline string-enum becomes a local per-field enum with exact wire renames', () => {
		const ev = mkEvent({
			modelName: 'ThreadConfiguredEvent',
			ownFields: [{ name: 'bufferSize', type: { kind: 'string-enum', values: ['25', '50'] }, required: true }],
		})
		const out = emitRsEvents([ev])
		expect(out).toContain('pub enum ThreadConfiguredBufferSize')
		expect(out).toContain('#[serde(rename = "25")]')
		expect(out).toContain('pub buffer_size: ThreadConfiguredBufferSize,')
	})

	test('a payload literal field stays String with the pinned value documented', () => {
		const ev = mkEvent({
			ownFields: [{ name: 'eventName', type: { kind: 'literal', value: 'fixed.value' }, required: true }],
		})
		const out = emitRsEvents([ev])
		expect(out).toContain('/// Always `"fixed.value"`.')
		expect(out).toContain('pub event_name: String,')
	})

	test('union-slot fields stay opaque Value — shapes live with the owner (union-slots spec §6)', () => {
		const ev = mkEvent({
			modelName: 'ChannelMessageReceivedEvent',
			wireName: 'integration.channel.message_received',
			ownFields: [
				{ name: 'platform', type: { kind: 'enum-ref', ref: 'ChannelKind' }, required: true },
				{ name: 'content', type: { kind: 'unknown' }, required: false },
			],
			unionSlots: [
				{
					field: 'content',
					discriminators: ['platform'],
					variants: [{ values: ['WHATSAPP'], typeName: 'WhatsAppTextContent', owner: 'apiGo' }],
				},
			],
		})
		const out = emitRsEvents([ev])
		expect(out).toContain('pub content: Option<serde_json::Value>,')
		// slot metadata is stamped as doc so readers know where the shapes live
		expect(out).toContain('union slot')
	})
})

describe('emitRsSlots', () => {
	const slotted = mkEvent({
		modelName: 'ChannelMessageReceivedEvent',
		wireName: 'integration.channel_message.received',
		ownFields: [
			{ name: 'platform', type: { kind: 'string' }, required: true },
			{ name: 'messageType', type: { kind: 'enum-ref', ref: 'MessageType' }, required: true },
			{ name: 'content', type: { kind: 'unknown' }, required: false },
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

	test('emits a machine-readable manifest const per slotted event (TS <Model>Unions parity)', () => {
		const out = emitRsSlots([slotted])
		expect(out).toContain('pub struct UnionSlotMeta {')
		expect(out).toContain('pub const CHANNEL_MESSAGE_RECEIVED_EVENT_SLOTS: &[UnionSlotMeta] = &[')
		expect(out).toContain('field: "content",')
		expect(out).toContain('discriminators: &["platform", "messageType"],')
		expect(out).toContain('UnionVariantMeta { values: &["WHATSAPP", "TEXT"], type_name: "WhatsAppTextContent", owner: "apiGo" },')
	})

	test('slot-less contract still emits the meta types (stable mod surface), no consts', () => {
		const out = emitRsSlots([mkEvent({ ownFields: [] })])
		expect(out).toContain('pub struct UnionSlotMeta {')
		expect(out).not.toContain('_SLOTS')
	})
})

describe('emitRsEnvelope', () => {
	const events: ParsedEvent[] = [
		mkEvent({
			modelName: 'VideoUploadedEvent',
			wireName: 'integration.video.uploaded',
			ownFields: [{ name: 'videoId', type: { kind: 'string' }, required: true }],
		}),
		mkEvent({
			modelName: 'VideoArchivedEvent',
			wireName: 'integration.video.archived',
			ownFields: [{ name: 'videoId', type: { kind: 'string' }, required: true }],
		}),
	]

	test('generic Envelope<T> mirrors the Go transport {id, ownerId, time, name, payload}', () => {
		const out = emitRsEnvelope(events)
		expect(out).toContain('pub struct Envelope<T> {')
		expect(out).toContain('pub id: uuid::Uuid,')
		expect(out).toContain('pub owner_id: String,')
		expect(out).toContain('pub time: chrono::DateTime<chrono::Utc>,')
		expect(out).toContain('pub name: String,')
		expect(out).toContain('pub payload: T,')
	})

	test('dispatch enum is name-tagged with one struct variant per event carrying the full envelope', () => {
		const out = emitRsEnvelope(events)
		expect(out).toContain('#[serde(tag = "name")]')
		expect(out).toContain('pub enum IntegrationEvent {')
		expect(out).toContain('#[serde(rename = "integration.video.uploaded", rename_all = "camelCase")]')
		expect(out).toContain('VideoUploaded {')
		expect(out).toContain('payload: super::events::VideoUploadedPayload,')
		// id + time must NOT vanish from the binding (the proven template defect)
		expect(out).toMatch(/VideoUploaded \{[^}]*id: uuid::Uuid/s)
		expect(out).toMatch(/VideoUploaded \{[^}]*time: chrono::DateTime<chrono::Utc>/s)
	})

	test('accessor helpers expose the envelope uniformly across variants', () => {
		const out = emitRsEnvelope(events)
		expect(out).toContain("pub fn name(&self) -> &'static str")
		expect(out).toContain('pub fn owner_id(&self) -> &str')
	})

	test('WireEvent wraps dispatch with forward-compat: unknown name → Opaque, never an error', () => {
		const out = emitRsEnvelope(events)
		expect(out).toContain('pub enum WireEvent {')
		expect(out).toContain('Known(IntegrationEvent),')
		expect(out).toContain('Opaque(serde_json::Value),')
		expect(out).toContain("impl<'de> serde::Deserialize<'de> for WireEvent")
	})
})
