import { describe, it, expect } from 'bun:test'
import { z } from 'zod'
import { stringToArray } from './Transforms'

describe('stringToArray', () => {
	describe('default element (string)', () => {
		const schema = stringToArray()

		it('normalizes a single param string into a one-element array', () => {
			expect(schema.parse('a')).toEqual(['a'])
		})

		it('preserves repeated params delivered as a string[]', () => {
			expect(schema.parse(['a', 'b'])).toEqual(['a', 'b'])
		})

		it('splits a comma-separated string', () => {
			expect(schema.parse('a,b,c')).toEqual(['a', 'b', 'c'])
		})

		it('trims whitespace and drops empty segments', () => {
			expect(schema.parse(' a , , b ')).toEqual(['a', 'b'])
		})

		it('returns an empty array for an empty string', () => {
			expect(schema.parse('')).toEqual([])
		})

		it('flattens comma-separated values inside a string[]', () => {
			expect(schema.parse(['a,b', 'c'])).toEqual(['a', 'b', 'c'])
		})
	})

	describe('with an element schema', () => {
		const uuid = '123e4567-e89b-12d3-a456-426614174000'
		const schema = stringToArray(z.uuid())

		it('validates each element with the inner schema', () => {
			expect(schema.parse([uuid])).toEqual([uuid])
		})

		it('rejects when any element fails the inner schema', () => {
			expect(schema.safeParse('not-a-uuid').success).toBe(false)
		})

		it('coerces an enum element schema', () => {
			const status = stringToArray(z.enum(['PENDING', 'PAID']))
			expect(status.parse('PENDING,PAID')).toEqual(['PENDING', 'PAID'])
			expect(status.safeParse('UNKNOWN').success).toBe(false)
		})
	})
})
