import { describe, expect, test } from 'bun:test'
import { parseContractsOpenapi } from './parse-openapi'

const sampleYaml = `
openapi: 3.0.0
info: { title: Test, version: 0.0.0 }
paths: {}
components:
  schemas:
    VideoStatus:
      type: string
      enum: [UPLOADING, READY, FAILED]
    ReactionType:
      type: string
      enum: [LIKE, DISLIKE]
    IntegrationEvent:
      type: object
      discriminator:
        propertyName: name
      required: [name, entityId, ownerId, occurredAt]
      properties:
        name: { type: string }
        entityId: { type: string }
        ownerId: { type: string }
        occurredAt: { type: string, format: date-time }
    VideoUploadedEvent:
      allOf:
        - $ref: '#/components/schemas/IntegrationEvent'
        - type: object
          required: [name, videoId, byteSize]
          properties:
            name: { type: string, enum: [integration.video.uploaded] }
            videoId: { type: string }
            byteSize: { type: integer, format: int64 }
            optional: { type: string }
`

describe('parseContractsOpenapi', () => {
	test('extracts enums', () => {
		const parsed = parseContractsOpenapi(sampleYaml)
		expect(parsed.enums.map(e => e.name).sort()).toEqual(['ReactionType', 'VideoStatus'])
		const videoStatus = parsed.enums.find(e => e.name === 'VideoStatus')!
		expect(videoStatus.values).toEqual(['UPLOADING', 'READY', 'FAILED'])
	})

	test('extracts integration events with constant name + fields', () => {
		const parsed = parseContractsOpenapi(sampleYaml)
		expect(parsed.events.length).toBe(1)
		const ev = parsed.events[0]!
		expect(ev.modelName).toBe('VideoUploadedEvent')
		expect(ev.wireName).toBe('integration.video.uploaded')
		// envelope fields + own fields
		const fieldNames = ev.fields.map(f => f.name).sort()
		expect(fieldNames).toEqual(['byteSize', 'entityId', 'name', 'occurredAt', 'optional', 'ownerId', 'videoId'])
		const byteSize = ev.fields.find(f => f.name === 'byteSize')!
		expect(byteSize.required).toBe(true)
		expect(byteSize.type).toEqual({ kind: 'integer', format: 'int64' })
		const optional = ev.fields.find(f => f.name === 'optional')!
		expect(optional.required).toBe(false)
	})
})

const unionYaml = `
components:
  schemas:
    SalesPlatform: { type: string, enum: [EXAMPLE, NUVEM_SHOP] }
    MarketingPlatform: { type: string, enum: [META, GOOGLE_ADS] }
    Platform:
      anyOf:
        - $ref: '#/components/schemas/SalesPlatform'
        - $ref: '#/components/schemas/MarketingPlatform'
      description: A cross-category platform.
    IntegrationEvent:
      type: object
      properties:
        name: { type: string }
      required: [name]
    StoreActivated:
      allOf:
        - $ref: '#/components/schemas/IntegrationEvent'
      properties:
        name: { type: string, enum: ['integration.activated'] }
        platform: { $ref: '#/components/schemas/Platform' }
      required: [platform]
`

describe('parseContractsOpenapi — unions', () => {
	test('collects a oneOf/anyOf-of-$ref component as a union, not an enum or event', () => {
		const { enums, unions, events } = parseContractsOpenapi(unionYaml)
		expect(unions).toEqual([{ name: 'Platform', refs: ['SalesPlatform', 'MarketingPlatform'], doc: 'A cross-category platform.' }])
		expect(enums.map(e => e.name)).not.toContain('Platform')
		expect(events.map(e => e.modelName)).not.toContain('Platform')
	})

	test('remaps an event field that refs a union to union-ref (not enum-ref)', () => {
		const { events } = parseContractsOpenapi(unionYaml)
		const platformField = events[0]!.fields.find(f => f.name === 'platform')!
		expect(platformField.type).toEqual({ kind: 'union-ref', ref: 'Platform' })
	})
})
