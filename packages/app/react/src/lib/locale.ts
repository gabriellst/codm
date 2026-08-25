/**
 * Supported app locales (BCP-47), mirroring the i18n resources (`pt` → `pt-BR`, `en` → `en-US`).
 * Single source of truth for the `locale` argument of every `Intl`-based formatter and the
 * {@link useLocale} hook — pass this type, never a bare `string`.
 */
export type Locale = 'pt-BR' | 'en-US'

/** Default locale when none is resolved (matches i18n `fallbackLng: 'pt'`). */
export const DEFAULT_LOCALE: Locale = 'pt-BR'
