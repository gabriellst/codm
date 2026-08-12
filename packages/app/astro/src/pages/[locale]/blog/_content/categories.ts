import type { Locale } from '~/i18n'

/**
 * D3 (design/codm.pen `ji2y3` → `VQNHl`/`h2UtB`, "Filtros"): the blog index's category
 * filter chips ("Todos" excluded — that's "no category selected", not a fourth value).
 * One label map per locale, keyed by the same enum the content schema declares
 * (`content.config.ts` → `blog.category`) — Open/Closed: a new category is one new enum
 * member + one new label pair here, never a hardcoded chip in a component.
 */
export type BlogCategory = 'product' | 'engineering' | 'use-cases'

export const BLOG_CATEGORIES: readonly BlogCategory[] = ['product', 'engineering', 'use-cases']

export const CATEGORY_LABELS: Record<Locale, Record<BlogCategory, string>> = {
	pt: {
		product: 'Produto',
		engineering: 'Engenharia',
		'use-cases': 'Casos de uso',
	},
	en: {
		product: 'Product',
		engineering: 'Engineering',
		'use-cases': 'Use cases',
	},
}
