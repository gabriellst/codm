import { describe, it, expect } from 'bun:test'
import { z } from './index'

describe('z.historical', () => {
	it('adds a window to a raw shape and defaults endDate to null', () => {
		const schema = z.historical({ rate: z.number() })
		const parsed = schema.parse({ rate: 0.1, startDate: new Date('2026-01-01') })
		expect(parsed.endDate).toBeNull()
		expect(parsed.startDate).toBeInstanceOf(Date)
	})

	it('coerces ISO-string dates (jsonb round-trip)', () => {
		const schema = z.historical({ rate: z.number() })
		const parsed = schema.parse({ rate: 0.1, startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-02-01T00:00:00.000Z' })
		expect(parsed.startDate).toBeInstanceOf(Date)
		expect(parsed.endDate).toBeInstanceOf(Date)
	})

	it('rejects startDate >= endDate with INVALID_DATE_RANGE', () => {
		const schema = z.historical({ rate: z.number() })
		const r = schema.safeParse({ rate: 0.1, startDate: new Date('2026-02-01'), endDate: new Date('2026-01-01') })
		expect(r.success).toBe(false)
		if (!r.success) expect(r.error.issues[0]!.message).toBe('INVALID_DATE_RANGE')
	})

	it('applies the window per-variant on a discriminated union and stays narrowable', () => {
		const schema = z.historical(
			z.discriminatedUnion('mode', [z.object({ mode: z.literal('NONE') }), z.object({ mode: z.literal('FLAT'), value: z.number() })]),
		)
		const flat = schema.parse({ mode: 'FLAT', value: 5, startDate: new Date('2026-01-01') })
		expect(flat.mode).toBe('FLAT')
		expect(flat.endDate).toBeNull()
		const none = schema.parse({ mode: 'NONE', startDate: new Date('2026-01-01') })
		expect(none.mode).toBe('NONE')
	})
})
