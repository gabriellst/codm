# StatCard — shared Stat card (design + UI Composition)

## Context
The bk-dash dashboard renders a grid of Stat cards (Lucro, Faturamento, Custos Totais, Taxas,
Margem, Anúncios, CPA, ROI, ROAS, C. de Produto, Pedidos, Ticket Médio, Unidades Vendidas).
They share **one shape**; only the highlighted card (Lucro) recolors its whole surface **by sign**.
Two outliers — Custos Adicionais (cost list) and Meta de Faturamento (radial gauge) — are separate
components that reuse the same atoms and are **out of scope here**. StatCard will also be reused
outside the dashboard, so it is a **shared component** (`@/components/StatCard`).

## Goal
A shared, composable `StatCard` built from primitives, covered by Storybook. No god-component:
the heterogeneous bits (label adornment, top-right actions) are `ReactNode` slots.

## Decisions
- **Shared** (`@/components/StatCard`) — ≥2 consumers (dashboard grid + future analytics/finance screens).
- **`tone` CVA** (`default | positive | negative`) — token-based (`--card` / `--success` / `--destructive`);
  **sign-driven** and applied **only on the highlighted card** (others stay `default`).
- **Slots**: `adornment` (label-side: InfoHint / PlatformBadge / StatusPill) and `actions` (top-right buttons).
  **Props**: `icon, label, value (pre-formatted), deltaPct`.
- **New primitives**: `GradientIconBadge`, `MetricDelta`, `InfoHint` (all `@/components/ui/`).
- Children adapt on a tinted surface via `onColor` (badge inverts; delta + text use `currentColor`/foreground).

## Acceptance Criteria
- AC-1 StatCard is composed only of primitives/atoms; **no color literals** — only tokens.
- AC-2 `tone` recolors the surface; children adapt (`GradientIconBadge onColor`, `MetricDelta onColor`, label via foreground/opacity).
- AC-3 `deltaPct` sign drives `MetricDelta` arrow (↗/↘) + color (`text-success`/`text-destructive`).
- AC-4 `adornment` and `actions` are `ReactNode` slots (no boolean soup).
- AC-5 Storybook stories cover: Default, Positive(highlight), Negative(highlight), WithInfo, WithActions, WithPlatformBadge, CountValue, and a Grid sample.
- AC-6 `GradientIconBadge`, `MetricDelta`, `InfoHint` each have their own story.

## UI Composition

### Component Contract (shared component — no route)
Not a route → no URL/search params. Public API:

- **Path:** `@/components/StatCard` (shared, Tier 2)
- **Props:**
  - `icon` — `ComponentType` — badge icon (custom icon or Tabler)
  - `label` — `string` — metric name ("C. de Produto")
  - `value` — `string` — **pre-formatted** ("R$ 3.989,61", "34,6%", "91")
  - `deltaPct?` — `number` — fraction (`0.52` → +52%); omit to hide delta
  - `tone?` — `'default' | 'positive' | 'negative'` — surface recolor (default `default`)
  - `adornment?` — `ReactNode` — label-side slot (InfoHint / PlatformBadge / StatusPill)
  - `actions?` — `ReactNode` — top-right slot (Button group)
- **errorComponent:** n/a (presentational)

### ASCII Layout Map

```text
┌──────────────────────────────────────────────────────────┐
│ StatCard                                  [actions slot]  │
│  ┌──────────┐                                             │
│  │ Gradient │   <label> [adornment slot]                  │
│  │ IconBadge│   <value>   MetricDelta                     │
│  └──────────┘                                             │
└──────────────────────────────────────────────────────────┘

Slots (consumer-provided ReactNode):
  adornment  ── InfoHint | PlatformBadge | StatusPill
  actions    ── <Button variant=outline size=icon> group (edit / refresh+add / swap)
```

### Component Tree

```text
StatCard                                            (Component, shared @/components/StatCard)
├─ GradientIconBadge                                (Primitive, @/components/ui — NEW)
├─ Label                                            (text, inside StatCard)
│  └─ {adornment}                                   (ReactNode slot)
│     ├─ InfoHint                                   (Primitive, @/components/ui — NEW)
│     ├─ PlatformBadge                              (consumer-provided; not part of StatCard)
│     └─ StatusPill                                 (consumer-provided; not part of StatCard)
├─ Value                                            (text, inside StatCard)
├─ MetricDelta                                      (Primitive, @/components/ui — NEW)
└─ {actions}                                        (ReactNode slot → Button group, reuse)
```

### Component Anatomy

**`StatCard`** (Component)

```text
┌──────────────────────────────────────────────────┐
│ ╭───╮  C. de Produto             [ ↻ ] [ + ]      │
│ │ $ │  R$ 3.989,61   ↗ +52%                       │
│ ╰───╯                                             │
└──────────────────────────────────────────────────┘
```

```text
StatCard
└─ Card  [primitive: Card]  [relative, flex row items-center gap-4, p-5; tone via cva className]
   ├─ Actions: absolute right-4 top-4, flex gap-1.5  →  {actions}  (rendered only if provided)
   ├─ IconBadge: GradientIconBadge  [primitive: GradientIconBadge]  (onColor = tone≠default)
   └─ Body: flex flex-col gap-1, min-w-0
      ├─ Header: flex items-center gap-1.5
      │  ├─ Label: text-sm  (truncate; text-muted-foreground OR opacity-90 when onColor)
      │  └─ {adornment}  (ReactNode slot)
      └─ ValueRow: flex items-baseline gap-2
         ├─ Value: text-2xl font-bold  (inherits card foreground)
         └─ Delta: MetricDelta  [primitive: MetricDelta]  (onColor = tone≠default)
```

