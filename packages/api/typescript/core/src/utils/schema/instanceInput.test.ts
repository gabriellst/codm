/**
 * Tests for z.instance(...).input() recovery.
 *
 * Requirement:
 *   z.object({ id: z.instance(Id) }).input()
 *   should produce a schema that validates the `id` field like IdSchema
 *   (rejects invalid ids, accepts valid ones) — NOT z.unknown().
 *
 * Constraint (do NOT change):
 *   The original z.instance(Id) (not .input()) must still:
 *   - Accept a raw id string and construct an Id instance (idempotent passthrough)
 *   - Accept an already-constructed Id instance
 *   - Throw a BaseError with the SAME code on invalid raw input (not a ZodError)
 */
import { describe, it, expect } from 'bun:test'
import './InputSchema' // register .input() prototype extension
import { Id } from '../../objects/Id'
import { BaseValueObject } from '../../objects/BaseValueObject'
import { BaseError } from '../../types/BaseError'
import { z } from './index'
import Z from 'zod'

// A valid UUIDv7 we can reuse
const VALID_UUID = '01932db0-fc3e-7a1e-b234-1234567890ab'

// Inline composite VO for test isolation (avoids importing from src/)
const MoneySchema = Z.object({
	amountCents: Z.number().int().nonnegative(),
	currency: Z.enum(['USD', 'BRL']),
})

class Money extends BaseValueObject<typeof MoneySchema> {
	static override schema = MoneySchema
	declare amountCents: number
	declare currency: 'USD' | 'BRL'
}
interface Money extends Z.infer<typeof MoneySchema> {}

describe('z.instance(...).input() — schema recovery', () => {
	describe('primitive VO: z.instance(Id)', () => {
		const Schema = z.object({ id: z.instance(Id) })

		it('(1a) .input() accepts a valid raw id string', () => {
			const InputSchema = Schema.input()
			const result = InputSchema.safeParse({ id: VALID_UUID })
			expect(result.success).toBe(true)
		})

		it('(1b) .input() rejects an empty string (like IdSchema would)', () => {
			const InputSchema = Schema.input()
			const result = InputSchema.safeParse({ id: '' })
			expect(result.success).toBe(false)
		})

		it('(1c) .input() result is NOT z.unknown() (it validates)', () => {
			const InputSchema = Schema.input()
			// z.unknown() accepts anything — if this passes, the fix is missing
			const result = InputSchema.safeParse({ id: '' })
			// With z.unknown() this would succeed; with IdSchema it must fail
			expect(result.success).toBe(false)
		})
	})

	describe('original z.instance(Id) (no .input()) — semantics must be preserved', () => {
		it('(2a) accepts a raw valid id string and returns an Id instance', () => {
			const Schema = z.object({ id: z.instance(Id) })
			const result = Schema.parse({ id: VALID_UUID })
			expect(result.id).toBeInstanceOf(Id)
			expect(result.id.value).toBe(VALID_UUID)
		})

		it('(2b) accepts an already-constructed Id instance (idempotent)', () => {
			const Schema = z.object({ id: z.instance(Id) })
			const existing = new Id(VALID_UUID)
			const result = Schema.parse({ id: existing })
			expect(result.id).toBe(existing) // same reference
		})

		it('(2c) throws a BaseError (not ZodError) with INVALID_ID code on invalid raw input', () => {
			const Schema = z.object({ id: z.instance(Id) })
			let thrown: unknown
			try {
				Schema.parse({ id: '' })
			} catch (e) {
				thrown = e
			}
			expect(thrown).toBeInstanceOf(BaseError)
			expect((thrown as BaseError<any>).name).toBe('INVALID_ID')
		})
	})

	describe('composite VO: z.instance(Money)', () => {
		const Schema = z.object({ price: z.instance(Money) })

		it('(3a) .input() accepts a valid Money props object', () => {
			const InputSchema = Schema.input()
			const result = InputSchema.safeParse({ price: { amountCents: 100, currency: 'BRL' } })
			expect(result.success).toBe(true)
		})

		it('(3b) .input() rejects an object with wrong shape', () => {
			const InputSchema = Schema.input()
			// Missing required fields — z.unknown() would accept this, MoneySchema would not
			const result = InputSchema.safeParse({ price: { notAField: true } })
			expect(result.success).toBe(false)
		})
	})
})
