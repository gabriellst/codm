// Section recipe — eyebrow + display title header followed by a content
// area. Maps to the typical "section header + rows" structure used across
// the expo screens (see `app/(sheets)/edit-profile/index.tsx`).

import type { MobileRecipe } from './index'

export const sectionRecipe: MobileRecipe = {
	rootTag: 'View',
	extraImports: [`import { Eyebrow } from '@/components/ui/Eyebrow'`, `import { DisplayTitle } from '@/components/ui/DisplayTitle'`],
	renderBody: ({ i18nPrefix }) => `\t\t\t<Eyebrow>{t('${i18nPrefix}.eyebrow')}</Eyebrow>
\t\t\t<DisplayTitle>{t('${i18nPrefix}.title')}</DisplayTitle>
\t\t\t{/* Section body */}`,
	i18nSlots: ['eyebrow', 'title'],
	requiresI18n: true,
}
