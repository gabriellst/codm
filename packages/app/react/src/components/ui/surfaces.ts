/**
 * Two load-bearing surface patterns shared across the design system.
 *
 * CODM is flat: surfaces are solid fills with a single hairline border — no
 * gloss, no gradient. Redefining these two presets re-skins every consumer
 * (Card, Popover, Sheet, Tooltip, Select, Dropdown, Combobox, Calendar,
 * DataTable, secondary Button, …) in one place.
 *
 * `surface` — static elevated content surface (white card + hairline).
 * `trigger` — interactive clickable surface (same, lifts to muted on hover).
 *
 * Each pattern exports granular pieces (`*Bg`, `*Border`, `*Hover`) for consumers
 * that compose with focus/data-* variants, plus a ready composite.
 */

// ──────────────────────────────────────────────
// surface — static elevated content
// ──────────────────────────────────────────────

export const surfaceBg = 'bg-card'

export const surfaceBorder = 'border border-border'

export const surface = 'bg-card border border-border'

// ──────────────────────────────────────────────
// trigger — interactive clickable surface
// ──────────────────────────────────────────────

export const triggerBg = 'bg-background'

export const triggerBorder = 'border border-border'

// D2 — the reference measures every plain list-row/trigger hover at a flat neutral tint
// (`background:#f4f4f4`/`#f2f2f2`), which is exactly what the dedicated `--hover` token already
// renders (`oklch(from var(--foreground) l c h / 0.05)` ≈ #f2f2f2) — closer in intent than
// `--muted` (a fill token, not a hover token) even though the two are numerically near-identical.
export const triggerHover = 'hover:bg-hover'

export const trigger = 'bg-background border border-border hover:bg-hover'
