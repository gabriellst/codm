/**
 * Tests for deep .input() recursion — arrays, nested objects, composite VOs.
 *
 * Requirements verified here:
 *   1. z.array(z.instance(Id)).min(1) → after .input(), validates string[] with
 *      min(1) enforced (reject [], reject element failing IdSchema, accept valid).
 *   2. A nested ZodObject field recurses: inner instance fields are unwrapped.
 *   3. A composite VO containing nested instances unwraps fully.
 *   4. Top-level instance + plain fields — unchanged (baseline regression).
 *   5. Instance-passthrough (already-constructed instance input) + BaseError
 *      semantics still intact on the original schema (not .input()).
 */
import { describe, it, expect } from 'bun:test'
import './InputSchema' // register .input() prototype extension
import { Id } from '../../objects/Id'
import { BaseValueObject } from '../../objects/BaseValueObject'
import { BaseError } from '../../types/BaseError'
import { z } from './index'
import Z from 'zod'

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_UUID = '01932db0-fc3e-7a1e-b234-1234567890ab'
const VALID_UUID2 = '01932db0-fc3e-7a1e-b234-1234567890ac'

// Inline MonetaryAmount-style composite VO
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

// Inline composite VO that CONTAINS an instance of another VO (nested)
const LineSchema = Z.object({
	lineId: Z.string().min(1),
	cost: z.instance(Money),
})
class Line extends BaseValueObject<typeof LineSchema> {
	static override schema = LineSchema
	declare lineId: string
	declare cost: Money
}
interface Line extends Z.infer<typeof LineSchema> {}

// ── 1. Array of instances with min(1) ─────────────────────────────────────────

describe('deep .input() — array of z.instance', () => {
	const Schema = z.object({
		ids: z.array(z.instance(Id)).min(1),
	})

	it('(A1) .input() accepts a valid string array', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({ ids: [VALID_UUID] })
		expect(result.success).toBe(true)
	})

	it('(A2) .input() rejects an empty array — min(1) is preserved', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({ ids: [] })
		expect(result.success).toBe(false)
	})

	it('(A3) .input() rejects an element that fails IdSchema (empty string)', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({ ids: [''] })
		expect(result.success).toBe(false)
	})

	it('(A4) .input() accepts multiple valid IDs', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({ ids: [VALID_UUID, VALID_UUID2] })
		expect(result.success).toBe(true)
	})

	it('(A5) .input() — result type is string[], not Id[]', () => {
		const InputSchema = Schema.input()
		// The value must parse without being transformed to Id instances
		const result = InputSchema.safeParse({ ids: [VALID_UUID] })
		expect(result.success).toBe(true)
		if (result.success) {
			// Should be plain strings, not Id instances
			expect(typeof result.data.ids[0]).toBe('string')
			expect(result.data.ids[0]).toBe(VALID_UUID)
		}
	})

	it('(A6) max() is also preserved when set', () => {
		const BoundedSchema = z.object({ ids: z.array(z.instance(Id)).min(1).max(2) })
		const InputSchema = BoundedSchema.input()
		const three = [VALID_UUID, VALID_UUID2, '01932db0-fc3e-7a1e-b234-1234567890ad']
		const result = InputSchema.safeParse({ ids: three })
		expect(result.success).toBe(false)
	})

	it('(A7) length() is preserved when set', () => {
		const ExactSchema = z.object({ ids: z.array(z.instance(Id)).length(2) })
		const InputSchema = ExactSchema.input()
		const oneItem = [VALID_UUID]
		const result = InputSchema.safeParse({ ids: oneItem })
		expect(result.success).toBe(false)
	})
})

// ── 2. Nested ZodObject recursion ─────────────────────────────────────────────

describe('deep .input() — nested object field', () => {
	const Schema = z.object({
		outer: z.object({
			innerId: z.instance(Id),
			count: z.number(),
		}),
	})

	it('(B1) .input() accepts a valid nested object with string id', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({ outer: { innerId: VALID_UUID, count: 5 } })
		expect(result.success).toBe(true)
	})

	it('(B2) .input() rejects an invalid innerId in the nested object', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({ outer: { innerId: '', count: 5 } })
		expect(result.success).toBe(false)
	})

	it('(B3) nested field is not transformed to an instance', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({ outer: { innerId: VALID_UUID, count: 5 } })
		expect(result.success).toBe(true)
		if (result.success) {
			expect(typeof result.data.outer.innerId).toBe('string')
		}
	})
})

// ── 3. Composite VO with nested instances ─────────────────────────────────────

describe('deep .input() — composite VO containing nested instances', () => {
	// Line has { lineId: string, cost: Money } where cost is z.instance(Money)
	const Schema = z.object({
		line: z.instance(Line),
	})

	it('(C1) .input() accepts a plain Line-shaped object', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({
			line: { lineId: 'abc', cost: { amountCents: 100, currency: 'BRL' } },
		})
		expect(result.success).toBe(true)
	})

	it('(C2) .input() rejects a plain Line with invalid cost (wrong currency)', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({
			line: { lineId: 'abc', cost: { amountCents: 100, currency: 'INVALID' } },
		})
		expect(result.success).toBe(false)
	})

	it('(C3) .input() rejects a missing cost field', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({ line: { lineId: 'abc' } })
		expect(result.success).toBe(false)
	})
})

