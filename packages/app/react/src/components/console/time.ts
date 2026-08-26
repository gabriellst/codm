/**
 * Time-of-day and relative-time wording — as i18n KEYS, never as sentences.
 *
 * D5: these two used to `return 'Good morning'` and `` return `${mins} min ago` ``, which is how an
 * English greeting ended up on top of an otherwise Portuguese home screen. They are pure and testable
 * and the fix keeps them so: they decide WHICH string, the caller's `t()` decides what it says.
 * Returning a key rather than calling `t()` here also means changing language re-renders the greeting,
 * which a string resolved inside this module would not.
 *
 * The keys are written as literals so the i18n-coherence gate can see them referenced in source.
 */

export type GreetingKey = 'time.goodMorning' | 'time.goodAfternoon' | 'time.goodEvening'

/** Time-of-day greeting shown above the Home masthead. Use as `t(greetingKey())`. */
export function greetingKey(now: Date = new Date()): GreetingKey {
	const h = now.getHours()
	if (h < 12) return 'time.goodMorning'
	if (h < 18) return 'time.goodAfternoon'
	return 'time.goodEvening'
}

/** A relative time as key + count, for `t(key, { count })`. */
export interface RelativeTime {
	key: 'time.justNow' | 'time.minutesAgo' | 'time.hoursAgo' | 'time.daysAgo'
	count: number
}

/** Compact relative time ("2 min atrás", "3 h atrás") from an ISO string or Date. */
export function relativeTime(value: string | Date, now: Date = new Date()): RelativeTime {
	const then = typeof value === 'string' ? new Date(value) : value
	const secs = Math.round((now.getTime() - then.getTime()) / 1000)
	// An unparseable date reads as "just now" rather than as an empty string: this renders in a
	// timestamp slot, where a blank looks like a broken component and a recent time looks like data.
	if (!Number.isFinite(secs) || secs < 60) return { key: 'time.justNow', count: 0 }
	const mins = Math.round(secs / 60)
	if (mins < 60) return { key: 'time.minutesAgo', count: mins }
	const hrs = Math.round(mins / 60)
	if (hrs < 24) return { key: 'time.hoursAgo', count: hrs }
	return { key: 'time.daysAgo', count: Math.round(hrs / 24) }
}
