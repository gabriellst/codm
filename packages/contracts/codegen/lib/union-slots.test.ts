import { describe, expect, test } from 'bun:test'
import { associateUnionSlots, assertUnionSlotOwners } from './union-slots'

// Raw arrays arrive in REVERSE source order (decorators execute bottom-up) — these
// fixtures mirror what the openapi3 emitter writes for the canonical pilot shape:
//
//   @unionSlot("content", #["platform", "messageType"])
//   @variant("WHATSAPP", "TEXT", "WhatsAppTextContent", #{ owner: "apiGo" })
//   @variant("WHATSAPP", "IMAGE", "WhatsAppImageContent", #{ owner: "apiGo" })
//   @unionSlot("platformData", #["platform"])
//   @variant("WHATSAPP", "WhatsAppPD", #{ owner: "apiGo" })
const rawSlots = [
	{ field: 'platformData', discriminators: ['platform'] },
	{ field: 'content', discriminators: ['platform', 'messageType'] },
]
const rawVariants = [
	{ values: ['WHATSAPP'], typeName: 'WhatsAppPD', owner: 'apiGo' },
	{ values: ['WHATSAPP', 'IMAGE'], typeName: 'WhatsAppImageContent', owner: 'apiGo' },
	{ values: ['WHATSAPP', 'TEXT'], typeName: 'WhatsAppTextContent', owner: 'apiGo' },
]
const props = ['name', 'ownerId', 'occurredAt', 'platform', 'messageType', 'content', 'platformData']

describe('associateUnionSlots', () => {
	test('recovers source order and associates variants to slots by discriminator count', () => {
		const slots = associateUnionSlots('Ev', rawSlots, rawVariants, props)
		expect(slots.map(s => s.field)).toEqual(['content', 'platformData'])
		expect(slots[0]!.discriminators).toEqual(['platform', 'messageType'])
		expect(slots[0]!.variants.map(v => v.typeName)).toEqual(['WhatsAppTextContent', 'WhatsAppImageContent'])
		expect(slots[1]!.variants).toEqual([{ values: ['WHATSAPP'], typeName: 'WhatsAppPD', owner: 'apiGo' }])
	})

	test('no declarations → empty result', () => {
		expect(associateUnionSlots('Ev', [], [], props)).toEqual([])
	})

	test('throws when the slot field is not a property of the model', () => {
		expect(() => associateUnionSlots('Ev', [{ field: 'nope', discriminators: ['platform'] }], rawVariants.slice(0, 1), props)).toThrow(
			/@unionSlot\("nope"\) does not match any property/,
		)
	})

	test('throws when a discriminator is not a property of the model', () => {
		expect(() =>
			associateUnionSlots(
				'Ev',
				[{ field: 'content', discriminators: ['provider'] }],
				[{ values: ['X'], typeName: 'T', owner: 'apiGo' }],
				props,
			),
		).toThrow(/discriminator "provider" is not a property/)
	})

	test('throws on two slots with the same discriminator count (ambiguous association)', () => {
		expect(() =>
			associateUnionSlots(
				'Ev',
				[
					{ field: 'platformData', discriminators: ['platform'] },
					{ field: 'content', discriminators: ['messageType'] },
				],
				[{ values: ['X'], typeName: 'T', owner: 'apiGo' }],
				props,
			),
		).toThrow(/equal-arity slots/)
	})

	test('throws when a variant arity matches no slot', () => {
		expect(() =>
			associateUnionSlots(
				'Ev',
				[{ field: 'content', discriminators: ['platform', 'messageType'] }],
				[{ values: ['WHATSAPP'], typeName: 'T', owner: 'apiGo' }],
				props,
			),
		).toThrow(/no @unionSlot declares that many discriminators/)
	})

	test('throws on duplicate variant value-tuples within a slot', () => {
		expect(() =>
			associateUnionSlots(
				'Ev',
				[{ field: 'platformData', discriminators: ['platform'] }],
				[
					{ values: ['WHATSAPP'], typeName: 'A', owner: 'apiGo' },
					{ values: ['WHATSAPP'], typeName: 'B', owner: 'apiGo' },
				],
				props,
			),
		).toThrow(/duplicate variant for values \(WHATSAPP\)/)
	})

	test('throws on a slot without variants (empty oneOf is make-work)', () => {
		expect(() => associateUnionSlots('Ev', [{ field: 'content', discriminators: ['platform', 'messageType'] }], [], props)).toThrow(
			/has no @variant/,
		)
	})

	test('throws on @variant without any @unionSlot', () => {
		expect(() => associateUnionSlots('Ev', [], rawVariants.slice(0, 1), props)).toThrow(/@variant declared without any @unionSlot/)
	})
})

describe('assertUnionSlotOwners — manifest gate', () => {
	const slots = associateUnionSlots('Ev', rawSlots, rawVariants, props)

	test('accepts owners that are WORKSPACES ids', () => {
		expect(() => assertUnionSlotOwners([{ modelName: 'Ev', unionSlots: slots }], ['apiTs', 'apiGo'])).not.toThrow()
	})

	test('unknown owner = contract compilation error (teaching, names the variant + valid ids)', () => {
		expect(() => assertUnionSlotOwners([{ modelName: 'Ev', unionSlots: slots }], ['apiTs'])).toThrow(
			/Ev: @variant "WhatsAppTextContent" declares owner "apiGo".*valid: apiTs/,
		)
	})

	test('the real manifest owner set comes from template.config.ts WORKSPACES', async () => {
		const { REPO } = await import('../../../../template.config')
		expect(Object.keys(REPO.workspaces)).toContain('apiGo')
		expect(() => assertUnionSlotOwners([{ modelName: 'Ev', unionSlots: slots }], Object.keys(REPO.workspaces))).not.toThrow()
	})
})
