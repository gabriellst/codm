# WANT — Dashboard read-layer + `ui` context (design specs)

> **Corpus pair:** `examples/pairs/dashboard/` — the first want→got example.
>
> - **WANT** (this file) = the two frozen design plans below: *what was asked*.
> - **GOT/** = the frontend components those contracts became on `feat/template-polyglot`: *what shipped*.
> - **NOTES.md** = the plan→code translation decisions, the WANT↔GOT trace, and what deliberately was **not** copied.
>
> **Provenance — `git show` of the two plans below (purged product vocabulary renamed to neutral
> identifiers per the product-residue rail; otherwise unedited):**
> - `feat/template-polyglot:.plans/2026-06-03-get-dashboard-and-ui-context.md`
> - `feat/template-polyglot:.plans/2026-06-03-dashboard-static-reads.md`
>
> Both plans are **backend** read-layer designs (the reintroduced `ui` BFF context: `GetDashboard`,
> `SetStoreVisualization`, and the static promo reads). The GOT side captured here is the **frontend**
> that consumes those contracts through the generated SDK — so the pair demonstrates a *spec → UI*
> hop, not a backend line port. The link is concrete: `AdditionalCostsSection` reads exactly the
> `GetDashboard` discriminated output this plan designs (`additionalCost`, the `*_NATIONAL`-only
> `draftOrders`, the operational breakdown); `PixelFunnelSection` reads `GetPixelFunnel` (plan §9).
> See **NOTES.md**.

---

## Plan A — `.plans/2026-06-03-get-dashboard-and-ui-context.md`

# Plan — `GetDashboard` controller + reintroduced `ui` context (`StoreVisualization`)

**Date:** 2026-06-03 · **Branch:** `feat/template-polyglot` · Status: **DESIGN LOCKED (grilled) — build not started.**

First slice of the read-layer rebuild (Wave 1) from `.plans/2026-06-03-read-layer-rebuild.md`, designed against
`.specs/frontend-screens/SPEC.md` (dashboard) + `_schema-fundamentals.md`. Grilled via `grill-with-docs`.

> **Scope of this plan:** only `GetDashboard` + the `StoreVisualization` setting it depends on. The rest of the
> dashboard-page cluster (`GetPixelFunnel`, `ListQuickProductRanking`, `GetGoal`, `GetCostBreakdown`,
> `ListRecommendedApps`, `ListPromotionalBanners`, `GetAppQrCode`) is a **separate grill/plan** — see §9.

---

## 0. Glossary (resolved terms)

- **ViewScope** — *runtime* query enum, `SINGLE | MULTI`. Governs **which stores + the money shape**:
  `SINGLE` = the session's active store, mono-currency; `MULTI` = consolidated across all the user's
  active/integrated stores (multi-currency) **plus** a `perStore` breakdown. Driven by the StoreSelector ("All stores").
  **Not persisted.** Wire enum (cross-language; query param only).
- **DashboardMode** — *persisted* per-store enum, `GLOBAL | NATIONAL`. Governs **which sections render**:
  `GLOBAL` = lean view; `NATIONAL` = `GLOBAL` **+ the `paymentMethods` section**. Orthogonal-ish to scope but may
  diverge per scope in future (→ composition-first output, §5). Persisted on `StoreVisualization`; default `GLOBAL`.
  Wire enum **and** pgEnum (persisted ⇒ paired with DB).
- **StoreVisualization** — entity in the (reintroduced) `ui` context. Holds **`storeId + dashboardMode`** only,
  keyed **per store**. The dashboard reads it server-side to pick the variant; a command sets it.
- **Section** — a named, reusable Zod **shape fragment** (`STAT`, `ORDERS`, `DETAILS`, `PAYMENT_METHODS`, …). The
  dashboard output is *composed* from sections; each (scope×mode) variant declares its own section list.
- **TallySchema** — generic atom `{ count: MetricSchema, value: MetricSchema }` (count and money each a Metric with
  its own `deltaPct`). Used by `orders.{generated,paid}` and the `paymentMethods` tree.

---

## 1. Decisions locked (grill outcomes)

1. **Faker-backed** Query use case — real controller/ctx/middleware/contract + correct discriminated output; use-case
   body returns deterministic faker conforming to schema. Real Drizzle aggregation is a later swap behind the same
   interface. **Exception:** the `StoreVisualization` *setting* is **real/persisted** (entity + repo + table + migration).
2. **One `GetDashboard`** controller (replaces the spec's `GetSingleStoreDashboard` + `GetMultiStoreDashboard` split),
   discriminated output.
3. **`DashboardMode` is persisted, not a query param** — read from `StoreVisualization` by `ctx.session.storeId`
   (default `GLOBAL`). `ViewScope` **stays a query param**.
4. **`GLOBAL` vs `NATIONAL`** differ *only* by the `paymentMethods` section (NATIONAL-only). Orders detail
   (`generated` + `paid`) sits **inside `details`** and is in **both** modes; the GLOBAL frontend renders only `paid`.
5. **Composition-first output** — section shape fragments + a `variant()` composer + a single
   `z.discriminatedUnion('kind', …)` over the 4 cells. Chosen for extensibility: a future mode can return less/more/
   internally-changed sections by editing its cell's list, no cross-product duplication. See §5.
6. **Sections & matrix** (§4): `stat`, `orders`, `details` in all 4 (money shape flips with `ViewScope`);
   `paymentMethods` NATIONAL-only; `perStore` MULTI-only.
7. **`TallySchema = { count: Metric, value: Metric }`** (Option B). `paymentMethods` `byMethod`/`byStatus` use it.
8. **`StoreVisualization`** keyed per-store; named without `Settings` suffix; **no domain event** on change.
9. **GetDashboard inputs:** `viewScope` (query), date range **required** (query, `stringToDate`),
   `productIds` **optional** (query, `stringToArray(uuid)`); `storeId`/`storeIds` from ctx.
10. **Rename `kpis` → `stat`** everywhere (matches `StatCard`/`StatCardsSection`).

### Divergences from spec / prior plan (intentional)
- Spec splits into two controllers; we unify into `GetDashboard` (matches read-layer-rebuild plan, renames its
  `StoreScope` → **`ViewScope`**).
- Spec has **no `paymentMethods`** and **no persisted mode** — both are new here.
- Spec keeps `details` mono in multi-store; we **flip `details` money shape with scope** (user-confirmed). Flagged in §4.

---

## 2. Contracts (wire) enums — Phase 0

Add under `packages/contracts/wire/enums/`, import in `wire/main.tsp`, regen
(`bun run tsp:compile && bun run codegen:wire`). Identifier-safe values (codegen derives member name from value).

```tsp
// view-scope.tsp
enum ViewScope { SINGLE: "SINGLE", MULTI: "MULTI" }
// dashboard-mode.tsp
enum DashboardMode { GLOBAL: "GLOBAL", NATIONAL: "NATIONAL" }
```
`DashboardMode` additionally becomes a **pgEnum** in `packages/contracts/db/schema/ui.ts` (persisted).
`PaymentMethod` / `PaymentStatus` already exist (`payment-method.tsp` = `CREDIT_CARD,PIX,BILLET`;
`payment-status.tsp` = `PENDING,AUTHORIZED,PAID,PARTIALLY_PAID,UNPAID,REFUNDED,PARTIALLY_REFUNDED,VOIDED`).

---

## 3. Reintroduce the `ui` bounded context

The `ui` context was deleted wholesale; recreate it as the **BFF read + UI-pref** context.

```
src/ui/
  entities/StoreVisualization.ts                 // identity + storeId + dashboardMode; .changeMode(mode); StoreVisualizationSchema (z.instance(Id))
  repositories/StoreVisualizationRepository/
    StoreVisualizationRepository.ts              // interface: findByStoreId(storeId), save(entity)
    DrizzleStoreVisualizationRepository.ts        (+ .test.ts)
    MockStoreVisualizationRepository.ts
    index.ts
  schemas/                                       // section vocabulary (see note below)
  controllers/GetDashboard.ts                    // faker metrics; mode from entity
  controllers/SetStoreVisualization.ts           // command: upsert mode for ctx.session.storeId
  controllers/index.ts
  usecases/GetDashboard.ts                        // Query use case (faker)
  usecases/SetStoreVisualization.ts               // command use case (real persist)
  usecases/index.ts
  registry.ts                                    // mock/integration/real bindings
  index.ts                                       // BoundedContext.create + Router
```
Wire `UiRouter` into `src/index.ts` (router list) and `ALL_REGISTRIES`. Add `db/schema/ui.ts`
(`store_visualization` table: `id`, `storeId` unique, `dashboardMode` pgEnum, timestamps) + a Drizzle migration.

**Section-schema location (REVISED — implemented):** only the **generic atoms** (`MetricSchema`, `CurrencyMetricSchema`,
`CurrencyAmountSchema`, `TallySchema`, `ConsolidatedTallySchema`, `segmented`) live in **`src/shared/schemas/Metric.ts`**
(exported from `@shared/schemas`). The **dashboard-specific** section schemas (`Stat*`, the breakdowns, `OrdersSummary*`,
`PaymentMethodBreakdown`, `DashboardDetails*`, `OperationalCost*`) live in the owning context at
**`src/ui/schemas/dashboard.ts`** (exported from `@ui/schemas`). The old `src/shared/schemas/ui/` god-file was deleted;
speculative orphans (ProfileAlert/IncomeGraph/SalesBy*/RecommendedApp) were dropped — they'll be defined in their own
query use cases when those reads are built.

