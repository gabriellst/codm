/** ~200 wpm, derived from the post's raw MDX body — never a hand-typed "6 min" per post. */
export function readingTimeMinutes(body: string | undefined): number {
	const words = (body ?? '').trim().split(/\s+/).filter(Boolean).length
	return Math.max(1, Math.round(words / 200))
}
