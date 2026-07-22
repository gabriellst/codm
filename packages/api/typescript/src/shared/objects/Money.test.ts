import { describe, expect, it } from 'bun:test'
import { CurrencyCode } from '@codedm/contracts-typescript/wire/enums'
import { Money, MoneySchema } from './Money'

describe('Money', () => {
	describe('schema validation', () => {
		it('accepts a zero amount (refunds/zero are valid)', () => {
			const m = MoneySchema.parse({ amountCents: 0, currency: CurrencyCode.USD })
			expect(m.amountCents).toBe(0)
			expect(m.currency).toBe(CurrencyCode.USD)
		})

		it('accepts a positive amount', () => {
			const m = MoneySchema.parse({ amountCents: 12_500, currency: CurrencyCode.BRL })
			expect(m.amountCents).toBe(12_500)
		})

		it('rejects negative amountCents', () => {
			expect(() => MoneySchema.parse({ amountCents: -1, currency: CurrencyCode.USD })).toThrow()
		})

		it('rejects negative amountCents (previously allowed in sales readmodel — now enforced globally)', () => {
			expect(() => MoneySchema.parse({ amountCents: -500, currency: CurrencyCode.BRL })).toThrow()
		})

		it('rejects non-integer amountCents', () => {
			expect(() => MoneySchema.parse({ amountCents: 12.5, currency: CurrencyCode.USD })).toThrow()
		})

		it('rejects unknown currency', () => {
			expect(() => MoneySchema.parse({ amountCents: 100, currency: 'XYZ' })).toThrow()
		})
	})

	describe('VO construction', () => {
		it('constructs via new Money()', () => {
			const vo = new Money({ amountCents: 500, currency: CurrencyCode.USD })
			expect(vo.amountCents).toBe(500)
			expect(vo.currency).toBe(CurrencyCode.USD)
		})

		it('throws on invalid input', () => {
			expect(() => new Money({ amountCents: -1, currency: CurrencyCode.USD })).toThrow()
		})

		it('toJSON returns plain object', () => {
			const vo = new Money({ amountCents: 1000, currency: CurrencyCode.USD })
			const json = vo.toJSON()
			expect(json).toEqual({ amountCents: 1000, currency: CurrencyCode.USD })
		})

		it('equals: same values → true', () => {
			const a = new Money({ amountCents: 100, currency: CurrencyCode.USD })
			const b = new Money({ amountCents: 100, currency: CurrencyCode.USD })
			expect(a.equals(b)).toBe(true)
		})

		it('equals: different amountCents → false', () => {
			const a = new Money({ amountCents: 100, currency: CurrencyCode.USD })
			const b = new Money({ amountCents: 200, currency: CurrencyCode.USD })
			expect(a.equals(b)).toBe(false)
		})

		it('equals: different currency → false', () => {
			const a = new Money({ amountCents: 100, currency: CurrencyCode.USD })
			const b = new Money({ amountCents: 100, currency: CurrencyCode.BRL })
			expect(a.equals(b)).toBe(false)
		})
	})
})
