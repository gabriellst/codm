/**
 * Money formatting for display strings. Components render money by passing a Money
 * (cents + currency) to the useMoney() hook — they never pick a currency or a locale.
 * Money on the wire is always single-currency (converted server-side).
 */
// Money is defined locally as a structural type matching the SDK wire shape.
import { type Locale, DEFAULT_LOCALE } from './locale'

/** Money value type: cents + ISO 4217 currency code. Matches the SDK wire shape. */
export interface Money {
	amountCents: number
	currency: string
}

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

/**
 * Format a duration in seconds for display: in pt-BR, `45` -> "45 seg", `1847` -> "31 min", `9000` -> "3 h".
 *
 * ONE unit, chosen so the number stays readable — a stat card shows how long something took, not a
 * stopwatch reading, and "1847 s" is a number the reader has to convert before it means anything.
 *
 * The unit word comes from `Intl`, not from an i18n key, because the unit is PART of the number's
 * formatting in every locale it has to survive — concatenating a translated "min" onto a formatted
 * numeral is how you end up with a string that is right in one language and wrong in the next.
 */
export function formatDurationSeconds(seconds: number, locale: Locale = DEFAULT_LOCALE): string {
	const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
	// Thresholds sit above the round unit (90, not 60) so a value just past the boundary reads as
	// "75 s" rather than snapping to a lossy "1 min".
	const scale =
		safe < 90
			? { value: safe, unit: 'second' as const }
			: safe < 90 * 60
				? { value: safe / 60, unit: 'minute' as const }
				: { value: safe / 3600, unit: 'hour' as const }
	return new Intl.NumberFormat(locale, {
		style: 'unit',
		unit: scale.unit,
		unitDisplay: 'short',
		maximumFractionDigits: 0,
	}).format(scale.value)
}

/**
 * O HORÁRIO LOCAL CURTO de um instante ISO — `"2026-08-08T08:25:00.000Z"` → `"05:25"` em pt-BR,
 * `"05:25 AM"` em en-US.
 *
 * A hora é a única parte que interessa a quem lê uma linha de conversa: o dia já é dado pela posição
 * dela na transcrição. O formato (24h ou AM/PM, separador) é decisão do LOCALE, nunca desta função —
 * é exatamente por isso que ela recebe um `Locale` tipado em vez de chamar `toLocaleTimeString()`
 * sem argumento e herdar o do sistema operacional, que não é o do app.
 *
 * Um valor que não é um instante volta como veio: uma transcrição não pode deixar de renderizar
 * porque uma linha trouxe algo que `Date` não sabe ler — degradação, nunca exceção (`Intl` lança
 * `RangeError` num `Invalid Date`).
 */
export function formatTimeOfDay(iso: string, locale: Locale = DEFAULT_LOCALE): string {
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return iso
	return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
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
