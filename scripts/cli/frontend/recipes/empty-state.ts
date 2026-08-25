// Icon + heading + message + optional action button.
// --i18n is required (the recipe always emits visible text).

import type { Recipe } from './index'

export const emptyState: Recipe = {
	blocks: ['element', 'i18n'],
	defaultElement: 'div',
	requiresI18n: true,
	i18nSlots: ['title', 'description', 'cta'],
	renderBody: ({ i18nPrefix }) => `\t\t\t<div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
\t\t\t\t<h3 className="text-lg font-semibold">{t('${i18nPrefix ?? ''}.title')}</h3>
\t\t\t\t<p className="text-sm text-muted-foreground">{t('${i18nPrefix ?? ''}.description')}</p>
\t\t\t\t{/* Optional CTA button: <Button>{t('${i18nPrefix ?? ''}.cta')}</Button> */}
\t\t\t</div>`,
}
