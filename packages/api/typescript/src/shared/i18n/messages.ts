import { Language } from '@codedm/contracts-typescript/wire/enums'

/**
 * Server-side i18n for surfaces the FRONTEND cannot translate: emails, hosted-checkout line
 * items, and any string handed to an external renderer (gateway, PDF, push). Everything the
 * frontend renders keeps the error-code pattern — backend emits codes/structure, the app's
 * locale files translate — so this module owns NO domain vocabulary. Each bounded context that
 * needs server-rendered copy declares its own catalog in `<ctx>/i18n/messages.ts` with
 * `defineMessages`; the mechanism lives here, the content lives with its context.
 */

/**
 * Languages every catalog must ship. The contracts `Language` wire enum ships EXACTLY the locales
 * the app translates (pt-BR/en-US), so today this list equals the whole enum and `resolveLanguage`'s
 * membership check only ever collapses null/absent input. The check stays because a product widens
 * the ONE contracts enum first and catches up the catalogs second — during that window an unshipped
 * member must resolve to the default instead of crashing a lookup. Adding a language here forces
 * every context catalog to provide it (compile error until done).
 */
export const CATALOG_LANGUAGES = [Language.PT_BR, Language.EN_US] as const
export type CatalogLanguage = (typeof CATALOG_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: CatalogLanguage = Language.PT_BR

/** Collapse any user language (or its absence) onto a language catalogs actually ship. */
export function resolveLanguage(language?: Language | null): CatalogLanguage {
	if (language && (CATALOG_LANGUAGES as readonly Language[]).includes(language)) return language as CatalogLanguage
	return DEFAULT_LANGUAGE
}

/**
 * A message is a function from typed params to copy — a single string, or a paragraph list for
 * email bodies. Functions (not template strings) so params stay type-checked at the call site.
 */
export type MessageValue = string | readonly string[]
export type MessageFn = (...args: never[]) => MessageValue

/**
 * The shape `defineMessages` returns: one record key per message, language as the first
 * argument — `billingMessages.dunningSubject(user.language)`, no intermediate resolver call.
 */
export type LocalizedMessages<T extends Record<string, MessageFn>> = {
	readonly [K in keyof T]: (language: Language | null | undefined, ...args: Parameters<T[K]>) => ReturnType<T[K]>
}

/**
 * Declare a per-context catalog. The PT catalog is the reference shape — every other language
 * must define the same keys with the same param types (missing keys are a compile error, which
 * is the exhaustiveness guard). Unshipped/absent languages resolve through `resolveLanguage`.
 */
export function defineMessages<T extends Record<string, MessageFn>>(catalogs: Readonly<Record<CatalogLanguage, T>>): LocalizedMessages<T>
export function defineMessages(
	catalogs: Record<CatalogLanguage, Record<string, MessageFn>>,
): Record<string, (language?: Language | null, ...args: never[]) => MessageValue> {
	const messages: Record<string, (language?: Language | null, ...args: never[]) => MessageValue> = {}
	for (const key of Object.keys(catalogs[DEFAULT_LANGUAGE])) {
		messages[key] = (language, ...args) => catalogs[resolveLanguage(language)][key]!(...args)
	}
	return messages
}
