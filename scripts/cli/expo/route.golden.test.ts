// Golden tests for the expo `bun cli route` output. The shape mirrors
// berzerk-club/feat/training-collaboration's real expo screen conventions
// (default-exported function, `useTranslation`, single combined `expo-router`
// import line, optional inline `useTypedSearchParams(schema)` block, optional
// `<Stack.Screen options={{ title }} />` for `--layout=stack`). Each captured
// fixture is the regression guard for that shape going forward.
import { describe, it, expect } from 'bun:test'
import { MOBILE_SDK_PACKAGE } from './blocks/sdk'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { routeGenerator } from './artifacts/route'

const FIX = join(import.meta.dir, '__fixtures__')
const golden = (f: string) => readFileSync(join(FIX, f), 'utf8')

describe('expo route generator — berzerk-style output (rendered via registry snippet)', () => {
	it('default (stack layout): emits <Stack.Screen options title> + useTranslation hook', async () => {
		const [file] = await routeGenerator(['(app)/probe'], { i18n: 'probe' })
		expect(file!.content).toBe(golden('route.stack.txt'))
		expect(file!.filePath).toBe('packages/app/expo/app/(app)/probe/index.tsx')
		// Spot-check the shape contract:
		expect(file!.content).toContain('export default function ProbeScreen()')
		expect(file!.content).toContain(`<Stack.Screen options={{ title: t('probe.title') }} />`)
		expect(file!.content).toContain(`import { Stack } from 'expo-router'`)
	})

	it('--detail: emits [id].tsx with combined expo-router import + useLocalSearchParams', async () => {
		const [file] = await routeGenerator(['(app)/probe'], { i18n: 'probe', detail: 'true' })
		expect(file!.content).toBe(golden('route.detail.txt'))
		expect(file!.filePath).toBe('packages/app/expo/app/(app)/probe/[id].tsx')
		// Single combined `expo-router` import line (berzerk-style — no duplicates):
		expect(file!.content).toContain(`import { Stack, useLocalSearchParams } from 'expo-router'`)
		expect(file!.content).not.toContain(`import { Stack } from 'expo-router'\nimport { useLocalSearchParams }`)
		expect(file!.content).toContain(`const { id } = useLocalSearchParams<{ id: string }>()`)
		expect(file!.content).toContain('export default function ProbeDetailScreen()')
	})

	it('--sdk + --search: typed search-params block with SDK schema .and(z.object({...}))', async () => {
		const [file] = await routeGenerator(['(app)/workouts'], {
			i18n: 'workouts',
			sdk: 'ListWorkoutsQueryParams',
			search: 'q:string?,page:number=1',
		})
		expect(file!.content).toBe(golden('route.search-sdk.txt'))
		expect(file!.content).toContain(`import { ListWorkoutsQueryParams } from '${MOBILE_SDK_PACKAGE}'`)
		expect(file!.content).toContain(`import { useTypedSearchParams } from '@/lib/typed-route'`)
		expect(file!.content).toContain(`const workoutsSearchSchema = ListWorkoutsQueryParams.and(`)
		expect(file!.content).toContain(`const [params, setParams] = useTypedSearchParams(workoutsSearchSchema)`)
	})

	it('--layout=plain: no Stack.Screen options, no expo-router import', async () => {
		const [file] = await routeGenerator(['(app)/leaf'], { i18n: 'leaf', layout: 'plain' })
		expect(file!.content).toBe(golden('route.plain.txt'))
		expect(file!.content).not.toContain('Stack.Screen')
		expect(file!.content).not.toContain(`from 'expo-router'`)
		expect(file!.content).toContain('export default function LeafScreen()')
	})

	it('--in-sheets: emits under (sheets)/<segment>/index.tsx', async () => {
		const [file] = await routeGenerator(['add-expense'], { i18n: 'addExpense', 'in-sheets': 'true' })
		expect(file!.content).toBe(golden('route.in-sheets.txt'))
		expect(file!.filePath).toBe('packages/app/expo/app/(sheets)/add-expense/index.tsx')
		expect(file!.content).toContain('export default function AddExpenseScreen()')
	})
})
