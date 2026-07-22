# Product-Cost Values Timeline — Design Spec

**Date:** 2026-06-03
**Status:** Draft
**Bounded Context:** catalog (read port consumed by sales, kept insulated)
**Kind:** chore (modeling correctness) + feature (per-(currency,country) cost timeline)
**Story Points:** 5 — catalog-internal end-to-end: `ProductCostOption` restructure + `ProductCost.create/update` grouping/painting + the `DrizzleProductCostQueryService` active-value read + the 2 CSV processors + `BulkImport` + `country` enum + a forward-recreate migration + a new `givenProductCost` helper. Stays a 5 (not 8/13) because **shipping was already removed cross-BC** by prior work (so sales is untouched), the `ApplicableProductCost` output shape is preserved (sales `ProductCostSolver` + `ProductCostApplicationHandler` stay insulated), and the migration needs **no backfill**.

## Context

In catalog (BC5), `ProductCost` is a merchant's COGS configuration for a `(storeIntegration × product?)` scope (`productId` null = kit), with its options stored inline as the `options` jsonb column on `catalog.product_costs`. The current shape (`packages/api/typescript/src/catalog/objects/ProductCostOption.ts` at `bk-dash-polyglot` HEAD `a523afe1`) is:

```ts
ProductCostOption = z.historical({ id, currency: z.enum(CurrencyCode),
                                   country: z.string().length(2).optional(),
                                   items: z.array(z.instance(ProductCostOptionItem)).min(1) })
ProductCostOptionItem = { id, variantIds, quantity, quantityModifier, unitCost, variantsHash }
```

i.e. the **whole record — including the identity fields `currency`/`country` — is wrapped in the `z.historical` time window**. The shared `z.historical` (window combinator) + `Timeline<T>` (last-write-wins interval paint) shipped earlier and are already used by the fees/taxes aggregates (`Fees`, `Taxes`), which adopted the correct keys-structural shape.

