import { z } from 'zod'
import type * as core from 'zod/v4/core'

/**
 * Extracts the inferred output type from a Zod schema
 */
export type InferSchemaType<T extends z.ZodTypeAny> = z.output<T>

/**
 * Schema type with .example() method added
 */
export type SchemaWithExample<T extends z.ZodTypeAny> = T & {
	example(examples: z.output<T>[]): SchemaWithExample<T>
}

// Augment Zod v4's ZodType interface to add .example() method
// Must match exact signature: ZodType<Output, Input, Internals>
declare module 'zod' {
	interface ZodType<out Output, out Input, out Internals extends core.$ZodTypeInternals<Output, Input>> {
		/**
		 * Add type-safe examples to the schema metadata
		 * Uses this["_output"] to get the actual output type from the schema instance
		 * @example
		 * ```typescript
		 * const schema = z.object({
		 *   name: z.string(),
		 *   email: z.email(),
		 * }).example([
		 *   { name: 'John', email: 'john@example.com' },
		 * ])
		 * ```
		 */
		example(examples: this['_output'][]): this
	}
}

/**
 * Zod v4 copies methods as own properties on each schema instance — prototype
 * patching doesn't work. This function adds `.example()` directly to a schema
 * instance, and wraps its `.meta()` so any schema produced by `.meta()` also
 * gets `.example()`.
 */
// Methods that return new schema instances and need re-patching
const SCHEMA_METHODS = [
	'meta',
	'optional',
	'nullable',
	'nullish',
	'array',
	'default',
	'prefault',
	'catch',
	'brand',
	'readonly',
	'pipe',
	'transform',
	'refine',
	'check',
	'clone',
	'describe',
	'nonoptional',
	'or',
	'and',
	// Object-composition methods — a derived envelope (ThreadParam.extend({...}), a .pick()/.omit()
	// body) must keep .example(): schema-reuse composition is the house controller shape.
	'extend',
	'pick',
	'omit',
	'partial',
	'required',
	'merge',
	'safeExtend',
]

export function patchExample<T>(schema: T): T {
	const s = schema as any
	if (!s || typeof s !== 'object' || typeof s.meta !== 'function' || s._ep) return schema
	s._ep = true

	// Add .example()
	const origMeta = s.meta
	s.example = function (examples: unknown[]) {
		return patchExample(origMeta.call(this, { examples }))
	}

	// Wrap methods that return new schemas so the result also gets .example()
	for (const method of SCHEMA_METHODS) {
		const orig = s[method]
		if (typeof orig === 'function') {
			s[method] = function (...args: any[]) {
				const result = orig.apply(this, args)
				return result && typeof result === 'object' && typeof result.meta === 'function' ? patchExample(result) : result
			}
		}
	}

	return schema
}

/**
 * Add type-safe examples to a Zod schema (wrapper function alternative)
 *
 * @example
 * ```typescript
 * const SignUpInputSchema = withExamples(
 *   z.object({...}).refine(...),
 *   [{ body: { name: 'John', email: 'john@example.com' } }]
 * )
 * ```
 */
export function withExamples<T extends z.ZodTypeAny>(schema: T, examples: z.output<T>[]): T {
	return schema.meta({ examples }) as T
}
