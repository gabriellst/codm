# Pixel Funnel Section — Design Spec

> Status: draft · Date: 2026-06-03 · Surface: `packages/app/react` (dashboard)
> Backend contract: **frozen** — `GetPixelFunnel` (`GET /v1/tracking/funnel`) already exists.

## Context

The dashboard (`/(app)/dashboard/`) is currently a mock shell. The first real region to land
is the **pixel conversion funnel** — a **single integrated card**: a row of funnel stages
(Page View → Purchase) separated by vertical dividers, plus a right-hand summary rail (conversion
rate + abandoned-cart value) split by a horizontal divider. A faint background grid sits behind it.

The backend query is already implemented (faker body, real contract):

- **Hook:** `useGetPixelFunnel` from `@template/client-typescript/typescript`
- **Input (FE-supplied):** `{ tenancyScope, startDate, endDate, productIds? }`
  (`storeId` / `storeIds` are injected server-side from session/membership ctx — the FE never sends them)
- **Output:**
  ```ts
  {
    hasPixel: boolean
    base: Metric                                 // unique sessions in period (the 100% denominator)
    steps: Record<PixelEventType, Metric>        // all 8 event types, keyed
    conversionRate: Metric                       // overall conversion (rail stat #1)
    carts: { count: Metric; value: Metric }      // abandoned carts (rail stat #2)
  }
  // Metric = { value: number; deltaPct: number | null }
  ```

## Problem

Turn the funnel screenshot into an architectural plan that downstream `/route`, `/component`,
and i18n work can execute without re-deriving the shape. **The whole funnel is one card** — stages
are columns inside it, not individual cards — so the Section owns the surface, the background grid,
and the separators; the Leaves are surfaceless.

## Goal

A single data-owning `PixelFunnelSection` (one `Card`) that:
1. Reads the date range from the URL and `tenancyScope` from the global `useTenancyStore`.
2. Fetches once via `useGetPixelFunnel`.
3. Renders a faint background grid + 5 funnel-stage **columns** separated by **vertical** `Separator`s.
4. Renders a right rail of 2 surfaceless stats separated by a **horizontal** `Separator`.
5. Handles `hasPixel === false` (no pixel connected) and loading inline.

## Decisions

- **D1 — Curated 5-stage subset.** The funnel displays an **ordered subset** of the 8 `PixelEventType`
  keys, derived from a typed constant (Open/Closed — no hardcoded JSX list):
  | Column label (screenshot) | `PixelEventType` key |
  |---|---|
  | Page View | `PAGE_VIEWED` |
  | View Content | `PRODUCT_VIEWED` |
  | Add to Cart | `PRODUCT_ADDED_TO_CART` |
  | Initiate Checkout | `CHECKOUT_STARTED` |
  | Purchase | `CHECKOUT_COMPLETED` |
  The 3 remaining keys (`PRODUCT_REMOVED_FROM_CART`, `CART_VIEWED`, `CHECKOUT_CONTACT_INFO_SUBMITTED`)
  are present in the response but **not displayed** in this view.
- **D2 — Percentage is relative to `base`.** Each stage's `%` = `steps[key].value / base.value`;
  the "X de Y" subtitle = `steps[key].value` de `base.value`.
- **D3 — One integrated card, columns not cards.** `PixelFunnelSection` is the **single `Card`**.
  Each stage is a **surfaceless column** (`FunnelStageColumn`, a `div`), and the Section renders a
  **vertical `Separator`** between consecutive columns and one before the rail. The rail's two stats
  are split by a **horizontal `Separator`**. No nested `Card`s anywhere inside.
- **D4 — Rail stats are route-local, reuse atoms (NOT `StatCard`).** The rail layout differs from
  `StatCard` (icon+label on the top row, value+delta on the row **below**, and no card surface), so
  `StatCard` is **not** reused. A route-local `FunnelSummaryStat` Leaf composes the shared atoms
  `GradientIconBadge` + `InfoHint` + `MetricDelta`.
