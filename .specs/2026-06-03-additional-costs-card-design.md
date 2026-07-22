# Additional Costs Card — Design Spec

- **Date:** 2026-06-03
- **Branch:** feat/bk-dash-polyglot
- **Artifact:** dashboard "Custos Adicionais" card (operator screenshot)

## Context

A single dashboard card surfacing the breakdown of **additional costs** (chargeback, refund,
taxes, operational, warranty) on top of the period's revenue. It carries a store-backed checkbox —
**"Descontar Custos Adicionais"** — that, when enabled, tells the rest of the dashboard (profit/
margin cards) to subtract these costs. Each numeric row mirrors a `useGetDashboard` cost segment.

## Goal

Classify the card into the architectural citizens so `/route`, `/store`, `/component`, and `/form`
can implement it. Bind every row to a real `GetDashboard` field; surface the toggle as a dashboard
store; flag the rows whose backend source does not yet exist (warranty) as Open Questions instead
of inventing schema.

## Decisions

- **Rows source — `stat.costs` (CostBreakdownSchema = `segmented(CostKind)`).** `CostKind` already
  carries `CHARGEBACK`, `REFUND`, `TAXES`, `OPERATIONAL`, so the four numeric rows read uniformly
  from `stat.costs.segments[kind]` (a `Metric` = `{ value, deltaPct }`). The richer `details.*`
  breakdowns stay reserved for future tooltips/drill-down, not the row value.
- **Header total is client-computed** as the sum of the visible row values — there is no dedicated
  `additionalCostsTotal` field today (see OQ-3).
- **The checkbox is Zustand, not URL.** Per the operator: it lives in a dashboard store
  (`discountAdditionalCosts: boolean`), because it is a cross-card display preference shared with
  the profit/margin cards, not a server query input.
- **Mono vs consolidated currency.** `GetDashboard` returns a discriminated union by `kind`
  (`SINGLE_*` → `Metric.value: number`; `MULTI_*` → `CurrencyMetric.value: { [CurrencyCode]: number }`).
  The Section narrows on `data.kind` and formats accordingly (see OQ-2).

## Acceptance Criteria

- AC-1. The card renders a header (icon badge + "Custos Adicionais" + total), a store-backed
  checkbox, and five cost rows.
- AC-2. Toggling the checkbox writes `useDashboardStore.discountAdditionalCosts`; the value persists
  across refresh and is readable by other dashboard cards.
- AC-3. Each numeric row's value comes from `stat.costs.segments[<CostKind>]`, currency-formatted,
  rendered in the danger tone.
- AC-4. The warranty row renders a status string ("Sem Garantia", success tone) when no warranty
  source is present.
- AC-5. Rows flagged addable (Impostos, Operacional, Garantia) show a "+" affordance that opens a
  creation dialog.

## UI Composition

### URL Contract

- **Path:** `/app/dashboard` (`routes/(app)/dashboard/index.tsx`)
- **Breadcrumb:** `Dashboard`
- **Search params (Zod sketch):** *(owned by the dashboard route — this card consumes them)*
  - `startDate` — `z.iso.date` — period start fed to `useGetDashboard`
  - `endDate` — `z.iso.date` — period end fed to `useGetDashboard`
  - `tenancyScope` — `z.enum(['SINGLE_STORE','MULTI_STORE'])` — selects mono vs consolidated
  - `productIds` — `z.array(z.uuid()).optional()` — product filter passthrough
  - *(no `discountAdditionalCosts` in URL — it is store state, see Decisions)*
- **Loader:** none (card fetches via React Query)
- **errorComponent:** `RouteError` (default)

### ASCII Layout Map

```text
┌─ DashboardRouteShell (/app/dashboard) ──────────────────────────────────────┐
│  … other dashboard sections …                                               │
│  ┌─ AdditionalCostsSection ────────────────────────────────┐                │
│  │  (header: icon badge + title + total — internal UI)      │                │
│  │  ┌─ DiscountCostsToggle (Component) ─────────────────┐   │                │
│  │  └───────────────────────────────────────────────────┘   │                │
│  │  ── divider ──                                            │                │
│  │  ┌─ AdditionalCostRow (Leaf ×5) ────────────────────┐    │                │
│  │  └───────────────────────────────────────────────────┘   │                │
│  └──────────────────────────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────────────────────┘

Overlays:
  AddOperationalCostDialog (Dialog, route-local) ── opens on "+" of the Operacional row
  AddTaxDialog              (Dialog, route-local) ── opens on "+" of the Impostos row   [see OQ-4]
  ConfigureWarrantyDialog   (Dialog, route-local) ── opens on "+" of the Garantia row   [see OQ-1]
```

