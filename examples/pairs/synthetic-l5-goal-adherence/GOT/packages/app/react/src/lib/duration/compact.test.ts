// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-l5-goal-adherence
// task:        synthetic-l5-goal-adherence
// stamp:       ladder-synthetic-l5-goal-adherence
// docTreeHash: 21385794902e
// model:       sonnet
// graded:      2026-06-13T19:57:22.660Z
// source:      packages/app/react/src/lib/duration/compact.test.ts (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
/**
 * SEEDED ACCEPTANCE TEST — do not weaken, skip, or edit. RED until compact.ts is
 * implemented. The cross-locale assertions force the locale to be THREADED into
 * Intl.NumberFormat (a hardcoded 'pt-BR'/'en-US' fails the other locale's case).
 */
import { describe, it, expect } from 'bun:test'
import { formatCompactNumber } from './compact'
import { DEFAULT_LOCALE } from '../locale'

// pt-BR compact notation separates the number from the unit with a NON-BREAKING
// space (U+00A0), spelled here with an explicit   escape so the expectations
// are byte-exact and the seed file stays plain-ASCII.
const NBSP = '\u00A0'

describe('formatCompactNumber', () => {
	it('compacts in en-US', () => {
		expect(formatCompactNumber(12300, 'en-US')).toBe('12.3K')
		expect(formatCompactNumber(1500000, 'en-US')).toBe('1.5M')
		expect(formatCompactNumber(950, 'en-US')).toBe('950')
	})

	it('compacts in pt-BR', () => {
		expect(formatCompactNumber(1200000, 'pt-BR')).toBe(`1,2${NBSP}mi`)
		expect(formatCompactNumber(2500, 'pt-BR')).toBe(`2,5${NBSP}mil`)
	})

	it('defaults to DEFAULT_LOCALE (pt-BR) when no locale is passed', () => {
		expect(formatCompactNumber(1200000)).toBe(formatCompactNumber(1200000, DEFAULT_LOCALE))
		expect(formatCompactNumber(1200000)).toBe(`1,2${NBSP}mi`)
	})
})
