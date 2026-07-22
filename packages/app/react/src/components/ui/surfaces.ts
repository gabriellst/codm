/**
 * Two load-bearing gradient surface patterns shared across the design system.
 *
 * `surface` — flat elevated content surface. Use for: Card, Popover, Sheet,
 * Tooltip, Combobox popup, Calendar body, DataTable wrapper, and any other
 * non-interactive surface that floats above the page.
 *
 * `trigger` — interactive clickable surface (slightly more contrast at the top
 * via a stronger color-mix, plus `hover:brightness-90`). Use for: Button
 * secondary, Select trigger, Combobox chip, and any other "clickable surface"
 * that opens / activates something.
 *
 * Each pattern exports:
 *   - granular pieces (`*Bg`, `*Border`, `*Hover`) for cases where consumers
 *     compose with other classes (e.g. focus/data-* variants).
 *   - a composite (`surface`, `trigger`) that already includes `gradient-box` —
 *     drop straight into `cn(...)`.
 *
 * IMPORTANT: each constant must be a COMPLETE static string. Tailwind's content
 * scanner doesn't see classes built at runtime via template-literal
 * concatenation, so variant prefixes can't be added later — bake them in here.
 */

// ──────────────────────────────────────────────
// surface — static elevated content
// ──────────────────────────────────────────────

export const surfaceBg = 'gradient-bg-[var(--background)_0,color-mix(in_oklab,var(--background),var(--foreground)_8%)_100%]'

export const surfaceBorder = 'gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0.035)_86%]'

export const surface =
	'gradient-box gradient-bg-[var(--background)_0,color-mix(in_oklab,var(--background),var(--foreground)_8%)_100%] gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0.035)_86%]'

// ──────────────────────────────────────────────
// trigger — interactive clickable surface
// ──────────────────────────────────────────────

export const triggerBg =
	'gradient-bg-[color-mix(in_oklab,var(--background),var(--foreground)_11%)_-15%,color-mix(in_oklab,var(--background),var(--foreground)_3%)_125%]'

export const triggerBorder = 'gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0.035)_86%]'

export const triggerHover = 'hover:brightness-90'

export const trigger =
	'gradient-box gradient-bg-[color-mix(in_oklab,var(--background),var(--foreground)_11%)_-15%,color-mix(in_oklab,var(--background),var(--foreground)_3%)_125%] gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0.035)_86%] hover:brightness-90'
