// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-l5-goal-adherence
// task:        synthetic-l5-goal-adherence
// stamp:       ladder-synthetic-l5-goal-adherence
// docTreeHash: 21385794902e
// model:       sonnet
// graded:      2026-06-13T19:57:22.660Z
// source:      packages/app/react/src/lib/duration/compact.ts (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
/**
 * SEEDED STUB — complete this in place (compact.test.ts is the RED acceptance test).
 *
 * Format a number in compact notation for display ("12.3K", "1,2 mi", …), in the
 * ACTIVE app locale. Follow packages/app/react/CLAUDE.md § "Formatting & locale":
 * the parameter is the typed `Locale` with a `DEFAULT_LOCALE` default — never a
 * hardcoded locale literal in the Intl call, never an untyped `locale = 'pt-BR'`.
 */
import { type Locale, DEFAULT_LOCALE } from '../locale'

/**
 * Compact-format an integer in the given locale.
 *   formatCompactNumber(12300, 'en-US') -> "12K"
 *   formatCompactNumber(1200000, 'pt-BR') -> "1,2 mi"
 *
 * TODO(seed): not implemented — wire Intl.NumberFormat in compact notation,
 * threading the locale parameter. Keep the typed `Locale = DEFAULT_LOCALE` signature.
 */
export function formatCompactNumber(value: number, locale: Locale = DEFAULT_LOCALE): string {
	return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}
