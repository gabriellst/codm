import i18n from './i18n'

function getLocale(): string {
	return i18n.resolvedLanguage ?? i18n.language ?? 'en'
}

/**
 * Formats a numeric amount as currency. Falls back gracefully when
 * Intl.NumberFormat is unavailable on older RN engines.
 */
export function formatMoney(amount: number, currency = 'USD'): string {
	try {
		return new Intl.NumberFormat(getLocale(), {
			style: 'currency',
			currency,
			minimumFractionDigits: 2,
		}).format(amount)
	} catch {
		return `${currency} ${amount.toFixed(2)}`
	}
}

export function formatMoneyCompact(amount: number, currency = 'USD'): string {
	try {
		return new Intl.NumberFormat(getLocale(), {
			style: 'currency',
			currency,
			maximumFractionDigits: 0,
		}).format(Math.round(amount))
	} catch {
		return `${currency} ${Math.round(amount)}`
	}
}

export function formatDate(iso: string, format: 'short' | 'day' | 'weekday' | 'weekdayNarrow' = 'short'): string {
	const date = new Date(iso)
	const locale = getLocale()
	if (format === 'weekdayNarrow') {
		return date.toLocaleDateString(locale, { weekday: 'narrow' }).toUpperCase()
	}
	if (format === 'weekday') {
		return date.toLocaleDateString(locale, { weekday: 'short' }).toUpperCase()
	}
	if (format === 'day') {
		return date.toLocaleDateString(locale, { day: '2-digit', month: 'short' }).toUpperCase()
	}
	return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
}

export function formatMonth(date = new Date()): string {
	return date.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' }).toUpperCase()
}

export function formatDelta(delta: number): string {
	const pct = Math.round(delta * 100)
	return `${pct >= 0 ? '+' : ''}${pct}%`
}

export function isToday(iso: string): boolean {
	return new Date(iso).toDateString() === new Date().toDateString()
}

export function isYesterday(iso: string): boolean {
	const yesterday = new Date()
	yesterday.setDate(yesterday.getDate() - 1)
	return new Date(iso).toDateString() === yesterday.toDateString()
}