---

## 4. Section inventory + composition matrix

Money-shape rule: **mono** sections use `MetricSchema` in money positions; **consolidated** (MULTI) sections
replace money-position `MetricSchema` with `CurrencyMetricSchema`. Counts/percentages/margin never flip.

| Section (fragment) | Mono shape | Consolidated shape | Present in |
|---|---|---|---|
| `STAT` | `StatSchema` `{revenue,profit,margin,averageTicket,unitsSold,costs}` | `ConsolidatedStatSchema` | all 4 (flips) |
| `PERSTORE` | — | `{ perStore: Record<StoreIntegrationId, StatSchema> }` (each store mono) | MULTI only |
| `DETAILS` | `DashboardDetailsSchema` `{orders, fees, ads, productCost, chargeback, refund, taxes, operational}` | `ConsolidatedDashboardDetailsSchema` | all 4 (flips ⚠ diverges from spec) |
| `PAYMENT_METHODS` | `PaymentMethodBreakdownSchema` (counts) | same (counts don't flip) | NATIONAL only |
| `STORE` | `{ store: { id, currency } }` | — (n/a; multi has no single store) | SINGLE only |

> `orders` (`OrdersSummarySchema` `{generated:Tally, paid:Tally}`) lives **inside `details`** — it is **not** a
> top-level section. It moves out of `stat`; `averageTicket`/`unitsSold` stay in `STAT`. In the consolidated
> `details`, `orders` uses `ConsolidatedOrdersSummarySchema` (Tally.value→CurrencyMetric).

**Matrix (kind → sections):**

| `kind` | viewScope | dashboardMode | sections |
|---|---|---|---|
| `SINGLE_GLOBAL` | SINGLE | GLOBAL | STORE, STAT, DETAILS |
| `SINGLE_NATIONAL` | SINGLE | NATIONAL | STORE, STAT, DETAILS, PAYMENT_METHODS |
| `MULTI_GLOBAL` | MULTI | GLOBAL | STAT(cons.), PERSTORE, DETAILS(cons.) |
| `MULTI_NATIONAL` | MULTI | NATIONAL | STAT(cons.), PERSTORE, DETAILS(cons.), PAYMENT_METHODS |

### Key schema sketches (Zod; `z` from `@codedm/core-typescript`)
```ts
export const TallySchema = z.object({ count: MetricSchema, value: MetricSchema })
export const ConsolidatedTallySchema = z.object({ count: MetricSchema, value: CurrencyMetricSchema })

export const OrdersSummarySchema = z.object({ generated: TallySchema, paid: TallySchema })
export const ConsolidatedOrdersSummarySchema = z.object({ generated: ConsolidatedTallySchema, paid: ConsolidatedTallySchema })

// orders lives INSIDE details (not a top-level section):
export const DashboardDetailsSchema = z.object({
  orders: OrdersSummarySchema,          // generated + paid (both modes; GLOBAL frontend renders only `paid`)
  fees: FeesBreakdownSchema, ads: AdsBreakdownSchema, productCost: ProductCostBreakdownSchema,
  chargeback: ChargebackBreakdownSchema, refund: MetricSchema, taxes: TaxesBreakdownSchema,
  operational: OperationalCostsSchema,
})
// ConsolidatedDashboardDetailsSchema mirrors it with orders→ConsolidatedOrdersSummarySchema + money leaves→CurrencyMetric

// counts only; total → byMethod → byStatus, each a Tally (count + value)
export const PaymentMethodBreakdownSchema = z.object({
  total: TallySchema,
  byMethod: z.record(z.enum(PaymentMethod), z.object({
    total: TallySchema,
    byStatus: z.record(z.enum(PaymentStatus), TallySchema),
  })),
})

// StatSchema = old KpisSchema minus `orders` (orders → OrdersSummarySchema)
export const StatSchema = z.object({
  revenue: MetricSchema, profit: MetricSchema, margin: MetricSchema,
  averageTicket: MetricSchema, unitsSold: MetricSchema, costs: CostBreakdownSchema,
})
```

---

## 5. `GetDashboard` output — composition-first discriminated union

```ts
// section fragments (raw Zod shapes — compose by spread)
const STORE            = { store: z.object({ id: StoreIntegrationId, currency: z.enum(CurrencyCode) }) }
const STAT             = { stat: StatSchema }
const STAT_CONSOLIDATED = { stat: ConsolidatedStatSchema, perStore: z.record(StoreIntegrationId, StatSchema) }
const DETAILS          = { details: DashboardDetailsSchema }            // includes orders
const DETAILS_CONS     = { details: ConsolidatedDashboardDetailsSchema } // includes consolidated orders
const PAYMENT_METHODS  = { paymentMethods: PaymentMethodBreakdownSchema }

const variant = (kind, viewScope, dashboardMode, ...shapes) =>
  z.object({
    kind: z.literal(kind),
    viewScope: z.literal(viewScope),   // echoed for the frontend
    dashboardMode: z.literal(dashboardMode), // echoed for the frontend
    ...Object.assign({}, ...shapes),
  })

const SINGLE_GLOBAL   = variant('SINGLE_GLOBAL',   'SINGLE', 'GLOBAL',   STORE, STAT, DETAILS)
const SINGLE_NATIONAL = variant('SINGLE_NATIONAL', 'SINGLE', 'NATIONAL', STORE, STAT, DETAILS, PAYMENT_METHODS)
const MULTI_GLOBAL    = variant('MULTI_GLOBAL',    'MULTI',  'GLOBAL',   STAT_CONSOLIDATED, DETAILS_CONS)
const MULTI_NATIONAL  = variant('MULTI_NATIONAL',  'MULTI',  'NATIONAL', STAT_CONSOLIDATED, DETAILS_CONS, PAYMENT_METHODS)

export const GetDashboardOutputSchema =
  z.discriminatedUnion('kind', [SINGLE_GLOBAL, SINGLE_NATIONAL, MULTI_GLOBAL, MULTI_NATIONAL])
```
`kind` is the single Zod/OpenAPI discriminator (clean kubb mapping + exhaustive `never` narrowing); both real enums are
echoed for the frontend. Adding a mode = add row(s) to the matrix composing whatever sections it needs.

---

## 6. Inputs (controller composes from use-case input)

```ts
// USE CASE — src/ui/usecases/GetDashboard.ts (canonical, primitives)
export const GetDashboardInputSchema = z.object({
  viewScope: z.enum(ViewScope),
  storeId:  z.uuid(),                 // ← ctx.session.storeId      (SINGLE)
  storeIds: z.array(z.uuid()),        // ← ctx.membership.storeIds  (MULTI; use case filters to active/integrated)
  startDate: z.date(),
  endDate:   z.date(),
  productIds: z.array(z.uuid()).optional(),
})
export const GetDashboardOutputSchema = /* §5 */

// CONTROLLER — src/ui/controllers/GetDashboard.ts (GET → query)
inputSchema = z.object({
  ctx: z.object({
    session:    z.object({ storeId: z.uuid() }),
    membership: z.object({ storeIds: z.array(z.uuid()) }),
  }),
  query: GetDashboardInputSchema
    .omit({ storeId: true, storeIds: true, startDate: true, endDate: true, productIds: true })
    .extend({
      startDate:  z.stringToDate(),
      endDate:    z.stringToDate(),
      productIds: z.stringToArray(z.uuid()).optional(),
    }),
})
outputSchema = GetDashboardOutputSchema
```
- `user` dropped from ctx (handler never reads `.user`); `AuthAccountMiddleware` + `RequireStoreMember` still run.
- Use case: load `StoreVisualization` by `storeId` → `dashboardMode` (default `GLOBAL`); pick SINGLE vs MULTI by
  `viewScope`; build the matching `variant` with faker data. MULTI filters `storeIds` to active/integrated internally.

### `SetStoreVisualization` command
```ts
// POST /ui/store-visualization   body: { dashboardMode }   ctx.session.storeId
SetStoreVisualizationInputSchema = z.object({ storeId: z.uuid(), dashboardMode: z.enum(DashboardMode) })
// controller: body = .omit({ storeId: true }); storeId from ctx.session.storeId
```
Use case: `findByStoreId` → `entity.changeMode(mode)` (or create) → `save`. No domain event.

---

## 7. Build order (waves)

1. **Contracts:** add `view-scope.tsp` + `dashboard-mode.tsp`, import in `main.tsp`, `tsp:compile` + `codegen:wire`.
2. **DB:** `db/schema/ui.ts` (`store_visualization` + `dashboardMode` pgEnum) → `drizzle:generate` migration.
3. **`ui` context skeleton:** `StoreVisualization` entity + schema, repository (Drizzle+Mock), `registry.ts`,
   `index.ts`; wire into root `index.ts` + `ALL_REGISTRIES`. `tsc` green.
4. **Section schemas:** atoms → `src/shared/schemas/Metric.ts`; dashboard sections → `src/ui/schemas/dashboard.ts` (rename `Kpis*`→`Stat*`, pull `orders` out, add `TallySchema`,
   `OrdersSummarySchema`(+cons.), `PaymentMethodBreakdownSchema`, `ConsolidatedDashboardDetailsSchema`, fragments).
5. **`SetStoreVisualization`** command (use case + controller + repo test). Real persist; PGlite test.
6. **`GetDashboard`** Query use case (faker) + controller (composition-first output). Use-case test asserts the right
   `kind`/sections per (scope, persisted mode).
7. **SDK:** `bun sdk`; repo `tsc` + `bun test` + `bun lint`; commit.

Verify: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` + `bun test`; root `bun tsc`.
`export PATH="$HOME/.bun/bin:$PATH"` before `git commit` (pre-commit hook).

---

## 8. Open implementation questions (resolve during build, not blocking)
1. `ConsolidatedDashboardDetailsSchema` — exact CurrencyMetric positions (mirror `DashboardDetailsSchema`, flip money
   leaves). Confirm against the multi-store HTML if available.
2. Faker determinism — seed by `(storeId, startDate, endDate, productIds)` so the frontend gets stable data across
   refetches.
3. Whether `SetStoreVisualization` belongs to `RequireStoreRole` (only owners/admins toggle) or any member.

## 9. Follow-on cluster — status
Dashboard-page reads, each grilled into its own plan:
- ✅ **`GetPixelFunnel`** — `.plans/2026-06-03-get-pixel-funnel.md` (tracking; `viewScope` input-only).
- ✅ **`ListQuickProductRanking`** — `.plans/2026-06-03-list-quick-product-ranking.md` (ui; top-10).
- ✅ **`GetGoal`** + **`GetGoalProgress`** — `.plans/2026-06-03-get-goal-and-goal-progress.md` (analytics).
- ⛔ **`GetCostBreakdown`** — **DROPPED (no endpoint).** The `CostDistributionSection` donut is **derived
  frontend-side** from `GetDashboard.stat.costs` + `revenue`/`profit` (the % is `value / revenue`); the 9 legend rows =
  the 8 `CostKind`s + Lucro (profit). No backend read needed — exactly as the spec intends.
- ⏳ Review-only (near-fully specced, no scope/mode discrimination): **`ListRecommendedApps`**, **`ListPromotionalBanners`**
  (spec `GetBanners`), **`GetAppQrCode`** (spec `GetAppDownload`) — confirm ctx/naming/static-vs-faker, then a short plan.
```

---

## Plan B — `.plans/2026-06-03-dashboard-static-reads.md`

# Plan — Dashboard static/promo reads (ui context)

**Date:** 2026-06-03 · **Branch:** `feat/template-polyglot` · Status: **DESIGN LOCKED (reviewed) — build not started.**

Dashboard-page reads #5–7 (Tier 2 — review-only). `ListRecommendedApps`, `ListPromotionalBanners`, `GetAppQrCode`.
Designed against `.specs/frontend-screens/SPEC.md` + `_schema-fundamentals.md`. No scope/mode discrimination — these are
global promo/static content.

---

## 1. Common disposition (all three)
- **Faker/static Query use cases in the `ui` context.** Data is CMS/external-link content with no real source — the use
  case returns static/faker payloads. Real swap (a CMS) is a later, contract-preserving change.
- **Empty ctx** — `ctx: z.object({})`. Global content, **not store-scoped**; the auth middlewares still run but the
  handler reads nothing from ctx (mirrors `GetFxRates`). No `storeId`, no `viewScope`, no inputs/params.
- **Names** = these (not the spec's `GetBanners`/`GetAppDownload`).
- **Ids are plain `z.string()`** (CMS/external ids, not entity UUIDs).

---

## 2. Endpoints

### `ListRecommendedApps` (shared across ~6 screens)
```ts
export const RecommendedAppSchema = z.object({
  id: z.string(),
  name: z.string(),
  logoUrl: z.url(),
  rating: z.number(),
  ratingCount: z.number(),
  description: z.string(),
  installUrl: z.url(),
})
export const ListRecommendedAppsOutputSchema = z.object({
  items: z.array(RecommendedAppSchema),
  advertiseUrl: z.url(),          // "Deseja anunciar sua marca aqui?" external link
})
```
> Spec OQ#1 floated a `context`/category param to tailor apps per screen — **deferred**; add only when a screen needs a
> different app set. **Define `RecommendedAppSchema` in `src/ui/schemas/` when this read is built** (the old
> speculative copy in `shared/schemas/ui` was deleted in the schema-reorg — schemas live with their query use case).

### `ListPromotionalBanners` (spec `GetBanners`)
```ts
export const ListPromotionalBannersOutputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    imageUrl: z.url(),
    targetUrl: z.url(),
  })),
})
```

### `GetAppQrCode` (spec `GetAppDownload`)
```ts
export const GetAppQrCodeOutputSchema = z.object({
  qrRedirectUrl: z.url(),   // QR target; a separate PUBLIC route 302s by User-Agent (iOS→App Store, Android→Play)
  iosUrl: z.url(),          // App Store badge
  androidUrl: z.url(),      // Google Play badge
})
```
> The actual User-Agent 302 redirect behind `qrRedirectUrl` is a **separate public redirect route** — out of scope for
> this read, which only returns the static URLs.

---

## 3. Build order
1. Use cases (faker/static) + controllers (GET, empty ctx, no query) for the three; barrels.
2. Register in `ui/registry.ts` + router (the reintroduced `ui` context — depends on the dashboard slice existing).
3. Define `RecommendedAppSchema`/`ListRecommendedAppsOutputSchema` in `src/ui/schemas/` (with this read).
4. `bun sdk`; repo `tsc` + `bun test` + `bun lint`; commit (`export PATH="$HOME/.bun/bin:$PATH"`).

## 4. Depends on / shared
- `ui` context (reintroduced in the dashboard slice).
- `@shared/schemas` (generic atoms only); `RecommendedAppSchema` is defined here when built.
