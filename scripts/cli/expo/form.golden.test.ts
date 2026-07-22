// Golden tests for the expo `bun cli form` output. Shape sourced from
// berzerk-club/feat/training-collaboration's real expo forms (TanStack Form +
// SDK Zod schema + KeyboardAware, submit gated by `safeParse(values).success`
// per FRM-06). Each captured fixture is the regression guard for that shape
// going forward; the canonical shell lives in
// .claude/skills/form/expo/registry.yaml `snippet.skeleton`.
import { describe, it, expect } from 'bun:test'
import { MOBILE_SDK_PACKAGE } from './blocks/sdk'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formGenerator } from './artifacts/form'

const FIX = join(import.meta.dir, '__fixtures__')
const golden = (f: string) => readFileSync(join(FIX, f), 'utf8')

describe('expo form generator — berzerk-style output (rendered via registry snippet)', () => {
	it('basic form: TanStack + SDK schema validators + safeParse-gated submit', async () => {
		const [file] = await formGenerator(['profile/edit', 'ProfileEdit'], {
			i18n: 'profile.edit',
			sdk: 'UpdateProfileBody',
		})
		expect(file!.content).toBe(golden('form.basic.txt'))
		// Spot-check the shape contract:
		expect(file!.filePath).toBe('packages/app/expo/app/profile/edit/-components/ProfileEditForm/index.tsx')
		expect(file!.content).toContain(`import { UpdateProfileBody } from '${MOBILE_SDK_PACKAGE}'`)
		expect(file!.content).toContain(`const { t } = useTranslation()`)
		expect(file!.content).toContain(`validators: { onChange: UpdateProfileBody }`)
		// FRM-06: submit button disabled gate uses schema.safeParse(values).success
		expect(file!.content).toContain('!UpdateProfileBody.safeParse(values).success')
		expect(file!.content).not.toContain('forwardRef')
		expect(file!.content).not.toContain('import * as AppleAuthentication')
	})

	it('apple-sign-in + in-sheets: Apple handler block + (sheets) base path', async () => {
		const [file] = await formGenerator(['(auth)/sign-in', 'SignIn'], {
			i18n: 'auth.signIn',
			sdk: 'SignInBody',
			'in-sheets': 'true',
			'apple-sign-in': 'true',
		})
		expect(file!.content).toBe(golden('form.apple-sign-in.txt'))
		expect(file!.filePath).toBe('packages/app/expo/app/(sheets)/(auth)/sign-in/-components/SignInForm/index.tsx')
		expect(file!.content).toContain(`import * as AppleAuthentication from 'expo-apple-authentication'`)
		expect(file!.content).toContain('const handleAppleSignIn = async () =>')
		expect(file!.content).toContain('<AppleAuthentication.AppleAuthenticationButton')
		expect(file!.content).toContain('!SignInBody.safeParse(values).success')
	})
})
