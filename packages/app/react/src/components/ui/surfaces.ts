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

// ──────────────────────────────────────────────
// row — interactive CONTENT-list row (workspace / channel / issue / agent-session rows)
// ──────────────────────────────────────────────

// D2 — the reference's bordered content rows hover to a distinct pastel green
// (`background:#F7FBEF;border-color:#d8ecb4` — tokens.css `--hover-accent`/`--hover-accent-border`),
// lighter/cooler than the selected-active `--secondary` pastel (#EAF6D3) and a different hue family
// entirely from the neutral `trigger`/`--hover` above. Use `row` for any row that IS a piece of
// primary list content (not a menu/table/utility row — that's still `trigger`). The pairing is load-
// bearing: a content row's background and border move TOGETHER on hover, never background alone —
// compose from here instead of hand-picking one or the other, which is how this drifted before.
//
// GROUP CONVENTION: put `group` on the row root alongside these classes. The row's own bg/border
// react via the plain `hover:` already baked into `row` (they live on the group root itself); any
// DESCENDANT that should echo the row's hover (a trailing chevron, a secondary icon) reacts via
// `group-hover:*` instead of its own `hover:`, so the whole row moves as one unit. See
// `components/console/IssueRow.tsx` for the canonical example.
// CORREÇÃO (founder, 07/08/2026) — duas coisas mudaram aqui.
// 1. A borda de hover usava `hover:border-hover-accent`, que é o token da SUPERFÍCIE (#F7FBEF,
//    quase branco): a borda praticamente sumia no hover em vez de acompanhar. Era exatamente o
//    drift que o parágrafo acima adverte, com o código contradizendo o próprio comentário.
// 2. A borda passa a ser o verde de marca CHEIO (`--primary`, #76C410), não o pastel
//    `--hover-accent-border` (#d8ecb4) que o D2 media — decisão do founder: o contorno é a
//    afordância da linha e precisa ler como ação, não como sombra.
// O fundo segue em `--hover-accent`: o par continua se movendo junto, só que agora com contraste.
export const rowBorder = 'border border-border'

export const rowHover = 'hover:bg-hover-accent hover:border-primary'

export const row = 'border border-border transition-colors hover:bg-hover-accent hover:border-primary'

// ──────────────────────────────────────────────
// alert — the "precisa de você" dark surface (D2)
// ──────────────────────────────────────────────

// Near-black fill + success-bright accents: the reference's single highest-emphasis surface.
// Shared by the dashboard's needs-you callout AND the in-thread stop panel — same composition, two
// different data shapes (a thread-level summary vs. a list of one thread's active stops). Import
// these instead of re-deriving "black panel, bright-green action" per screen — that duplication is
// exactly why the two panels drifted apart (founder note, D2 redesign audit).
export const alertSurface = 'bg-foreground text-background'

export const alertActionButton = 'bg-success-bright text-success-bright-foreground hover:bg-success-bright/90'
