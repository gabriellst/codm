# Money & Metric Vocabulary Alignment — Design Spec

> Status: draft · Date: 2026-06-03 · Surface: `packages/api/typescript` (+ SDK regen → FE ripple)
> Precedes: `.specs/2026-06-03-pixel-funnel-section.md` (the funnel build is paused until this lands).

## Context

The backend has two overlapping, partly-inconsistent ways to represent money and KPIs:

- **Stored money** uses the `MonetaryAmount` value object (`{ amountCents≥0, currency }`) — 24 files,
  via `z.instance(MonetaryAmount)` on entity fields (OrderOverride, ProductCostOptionItem,
  OperationalCost, Goal, AdSpendManual) and in fee schemas.
- **Read-side KPIs** use `shared/schemas/Metric.ts`: `MetricSchema {value:number,deltaPct}`,
  `CurrencyMetricSchema {value: CurrencyAmount, deltaPct}`, `TallySchema`, `ConsolidatedTallySchema`,
  plus `CurrencyAmountSchema` (partial record of currency→**raw number**) and a dead
  `MonetaryByCurrencySchema` (record of currency→**cents**, no consumers).

The result: money reaches the frontend in **three** different shapes — a bare `number` (NATIONAL
dashboards, where the currency is implicit and the FE infers it from the store), a multi-currency
record (GLOBAL/Consolidated dashboards), and an `{amountCents,currency}` object (entity reads). The
funnel (`GetPixelFunnel`) emits `carts.value` as a bare-number `Metric`, so the FE has to look up the
store currency separately to render it.

## Problem