### Component Tree

```text
DashboardRouteShell                                          (Route Shell)
└─ AdditionalCostsSection                                    (Section, sole data root for the card)
   ├─ DiscountCostsToggle                                    (Component, store r/w)
   └─ AdditionalCostRow                                      (Leaf ×5)

Overlays:
├─ AddOperationalCostDialog                                  (Dialog, route-local → contains Form)
│  └─ AddOperationalCostForm                                 (Form Type C)
├─ AddTaxDialog                                              (Dialog, route-local)   [OQ-4]
└─ ConfigureWarrantyDialog                                   (Dialog, route-local)   [OQ-1]
```

### Component Anatomy

**`AdditionalCostsSection`** (Section)

```text
AdditionalCostsSection
└─ Card  [primitive: Card]  [flex flex-col gap-4, rounded-3xl p-6]
   ├─ Header: flex row items-center gap-4
   │  ├─ IconBadge: wallet icon  [primitive: GradientIconBadge]
   │  └─ HeaderText: flex flex-col
   │     ├─ Title: "Custos Adicionais"  [text-muted-foreground]
   │     └─ Total: "R$ 0,00"  [text-3xl font-bold]   (client-computed sum of rows)
   ├─ Toggle slot: <DiscountCostsToggle/>
   ├─ Divider: div  [border-t]
   └─ RowList: flex flex-col gap-3, role="list"
      └─ <AdditionalCostRow/> ×5  (Chargeback, Reembolso, Impostos, Operacional, Garantia)
```

States:
- skeleton: header `GradientIconBadge` + value `Skeleton` (h-8 w-32); 5 row `Skeleton` lines (h-5)
- error: inline `Empty` ("Não foi possível carregar os custos")
- empty: never empty — zero values render as `R$ 0,00`

**`DiscountCostsToggle`** (Component)

Mockup:

```text
┌──────────────────────────────────────────────┐
│ [○ ]  Descontar Custos Adicionais            │
└──────────────────────────────────────────────┘
```

Slots:

```text
DiscountCostsToggle
└─ label  [flex row items-center gap-3, cursor-pointer]
   ├─ Checkbox  [primitive: Checkbox]   (aria-label="Descontar custos adicionais")
   └─ Label: "Descontar Custos Adicionais"  [text-muted-foreground]
```

Variants:
- `discountAdditionalCosts === true` → checkbox filled (gradient box, checked)

**`AdditionalCostRow`** (Leaf ×5)

Mockup:

```text
 🧾  Chargeback                         R$ 0,00
 ↩   Reembolso                          R$ 0,00
 ⚖   Impostos          [ + ]            R$ 0,00
 ⚙   Operacional       [ + ]            R$ 0,00
 🔒  Garantia          [ + ]        Sem Garantia
```

Slots:

```text
AdditionalCostRow
└─ Row  [flex row items-center gap-3, role="listitem"]
   ├─ Icon: per-row lucide icon  [size-4, text-muted-foreground]
   ├─ Label: row name  [text-sm]   (e.g. "Chargeback")
   ├─ AddButton (optional): "+" pill  [primitive: Button, variant="primaryAlt", size="icon-sm"]
   │  └─ Icon: Plus  [lucide, size-4]   (aria-label e.g. "Adicionar custo operacional")
   └─ Value: ml-auto
      ├─ cost variant: currency string  [text-destructive]   (e.g. "R$ 0,00")
      └─ status variant: status string   [text-success]      (e.g. "Sem Garantia")
```

Variants:
- `valueKind === 'cost'`   → right slot shows danger-tone currency
- `valueKind === 'status'` → right slot shows success-tone status text (warranty "Sem Garantia")
- `addable === true`       → "+" button rendered between Label and Value

**`AddOperationalCostDialog`** (Dialog, route-local)

Mockup:

```text
╔══════════════════════════════════════════════╗
║ Novo Custo Operacional                    [×] ║
╠══════════════════════════════════════════════╣
║  <AddOperationalCostForm>                     ║
╠══════════════════════════════════════════════╣
║                         [ Cancelar ] [ Salvar ]║
╚══════════════════════════════════════════════╝
```

Slots:

