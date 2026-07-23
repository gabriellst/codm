import { testId } from '@test/support'
import { describe, it, expect } from 'bun:test'
import { parseTier, sessionBadge, supportsColor, colorize, LOG_TIER_RANK } from './format'

describe('format', () => {
	describe('parseTier', () => {
		it('returns the tier when valid', () => {
			expect(parseTier('quiet')).toEqual({ tier: 'quiet', warning: null })
			expect(parseTier('info')).toEqual({ tier: 'info', warning: null })
			expect(parseTier('verbose')).toEqual({ tier: 'verbose', warning: null })
			expect(parseTier('trace')).toEqual({ tier: 'trace', warning: null })
		})

		it('falls back to info with a warning for invalid input', () => {
			const result = parseTier('debug')
			expect(result.tier).toBe('info')
			expect(result.warning).toContain('debug')
			expect(result.warning).toContain('info')
		})

		it('falls back to info silently when input is undefined', () => {
			expect(parseTier(undefined)).toEqual({ tier: 'info', warning: null })
		})
	})

	describe('LOG_TIER_RANK', () => {
		it('orders tiers from quiet to trace', () => {
			expect(LOG_TIER_RANK.quiet).toBeLessThan(LOG_TIER_RANK.info)
			expect(LOG_TIER_RANK.info).toBeLessThan(LOG_TIER_RANK.verbose)
			expect(LOG_TIER_RANK.verbose).toBeLessThan(LOG_TIER_RANK.trace)
		})
	})

	describe('sessionBadge', () => {
		it('produces a 5-char #xxxx badge from the issueId (Fork B)', () => {
			const badge = sessionBadge(testId('runner-logger', 'session'))
			expect(badge).toMatch(/^#[0-9a-f]{4}$/)
		})

		it('is stable across calls for the same issue', () => {
			expect(sessionBadge('issue-1')).toBe(sessionBadge('issue-1'))
		})

		it('differs for different issues', () => {
			expect(sessionBadge('issue-1')).not.toBe(sessionBadge('issue-2'))
		})
	})

	describe('supportsColor', () => {
		it('returns false when isTTY is false', () => {
			expect(supportsColor({ isTTY: false, noColor: false })).toBe(false)
		})

		it('returns false when NO_COLOR is set even if TTY', () => {
			expect(supportsColor({ isTTY: true, noColor: true })).toBe(false)
		})

		it('returns true when TTY and no NO_COLOR', () => {
			expect(supportsColor({ isTTY: true, noColor: false })).toBe(true)
		})
	})

	describe('colorize', () => {
		it('wraps with ANSI when enabled', () => {
			expect(colorize('hello', 'red', true)).toBe('\x1b[31mhello\x1b[0m')
		})

		it('returns plain text when disabled', () => {
			expect(colorize('hello', 'red', false)).toBe('hello')
		})
	})
})
