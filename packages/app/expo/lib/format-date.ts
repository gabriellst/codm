import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { enUS, ptBR, type Locale } from 'date-fns/locale'
import type { TFunction } from 'i18next'

const LOCALES: Record<string, Locale> = {
	en: enUS,
	pt: ptBR,
}

function resolveLocale(language: string): Locale {
	const lang = language.slice(0, 2).toLowerCase()
	return LOCALES[lang] ?? enUS
}

interface FormatRelativeArgs {
	/** ISO 8601 date string (e.g. `2026-05-04` or full ISO timestamp). */
	isoDate: string
	/** `useTranslation().t`, used for "Today" / "Yesterday" labels. */
	t: TFunction
	/** Current i18n language (`useTranslation().i18n.language`). Defaults to `en`. */
	language?: string
	/** Override "now" (test seam). Defaults to `new Date()`. */
	now?: Date
}

/**
 * Locale-aware history-row label.
 *
 *   • Today's date → `t('common.today')` ("Today" / "Hoje").
 *   • Yesterday    → `t('common.yesterday')` ("Yesterday" / "Ontem").
 *   • Anything else → `EEE · d MMM` formatted via date-fns with the
 *     locale matching the i18next language (e.g. `Mon · 5 May`,
 *     `Seg · 5 mai`).
 *
 * The API never returns formatted display strings — it ships the raw
 * `isoDate` and the client formats per locale here.
 */
export function formatRelativeHistoryDate({ isoDate, t, language = 'en', now = new Date() }: FormatRelativeArgs): string {
	const date = parseISO(isoDate)
	const diff = differenceInCalendarDays(now, date)
	if (diff === 0) return t('common.today')
	if (diff === 1) return t('common.yesterday')
	return format(date, 'EEE · d MMM', { locale: resolveLocale(language) })
}

/**
 * Localized short date label used as the home-screen eyebrow
 * (e.g. `WED · 5 MAY`, `QUA · 5 MAIO`). Eyebrow already uppercases
 * via CSS so the locale's natural casing is fine.
 */
export function formatEyebrowDate(language: string, now = new Date()): string {
	return format(now, 'EEE · d MMM', { locale: resolveLocale(language) })
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening'

/**
 * Maps the local hour to a greeting bucket. Boundaries follow the common
 * ranges: morning 5–11, afternoon 12–17, everything else evening (so late
 * night and pre-dawn fall into "evening" rather than introducing a fourth
 * bucket the design doesn't have a copy for).
 */
export function resolveTimeOfDay(now = new Date()): TimeOfDay {
	const hour = now.getHours()
	if (hour >= 5 && hour < 12) return 'morning'
	if (hour >= 12 && hour < 18) return 'afternoon'
	return 'evening'
}

/**
 * Returns true when the given ISO date (`YYYY-MM-DD` or full timestamp)
 * falls on the current local calendar day. Calendar-day comparison —
 * ignores time-of-day so a workout finished at 23:59 and another at
 * 00:01 the next day are correctly classified as different days.
 */
export function isToday(isoDate: string, now = new Date()): boolean {
	return differenceInCalendarDays(now, parseISO(isoDate)) === 0
}

export interface DayGroup<T> {
	/** YYYY-MM-DD bucket key — stable React list key. */
	key: string
	/** Localized header label (Today / Yesterday / Wed · 5 May). */
	label: string
	items: T[]
}

/**
 * Buckets a date-sorted feed into per-calendar-day groups while preserving
 * the input order within each group. Used by both the home recent-activity
 * list and the history tab so a day with multiple sessions collapses under
 * a single date header instead of repeating the date on every row.
 *
 * The header label is derived client-side from `isoDate` via the supplied
 * `formatLabel` callback — the API used to ship a pre-formatted
 * `dateRelative` string but it was hard-coded pt-BR; we now format here
 * with date-fns + the active i18n locale.
 */
export function groupByDay<T extends { isoDate: string }>(items: T[], formatLabel: (isoDate: string) => string): DayGroup<T>[] {
	const groups: DayGroup<T>[] = []
	const indexByKey = new Map<string, number>()
	for (const item of items) {
		const key = item.isoDate.slice(0, 10)
		const existing = indexByKey.get(key)
		if (existing !== undefined) {
			groups[existing]!.items.push(item)
			continue
		}
		indexByKey.set(key, groups.length)
		groups.push({ key, label: formatLabel(item.isoDate), items: [item] })
	}
	return groups
}
