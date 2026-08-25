import { describe, expect, test } from 'bun:test'
import { dataHookCall, isRouteShell } from './component-props'

/**
 * Self-test for CP-03 — a route shell fetches nothing (route bp-13 / CMP-P01 data ownership).
 *
 * The className half of this walker (CP-01 / CP-02 / CP-04) moved to the type-aware eslint rule
 * `local/component-props` on 31/07 and is tested there (scripts/eslint-rules/component-props.test.ts);
 * what remains here is the one rule that is about WHERE a file sits, which no per-file lint rule can
 * decide. Each predicate keeps the case that MUST fail next to the one that must pass — a gate that
 * cannot fail measures nothing.
 */

describe('isRouteShell', () => {
	test('the route own index.tsx is the shell', () => {
		expect(isRouteShell('routes/(app)/dashboard/index.tsx')).toBe(true)
		expect(isRouteShell('routes/index.tsx')).toBe(true)
	})

	test('a `-`-prefixed module is not the shell — that is exactly where fetching belongs', () => {
		expect(isRouteShell('routes/(app)/dashboard/-components/HomeDashboard/index.tsx')).toBe(false)
		expect(isRouteShell('routes/(app)/threads/-hooks/index.tsx')).toBe(false)
		expect(isRouteShell('routes/(app)/threads/-stores/index.tsx')).toBe(false)
	})
})

describe('dataHookCall', () => {
	test('an SDK read hook in a shell is the finding', () => {
		expect(dataHookCall('const { data } = useGetHomeDashboard()')?.[0]).toBe('useGetHomeDashboard(')
		expect(dataHookCall('const { data } = useListWorkspaces()')?.[0]).toBe('useListWorkspaces(')
	})

	test('a shell that only composes components is clean', () => {
		expect(dataHookCall('export const Route = createFileRoute("/x")({ component: () => <HomeDashboard /> })')).toBeNull()
	})

	test('a mutation or a plain hook is not a read — only useGet*/useList* are', () => {
		expect(dataHookCall('const m = useCreateThread()')).toBeNull()
		expect(dataHookCall('const { t } = useTranslation()')).toBeNull()
	})
})