- **D5 — Funnel shape: logarithmic attenuation.** The purple filled area behind each column is an
  inline `<svg><polygon>` whose left/right heights are a **log-attenuated** function of
  `thisPct`/`nextPct` (so 10–20% stages stay visibly tall instead of near-flat). Helper
  `attenuate(pct) = log scaling` (e.g. `Math.log1p(pct * k) / Math.log1p(k)`), clamped to `[0,1]`.
  Route-local inside the Leaf — **not** a `@/components/ui/` primitive.
- **D6 — Background grid.** A faint grid layer sits behind the content of the Section `Card`, at the
  **same opacity as the separators** (the `--border`/separator token). Absolute, `aria-hidden`,
  `pointer-events-none`, drawn with a repeating-linear-gradient (or thin border divs).
- **D10 — Carts currency from `GetUserInfo`.** The funnel response has **no** currency field. The
  carts value is formatted with the **active store's currency** read from
  `useGetUserInfo().current?.currency` (fallback `CurrencyCode.BRL` while loading / no active store).
  The shared `formatCurrency(value, currency)` util (in `@/lib/utils`) is currency-general over the
  whole `CurrencyCode` enum.
- **D7 — `deltaPct` null → no delta.** `MetricDelta` only renders when `deltaPct !== null`
  (map `null → undefined`). `MetricDelta.pct` is a **fraction** (`0.52 → +52%`) — see OQ-2.
- **D8 — `productIds` filter out of scope** for this iteration (no product picker in the screenshot).
- **D9 — `tenancyScope` is a global Zustand store.** `useTenancyStore` holds `scope: TenancyScope`,
  app-wide, **default `SINGLE_STORE`**, with a `setScope(scope)` action. It is **not** URL state (not
  bookmarkable) and **not** derived per-render — a future store-switcher sets it once and every
  tenancy-aware query refetches via its query key. Lives in the global stores dir
  (`@/stores/useTenancyStore.ts`), alongside `useDialogStore`. Consider `persist` so the choice
  survives refresh (OQ-1).

## User Stories

- **US-1** — As a store operator, I see how many sessions reach each funnel stage and the % drop-off,
  so I know where I lose customers.
- **US-2** — As an operator, I see my overall conversion rate and abandoned-cart value with
  period-over-period deltas.
- **US-3** — As an operator without a connected pixel, I see a clear "connect your pixel" empty state
  instead of zeros.
- **US-4** — As an operator, changing the dashboard date range refetches the funnel for that period.

## Acceptance Criteria

- **AC-1** — `PixelFunnelSection` owns the `useGetPixelFunnel` query; the route passes **no data props**.
- **AC-2** — Funnel stages are derived from a typed `FUNNEL_STAGES` constant + an i18n labels map
  (no hardcoded option list in JSX).
- **AC-3** — The funnel renders as **one `Card`** with 5 stage **columns** separated by vertical
  `Separator`s; the rail's two stats are separated by a horizontal `Separator`. **No nested cards.**
- **AC-4** — Each stage column shows: label, `%` (value/base), "value de base" subtitle, a sessions
  icon, and a **log-attenuated** descending area shape.
- **AC-5** — A faint background grid renders behind the card content at the same opacity as the
  separators, `aria-hidden`.
- **AC-6** — The rail uses a route-local `FunnelSummaryStat` (reusing `GradientIconBadge`/`InfoHint`/
  `MetricDelta`) for conversion rate (formatted `%`) and carts (formatted `R$`); `MetricDelta` shows
  only when `deltaPct !== null`.
- **AC-7** — `hasPixel === false` renders an `Empty` state with a connect-pixel CTA; `data === undefined`
  renders an inline skeleton; the card surface + grid stay visible.
- **AC-8** — All user-facing strings come from `t()` under a new `pixelFunnel` i18n namespace
  (`en.json` + `pt.json`).
- **AC-9** — The dashboard route declares `startDate` / `endDate` search params (Zod, `Date`); the
  section reads them via the route API and feeds them to the query.

