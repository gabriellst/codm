import pt from '../../app/react/src/locales/pt.json' with { type: 'json' }
import en from '../../app/react/src/locales/en.json' with { type: 'json' }

type NestedKeys<T, Prefix extends string = ''> =
	T extends Record<string, unknown>
		? { [K in keyof T & string]: NestedKeys<T[K], Prefix extends '' ? K : `${Prefix}.${K}`> }[keyof T & string]
		: Prefix

type TranslationKey = NestedKeys<typeof pt>

/**
 * The languages the console ships (`app/react/src/lib/i18n.ts`, `supportedLngs`).
 *
 * `pt` is keyed off first and is the default here for the same reason it is there: it is the product's
 * first language, and every spec written before this parameter existed reads it.
 */
const BUNDLES = { pt, en }

export type Locale = keyof typeof BUNDLES

/**
 * The console's own copy, by key — the ONE place a spec should get a user-visible string.
 *
 * `locale` defaults to `pt`, so every existing call site keeps meaning what it meant. It exists for
 * the demo films, which are recorded twice: `parity.test.ts` next to the bundles already pins that
 * both carry the same key set, so a key that resolves in one resolves in the other.
 */
export function t(key: TranslationKey, locale: Locale = 'pt'): string {
	return key.split('.').reduce<any>((obj, k) => obj?.[k], BUNDLES[locale]) ?? key
}
