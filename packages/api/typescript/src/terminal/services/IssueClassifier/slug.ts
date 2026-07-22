/** Turn a free-text issue title into a URL-safe slug (`"Pix payment bug" → "pix-payment-bug"`). */
export function slugify(text: string): string {
	const slug = text
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)
		.replace(/-+$/g, '')
	return slug || 'issue'
}

/**
 * A slug key UNIQUE within a thread — the invariant the modeling states for an issue key ("unique
 * per thread, e.g. 'coupon-focus'"). Collisions get a numeric suffix (`pix-payment` → `pix-payment-2`).
 */
export function uniqueSlugKey(title: string, existingKeys: readonly string[]): string {
	const base = slugify(title)
	if (!existingKeys.includes(base)) return base
	let n = 2
	while (existingKeys.includes(`${base}-${n}`)) n++
	return `${base}-${n}`
}