## State Strategy

Three state sources, no `useState` for anything shareable:

| Concern | Source | Mechanism |
|---|---|---|
| Funnel data (server) | React Query / SDK | `useGetPixelFunnel({ tenancyScope, startDate, endDate })` — one call, cached/deduped by query key |
| Display currency | React Query / SDK | `useGetUserInfo().current?.currency` — the active store's currency (fallback `BRL` while loading) |
| `startDate` / `endDate` | **URL search params** | `routeApi.useSearch()` + `useRangeSearchParams` — bookmarkable, survives refresh |
| `tenancyScope` | **Global Zustand store** | `useTenancyStore(s => s.scope)` — default `SINGLE_STORE`, app-wide (D9) |

- **Fetch root:** `PixelFunnelSection` is the **sole data-fetching root**. It reads the store + URL,
  fires the single query, derives the curated `FUNNEL_STAGES` list, and passes plain values to Leaves.
- **Leaves never fetch.** `FunnelStageColumn` and `FunnelSummaryStat` are props-only (UIC-05).
- **Server-side scoping.** The FE sends `tenancyScope` (+ dates); the backend injects `storeId`/`storeIds`
  from session/membership ctx (`AuthAccountMiddleware` + `RequireStoreMember`). The FE never sends store IDs.
- **Reactivity.** Because `tenancyScope` and the dates are query-key inputs, a store-switcher or
  range-picker change triggers an automatic refetch — no manual invalidation needed.
- **Route is a thin shell** — declares the `startDate`/`endDate` search params and mounts the Section;
  no data props, no `isLoading` gating.

## UI Composition

### URL Contract

- **Path:** `/(app)/dashboard/` (existing route — this spec extends it; funnel is the first Section)
- **Breadcrumb:** `Dashboard` (`t('dashboard.breadcrumb')`)
- **Search params (Zod sketch):**
  - `startDate` — `z.coerce.date().optional()` — funnel period start (consumed by `useGetPixelFunnel`)
  - `endDate` — `z.coerce.date().optional()` — funnel period end
  - (defaults applied in the section when absent: last 30 days)
- **Loader:** none — the Section fetches client-side via React Query.
- **errorComponent:** `RouteError` (default).

> `tenancyScope` and `productIds` are **not** URL params. `tenancyScope` is global client state from
> `useTenancyStore` (D9); `productIds` is out of scope (D8).

### ASCII Layout Map

```text
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ DashboardRoute  (header: "Dashboard" + DateRange picker — route-shell static)           │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────────────────────────────────┐ │
│ │ PixelFunnelSection  (ONE Card; faint background grid behind all content)            │ │
│ │ ┌───────┬─┬───────┬─┬───────┬─┬───────┬─┬───────┐ ║ ┌───────────────────────────┐  │ │
│ │ │Funnel │┃│Funnel │┃│Funnel │┃│Funnel │┃│Funnel │ ║ │ FunnelSummaryStat (Conv.) │  │ │
│ │ │Stage  │┃│Stage  │┃│Stage  │┃│Stage  │┃│Stage  │ ║ ├───────────────────────────┤  │ │
│ │ │Column │┃│Column │┃│Column │┃│Column │┃│Column │ ║ │ ── horizontal Separator ──│  │ │
│ │ │(Leaf  │┃│       │┃│       │┃│       │┃│       │ ║ ├───────────────────────────┤  │ │
│ │ │ ×5)   │┃│       │┃│       │┃│       │┃│       │ ║ │ FunnelSummaryStat (Carts) │  │ │
│ │ └───────┴─┴───────┴─┴───────┴─┴───────┴─┴───────┘ ║ └───────────────────────────┘  │ │
│ │     (┃ = vertical Separator between columns)      (║ = vertical Separator to rail)  │ │
│ └───────────────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────┘

Overlays: none
```

### Component Tree