Variants (CVA `tone`):
- `default` → `bg-card text-card-foreground ring-1 ring-border/50` (Card defaults)
- `positive` → `bg-success text-success-foreground ring-0`
- `negative` → `bg-destructive text-destructive-foreground ring-0`

States:
- skeleton: caller swaps the card body for a `Skeleton` block (StatCard stays presentational)
- empty: never — a Stat always has a value (zero rendered)

**`GradientIconBadge`** (Primitive — NEW)

```text
╭───────╮      outer halo (rounded-full)
│ ╭───╮ │      inner disc (rounded-full, bkdash-purple gradient)
│ │ $ │ │      GradientIcon (icon), text-primary-foreground
│ ╰───╯ │
╰───────╯
```

```text
GradientIconBadge
└─ Halo: span rounded-full size-12, centered  [cva tone]
   └─ Disc: span rounded-full size-9, shadow-sm  [cva tone]
      └─ Icon: GradientIcon  [primitive: GradientIcon]  (size-5)
```

Variants:
- `onColor=false` (default): Halo `bg-bkdash-purple/15`, Disc purple gradient, Icon `text-primary-foreground`
- `onColor=true`: Halo `bg-current/15`, Disc `bg-current/25`, Icon `text-current` (white-on-tint, inherits card foreground)

**`MetricDelta`** (Primitive — NEW)

```text
↗ +52%      (positive → text-success)
↘ -10%      (negative → text-destructive)
```

```text
MetricDelta
└─ span inline-flex items-center gap-0.5, text-sm font-medium
   ├─ Arrow: IconTrendingUp | IconTrendingDown  [tabler]  (size-4)
   └─ Pct: "{sign}{round(pct*100)}%"
```

Variants:
- positive (`pct ≥ 0`) → `text-success` + ↗ ; negative → `text-destructive` + ↘
- `onColor=true` → `text-current` (on a tinted card the surface already carries the color)

**`InfoHint`** (Primitive — NEW)

```text
(i)   ⟵ hover → tooltip
```

```text
InfoHint
└─ Tooltip  [primitive: Tooltip]
   ├─ TooltipTrigger: button aria-label  →  InfoIcon  [icon, size-3.5, text-current/60]
   └─ TooltipContent: {children}  (tooltip text — caller passes translated string)
```

### Data Cards

| Name | Role | Renders | Data | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|
| StatCard | Component | once (N in grid) | props from consumer | — | create-new-shared | `@/components/StatCard/index.tsx` | /component |
| GradientIconBadge | Primitive | once | props | — | create (primitive) | `@/components/ui/gradient-icon-badge.tsx` | /primitive |
| MetricDelta | Primitive | once | props | — | create (primitive) | `@/components/ui/metric-delta.tsx` | /primitive |
| InfoHint | Primitive | once | props | — | create (primitive) | `@/components/ui/info-hint.tsx` | /primitive |

**Per-node notes:**
- **StatCard:** ARIA: none special (label/value are text). Rationale: one shape reused by 13 Stat cards + other screens; heterogeneous bits are slots. `tone` is set by the consumer from the metric sign **only on the highlighted card**.
- **GradientIconBadge:** ARIA: `aria-hidden` (decorative). Reusable across orders/products/etc.
- **MetricDelta:** delta % formatted here (round to integer %); sign drives arrow + token color.
- **InfoHint:** `aria-label` defaults to "Info"; consumers pass a translated label when needed.

### Reuse Summary
- **Reuse (no work):** `Card`, `Button` (`outline`/`icon`), `Tooltip`, `GradientIcon`, icon set (`CurrencyMoney/Lock/Percentage/Megaphone/Bag/Ticket/Cart/AddUser/BarGraph/Info/Pencil/Refresh/Plus/ArrowDownUp`), Tabler `IconTrendingUp/Down`.
- **Create new shared:** `StatCard` — consumers: `routes/(app)/dashboard` (Stat grid, ~13×) **and** future finance/analytics screens; props are generic (icon/label/value/delta/tone/slots), no domain coupling.
- **Create primitive:** `GradientIconBadge`, `MetricDelta`, `InfoHint` — design-system atoms reused beyond StatCard.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /primitive | GradientIconBadge | `@/components/ui/gradient-icon-badge.tsx` | + Storybook story |
| 2 | /primitive | MetricDelta | `@/components/ui/metric-delta.tsx` | + story |
| 3 | /primitive | InfoHint | `@/components/ui/info-hint.tsx` | + story |
| 4 | /component | StatCard | `@/components/StatCard/index.tsx` | composes 1–3 + Card/Button; tone cva |
| 5 | (storybook) | StatCard.stories | `@/components/StatCard/StatCard.stories.tsx` | Default/Positive/Negative/WithInfo/WithActions/WithPlatformBadge/Count/Grid |

### Open Questions
- OQ-1. `PlatformBadge` (Anúncios → Facebook "f") and `StatusPill` (Pedidos → "Todos com Custo ✓") are passed via the `adornment` slot. Promote to shared primitives if a 2nd consumer appears; for now they're composed at the call site. Proposed: keep out of StatCard.
- OQ-2. The 2 outliers (`AdditionalCostsCard`, `GoalCard`) reuse `GradientIconBadge` + `Card` but own their body — separate `/component` tasks, not StatCard variants.
