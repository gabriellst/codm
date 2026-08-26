import { describe, it, expect } from 'bun:test'
import { z } from './index'

describe('z.integrationEvent', () => {
	it('bakes the event name as a z.literal in the produced schema', () => {
		const schema = z.integrationEvent('integration.example.created', { foo: z.string() })
		const parsed = schema.parse({
			name: 'integration.example.created',
			payload: { foo: 'bar' },
			ownerId: 'tenant-1',
		})
		expect(parsed.name).toBe('integration.example.created')

		expect(() =>
			schema.parse({
				name: 'integration.example.different',
				payload: { foo: 'bar' },
				ownerId: 'tenant-1',
			}),
		).toThrow()
	})

	it('participates in a discriminatedUnion by name', () => {
		const a = z.integrationEvent('integration.a', { value: z.string() })
		const b = z.integrationEvent('integration.b', { value: z.number() })
		const union = z.discriminatedUnion('name', [a, b])

		const parsed = union.parse({
			name: 'integration.a',
			payload: { value: 'hello' },
			ownerId: 't',
		})
		expect(parsed.name).toBe('integration.a')
		expect((parsed.payload as { value: string }).value).toBe('hello')
	})
})
