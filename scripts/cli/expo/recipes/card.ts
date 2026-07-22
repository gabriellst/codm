// Card recipe — wraps the body in the `Card` primitive from
// `@/components/ui/Card`. Designed for leaf cards rendered inside a list
// (e.g. GameCard inside a GameList). The card itself is the root element so
// className / variants get applied to the surface.

import type { MobileRecipe } from './index'

export const cardRecipe: MobileRecipe = {
	rootTag: 'View',
	extraImports: [`import { Card } from '@/components/ui/Card'`, `import { Text } from 'react-native'`],
	renderBody: ({ i18nPrefix }) => `\t\t\t<Card>
\t\t\t\t<Text className="text-fg-0 font-sans-bold">{t('${i18nPrefix}.title')}</Text>
\t\t\t\t<Text className="text-fg-1 font-sans">{t('${i18nPrefix}.subtitle')}</Text>
\t\t\t</Card>`,
	i18nSlots: ['title', 'subtitle'],
	requiresI18n: true,
}