```text
DashboardRoute                                               (Route Shell)
└─ PixelFunnelSection                                        (Section, owns useGetPixelFunnel; ONE Card + grid)
   ├─ FunnelStageColumn                                      (Leaf ×5, props only — surfaceless column)
   ├─ FunnelSummaryStat  (Taxa de Conversão)                 (Leaf, props only — reuses atoms)
   └─ FunnelSummaryStat  (Carrinhos)                         (Leaf, props only — reuses atoms)

Overlays: none
```

> Vertical/horizontal `Separator`s and the background grid are **layout elements of the Section**, not
> citizens (they own no data and render no domain content).

### Component Anatomy

**`PixelFunnelSection`** (Section)

```text
PixelFunnelSection
└─ Card  [primitive: Card]  [relative flex row gap-0 p-5 rounded-[1.5rem] overflow-hidden]
   ├─ GridBackdrop: absolute inset-0 -z-0, aria-hidden, pointer-events-none
   │  └─ faint grid lines @ separator opacity (repeating-linear-gradient on --border)   [D6]
   ├─ StageRow: relative z-10 flex row flex-1 items-stretch
   │  └─ [ FunnelStageColumn , <Separator orientation="vertical"/> ] interleaved ×5      → Leaf anatomy
   │       (Separator between consecutive columns only — 4 separators for 5 columns)
   ├─ Separator: vertical, full-height  [primitive: Separator, orientation="vertical"]   (rail divider)
   └─ SummaryRail: relative z-10 flex col justify-between w-56 pl-5
      ├─ FunnelSummaryStat (Taxa de Conversão)                                           → Leaf anatomy
      ├─ Separator  [primitive: Separator, orientation="horizontal"]
      └─ FunnelSummaryStat (Carrinhos)                                                   → Leaf anatomy
```

States:
- skeleton (`data === undefined`): StageRow → 5 `Skeleton` columns (h-44) with separators; rail → 2
  `Skeleton` blocks (h-16). Card surface + GridBackdrop stay visible.
- empty (`hasPixel === false`): replace StageRow + rail content with `Empty / EmptyHeader / EmptyTitle
  / EmptyDescription` + a "Conectar pixel" `Button` CTA (grid stays).

**`FunnelStageColumn`** (Leaf ×5)

Mockup:

```text
 Page View
 100,0%
 1.000 de 1.000   👥
 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄    ← faint gridline (from Section backdrop, shown through)
 ▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒░░░
 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒░░      ← inline SVG area, log-attenuated, slopes this% → next%
 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒░
```

Slots:

```text
FunnelStageColumn
└─ div  [flex col gap-2 px-4 flex-1 min-w-0, relative]   (NO Card — surfaceless column)
   ├─ Label: text-sm text-muted-foreground             (t('pixelFunnel.steps.<KEY>'))
   ├─ Percent: text-2xl font-bold text-foreground       (formatPercent(value / base))
   ├─ SubtitleRow: flex items-center gap-1.5
   │  ├─ Subtitle: text-xs text-muted-foreground        ("{value} de {base}", i18n number format)
   │  └─ SessionsIcon: IconUsers  [tabler, size-4, text-muted-foreground]
   └─ FunnelShape: inline <svg> filled <polygon>, mt-auto, aria-hidden   [route-local, log-attenuated]
      └─ left edge height = attenuate(value/base); right edge = attenuate(nextValue/base); fill =
         primary token ~70% opacity (D5)
```

Variants:
- last stage (`Purchase`) → `nextValue = 0` (shape slopes to the floor).
- `base.value === 0` → Percent `0,0%`, shape collapsed (guard divide-by-zero).

States:
- skeleton: column-height `Skeleton` (h-44).

**`FunnelSummaryStat`** (Leaf ×2 — route-local, reuses atoms)

Mockup:

```text
╭───╮ Taxa de Conversão  ⓘ
│ % │
╰───╯ 0,0%        ↗ +0,0%
```

Slots:

