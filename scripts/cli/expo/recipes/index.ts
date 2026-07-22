// Mobile component recipes — preset bundles of JSX bodies for the
// `component` artifact. Mirrors the web recipes (plain/section/card/
// empty-state) but emits RN primitives + `components/ui/*` from the expo
// design system.

export interface MobileRecipe {
	/** RN element to use as the root view of the component. */
	rootTag: 'View' | 'Pressable'
	/** Extra imports the recipe needs beyond the assembler defaults. */
	extraImports: string[]
	/**
	 * The body JSX rendered inside the root element. `pascal` + `i18nPrefix`
	 * give the recipe access to component name and i18n slot prefix.
	 */
	renderBody: (args: { pascal: string; i18nPrefix?: string }) => string
	/** i18n keys (relative to `i18nPrefix`) referenced by `renderBody`. */
	i18nSlots: string[]
	/** Whether this recipe needs an `--i18n=` prefix to be passed. */
	requiresI18n: boolean
}

import { plainRecipe } from './plain'
import { sectionRecipe } from './section'
import { cardRecipe } from './card'
import { emptyStateRecipe } from './empty-state'

export const mobileRecipes: Record<string, MobileRecipe> = {
	plain: plainRecipe,
	section: sectionRecipe,
	card: cardRecipe,
	'empty-state': emptyStateRecipe,
}
