/** Time-of-day greeting shown above the Home masthead. */
export function greeting(now: Date = new Date()): string {
	const h = now.getHours()
	if (h < 12) return 'Good morning'
	if (h < 18) return 'Good afternoon'
	return 'Good evening'
}

/** Compact relative time ("2 min ago", "3 h ago") from an ISO string or Date. */
export function relativeTime(value: string | Date, now: Date = new Date()): string {
	const then = typeof value === 'string' ? new Date(value) : value
	const secs = Math.round((now.getTime() - then.getTime()) / 1000)
	if (!Number.isFinite(secs)) return ''
	if (secs < 60) return 'just now'
	const mins = Math.round(secs / 60)
	if (mins < 60) return `${mins} min ago`
	const hrs = Math.round(mins / 60)
	if (hrs < 24) return `${hrs} h ago`
	const days = Math.round(hrs / 24)
	return `${days} d ago`
}
