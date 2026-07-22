import { describe, it, expect } from 'bun:test'
import { formatMoney, formatPercent, sumMoney } from './format'

describe('formatMoney', () => {
	it('formats cents as currency in the given locale', () => {
		expect(formatMoney({ amountCents: 0, currency: 'BRL' }, 'pt-BR')).toBe(`R$ 0,00`)
		expect(formatMoney({ amountCents: 123450, currency: 'BRL' }, 'pt-BR')).toBe(`R$ 1.234,50`)
		expect(formatMoney({ amountCents: 123450, currency: 'USD' }, 'en-US')).toBe(`$1,234.50`)
	})
})

describe('sumMoney', () => {
	it('sums same-currency cents into one Money', () => {
		expect(
			sumMoney([
				{ amountCents: 100, currency: 'BRL' },
				{ amountCents: 250, currency: 'BRL' },
			]),
		).toEqual({ amountCents: 350, currency: 'BRL' })
	})

	it('returns a zero Money for an empty list', () => {
		expect(sumMoney([])).toEqual({ amountCents: 0, currency: 'BRL' })
	})
})

describe('formatPercent', () => {
	it('formats a ratio with one decimal, pt-BR comma', () => {
		expect(formatPercent(1)).toBe(`100,0%`)
		expect(formatPercent(0.75)).toBe(`75,0%`)
		expect(formatPercent(0.1)).toBe(`10,0%`)
	})

	it('clamps non-finite to zero', () => {
		expect(formatPercent(0)).toBe(`0,0%`)
		expect(formatPercent(Number.NaN)).toBe(`0,0%`)
	})
})