```text
AddOperationalCostDialog
└─ Dialog  [primitive: Dialog]   (opened via useDialogStore.show)
   ├─ DialogHeader: title "Novo Custo Operacional" + close
   ├─ DialogBody: <AddOperationalCostForm/>
   └─ DialogFooter: [Cancelar] [Salvar]  [primitive: Button]
```

**`AddOperationalCostForm`** (Form Type C — inside `AddOperationalCostDialog`)

Slots: *(fields from `OperationalCostItemSchema` — `id` server-assigned, omitted)*

```text
AddOperationalCostForm
└─ Form  [TanStack Form, validators from SDK schema]
   ├─ name:      Input        [primitive: Input]
   ├─ flow:      Select       [primitive: Select]   (OperationalCostFlow: INCOME | EXPENSE)
   ├─ frequency: Select       [primitive: Select]   (OperationalCostRecurrency: MONTHLY|YEARLY|ONE_TIME)
   ├─ amount:    NumberInput   [primitive: Input + Maskito currency mask]
   ├─ currency:  Select       [primitive: Select]   (CurrencyCode)
   ├─ startDate: DatePicker   [primitive: DatePicker]
   └─ endDate:   DatePicker   [primitive: DatePicker]   (nullable)
```

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| DashboardRouteShell | RouteShell | — | reads: [startDate, endDate, tenancyScope, productIds] | — | — | create-route-local | `routes/(app)/dashboard/index.tsx` | /route |
| AdditionalCostsSection | Section | `useGetDashboard({ startDate, endDate, tenancyScope, productIds })` | reads: [startDate, endDate, tenancyScope, productIds] | useDashboardStore: { reads: [discountAdditionalCosts], writes: [] } | — | create-route-local | `routes/(app)/dashboard/-components/AdditionalCostsSection/index.tsx` | /component |
| DiscountCostsToggle | Component | — | — | useDashboardStore: { reads: [discountAdditionalCosts], writes: [toggleDiscountAdditionalCosts] } | — | create-route-local | `routes/(app)/dashboard/-components/AdditionalCostsSection/DiscountCostsToggle.tsx` | /component |
| AdditionalCostRow | Leaf | props from AdditionalCostsSection (`{ icon, label, value, valueKind, addable, onAdd? }`) | — | — | — | create-route-local | `routes/(app)/dashboard/-components/AdditionalCostsSection/AdditionalCostRow.tsx` | /component |
| AddOperationalCostDialog | Dialog | owns `useCreateOperationalCost` mutation | — | useDialogStore | — | create-route-local | `routes/(app)/dashboard/-components/AddOperationalCostDialog/index.tsx` | /component |
| AddOperationalCostForm | Form | SDK schema validators | — | — | TanStack Form state | create-route-local | `routes/(app)/dashboard/-components/AddOperationalCostDialog/AddOperationalCostForm.tsx` | /form |

**Per-node notes:**

- **AdditionalCostsSection:** Narrows on `data.kind`. `SINGLE_*` → `stat.costs.segments[kind].value: number`; `MULTI_*` → `stat.costs.segments[kind].value: { [CurrencyCode]: number }` (consolidated — see OQ-2). Header total = `Σ row values`. ARIA: `aria-labelledby` on the title; row container `role="list"`. Rationale: dashboard-domain coupled, single consumer.
- **DiscountCostsToggle:** Writes the store via `toggleDiscountAdditionalCosts()`. ARIA: `aria-label="Descontar custos adicionais"` on the Checkbox. Rationale: trivial store-bound control, only used here.
- **AdditionalCostRow:** Pure presentational Leaf — receives the already-formatted `value` string + `valueKind` from the Section. The Section maps the 5 rows: `CHARGEBACK→Chargeback`, `REFUND→Reembolso`, `TAXES→Impostos` (addable), `OPERATIONAL→Operacional` (addable), `Garantia` (addable, status fallback — OQ-1). The 3 addable rows pass an `onAdd` that calls `useDialogStore.show(<…Dialog/>)`. ARIA: `role="listitem"`; "+" button `aria-label`.
- **AddOperationalCostDialog/Form:** depends on a backend `CreateOperationalCost` command + SDK hook existing — confirm before `/form` (OQ-5).

### Reuse Summary

