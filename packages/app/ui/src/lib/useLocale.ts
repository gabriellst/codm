import { useTranslation } from 'react-i18next'
import type { Locale } from './locale'

/**
 * The active {@link Locale} inferred from i18n (`en*` → `en-US`, otherwise `pt-BR`).
 * Single source for locale-aware number/date formatting — used by {@link useMoney}
 * and any component that formats with `Intl` / `toLocaleString`.
 */
export function useLocale(): Locale {
	const { i18n } = useTranslation()
	return i18n.language?.startsWith('en') ? 'en-US' : 'pt-BR'
}
