import { describe, it, expect } from 'bun:test'
import { z } from 'zod'
import { extractObjectInputSchema } from './InputSchema' // importing also registers the .input() prototype extension

describe('.input() prototype extension', () => {
	describe('on a plain ZodObject (no transforms)', () => {
		const Schema = z.object({
			name: z.string(),
			age: z.number(),
		})

		it('returns a ZodObject that parses the same input', () => {
			const InputSchema = Schema.input()
			const result = InputSchema.safeParse({ name: 'Alice', age: 30 })
			expect(result.success).toBe(true)
			expect(result.data).toEqual({ name: 'Alice', age: 30 })
		})

		it('still rejects invalid input', () => {
			const InputSchema = Schema.input()
			const result = InputSchema.safeParse({ name: 123, age: 'not-a-number' })
			expect(result.success).toBe(false)
		})
	})

	describe('on a ZodObject with .transform() fields', () => {
		const Schema = z.object({
			email: z.string().transform(v => v.toLowerCase()),
			count: z.string().transform(v => Number(v)),
		})

		it('strips the transform — output type becomes the input type (string)', () => {
			const InputSchema = Schema.input()
			const result = InputSchema.safeParse({ email: 'USER@EXAMPLE.COM', count: '42' })
			expect(result.success).toBe(true)
			// Without the transform the values come through as raw strings
			expect(result.data).toEqual({ email: 'USER@EXAMPLE.COM', count: '42' })
		})

		it('still validates the input-side type', () => {
			const InputSchema = Schema.input()
			const result = InputSchema.safeParse({ email: 123, count: true })
			expect(result.success).toBe(false)
		})
	})

	describe('on a ZodObject with .pipe() fields', () => {
		const Schema = z.object({
			ids: z
				.string()
				.transform(v => v.split(','))
				.pipe(z.array(z.string())),
			date: z.string().pipe(z.coerce.date()),
		})

		it('strips the pipe — fields accept the original input type (string)', () => {
			const InputSchema = Schema.input()
			const result = InputSchema.safeParse({ ids: 'a,b,c', date: '2024-01-01' })
			expect(result.success).toBe(true)
			expect(result.data).toEqual({ ids: 'a,b,c', date: '2024-01-01' })
		})
	})

	describe('on a nested ZodObject', () => {
		const AddressSchema = z.object({
			street: z.string().transform(v => v.trim()),
			zipCode: z.string().transform(v => v.replace('-', '')),
		})

		const PersonSchema = z.object({
			name: z.string(),
			address: AddressSchema.input(),
		})

		it('accepts raw string values for transformed nested fields', () => {
			const result = PersonSchema.safeParse({
				name: 'Alice',
				address: { street: '  Main St  ', zipCode: '12345-678' },
			})
			expect(result.success).toBe(true)
			expect(result.data).toEqual({
				name: 'Alice',
				address: { street: '  Main St  ', zipCode: '12345-678' },
			})
		})
	})

	describe('on a non-object schema (rejected)', () => {
		// `.input()` no longer type-checks on non-object schemas — the augmentation
		// covers ZodObject only (schema bp-07). Untyped/dynamic callers reach the
		// prototype method, whose body (extractObjectInputSchema) must fail fast.
		it('throws for ZodString instead of silently no-opping', () => {
			expect(() => extractObjectInputSchema(z.string())).toThrow(
				'.input() is only valid on z.object()/composite VO schemas — reference primitive VO schemas directly (schema bp-07)',
			)
		})

		it('throws for ZodNumber instead of silently no-opping', () => {
			expect(() => extractObjectInputSchema(z.number())).toThrow('schema bp-07')
		})

		it('still extracts for a ZodObject through the same runtime body', () => {
			const schema = z.object({ count: z.string().transform(v => Number(v)) })
			const result = extractObjectInputSchema(schema).safeParse({ count: '42' })
			expect(result.success).toBe(true)
		})
	})
})