What prior/concurrent work already did (so it's **out of scope** here):
- **Shipping is fully removed from product cost.** Neither `ProductCostOption` nor `ProductCostOptionItem` has a `shipping` field; `ApplicableProductCost` has none; and sales `ProductCostSolver` computes COGS from `unitCost × quantity` only (it has a regression test: *"solved totals reflect unit cost only (shipping removed from the cost math)"*). Shipping cost is owned by `Fees.shippingFee`.

Consumers of `ProductCostOption` today:
- **`DrizzleProductCostQueryService.findApplicable({ at })`** (`catalog/services/ProductCostQueryService/`) — the cross-BC read port: iterates each option, hand-rolls a date-range filter on `option.startDate`/`option.endDate` vs `at`, emits `ApplicableProductCost[]` (`{ cost?, country?, startDate, endDate, per-item data }`, **no shipping**).
- **Sales** — `ProductCostSolver` (matching/scoring on the `ApplicableProductCost` output) and the newer `ProductCostApplicationHandler` (`sales/handlers/`, reacts to an integration event and applies costs via the query port). Both depend only on the `ApplicableProductCost` output shape.
- **CSV import** — `ManualProductCostCsvProcessor` / `ShopifyProductCostCsvProcessor` build options from rows; `BulkImportProductCostsFromCsv` on update **re-appends** existing options (`[...existing.options.map(o => o.toJSON()), ...build.options]`) with no dedup/supersession.
- **`CreateProductCost` / `UpdateProductCost`** + controllers take `options: ProductCostOptionInputSchema[]`.

There is **no `givenProductCost` test helper**, **no seed/production data** for `product_costs`, the `options` jsonb is **unversioned**, the latest migration is `0050`, and the `Country` wire enum exists (`packages/contracts/wire/enums/country.tsp`).

## Problem

1. **Identity is inside the time window.** `currency`/`country` — the stable identity of a cost slice — sit inside `z.historical`, the same modeling error already corrected for `Fees`/`Taxes`. Each cost change for one `(currency, country)` produces a fresh whole-record option repeating `currency`/`country`, instead of extending that key's timeline.
2. **Updates duplicate instead of supersede.** `BulkImport` re-appends existing options; a corrected cost for an existing `(currency, country)` accumulates overlapping/duplicate slices rather than trimming/splitting the prior value (exactly what `Timeline.place` solves). The aggregate's claimed "(currency,country) date ranges must not overlap" invariant isn't actually enforced.
3. **`country` is an untyped string** (`z.string().length(2)`), not the `Country` wire enum used everywhere else for closed sets.

## Goal

A product's cost for each `(currency, Country)` becomes one clean time-series: the identity is structural (`country` typed as the `Country` enum) and only the changing COGS value `{ items }` is a leaf `Timeline`. Updating a cost **paints** onto that key's timeline (trim/split/supersede) instead of appending duplicates, and reads select the value active at a date via the timeline. Catalog gains the one consistent time-effective shape already used by `Fees`/`Taxes`, reusing `z.historical` + `Timeline`.

## Decisions

1. **Restructure `ProductCostOption` to keys-structural** (`catalog/objects/`):
   ```ts
   ProductCostOptionValue = z.historical({ items: z.array(z.instance(ProductCostOptionItem)).min(1) })
   ProductCostOption      = z.object({ id: z.instance(Id), currency: z.enum(CurrencyCode),
                                       country: z.enum(Country).optional(),
                                       values: z.array(ProductCostOptionValue).min(1) })
   ```
   `values` is a `Timeline<ProductCostOptionValue>` (reusing the shipped `z.historical` coerced-`Date` window + `Timeline`). `ProductCostOptionItem` is unchanged (already shipping-free). `country` is the `Country` enum.
2. **Wire input — one windowed value per submit, typed country.** `ProductCostOptionInputSchema` becomes `{ currency: z.enum(CurrencyCode), country?: z.enum(Country), startDate: z.iso.date(), endDate?: z.iso.date(), items }`. `ProductCost.create`/`update` **group** input options by `(currency, country)` and **paint** each `{ items, startDate, endDate }` value onto that option's `values` `Timeline` via `Timeline.place`. (`country` becomes enum-constrained; otherwise the wire shape is unchanged — still no shipping.)
3. **Invariants from structure + `Timeline`.** At most one `ProductCostOption` per `(currency, country)` (grouping enforces it); each option's `values` timeline is sorted, non-overlapping (`Timeline` enforces it). Strict `<` rejects zero-length values.
4. **`DrizzleProductCostQueryService.findApplicable({ at })` selects the active value per option, preserving its output shape.** For each option it picks the `values` entry whose window contains `at` (`Timeline.activeAt(at)`; open entry when `at` omitted), then emits the **same `ApplicableProductCost`** (`costId`, `costOptionId`, `country`, `startDate`, `endDate`, per-item `cost`/`quantity`/`variants`) derived from that value. Output unchanged → **sales `ProductCostSolver` + `ProductCostApplicationHandler` need no change.**
5. **CSV import + BulkImport adapt to grouping/painting.** Processors still produce per-row build inputs `{ currency, country?, startDate, endDate?, items }` (`country` parsed to the `Country` enum); `CreateProductCost`/`UpdateProductCost`/`BulkImport` group + paint. `BulkImport` update **supersedes** via `Timeline.place` (no more blind re-append).
6. **Migration forward-recreate, no backfill** (next number after `0050`). Reshape the `product_costs.options` jsonb shape; truncate/reset acceptable (no seed/production data; jsonb unversioned — verified).
7. **Add a `givenProductCost(testBed, overrides?)` helper** (`tests/support/given/`, repo-direct, new shape, re-exported from `@test/support`) — none exists today; ship it with its first consuming test.
8. **`costType`, `displayName`, kit scoping (`productId` null), soft-delete (`deletedAt`)** unchanged.

## User Stories

- **Story 1:** As a merchant, I want to set my product's cost for (USD, US) effective from a date, so that COGS uses it from then on.
  - Given no cost option for (USD, US), when I submit `{ currency: CurrencyCode.USD, country: Country.US, startDate: '2026-05-01', items }`, then a `ProductCostOption` for (USD, US) is created with one `values` entry `endDate: null`.
- **Story 2:** As a merchant, I want to correct my (USD, US) cost from a later date without duplicating the option, so the prior cost stays attributed to the earlier window.
  - Given an active (USD, US) value from `2026-05-01`, when I submit a new (USD, US) value effective `2026-09-01`, then the (USD, US) option's `values` timeline has 2 entries — the first trimmed to end `2026-09-01` — and **no second (USD, US) option is created**.
  - Given a (USD, US) value spanning `[T0, T2)`, when I paint a value over `[T1, T1.5)` inside it, then that option's `values` becomes 3 entries (old, new, old).
- **Story 3:** As the sales cost solver / application handler, I want the cost active at the order date, so that profit uses the right COGS.
  - Given a (USD, US) option with values at `[May, Sep)` and `[Sep, ∞)`, when `findApplicable({ at: 2026-07-01 })` runs, then it returns the May value's items; at `at: 2026-10-01`, the Sep value's — in the unchanged `ApplicableProductCost` shape.
- **Story 4:** As a developer writing catalog tests, I want a `givenProductCost` helper, so tests can seed a cost without the create use case.
  - Given the helper, when a test calls `givenProductCost(testBed, { options })`, then a persisted `ProductCost` with the new `values`-timeline shape exists.

## Acceptance Criteria

- [ ] AC-1: `ProductCostOption` is `{ id, currency: z.enum(CurrencyCode), country?: z.enum(Country), values: ProductCostOptionValue[] }` with `ProductCostOptionValue = z.historical({ items })`. No `z.historical` wraps `currency`/`country`. `country` is the `Country` enum (not a string). `ProductCostOptionItem` unchanged.
- [ ] AC-2: `ProductCost.create`/`update` group submitted input options by `(currency, country)` and paint each value onto that option's `values` `Timeline`; submitting two values for the same `(currency, country)` yields **one** option with a 2-entry timeline (the earlier trimmed), not two options. `variantsHash` computed per item.
- [ ] AC-3: `ProductCostOptionInputSchema` = `{ currency: z.enum(CurrencyCode), country?: z.enum(Country), startDate, endDate?, items }`; `CreateProductCostController`/`UpdateProductCostController` bodies reflect the `Country` enum. SDK regenerated.
- [ ] AC-4: `DrizzleProductCostQueryService.findApplicable({ at })` returns, per option, the value whose window contains `at` (or the open value when omitted), in the **unchanged `ApplicableProductCost` output shape**. A test covers active-value selection across two windows.
- [ ] AC-5: Sales is untouched — `ProductCostSolver` and `ProductCostApplicationHandler` + their tests pass with no changes (output contract preserved).
- [ ] AC-6: `BulkImportProductCostsFromCsv` update supersedes via `Timeline.place` (re-importing the same `(currency, country)` with a later `startDate` trims the prior value, not a duplicate option). Both CSV processors still parse to per-value build inputs (`country` → `Country` enum).
- [ ] AC-7: **No migration** — `catalog.product_costs.options` stays a `jsonb` column whose *contents* reshape (and `country` moves from an in-jsonb string to the `Country` enum value, still inside the jsonb, not a DB column). The only DB-adjacent change is updating the table's doc-comment in `packages/contracts/db/schema/catalog.ts` to the new option shape. No DDL, no `0051` migration, no backfill (verified: no seed/production data).
- [ ] AC-8: A `givenProductCost(testBed, overrides?)` helper exists in `tests/support/given/`, re-exported from `@test/support`, producing the new `values`-timeline shape.
- [ ] AC-9: Existing catalog tests pass after the refactor (`CreateProductCost`, `UpdateProductCost`, `BulkImportProductCostsFromCsv`, query-service, list/history use cases), adjusted to the new shape; `bun tsc` clean.

## Risks & Migration

- **Forward-recreate is safe** only because there is no seed/production `product_costs` data and the `options` jsonb is unversioned (verified). If real data exists at implementation time, revisit (a backfill folding each old option into a single-entry `values` timeline under its `(currency, country)` is mechanical but out of scope).
- **Keep `ApplicableProductCost` byte-stable.** This is what keeps the change catalog-internal (5 pts) and sales insulated. Any change to that output pulls `ProductCostSolver` + `ProductCostApplicationHandler` into scope.
- **History/list reads** (`GetProductCostHistory` / `GetVariantCostHistory` / `GetProductCostsList` / `ListProductVariantCosts`) map cleanly onto the per-option `values` timeline (the timeline *is* the history); adjust option access from flat `option.startDate/items` to `option.values[*]`.

## Open Questions

- None blocking. Shipping removal + the sales-side adaptation are already done on `bk-dash-polyglot`; this spec is purely the catalog values-timeline restructure + `country` enum. If a future requirement wants per-(currency,country) variant breakdowns *stable* across time (items structural, only `unitCost` historical), that's a further refinement — out of scope.

## Reuse

Builds entirely on shipped abstractions on `bk-dash-polyglot`: `z.historical` (core), `Timeline<T>` (`shared/objects`), the `Country` wire enum, and the `Fees`/`Taxes` keys-structural pattern as the template. No new shared primitives.
