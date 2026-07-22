// Golden tests for the expo `bun cli sheet` output. The shape was rewritten
// to match berzerk-club/feat/training-collaboration's real (sheets) routes:
//   - pageSheet / formSheet inner _layout.tsx is a bare <Slot /> — actual
//     presentation options live on the root app/_layout.tsx Stack.Screen
//     (putting them on the inner Stack is registry bp-09).
//   - fullScreenModal inner _layout.tsx is a <Stack> with a back-arrow header
//     (iOS doesn't render a header for fullScreenModal by default — matches
//     berzerk edit-profile/_layout.tsx).
// Each captured fixture is the regression guard for that shape going forward.
import { describe, it, expect } from 'bun:test'
import { MOBILE_SDK_PACKAGE } from './blocks/sdk'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sheetGenerator } from './artifacts/sheet'

const FIX = join(import.meta.dir, '__fixtures__')
const golden = (f: string) => readFileSync(join(FIX, f), 'utf8')

describe('expo sheet generator — berzerk-style output (rendered via registry snippet)', () => {
	it('pageSheet plain: <Slot/> layout + read-only body', async () => {
		const files = await sheetGenerator(['devices'], { i18n: 'profile.devices' })
		expect(files.map(f => f.filePath)).toEqual([
			'packages/app/expo/app/(sheets)/devices/_layout.tsx',
			'packages/app/expo/app/(sheets)/devices/index.tsx',
		])
		expect(files[0]!.content).toBe(golden('sheet.pageSheet-plain._layout.txt'))
		expect(files[1]!.content).toBe(golden('sheet.pageSheet-plain.index.txt'))
		// Shape contract: layout is bare Slot — presentation opts live on root app/_layout.tsx.
		expect(files[0]!.content).toContain(`import { Slot } from 'expo-router'`)
		expect(files[0]!.content).not.toContain('sheetCornerRadius')
		expect(files[0]!.content).not.toContain('presentation:')
		// Body shape: useTranslation + headerTitle from i18n prefix.
		expect(files[1]!.content).toContain(`export default function DevicesSheet()`)
		expect(files[1]!.content).toContain(`{t('profile.devices.title')}`)
	})

	it('formSheet + --form + --sdk: TanStack form body, layout still Slot', async () => {
		const files = await sheetGenerator(['edit-bio'], {
			i18n: 'profile.editBio',
			presentation: 'formSheet',
			form: 'true',
			sdk: 'updateBioRequestSchema',
		})
		expect(files.map(f => f.filePath)).toEqual([
			'packages/app/expo/app/(sheets)/edit-bio/_layout.tsx',
			'packages/app/expo/app/(sheets)/edit-bio/index.tsx',
		])
		expect(files[0]!.content).toBe(golden('sheet.formSheet-form-sdk._layout.txt'))
		expect(files[1]!.content).toBe(golden('sheet.formSheet-form-sdk.index.txt'))
		// formSheet uses the same <Slot /> layout shape as pageSheet — sheet*
		// options belong on the root app/_layout.tsx Stack.Screen entry.
		expect(files[0]!.content).toContain(`import { Slot } from 'expo-router'`)
		// Form body imports + dismisses on success via router.back().
		expect(files[1]!.content).toContain(`import { useForm } from '@tanstack/react-form'`)
		expect(files[1]!.content).toContain(`import { updateBioRequestSchema } from '${MOBILE_SDK_PACKAGE}'`)
		expect(files[1]!.content).toContain(`router.back()`)
	})

	it('fullScreenModal: back-arrow Stack layout (matches berzerk edit-profile)', async () => {
		const files = await sheetGenerator(['edit-profile'], {
			i18n: 'profile.editProfile',
			presentation: 'fullScreenModal',
		})
		expect(files.map(f => f.filePath)).toEqual([
			'packages/app/expo/app/(sheets)/edit-profile/_layout.tsx',
			'packages/app/expo/app/(sheets)/edit-profile/index.tsx',
		])
		expect(files[0]!.content).toBe(golden('sheet.fullScreenModal-plain._layout.txt'))
		expect(files[1]!.content).toBe(golden('sheet.fullScreenModal-plain.index.txt'))
		// fullScreenModal needs an inner Stack with a back arrow — iOS does
		// not render a header for fullScreenModal on its own.
		expect(files[0]!.content).toContain(`<Stack`)
		expect(files[0]!.content).toContain(`headerLeft:`)
		expect(files[0]!.content).toContain(`import { IconBack } from '@/components/ui/Icons'`)
		expect(files[0]!.content).toContain(`headerTitle: t('profile.editProfile.title')`)
	})

	it('multistep: index.tsx + step-2.tsx + zustand store', async () => {
		const files = await sheetGenerator(['onboarding'], { i18n: 'onboarding', multistep: 'true' })
		expect(files.map(f => f.filePath)).toEqual([
			'packages/app/expo/app/(sheets)/onboarding/_layout.tsx',
			'packages/app/expo/app/(sheets)/onboarding/index.tsx',
			'packages/app/expo/app/(sheets)/onboarding/step-2.tsx',
			'packages/app/expo/app/(sheets)/onboarding/-stores/onboarding-store.ts',
		])
		expect(files[0]!.content).toBe(golden('sheet.multistep._layout.txt'))
		expect(files[1]!.content).toBe(golden('sheet.multistep.index.txt'))
		expect(files[2]!.content).toBe(golden('sheet.multistep.step-2.txt'))
		expect(files[3]!.content).toBe(golden('sheet.multistep.store.txt'))
		// Step 1 is index.tsx; step 2 routes to step-3 (one more step the
		// generator doesn't emit — user adds it). Store shares state across steps.
		expect(files[1]!.content).toContain(`export default function OnboardingStep1()`)
		expect(files[2]!.content).toContain(`router.push('/(sheets)/onboarding/step-3')`)
		expect(files[3]!.content).toContain(`export const useOnboardingStore = create<OnboardingStore>`)
	})
})
