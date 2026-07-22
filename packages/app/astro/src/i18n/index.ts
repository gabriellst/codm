export const LOCALES = ['pt', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'pt'

export function getLocale(url: URL): Locale {
	const seg = url.pathname.split('/')[1]
	return LOCALES.includes(seg as Locale) ? (seg as Locale) : DEFAULT_LOCALE
}

export function routeFor(locale: Locale, path: string): string {
	const clean = path.startsWith('/') ? path : `/${path}`
	if (locale === DEFAULT_LOCALE) return clean
	return `/${locale}${clean}`
}

export function localizedPath(url: URL, targetLocale: Locale): string {
	const current = getLocale(url)
	const stripped = current === DEFAULT_LOCALE ? url.pathname : url.pathname.replace(new RegExp(`^/${current}`), '') || '/'
	return routeFor(targetLocale, stripped)
}

/** Absolute per-locale URLs for the current page — used for hreflang alternates. */
export function alternateUrls(url: URL, site: URL): Record<Locale, string> {
	return {
		pt: new URL(localizedPath(url, 'pt'), site).href,
		en: new URL(localizedPath(url, 'en'), site).href,
	}
}
