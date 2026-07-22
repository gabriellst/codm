import { z as zod } from 'zod'
import { ZodTransforms } from './Transforms'
import { ExtraSchemaTypes } from './ExtraTypes'
import { patchExample } from './Examples'
import './InputSchema' // Import to register the .input() method on ZodType prototype

// Create the z object that combines Zod with custom transforms and extra types
const baseZ = Object.assign({}, zod, ZodTransforms, ExtraSchemaTypes)

// Wrap schema factory methods so every returned schema gets .example()
type ZodFactory = (...args: any[]) => any
const wrappedZ: Record<string, any> = {}
for (const [key, value] of Object.entries(baseZ)) {
	if (typeof value === 'function') {
		wrappedZ[key] = ((...args: any[]) => {
			const result = (value as ZodFactory)(...args)
			return result && typeof result === 'object' && typeof result.meta === 'function' ? patchExample(result) : result
		}) as any
	} else {
		wrappedZ[key] = value
	}
}

// cc-bp-16: z.nativeEnum is the Zod-3 idiom — z.enum(Enum) handles TS enums in Zod v4.
// Removed at runtime + type level so the idiom can't exist for consumers of this z;
// the registry detect stays as belt-and-suspenders for direct 'zod' imports.
delete wrappedZ.nativeEnum

export const z = wrappedZ as Omit<typeof baseZ, 'nativeEnum'>

// Re-export types from zod that are commonly used
export type { ZodType, ZodTypeAny, ZodRawShape, ZodObject } from 'zod'

// Re-export ZodInstance so TypeScript can name the inferred return type of z.instance() in declaration files
export type { ZodInstance } from './ExtraTypes'

// Re-export type-safe example helpers
export { withExamples, type InferSchemaType, type SchemaWithExample } from './Examples'

// Re-export refinement filter utilities
export { filterRefinementsForProperty, type RefinementMetadata } from './RefinementFilter'
