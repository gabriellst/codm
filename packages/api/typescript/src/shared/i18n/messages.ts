import { Language } from '@codm/contracts-typescript/wire/enums'

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

/**
 * THE LANGUAGE OF ONE CONVERSATION — declared, else the owner's, else the product default.
 *
 * The collapse lives here, in one named function, because it has THREE readers that must never
 * disagree: the channel (`RunOrchestratorTurn`, which opens the "thinking" cues and hands the agent
 * the language it must answer in), the settings dialog (`GetThreadSettings`, which renders what is in
 * force), and the console chat (`GetSessionChat`, whose spinner has to show the room's words, not the
 * browser's). Three `??` chains written three times is exactly how a room ends up with English cues
 * over a Portuguese answer — the defect this whole field exists to close.
 *
 * `declared` absent ⟺ the thread never chose (`Thread.language`); `ownerDefault` absent ⟺ the account
 * never chose, or the session could not be resolved at all. `resolveLanguage` decides the last step,
 * so an unknown locale has ONE landing place for the whole daemon.
 */
export function resolveThreadLanguage(declared: Language | null | undefined, ownerDefault: Language | null | undefined): CatalogLanguage {
	return resolveLanguage(declared ?? ownerDefault)
}
