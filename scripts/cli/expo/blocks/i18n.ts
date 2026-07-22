// Mobile i18n block — emits the `useTranslation` hook from `react-i18next`,
// matching the pattern used by every screen under `packages/app/expo/app/`.

import type { MobileBlockContext, MobileBlockOutput } from './types'

export function i18nBlock(ctx: MobileBlockContext): MobileBlockOutput {
	if (!ctx.i18nPrefix) return {}
	return {
		imports: [`import { useTranslation } from 'react-i18next'`],
		hookCalls: [`const { t } = useTranslation()`],
	}
}