```text
FunnelSummaryStat
└─ div  [flex col gap-2]   (NO Card — surfaceless)
   ├─ HeaderRow: flex items-center gap-2
   │  ├─ IconBadge: GradientIconBadge  [primitive: gradient-icon-badge]  (icon via prop)
   │  ├─ Label: text-sm text-muted-foreground   (label via prop)
   │  └─ Hint: <InfoHint>  [primitive: info-hint]  (tooltip text via prop, aria-label set)
   └─ ValueRow: flex items-center gap-2
      ├─ Value: text-2xl font-bold text-foreground   (pre-formatted string via prop)
      └─ Delta: <MetricDelta pct={...} />  [primitive: metric-delta]  (only when deltaPct !== null)
```

Props (route-local): `{ icon, label, hint, value: string, deltaPct?: number }`.

Variants:
- `deltaPct === undefined` (was `null`) → Delta hidden.

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| DashboardRoute | RouteShell | — | reads: [startDate, endDate]; writes: [startDate, endDate] | — | — | (modify existing) | `routes/(app)/dashboard/index.tsx` | /route |
| PixelFunnelSection | Section | `useGetPixelFunnel({ tenancyScope, startDate, endDate })` + `useGetUserInfo()` (currency) | reads: [startDate, endDate] | `useTenancyStore: { reads: [scope], writes: [] }` | — | create-route-local | `routes/(app)/dashboard/-components/PixelFunnelSection/index.tsx` | /component |
| FunnelStageColumn | Leaf | props from PixelFunnelSection (`{ labelKey, value, base, nextValue }`) | — | — | — | create-route-local | `.../PixelFunnelSection/FunnelStageColumn/index.tsx` | /component |
| FunnelSummaryStat | Leaf | props from PixelFunnelSection (`{ icon, label, hint, value, deltaPct }`) | — | — | — | create-route-local | `.../PixelFunnelSection/FunnelSummaryStat/index.tsx` | /component |

**Per-node notes:**

- **PixelFunnelSection:** `tenancyScope` from `useTenancyStore(s => s.scope)` (D9), not URL/props. Renders the
  single `Card`, the `GridBackdrop` (D6), all separators (D3), skeleton + `!hasPixel` empty.
  ARIA: `<section aria-label={t('pixelFunnel.title')}>`; StageRow `role="list"`, each column `role="listitem"`.
  Defaults startDate/endDate to last-30-days when absent.
- **FunnelStageColumn:** receives the neighbour `nextValue` so it can draw the slope without knowing
  the array; `pct = base ? value / base : 0`; height via `attenuate()` (D5). ARIA:
  `role="listitem" aria-label={`${label}: ${formatPercent(pct)}`}`. The `<svg>` is `aria-hidden`.
- **FunnelSummaryStat:** instantiated twice — conversion (`icon=IconPercentage`,
  `value=formatPercent(conversionRate.value)`, `deltaPct=conversionRate.deltaPct ?? undefined`) and
  carts (`icon=IconShoppingCart`, `value=formatCurrency(carts.value.value, currency)` with
  `currency = useGetUserInfo().current?.currency ?? CurrencyCode.BRL` (D10),
  `deltaPct=carts.value.deltaPct ?? undefined`). `InfoHint` needs an `aria-label`.
  `carts.count.value` is available but unshown unless design asks.

### Reuse Summary

- **Reuse (no work):**
  - `Card` — `@/components/ui/card.tsx` — the single Section surface.
  - `Separator` — `@/components/ui/separator.tsx` — vertical (between columns + before rail) and horizontal (rail split).
  - `GradientIconBadge` — `@/components/ui/gradient-icon-badge.tsx` — `FunnelSummaryStat` icon.
  - `InfoHint` — `@/components/ui/info-hint.tsx` — `FunnelSummaryStat` tooltip.
  - `MetricDelta` — `@/components/ui/metric-delta.tsx` — rail deltas (fraction input, D7).
  - `Skeleton`, `Empty`, `Button` — `@/components/ui/*` — loading + empty state.
  - `useRangeSearchParams` — `@/hooks/useRangeSearchParams.ts` — date-range read/write.
