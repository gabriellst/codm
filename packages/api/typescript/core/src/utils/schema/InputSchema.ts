import { z } from 'zod'
import type * as core from 'zod/v4/core'
import type { ZodInstance } from './ExtraTypes'
import { extractInputSchema } from './Transforms'

// Re-export ZodInstance for external consumers who want to use the brand check type.
export type { ZodInstance }

/**
 * Recursively maps a single field type to its wire-input equivalent.
 */
type InputField<F> = F extends { readonly _voSchema?: infer S extends z.ZodTypeAny }
	? InputField<S>
	: F extends z.ZodArray<infer E extends z.ZodTypeAny>
		? z.ZodArray<InputField<E>>
		: F extends z.ZodOptional<infer I extends z.ZodTypeAny>
			? z.ZodOptional<InputField<I>>
			: F extends z.ZodNullable<infer I extends z.ZodTypeAny>
				? z.ZodNullable<InputField<I>>
				: F extends z.ZodDefault<infer I extends z.ZodTypeAny>
					? z.ZodOptional<InputField<I>>
					: F extends z.ZodPipe<infer In extends z.ZodTypeAny, any>
						? InputField<In>
						: F extends z.ZodObject<infer Sh extends core.$ZodShape>
							? z.ZodObject<{ [K in keyof Sh]: InputField<Sh[K]> }>
							: F

/** Applies InputField to every key of a ZodObject shape. */
type InputShape<Shape extends core.$ZodShape> = {
	[K in keyof Shape]: InputField<Shape[K]>
}

// Augment Zod v4's ZodObject interface to add .input() — object schemas ONLY.
// .input() deliberately does NOT exist on other schema types: calling it on a
// primitive VO schema is a compile error (schema bp-07 — reference the schema directly).
declare module 'zod' {
	// @ts-expect-error — variance on Shape is covariant in practice (we only read from it)
	interface ZodObject<out Shape extends core.$ZodShape, out Config extends core.$ZodObjectConfig> {
		input(): z.ZodObject<InputShape<Shape>>
	}
}

/**
 * Runtime body of `.input()`. Exported so tests can exercise the non-object
 * guard — the type system no longer lets `.input()` be spelled on non-objects,
 * but untyped/dynamic callers still hit the prototype method below.
 */
export function extractObjectInputSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
	if (schema._zod.def.type !== 'object') {
		throw new Error('.input() is only valid on z.object()/composite VO schemas — reference primitive VO schemas directly (schema bp-07)')
	}
	return extractInputSchema(schema as z.ZodObject)
}
// Add the .input() method to Zod's prototype at runtime. ZodObject instances
// inherit it from the shared ZodType prototype; the guard above fail-fasts the
// non-object case the type system already rejects.
// biome-ignore lint/suspicious/noExplicitAny: Required for prototype extension
;(z.ZodType.prototype as any).input = function () {
	return extractObjectInputSchema(this)
}