// ── 4. Array of composite VOs with min constraint ─────────────────────────────

describe('deep .input() — array of composite VO instances with min(1)', () => {
	const Schema = z.object({
		lines: z.array(z.instance(Line)).min(1),
	})

	it('(D1) .input() rejects empty array — min(1) preserved', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({ lines: [] })
		expect(result.success).toBe(false)
	})

	it('(D2) .input() accepts valid line array', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({
			lines: [{ lineId: 'x', cost: { amountCents: 50, currency: 'USD' } }],
		})
		expect(result.success).toBe(true)
	})

	it('(D3) .input() rejects array with invalid cost inside', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({
			lines: [{ lineId: 'x', cost: { amountCents: -1, currency: 'USD' } }],
		})
		expect(result.success).toBe(false)
	})
})

// ── 5. Regression — top-level instance + plain fields unchanged ───────────────

describe('deep .input() — regression: top-level fields still work', () => {
	const Schema = z.object({
		id: z.instance(Id),
		name: z.string(),
		count: z.number().optional(),
	})

	it('(E1) .input() accepts valid top-level id + plain fields', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({ id: VALID_UUID, name: 'foo' })
		expect(result.success).toBe(true)
	})

	it('(E2) .input() rejects empty top-level id', () => {
		const InputSchema = Schema.input()
		const result = InputSchema.safeParse({ id: '', name: 'foo' })
		expect(result.success).toBe(false)
	})
})

// ── 6. BaseError semantics preserved on original schema (not .input()) ────────

describe('original z.instance() — BaseError semantics preserved after deepening', () => {
	it('(F1) z.instance(Id) still throws BaseError with INVALID_ID on invalid input', () => {
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

	it('(F2) z.instance(Id) accepts an already-constructed Id (idempotent passthrough)', () => {
		const Schema = z.object({ id: z.instance(Id) })
		const existing = new Id(VALID_UUID)
		const result = Schema.parse({ id: existing })
		expect(result.id).toBe(existing)
	})

	it('(F3) z.array(z.instance(Id)).min(1) still throws on empty input (original schema)', () => {
		const Schema = z.object({ ids: z.array(z.instance(Id)).min(1) })
		const result = Schema.safeParse({ ids: [] })
		expect(result.success).toBe(false)
	})
})

// ── 7. Type-level assertions (compile-time only) ─────────────────────────────
//
// These assignments verify at the type level that `.input()` returns a properly
// typed ZodObject (with .omit()/.pick() etc.) and that z.infer of the result
// gives the clean wire shape. They are executed in the test runner so bun
// reports them; the real contract is that tsc must accept them without error.

describe('type-level: .input() returns correctly typed ZodObject', () => {
	it('(G1) z.object({ id: z.instance(Id) }).input() infers { id: string }', () => {
		const schema = z.object({ id: z.instance(Id) })
		const inputSchema = schema.input()
		// compile-time: z.infer of input() result must be { id: string }
		const _check: Z.infer<typeof inputSchema> = { id: VALID_UUID }
		expect(_check.id).toBe(VALID_UUID)
	})

	it('(G2) z.object({ ids: z.array(z.instance(Id)) }).input() infers { ids: string[] }', () => {
		const schema = z.object({ ids: z.array(z.instance(Id)) })
		const inputSchema = schema.input()
		const _check: Z.infer<typeof inputSchema> = { ids: [VALID_UUID] }
		expect(_check.ids[0]).toBe(VALID_UUID)
	})

	it('(G3) z.object({ m: z.instance(Money) }).input() infers { m: { amountCents: number; currency: string } }', () => {
		const schema = z.object({ m: z.instance(Money) })
		const inputSchema = schema.input()
		// compile-time: m must be a plain object, not Money instance
		const _check: Z.infer<typeof inputSchema> = { m: { amountCents: 100, currency: 'BRL' as const } }
		expect(_check.m.amountCents).toBe(100)
	})

	it('(G4) .input().omit() chains without casts and preserves remaining fields', () => {
		const schema = z.object({ id: z.instance(Id), name: z.string(), cost: z.instance(Money) })
		const omitted = schema.input().omit({ id: true })
		// compile-time: result must have { name: string; cost: { amountCents; currency } }
		const _check: Z.infer<typeof omitted> = {
			name: 'foo',
			cost: { amountCents: 50, currency: 'USD' as const },
		}
		expect(_check.name).toBe('foo')
	})

	it('(G5) .input() on composite VO (Line with nested Money) infers { lineId: string; cost: { amountCents; currency } }', () => {
		const schema = z.object({ line: z.instance(Line) })
		const inputSchema = schema.input()
		// compile-time: line must be the unwrapped shape, not a Line instance
		const _check: Z.infer<typeof inputSchema> = {
			line: { lineId: 'x', cost: { amountCents: 200, currency: 'USD' as const } },
		}
		expect(_check.line.lineId).toBe('x')
	})
})
