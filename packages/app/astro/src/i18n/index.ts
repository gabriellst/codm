export const LOCALES = ['pt', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'pt'

/** Cookie the LocaleSwitcher writes and the `/` redirect shell reads (Option B). */
export const LOCALE_COOKIE = 'codm_locale'

export function isLocale(value: string | undefined | null): value is Locale {
	return !!value && (LOCALES as readonly string[]).includes(value)
}

/** Current locale = first path segment. Every page is prefixed under Option B. */
export function getLocale(url: URL): Locale {
	const seg = url.pathname.split('/')[1]
	return isLocale(seg) ? seg : DEFAULT_LOCALE
}

/**
 * Option B: BOTH locales are prefixed — there is no unprefixed default. Always
 * emits `/<locale>` + path. Root path collapses to `/<locale>/`.
 */
export function getLocaleUrl(locale: Locale, path = '/'): string {
	if (path === '/' || path === '') return `/${locale}/`
	const clean = path.startsWith('/') ? path : `/${path}`
	return `/${locale}${clean}`
}

/** Alias kept for call sites that read as "the route for this locale". */
export const routeFor = getLocaleUrl

/** Swap the current URL's locale prefix for `target`, preserving the rest. */
export function localizedPath(url: URL, target: Locale): string {
	const current = getLocale(url)
	const rest = url.pathname.replace(new RegExp(`^/${current}(?=/|$)`), '') || '/'
	return getLocaleUrl(target, rest)
}

/** Absolute per-locale URLs for the current page — used for hreflang alternates. */
export function alternateUrls(url: URL, site: URL): Record<Locale, string> {
	return {
		pt: new URL(localizedPath(url, 'pt'), site).href,
		en: new URL(localizedPath(url, 'en'), site).href,
	}
}

/**
 * Best-effort locale from a language tag (cookie value or `navigator.language`).
 * Used client-side by the `/` redirect shell; kept here so the tag list stays
 * single-sourced. Falls back to DEFAULT_LOCALE.
 */
export function detectLocale(tag: string | null | undefined): Locale {
	if (!tag) return DEFAULT_LOCALE
	const lower = tag.toLowerCase()
	for (const loc of LOCALES) if (lower === loc || lower.startsWith(`${loc}-`)) return loc
	return DEFAULT_LOCALE
}

/** The other locale in a two-locale world — used to find a blog post's sibling. */
export function siblingLocale(locale: Locale): Locale {
	return locale === 'pt' ? 'en' : 'pt'
}
