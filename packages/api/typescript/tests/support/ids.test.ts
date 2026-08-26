import { describe, expect, it } from 'bun:test'
import { testId } from './ids'

describe('testId', () => {
	it('is deterministic for the same segments', () => {
		expect(testId('store', 'a')).toBe(testId('store', 'a'))
	})

	it('differs for different segments', () => {
		expect(testId('store', 'a')).not.toBe(testId('store', 'b'))
	})

	it('returns a random UUID when called with no segments', () => {
		expect(testId()).not.toBe(testId())
	})

	it('produces a canonical UUID string', () => {
		expect(testId('order', '1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
	})
})
