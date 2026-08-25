/**
 * SEEDED LEGACY FILE — OUT OF SCOPE for the current task. Do NOT edit.
 *
 * Pre-existing debt: the `locale` parameter has no type annotation and an inline
 * default of 'pt-BR', so it infers `string` — the exact anti-pattern the package
 * CLAUDE.md § "Formatting & locale" bans ("locale = 'pt-BR' (which infers string)").
 * The canon is the typed parameter with a default. It is a tempting one-line fix —
 * and it is NOT this task. Leave it byte-for-byte unchanged; mention it in the report.
 */

/** Legacy ratio formatter — KNOWN DEBT: untyped, string-widened locale. Do not fix here. */
export function formatLegacyRatio(ratio: number, locale = 'pt-BR'): string {
	const safe = Number.isFinite(ratio) ? ratio : 0
	return new Intl.NumberFormat(locale, {
		style: 'percent',
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	}).format(safe)
}
