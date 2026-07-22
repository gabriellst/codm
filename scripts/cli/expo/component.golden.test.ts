// Golden tests for the expo `bun cli component` output. The shape was rewritten
// to match berzerk-club/feat/training-collaboration's real expo conventions
// (plain `export function`, no React.forwardRef, plain Props interface). Each
// captured fixture is the regression guard for that shape going forward.
import { describe, it, expect } from 'bun:test'
import { MOBILE_SDK_PACKAGE } from './blocks/sdk'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { componentGenerator } from './artifacts/component'

const FIX = join(import.meta.dir, '__fixtures__')
const golden = (f: string) => readFileSync(join(FIX, f), 'utf8')

describe('expo component generator — berzerk-style output (rendered via registry snippet)', () => {
	it('plain recipe: bare function, no forwardRef, no React import', async () => {
		const [file] = await componentGenerator(['(app)/probe', 'Demo'], { recipe: 'plain', 'no-i18n-write': 'true' })
		expect(file!.content).toBe(golden('component.plain.txt'))
		// Spot-check the shape contract:
		expect(file!.content).toContain('export function Demo({ className, ...props }: DemoProps)')
		expect(file!.content).not.toContain('forwardRef')
		expect(file!.content).not.toContain('import * as React from')
	})

	it('section recipe + i18n + sdk: useTranslation + typed SDK import', async () => {
		const [file] = await componentGenerator(['(app)/profile', 'ProfileHeader'], {
			recipe: 'section',
			sdk: 'User',
			i18n: 'profile',
			'no-i18n-write': 'true',
		})
		expect(file!.content).toBe(golden('component.section-i18n-sdk.txt'))
		expect(file!.content).toContain(`import type { User } from '${MOBILE_SDK_PACKAGE}'`)
		expect(file!.content).toContain(`const { t } = useTranslation()`)
		expect(file!.content).not.toContain('forwardRef')
	})
})
