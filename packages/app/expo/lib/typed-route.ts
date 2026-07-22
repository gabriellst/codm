import { useMemo } from 'react'
import { useLocalSearchParams, router } from 'expo-router'
import type { ZodType } from 'zod'

/**
 * Zod-validated search params for an Expo Router screen.
 *
 * Expo Router's `experiments.typedRoutes` (see `app.json`) gives compile-time
 * safety for paths and dynamic segments, but query params are not auto-typed
 * and there is no built-in runtime validation. This hook closes that gap by
 * mirroring TanStack Router's `validateSearch` pattern: pass a Zod schema and
 * receive parsed, fully-typed params.
 *
 * On invalid input, the hook falls back to `schema.parse({})`, which means
 * every field in the schema must have a default. This keeps screens crash-free
 * when a deep link arrives with garbage params.
 *
 * @example
 *   const schema = z.object({
 *     tab: z.enum(['workouts', 'prs']).default('workouts'),
 *     page: z.coerce.number().int().min(1).default(1),
 *   })
 *
 *   export default function Screen() {
 *     const [{ tab, page }, setParams] = useTypedSearchParams(schema)
 *     return <Button onPress={() => setParams({ page: page + 1 })} />
 *   }
 */
export function useTypedSearchParams<T extends Record<string, unknown>>(schema: ZodType<T>): [T, (next: Partial<T>) => void] {
	const raw = useLocalSearchParams()

	const validated = useMemo(() => {
		const result = schema.safeParse(raw)
		return result.success ? result.data : schema.parse({})
	}, [raw, schema])

	const setParams = (next: Partial<T>) => {
		const serialized: Record<string, string | undefined> = {}
		for (const [key, value] of Object.entries(next)) {
			serialized[key] = value == null ? undefined : String(value)
		}
		router.setParams(serialized)
	}

	return [validated, setParams]
}