- **Promote to shared:** none.
- **Create new shared:**
  - `useTenancyStore` — `@/stores/useTenancyStore.ts` — global Zustand store, app-wide tenancy scope
    (consumers beyond this section: any future tenancy-aware query + a store-switcher control). `/store`.
- **Create route-local:**
  - `PixelFunnelSection` — dashboard/pixel-domain coupled; single consumer.
  - `FunnelStageColumn` — funnel-specific column + log-attenuated SVG; single consumer.
  - `FunnelSummaryStat` — funnel rail layout (differs from `StatCard`, D4); single consumer.

> **`StatCard` is deliberately NOT reused** (D4): its layout is icon-beside-value on a card surface,
> whereas the rail is icon+label-above-value with no surface. Reusing it would force a divergent
> variant; the shared **atoms** are reused instead. Overlap with `StatCard` is <70% (different root,
> different slot arrangement), so UIC-C09 does not apply.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | (i18n) | `pixelFunnel` namespace | `src/locales/{en,pt}.json` | 5 step labels + title/conversionRate/carts/hint/empty; update `@types/i18next.d.ts` if needed |
| 2 | /store | `useTenancyStore` | `src/stores/useTenancyStore.ts` | global store; `scope: TenancyScope` (default `SINGLE_STORE`) + `setScope`; consider `persist` (OQ-1) |
| 3 | /route | DashboardRoute (modify) | `routes/(app)/dashboard/index.tsx` | add `validateSearch` for `startDate`/`endDate`; mount `<PixelFunnelSection />` |
| 4 | /component | PixelFunnelSection | `.../dashboard/-components/PixelFunnelSection/index.tsx` | ONE Card; GridBackdrop; separators; FUNNEL_STAGES; skeleton + `!hasPixel` empty |
| 5 | /component | FunnelStageColumn | `.../PixelFunnelSection/FunnelStageColumn/index.tsx` | Leaf; surfaceless `div`; log-attenuated funnel SVG; props `{ labelKey, value, base, nextValue }` |
| 6 | /component | FunnelSummaryStat | `.../PixelFunnelSection/FunnelSummaryStat/index.tsx` | Leaf; surfaceless; reuses GradientIconBadge/InfoHint/MetricDelta; props `{ icon, label, hint, value, deltaPct }` |
| 7 | /sdk | (verify) | — | hook already generated; confirm `useGetPixelFunnel` import + `bun tsc` |

> No `/primitive` step: every primitive referenced (`Card`, `Separator`, `Skeleton`, `Empty`,
> `Button`, `info-hint`, `metric-delta`, `gradient-icon-badge`) already exists in `@/components/ui/`.
> The background grid (D6) and funnel area shape (D5) are route-local CSS/SVG, not new primitives.

### Open Questions

- **OQ-1 — `tenancyScope` store: persist + who writes.** Resolved (D9): `tenancyScope` is a global
  Zustand store `useTenancyStore`, default `SINGLE_STORE`. Remaining: (a) should it use the `persist`
  middleware so the scope survives refresh? (b) who flips it to `MULTI_STORE` — a header store-switcher,
  or seeded from session/membership (`GetUserInfo`, commit `3a3c7308`) on login? This section only
  *reads* `scope`; the writer is out of scope here but should be confirmed.
- **OQ-2 — delta units.** `MetricDelta` expects a fraction (`0.52 → +52%`). Confirm `Metric.deltaPct`
  from the backend is a fraction (not a pre-multiplied percent).
- **OQ-3 — attenuation curve.** D5 proposes a log curve `attenuate(pct)=log1p(pct·k)/log1p(k)`. Confirm
  the constant `k` (visual steepness) and the min floor height for a 0% stage with the design owner.
- **OQ-4 — date-range picker ownership.** The screenshot crops out the period selector. Assumed the
  dashboard route shell hosts a shared date-range picker writing `startDate`/`endDate` (via
  `useRangeSearchParams`). Confirm whether that picker is in scope here or a separate dashboard-shell task.
