// Plain recipe — bare `<View>` shell with a TODO marker. Useful for
// container components that own data but render their own custom JSX.

import type { MobileRecipe } from './index'

export const plainRecipe: MobileRecipe = {
	rootTag: 'View',
	extraImports: [],
	renderBody: ({ pascal }) => `\t\t\t{/* Implement ${pascal} */}`,
	i18nSlots: [],
	requiresI18n: false,
}
