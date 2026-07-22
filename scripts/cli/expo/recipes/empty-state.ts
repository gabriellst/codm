// Empty-state recipe — renders the `EmptyState` primitive from
// `@/components/ui/EmptyState`. The web stack splits this into four
// subcomponents (Empty / EmptyHeader / EmptyTitle / EmptyMedia); the mobile
// design system is a single component with `title` + `description` props.

import type { MobileRecipe } from './index'

export const emptyStateRecipe: MobileRecipe = {
	rootTag: 'View',
	extraImports: [`import { EmptyState } from '@/components/ui/EmptyState'`],
	renderBody: ({ i18nPrefix }) => `\t\t\t<EmptyState
\t\t\t\ttitle={t('${i18nPrefix}.title')}
\t\t\t\tdescription={t('${i18nPrefix}.description')}
\t\t\t/>`,
	i18nSlots: ['title', 'description'],
	requiresI18n: true,
}
