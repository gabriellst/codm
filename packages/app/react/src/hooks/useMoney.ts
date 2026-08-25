import { useCallback } from 'react'
import type { Money } from '@/lib/format'
import { formatMoney } from '@/lib/format'
import { useLocale } from './useLocale'

/**
 * Returns a money formatter bound to the active locale (inferred from i18n via {@link useLocale}).
 * Encapsulates locale inference so components just pass a Money and get a finished string.
 */
export function useMoney() {
	const locale = useLocale()
	return useCallback((money: Money) => formatMoney(money, locale), [locale])
}