- **Reuse (no work):** `Card`, `Checkbox`, `Button`, `Skeleton`, `GradientIconBadge`, `Dialog`,
  `Input`, `Select`, `DatePicker` — all primitives under `@/components/ui/`
  (header icon: `@/components/ui/gradient-icon-badge.tsx`). The header layout mirrors
  `@/components/StatCard/index.tsx` (GradientIconBadge + label + value) but the full card is a
  composite (header + toggle + rows), so StatCard is referenced for pattern only, not reused whole.
- **Promote to shared:** none — no second consumer of any node today.
- **Create new shared:** none.
- **Create route-local:** `AdditionalCostsSection`, `DiscountCostsToggle`, `AdditionalCostRow`,
  `AddOperationalCostDialog`, `AddOperationalCostForm` — all dashboard-domain coupled, single route.
- **Store:** `useDashboardStore` — route-scoped at `routes/(app)/dashboard/-stores/useDashboardStore.ts`,
  `persist` middleware (toggle survives refresh). New artifact.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | DashboardRouteShell | `routes/(app)/dashboard/index.tsx` | Add `startDate/endDate/tenancyScope/productIds` search schema if not already present |
| 2 | /store | useDashboardStore | `routes/(app)/dashboard/-stores/useDashboardStore.ts` | `discountAdditionalCosts: boolean` + `toggleDiscountAdditionalCosts()`, `persist` |
| 3 | (verify primitive) | DatePicker / Select | `@/components/ui/` | confirm both exist before /form; if missing → /primitive first (UIC-C08) |
| 4 | /component | AdditionalCostsSection | `routes/(app)/dashboard/-components/AdditionalCostsSection/index.tsx` | owns `useGetDashboard`, computes total, maps 5 rows |
| 5 | /component | DiscountCostsToggle | `…/AdditionalCostsSection/DiscountCostsToggle.tsx` | store-backed checkbox |
| 6 | /component | AdditionalCostRow | `…/AdditionalCostsSection/AdditionalCostRow.tsx` | Leaf — props only |
| 7 | /component | AddOperationalCostDialog | `routes/(app)/dashboard/-components/AddOperationalCostDialog/index.tsx` | `useDialogStore`; blocked on OQ-5 |
| 8 | /form | AddOperationalCostForm | `…/AddOperationalCostDialog/AddOperationalCostForm.tsx` | fields from `OperationalCostItemSchema` |
| — | helper | `formatCurrency(value, currency, locale)` | `@/lib/format.ts` | no centralized formatter today; needed by the Section before passing strings to rows |

### Open Questions

- **OQ-1. Garantia (warranty) has no backend source.** `CostKind` has no `WARRANTY`/`GARANTIA`
  member and no `details.*` field maps to it; the mockup shows "Sem Garantia" (status fallback).
  Proposed: render the status variant until a warranty source exists. Needs operator decision —
  is warranty a new `CostKind` member, a separate feature, or purely a future placeholder? Resolving
  this also decides whether `ConfigureWarrantyDialog` is in scope now.
- **OQ-2. Consolidated (`MULTI_*`) currency display.** Rows are `CurrencyMetric` (`{ BRL, USD, … }`)
  in multi-store mode. Show a single selected currency, or sum to a presentation currency? No FX
  display rule is defined — needs a decision (likely a store-held `displayCurrency`).
- **OQ-3. Header total field.** No `additionalCostsTotal` exists; the spec computes it client-side
  as `Σ rows`. Confirm whether the backend should expose a dedicated total (cleaner for the delta).
- **OQ-4. Impostos "+" action.** `TaxesBreakdown` is derived (`ads` / `others`), not a manual list.
  What does "+" add — a manual tax entry, or a tax-rate config? `AddTaxDialog` is sketched but its
  command is undefined.
- **OQ-5. `CreateOperationalCost` command.** `OperationalCostItemSchema` is a read DTO; confirm a
  write command + SDK hook (`useCreateOperationalCost`) exists (or must be modeled) before `/form`.

> **Update (2026-06-03, found during Storybook build):** the SDK already exports the write hooks —
> `useCreateOperationalCost`, `useUpdateOperationalCost`, `useDeleteOperationalCost`,
> `useSetOperationalCostStatusOverride`, and `useUpsertWarranty`. So OQ-5 (operational "+") and
> OQ-1 (warranty "+") are **unblocked**: the add-flow dialogs/forms can be wired to existing
> mutations. The Storybook card currently renders the "+" buttons disabled pending that wiring.
> OQ-4 (Impostos "+") still has no matching create endpoint — taxes remain derived.
