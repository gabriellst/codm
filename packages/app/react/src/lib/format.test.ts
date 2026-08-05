import { describe, it, expect } from 'bun:test'
import { formatDurationSeconds, formatMoney, formatPercent, sumMoney } from './format'

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

describe('formatDurationSeconds', () => {
	it('keeps small waits in seconds', () => {
		expect(formatDurationSeconds(45, 'pt-BR')).toBe(`45 seg`)
		expect(formatDurationSeconds(45, 'en-US')).toBe(`45 sec`)
	})

	/** The card printed raw seconds, so a half-hour median read "1847s" — a number nobody converts on sight. */
	it('scales past a minute and a half into minutes, and past ninety minutes into hours', () => {
		expect(formatDurationSeconds(1847, 'pt-BR')).toBe(`31 min`)
		expect(formatDurationSeconds(9000, 'pt-BR')).toBe(`3 h`)
	})

	/** Just past the boundary stays in the smaller unit rather than snapping to a lossy "1 min". */
	it('does not round a value to a unit that loses it', () => {
		expect(formatDurationSeconds(75, 'pt-BR')).toBe(`75 seg`)
	})

	it('clamps zero and non-finite to zero', () => {
		expect(formatDurationSeconds(0, 'pt-BR')).toBe(`0 seg`)
		expect(formatDurationSeconds(Number.NaN, 'pt-BR')).toBe(`0 seg`)
	})
})
