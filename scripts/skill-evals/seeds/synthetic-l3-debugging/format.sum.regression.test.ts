/**
 * HIDDEN regression test for the sumMoney totals bug (synthetic-l3-debugging probe).
 *
 * Seeded into the tree as packages/app/react/src/lib/format.sum.regression.test.ts BEFORE the
 * agent runs. It encodes the contract sumMoney must honor: the returned total is the exact sum
 * of every line's cents — never double-counting the first line. RED against the seeded bug
 * (which seeds the reduce accumulator with items[0].amountCents); GREEN once the cause is fixed
 * in src/lib/format.ts. The agent must NOT edit or delete this file.
 */
import { describe, it, expect } from 'bun:test'
import { formatMoney, formatPercent, sumMoney } from './format'

describe('sumMoney — exact totals (regression)', () => {
	it('sums two lines to their exact total (no first-line double-count)', () => {
		expect(
			sumMoney([
				{ amountCents: 100, currency: 'BRL' },
				{ amountCents: 250, currency: 'BRL' },
			]),
		).toEqual({ amountCents: 350, currency: 'BRL' })
	})

	it('returns a single line unchanged', () => {
		expect(sumMoney([{ amountCents: 4200, currency: 'BRL' }])).toEqual({ amountCents: 4200, currency: 'BRL' })
	})

	it('sums many lines to their exact total', () => {
		const lines = [199, 199, 199, 1, 5000].map(amountCents => ({ amountCents, currency: 'USD' as const }))
		expect(sumMoney(lines)).toEqual({ amountCents: 5598, currency: 'USD' })
	})

	it('carries the shared currency of the lines, not a hardcoded default', () => {
		expect(
			sumMoney([
				{ amountCents: 10, currency: 'USD' },
				{ amountCents: 20, currency: 'USD' },
			]).currency,
		).toBe('USD')
	})

	it('returns a zero BRL Money for an empty list', () => {
		expect(sumMoney([])).toEqual({ amountCents: 0, currency: 'BRL' })
	})

	it('the formatted total of a multi-line cart reads correctly', () => {
		const total = sumMoney([
			{ amountCents: 123450, currency: 'BRL' },
			{ amountCents: 50, currency: 'BRL' },
		])
		// pt-BR currency uses a NON-BREAKING space (U+00A0) between symbol and digits.
		expect(formatMoney(total, 'pt-BR')).toBe('R$ 1.235,00')
	})
})

describe('sibling formatters still behave (regression guard against an over-broad rewrite)', () => {
	it('formatMoney is unchanged', () => {
		expect(formatMoney({ amountCents: 123450, currency: 'BRL' }, 'pt-BR')).toBe('R$ 1.234,50')
		expect(formatMoney({ amountCents: 123450, currency: 'USD' }, 'en-US')).toBe('$1,234.50')
	})

	it('formatPercent is unchanged', () => {
		expect(formatPercent(0.75)).toBe('75,0%')
		expect(formatPercent(Number.NaN)).toBe('0,0%')
	})
})
