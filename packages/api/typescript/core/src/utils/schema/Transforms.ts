import { z } from 'zod'
import { BaseError } from '../../types/BaseError'
import type { BaseInterfaceErrors } from '../../errors/codes'
import { instanceInputSchemaMap } from './InstanceRegistry'

/**
 * StringToNumber - Coerces a string to a number
 * Uses Zod's coerce which applies Number() to the input
 */
export const stringToNumber = (options?: { minimum?: number; maximum?: number }) => {
	let schema = z.coerce.number()
	if (options?.minimum !== undefined) schema = schema.min(options.minimum)
	if (options?.maximum !== undefined) schema = schema.max(options.maximum)
	return schema
}

/**
 * StringToInteger - Coerces a string to an integer
 * Uses Zod's coerce with .int() validation
 */
export const stringToInteger = (options?: { minimum?: number; maximum?: number }) => {
	let schema = z.coerce.number().int()
	if (options?.minimum !== undefined) schema = schema.min(options.minimum)
	if (options?.maximum !== undefined) schema = schema.max(options.maximum)
	return schema
}

/**
 * StringToBoolean - Coerces common string values to boolean
 * Uses Zod v4's stringbool() which handles 'true', '1', 'yes', 'on', etc.
 */
export const stringToBoolean = () => {
	return z.stringbool()
}

/**
 * StringToDate - Transforms an ISO date string to a Date object.
 * Validates input as ISO date (documented in OpenAPI as z.iso.date())
 * then pipes to z.date() for Date object output.
 */
export const stringToDate = () => {
	return z.union([z.iso.date(), z.iso.datetime()]).transform(v => new Date(v))
}

/**
 * StringToArray - Normalizes a query-string array filter into a typed array.
 *
 * Accepts the three shapes a query param can arrive in and validates each
 * element with `element` (defaults to `z.string()`):
 * - repeated params  `?id=a&id=b` → Fastify delivers `['a','b']`
 * - single param     `?id=a`      → delivers `'a'` → `['a']`
 * - comma-separated  `?id=a,b`    → `'a,b'` → `['a','b']`
 *
 * @example z.stringToArray(z.uuid()) // 'a' -> ['a'], ['a','b'] -> ['a','b']
 */
export const stringToArray = <T extends z.ZodTypeAny = z.ZodString>(element?: T, options?: { min?: number; max?: number }) => {
	const inner = (element ?? z.string()) as T
	let array = z.array(inner)
	if (options?.min !== undefined) array = array.min(options.min)
	if (options?.max !== undefined) array = array.max(options.max)
	return z
		.union([z.string(), z.array(z.string())])
		.transform(
			value =>
				(Array.isArray(value) ? value : [value])
					.flatMap(item => item.split(','))
					.map(item => item.trim())
					.filter(item => item.length > 0) as z.input<typeof array>,
		)
		.pipe(array)
}

/**
 * StringToNumberArray - Transforms a comma-separated string into an array of numbers
 */
export const stringToNumberArray = () => {
	return z
		.string()
		.transform(value => {
			if (!value || value.trim() === '') return []
			return value.split(',').map(item => {
				const num = Number(item.trim())
				if (Number.isNaN(num)) {
					throw new BaseError<BaseInterfaceErrors>('CANNOT_CONVERT_INPUT', `Cannot convert "${item}" to number`)
				}
				return num
			})
		})
		.pipe(z.array(z.number()))
}

/**
 * Dispatches a resolved (non-instance, non-wrapper) schema to deeper recursion
 * if it is a ZodObject or ZodArray — otherwise returns it as-is.
 *
 * Called AFTER instance-registry and wrapper (pipe/default/optional/nullable)
 * unwrapping so the input here is always the "real" schema, never a
 * transform or wrapper shell.
 */
function deepen(schema: z.ZodTypeAny): z.ZodTypeAny {
	if (schema._zod.def.type === 'object') {
		return extractInputSchema(schema as z.ZodObject<any>)
	}
	if (schema._zod.def.type === 'array') {
		return unwrapArray(schema)
	}
	return schema
}

/**
 * Rebuilds a ZodArray with its element unwrapped, preserving any min/max/length
 * constraints stored in `def.checks`. Zod v4 array checks are stored as check
 * objects in `schema._zod.def.checks`; each check has a `_zod.def` of shape
 * `{ check: 'min_length', minimum: N }`, `{ check: 'max_length', maximum: N }`,
 * or `{ check: 'length_equals', length: N }`.
 */
function unwrapArray(schema: z.ZodTypeAny): z.ZodTypeAny {
	const def = schema._zod.def as any
	const unwrappedElement = unwrapPipe(def.element as z.ZodTypeAny)
	let rebuilt = z.array(unwrappedElement)

	// Re-apply length constraints from the original array's checks.
	for (const check of (def.checks ?? []) as any[]) {
		const cd = check._zod?.def
		if (!cd) continue
		if (cd.check === 'min_length') {
			rebuilt = rebuilt.min(cd.minimum as number)
		} else if (cd.check === 'max_length') {
			rebuilt = rebuilt.max(cd.maximum as number)
		} else if (cd.check === 'length_equals') {
			rebuilt = rebuilt.length(cd.length as number)
		}
	}

	return rebuilt
}

function unwrapPipe(schema: z.ZodTypeAny): z.ZodTypeAny {
	// Check the instance registry FIRST: z.instance(Cls) produces a `pipe`
	// schema (z.unknown().transform(...)) that is registered here by the
	// `instance` helper. If we let the pipe branch run first, it would recurse
	// into z.unknown() and lose the VO schema. Checking early returns the real
	// wire-input schema without touching parse-time behaviour.
	const voSchema = instanceInputSchemaMap.get(schema)
	if (voSchema !== undefined) {
		// Recurse so composite VOs (containing nested instances or nested objects)
		// are unwrapped fully, not returned as raw VO schema with transforms intact.
		return deepen(voSchema)
	}
	if (schema._zod.def.type === 'pipe') {
		return unwrapPipe((schema._zod.def as any).in)
	}
	if (schema._zod.def.type === 'default') {
		return unwrapPipe((schema._zod.def as any).innerType).optional()
	}
	if (schema._zod.def.type === 'optional' || schema._zod.def.type === 'nullable') {
		return unwrapPipe((schema._zod.def as any).innerType).optional()
	}
	// For arrays and nested objects, recurse so their contents are also stripped.
	return deepen(schema)
}

export function extractInputSchema<T extends z.ZodObject<any>>(schema: T): z.ZodType<z.input<T>> {
	const shape = schema._zod.def.shape
	const newShape = Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, unwrapPipe(value as z.ZodTypeAny)]))
	return z.object(newShape) as any
}
// ZodTransforms - Transform functions that match Zod's camelCase naming convention
export const ZodTransforms = {
	stringToNumber,
	stringToInteger,
	stringToBoolean,
	stringToDate,
	stringToArray,
	stringToNumberArray,
}
