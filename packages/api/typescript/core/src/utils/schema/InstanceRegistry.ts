import type { ZodTypeAny } from 'zod'

/**
 * Module-level registry that maps an instance schema (returned by `z.instance()`)
 * to the underlying VO schema (`Cls.schema`). Used by `unwrapPipe` / `extractInputSchema`
 * so that `.input()` on a ZodObject containing `z.instance(VO)` fields recovers
 * the VO's wire-input schema instead of `z.unknown()`.
 *
 * Placed in its own module to avoid a circular dependency between ExtraTypes.ts
 * (which uses the map) and Transforms.ts (which queries it): both can import this
 * zero-dependency module without creating a cycle.
 *
 * Runtime behaviour is unchanged: the transform still constructs via `new Cls(v)`,
 * so `BaseError` codes are preserved. Only the `.input()` recovery path reads this map.
 */
export const instanceInputSchemaMap = new WeakMap<ZodTypeAny, ZodTypeAny>()
