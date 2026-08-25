import type { ValidatorAdapter } from '@tanstack/react-router'
import type { z } from 'zod'

function extractDefaults(schema: z.ZodTypeAny): Record<string, unknown> {
	const defaults: Record<string, unknown> = {}
	const def = schema._def as any
	const type = def?.type

	if (type === 'intersection') {
		Object.assign(defaults, extractDefaults(def.left))
		Object.assign(defaults, extractDefaults(def.right))
	} else if (type === 'object') {
		const shape = typeof def.shape === 'function' ? def.shape() : def.shape
		for (const [key, field] of Object.entries<any>(shape)) {
			if (field?._def?.type === 'default') {
				const dv = field._def.defaultValue
				defaults[key] = typeof dv === 'function' ? dv() : dv
			}
		}
	}

	return defaults
}

export function zodValidator<TSchema extends z.ZodTypeAny>(
	schema: TSchema,
): ValidatorAdapter<Partial<z.infer<TSchema>>, z.output<TSchema>> {
	const defaults = extractDefaults(schema)
	const hasDefaults = Object.keys(defaults).length > 0

	return {
		types: undefined!,
		parse: search => schema.parse(hasDefaults ? { ...defaults, ...(search as Record<string, unknown>) } : search),
	}
}