There is no single answer to "what does a money value look like on the wire to the frontend?" The FE
has to know whether a metric is money or a number, and when it is money, where to find the currency.
Internal multi-currency aggregation (summing orders across currencies before converting to the
store's reporting currency) has no first-class type — it's an ad-hoc partial record.

## Goal

One coherent money/metric vocabulary:

- **Every money value that reaches the frontend already carries its currency** and is a single,
  converted currency (the store's reporting currency). The FE never infers currency and never
  receives a multi-currency record.
- **Internal multi-currency accumulation** is a first-class value object (`MultiCurrencyMoney`) with
  calculation + conversion utilities, used only inside the backend before the final conversion.
- KPIs split cleanly into **`NumberMetric`** (ratios, counts, percentages) and **`MoneyMetric`**
  (money values, currency-carrying).

Pipeline: **DB (cents+currency columns / jsonb) → `MultiCurrencyMoney` (accumulate across
orders/currencies) → `.convert(rates, store.reportingCurrency)` → `Money` / `SignedMoney` →
`MoneyMetric` → frontend.**

## Decisions

- **D1 — Always convert before the FE** (locked). The frontend only ever receives single-currency
  `MoneyMetric`. `MultiCurrencyMoney` and any multi-currency record are strictly internal. The
  multi-currency FE shapes (`CurrencyMetricSchema`, `ConsolidatedTallySchema`) are **removed**.
- **D2 — Keep the signed split** (locked). `Money` (the VO) stays **nonnegative** (`amountCents≥0`)
  for stored entity fields — preserves the existing invariant. A separate read-side
  **`SignedMoneySchema`** (`{ amountCents: int, currency }`, allows negatives) is the value type of
  `MoneyMetric` (profit, margin-in-money, deltas). `SignedMoney` is **not** a VO (no `z.instance`).
- **D3 — `MultiCurrencyMoney` holds cents, replaces both** (locked). It stores `amountCents` (int)
  per currency as a partial record and **replaces both** `CurrencyAmountSchema` (raw number) and the
  dead `MonetaryByCurrencySchema`; both are deleted.
- **D4 — Rename `MonetaryAmount` → `Money`.** `MonetaryAmountSchema` → `MoneySchema`,
  `SignedMonetaryAmountSchema` → `SignedMoneySchema`. Mechanical rename across all 24 sites + barrels
  + tests. The VO keeps its single method (`equals`) and the `≥0` invariant.
- **D5 — Metric naming.** `MetricSchema` → **`NumberMetricSchema`** (ratios/counts/percentages).
  New **`MoneyMetricSchema` = `{ value: SignedMoneySchema, deltaPct: number|null }`**. `TallySchema`
  keeps its name but its shape becomes **`{ count: NumberMetricSchema, value: MoneyMetricSchema }`**
  (a tally is a count of things + their money value). The `segmented()` helper splits into
  `segmentedNumber()` (NumberMetric segments) and `segmentedMoney()` (MoneyMetric segments).
- **D6 — Money KPIs carry currency; ratios/counts do not.** In dashboard + funnel outputs: money
  leaves (revenue, profit, costs, fees, ads spend, product cost, refund, taxes, warranty, cart value,
  order value) become `MoneyMetric`; ratio/count leaves (margin %, roi, roas, cpa, unitsSold, session
  counts, conversion rate) stay `NumberMetric`.
- **D7 — `GetDashboard` GLOBAL/Consolidated keeps its union structure; money leaves convert.** The
  4-variant discriminated union (SINGLE/MULTI × NATIONAL/GLOBAL) is **not redesigned**. The
  `Consolidated*` schemas switch their money leaves from `CurrencyMetric`/`ConsolidatedTally` →
  `MoneyMetric`/`Tally` (converted single currency), and `segmentedCurrency` → `segmentedMoney`. The
  faker body emits converted single-currency money. (After this, Consolidated\* shapes equal their
  NATIONAL counterparts on money; collapsing the union is an explicit, separate follow-up — OQ-1.)
- **D8 — Conversion takes rates as input; no FX service.** `MultiCurrencyMoney.convert(rates, target)`
  accepts a caller-supplied rate table and returns a `Money`. Building an FX-rate-fetching service is
  **out of scope** (analytics is faker today; not one of the requested deliverables).
- **D9 — SDK + FE ripple is in scope to keep the tree green.** Changing `GetPixelFunnel` and
  `GetDashboard` outputs requires `bun sdk` regen; any FE consumer that breaks (the dashboard, and the
  paused funnel plan) is updated to the new shapes. See Risks.
- **D10 — Frontend money rendering is an encapsulated hook over a `Money` object.** The FE renders
  money from a single `Money` value `{ amountCents, currency }` (the converted, currency-carrying SDK
  shape). A `useMoney()` hook **encapsulates locale inference** (reads `i18n.language` internally) and
  returns a formatter `(money: Money) => string`. Consumers pass a `Money` and get a string — they
  **never** pick a currency, never read `i18n.language`, never hold a `DEFAULT_CURRENCY` constant or a
  `const locale = i18n.language?.startsWith('en') ? 'en-US' : 'pt-BR'` ternary. `lib/format.ts` is
  reworked: a cents-aware single-currency `formatMoney(money, locale)` core + `sumMoney(Money[]) →
  Money`; the multi-currency `MoneyValue` union, `formatMoneyValue`, and the major-unit
  `formatCurrency` are removed (FE money is always single-currency after D1).
- **D11 — `OperationalCostItem` carries `amountCents`.** So every money in the dashboard read renders
  through the same `Money` path, `OperationalCostItemSchema.amount` (raw number) becomes `amountCents`
  (int), keeping its sibling `currency`. The FE builds a `Money` from `{ amountCents, currency }`.

## User Stories

- **US-1** — As a frontend dev, when I read any money KPI from the SDK, the value is an
  `{ amountCents, currency }` object — I render it without separately fetching the store currency.
- **US-2** — As a backend dev, when I aggregate orders across currencies, I use `MultiCurrencyMoney`
  (add/sum/convert) instead of an ad-hoc partial record.
- **US-3** — As a backend dev, money I store on an entity is a `Money` VO that cannot be negative;
  computed reporting figures that can be negative use `SignedMoney` on the read side.
- **US-4** — As a maintainer, there is exactly one money VO name (`Money`) and one number-vs-money
  metric distinction (`NumberMetric` / `MoneyMetric`) across the codebase.
- **US-5** — As a frontend dev, I render any money by passing its `Money` object to `useMoney()` — the
  hook infers the locale and returns the formatted string. I never select a currency, read
  `i18n.language`, or keep a default-currency constant in a component.

## Acceptance Criteria

- **AC-1** — `MonetaryAmount` no longer exists; `Money` (+ `MoneySchema`, `SignedMoneySchema`) is the
  shared money VO in `shared/objects/Money.ts`, exported from `shared/objects/index.ts`. All 24 prior
  `MonetaryAmount` sites compile against `Money`.
- **AC-2** — `shared/schemas/Metric.ts` exports `NumberMetricSchema`, `MoneyMetricSchema`,
  `TallySchema` (`{count: NumberMetric, value: MoneyMetric}`), `segmentedNumber`, `segmentedMoney`.
  `MetricSchema`, `CurrencyMetricSchema`, `ConsolidatedTallySchema`, `CurrencyAmountSchema`, and
  `segmented` no longer exist.
- **AC-3** — `MonetaryByCurrencySchema` and its file are deleted (it had no consumers).
- **AC-4** — `MultiCurrencyMoney` VO exists in `shared/objects/MultiCurrencyMoney.ts` with a partial
  record of `amountCents` per `CurrencyCode` and the utilities in the "MultiCurrencyMoney" section
  below, each covered by a unit test.
- **AC-5** — `GetPixelFunnel` output: `base`, `steps.*`, `conversionRate` are `NumberMetric`; `carts`
  is `{ count: NumberMetric, value: MoneyMetric }`. The FE funnel renders `carts.value` from the
  embedded currency (no separate currency lookup).
- **AC-6** — `GetDashboard` + `dashboard.ts`: money leaves are `MoneyMetric`, ratio/count leaves are
  `NumberMetric`, money breakdowns use `segmentedMoney`; `Consolidated*` variants use
  `MoneyMetric`/`Tally`/`segmentedMoney` (converted). The 4 discriminated-union variants still exist.
- **AC-7** — `ListQuickProductRanking` uses the new `TallySchema`.
- **AC-8** — `bun sdk` regenerated; `bun tsc` (api + app) clean; `bun lint` clean; all affected unit
  tests pass (Money rename tests, MultiCurrencyMoney tests, GetPixelFunnel/GetDashboard tests).
- **AC-9** — Every prior `z.instance(MonetaryAmount)` is now `z.instance(Money)` and the entity still
  rejects negative `amountCents`.
- **AC-10** — `lib/format.ts` exports `formatMoney(money, locale)` (cents-aware, single-currency) and
  `sumMoney(Money[]) → Money`; `MoneyValue`, `formatMoneyValue`, and the major-unit `formatCurrency` no
  longer exist. A `useMoney()` hook in `@/hooks` infers the locale from `i18n.language` and returns a
  `(money: Money) => string` formatter.
- **AC-11** — `AdditionalCostsSection` renders all money via `useMoney()`; it contains **no**
  `DEFAULT_CURRENCY` constant, **no** `i18n.language?.startsWith('en') ? 'en-US' : 'pt-BR'` ternary, and
  **no** per-`kind` currency selection — each money value carries its own currency. `OperationalCostItem`
  exposes `amountCents`.

## Vocabulary — old → new (the contract)

| Old | New | Layer | Notes |
|---|---|---|---|
| `MonetaryAmount` VO `{amountCents≥0, currency}` | **`Money`** VO | write/stored | rename only; keeps `≥0`, `equals` |
| `MonetaryAmountSchema` | **`MoneySchema`** | write | `z.instance(Money)` on entity fields |
| `SignedMonetaryAmountSchema` `{amountCents, currency}` | **`SignedMoneySchema`** | read | value type of `MoneyMetric`; not a VO |
| `MetricSchema` `{value:number, deltaPct}` | **`NumberMetricSchema`** | read/FE | ratios, counts, % |
| — | **`MoneyMetricSchema`** `{value: SignedMoney, deltaPct}` | read/FE | money KPIs (new) |
| `TallySchema` `{count:Metric, value:Metric}` | **`TallySchema`** `{count: NumberMetric, value: MoneyMetric}` | read/FE | same name, new shape |
| `segmented(enum)` (Metric) | **`segmentedNumber(enum)`** | read/FE | number segments |
| `segmentedCurrency(enum)` (CurrencyMetric, in dashboard.ts) | **`segmentedMoney(enum)`** (MoneyMetric) | read/FE | money segments |
| `CurrencyAmountSchema` (partial record → raw number) | **`MultiCurrencyMoney`** VO (partial record → cents) | internal | replaces it; cents |
| `MonetaryByCurrencySchema` (record → cents, **dead**) | **deleted** | — | no consumers |
| `CurrencyMetricSchema` | **deleted** | — | D1 (no multi-currency FE) |
| `ConsolidatedTallySchema` | **deleted** | — | D1 |

## MultiCurrencyMoney — VO shape + utilities

- Lives at `packages/api/typescript/src/shared/objects/MultiCurrencyMoney.ts`. `BasePrimitiveValueObject`
  whose `value` is `Partial<Record<CurrencyCode, number /* amountCents, int */>>`.
  Schema: `z.partialRecord(z.enum(CurrencyCode), z.number().int())`. Immutable — every mutator returns
  a new instance.
- Utilities (each unit-tested):
  - `get(currency: CurrencyCode): number` — cents for that currency, `0` if absent.
  - `currencies(): CurrencyCode[]` — present currencies.
  - `isEmpty(): boolean` — no currencies / all zero.
  - `add(currency: CurrencyCode, cents: number): MultiCurrencyMoney` — returns a new instance with the
    delta folded in.
  - `plus(money: Money): MultiCurrencyMoney` — fold a single `Money` into the bag.
  - `merge(other: MultiCurrencyMoney): MultiCurrencyMoney` — sum two bags per-currency.
  - `static sum(items: MultiCurrencyMoney[]): MultiCurrencyMoney` — fold a list.
  - `convert(rates: Partial<Record<CurrencyCode, number>>, target: CurrencyCode): Money` — multiply
    each currency's cents by its rate-to-target and sum into a single `Money` (rounded to int cents).
    Throws a named domain error if a present currency has no rate (`MISSING_FX_RATE`, a `BaseDomainErrors`).
  - `equals(other): boolean`.

## Migration scope (consumers to update)

| File(s) | Change |
|---|---|
| `shared/objects/MonetaryAmount.ts` → `Money.ts` (+ `.test.ts`) | rename VO + both schemas |
| `shared/objects/index.ts` | export `Money`/`MoneySchema`/`SignedMoneySchema` + `MultiCurrencyMoney` |
| `shared/objects/MultiCurrencyMoney.ts` (+ `.test.ts`) | new VO |
| `shared/schemas/Metric.ts` | `NumberMetric`, `MoneyMetric`, new `Tally`, `segmentedNumber`, `segmentedMoney`; delete `Metric`/`CurrencyMetric`/`ConsolidatedTally`/`CurrencyAmount` |
| `shared/schemas/MonetaryByCurrency.ts` + barrel line | delete |
| `shared/testing/mock.ts` | add `mockMoneyMetric()` / `mockMultiCurrencyMoney()`; keep `mockMetric` for `NumberMetric` |
| sales: `OrderOverrideFields.ts` (+test), `UpdateOrderOverride.test.ts` | `MonetaryAmount`→`Money` |
| catalog: `ProductCostOptionItem.ts`, `ProductCost.ts`/test (comments), `DrizzleProductCostQueryService.ts` | `MonetaryAmount`→`Money` |
| finance: `GatewayFee.ts`, `ShippingFee.ts`, `OperationalCost.ts`, `CreateOperationalCost.ts`, `UpdateOperationalCost.ts`, `UpdateFees.ts` | rename |
| analytics: `Goal.ts`, `CreateGoal.ts`, `UpdateGoal.ts` | rename |
| marketing: `AdSpendManual.ts` (+test) | rename |
| flows: `manual-override-publishes-integration-event.flow.test.ts` | rename |
| tracking: `GetPixelFunnel.ts` | `Metric`→`NumberMetric`; `carts`→`{count:NumberMetric, value:MoneyMetric}`; fakers |
| ui: `dashboard.ts` | money leaves→`MoneyMetric`, ratios→`NumberMetric`, `segmented`→`segmentedNumber`/`segmentedMoney`, `Consolidated*`→`MoneyMetric`/`Tally` |
| ui: `GetDashboard.ts` (+test) | faker body emits converted single-currency money; drop `fakeCurrencyAmount`/`fakeCurrencyMetric`/`fakeConsolidatedTally` |
| ui: `ListQuickProductRanking.ts` | new `Tally` |
| ui: `dashboard.ts` | also: `OperationalCostItemSchema.amount` → `amountCents` (D11) |
| SDK | `bun sdk` regen (openapi + client dist) |
| FE: `packages/app/react/src/lib/format.ts` | rework to `formatMoney(money, locale)` + `sumMoney(Money[])→Money`; delete `MoneyValue`/`formatMoneyValue`/major-unit `formatCurrency` (D10) |
| FE: `packages/app/react/src/hooks/useMoney.ts` (+ barrel) | new hook: infers locale from `i18n.language`, returns `(money)→string` (D10) |
| FE: `AdditionalCostsSection/index.tsx` | render via `useMoney()`; drop `DEFAULT_CURRENCY`, locale ternary, per-`kind` currency selection; money leaves are `MoneyMetric` (D10/D11) |
| FE: paused funnel plan | revised separately after merge (carts → MoneyMetric, drop currency lookup) |

## Risks

- **Dirty working tree — now coordinated in-pass.** The in-flight "Additional Costs Card" FE feature
  is uncommitted and **is the FE consumer this plan refactors** (D10/D11). Commit it first so the FE
  task modifies tracked files and the regen + tsc gate is clean; this change shifts its money types on
  regen and updates it in the same pass.
- **`GetPixelFunnel` shape change retro-fits the paused funnel plan.** `.plans/2026-06-03-pixel-funnel-section.md`
  assumes `carts.value` is a bare number + a separate `useGetUserInfo` currency. After this, `carts.value`
  is a `MoneyMetric` carrying its currency — the funnel plan must be revised (simpler: drop the currency lookup).
- **Discriminated-union near-duplication** after D7 (Consolidated == National on money). Acceptable;
  collapsing is OQ-1.

## Open Questions

- **OQ-1 — Collapse `GetDashboard`'s GLOBAL/NATIONAL union?** After D7, the `Consolidated*` money
  shapes equal their NATIONAL counterparts. Whether to collapse the 4 variants (and what the
  NATIONAL-only `paymentMethods`/`draftOrders` distinction should key on) is a separate `GetDashboard`
  redesign — deferred.
- **OQ-2 — FX rate source.** `convert()` takes rates as input. Where the rate table comes from in the
  real (non-faker) implementation (a rates table, an integration, a cached daily snapshot) is out of
  scope here and needs its own spec.
- **OQ-3 — `Money` arithmetic.** Should `Money` gain `add`/`subtract`/`isZero`, or stay minimal
  (`equals` only) with all arithmetic on `MultiCurrencyMoney`? Default: keep `Money` minimal.
