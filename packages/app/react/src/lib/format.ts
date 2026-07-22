/**
 * Money formatting for display strings. Components render money by passing a Money
 * (cents + currency) to the useMoney() hook — they never pick a currency or a locale.
 * Money on the wire is always single-currency (converted server-side).
 */
// Money is defined locally as a structural type matching the SDK wire shape.
import { type Locale, DEFAULT_LOCALE } from './locale'

/** Money value type: cents + ISO 4217 currency code. Matches the SDK wire shape. */
export interface Money { amountCents: number; currency: string }

/** Format a single-currency money value (cents) in the given locale: {1234,'BRL'} -> "R$ 12,34". */
export function formatMoney(money: Money, locale: Locale = DEFAULT_LOCALE): string {
	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency: money.currency,
		minimumFractionDigits: 2,
	}).format(money.amountCents / 100)
}

/** Sum same-currency money values into one Money carrying the shared currency. */
export function sumMoney(items: Money[]): Money {
	if (items.length === 0) return { amountCents: 0, currency: 'BRL' }
	return { amountCents: items.reduce((acc, m) => acc + m.amountCents, 0), currency: items[0]!.currency }
}

/** Format a ratio (0..1) as a percent string, one decimal, pt-BR by default: 0.75 -> "75,0%". */
export function formatPercent(ratio: number, locale: Locale = DEFAULT_LOCALE, fractionDigits = 1): string {
	const safe = Number.isFinite(ratio) ? ratio : 0
	return new Intl.NumberFormat(locale, {
		style: 'percent',
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	}).format(safe)
}
