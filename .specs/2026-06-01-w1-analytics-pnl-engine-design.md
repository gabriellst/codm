# Analytics P&L Engine — Design Spec (W1)

**Date:** 2026-06-01
**Status:** Draft
**Bounded Context:** cross-context: analytics (← finance, catalog, marketing)
**Kind:** feature
**Story Points:** 13 — new cross-BC service port + 4 use-case implementations + FeesConfiguration VO typing + OperationalCostRepository date-range method; constitutes a new query service (cross-service contract tier), no migration-with-backfill, no new projection.
**Part of:** .specs/2026-06-01-bk-dash-crucial-gaps-closure-roadmap-design.md (master roadmap)
**Depends on:** W5 (finance integration events on bus), W9 (read-model groundwork), W2 (FX capture trigger)

---

## Context

The analytics bounded context exposes four read-side use cases that drive the merchant dashboard: `GetProfitMarginReport`, `GetDashboardOverview`, `GetProductPerformanceReport`, and `GetChart`. All four exist in production code at:

- `/packages/api/typescript/src/analytics/usecases/GetProfitMarginReport.ts` — time-bucketed P&L roll-up; every deduction bucket (`costAmountCents`, `taxAmountCents`, `feesAmountCents`, `operationalAmountCents`, `warrantyAmountCents`) is initialized to 0 in `ensure()` (lines 105–116) and never written to. `marketingAmountCents` is the only real deduction today.
- `/packages/api/typescript/src/analytics/usecases/GetDashboardOverview.ts` — top-level KPIs; `grossMargin: {}`, `grossMarginInReportingCurrency: { amountCents: 0 }`, `grossMarginPercent: 0`, and `roas: 0` are hardcoded (lines 97–103).
- `/packages/api/typescript/src/analytics/usecases/GetProductPerformanceReport.ts` — product-level table; every per-product metric (`unitsSold`, `revenueAmountCents`, `costAmountCents`, `attributedAdSpendAmountCents`, `profitAmountCents`, `marginPercent`) returns 0 (lines 81–90).
- `/packages/api/typescript/src/analytics/usecases/GetChart.ts` — discriminated chart aggregator; four of five `ChartType` values (`REVENUE_PER_SHIFT`, `SALES_PER_WEEKDAY`, `SALES_PER_HOUR`, `SALES_PER_REGION`) return `{ series: [] }` via the early-exit guard at line 52.

The finance data that should feed these use cases is fully Drizzle-backed and tested in isolation. The five finance entities — `Taxes`, `FeesConfiguration`, `OperationalCost`, `WarrantyReserve`, and `FxRate` — live at `/packages/api/typescript/src/finance/entities/`, each with its own Drizzle repository under `/packages/api/typescript/src/finance/repositories/`. These repositories are never queried by the analytics layer today. The existing `ProductCostQueryService` in `/packages/api/typescript/src/catalog/services/ProductCostQueryService/` already resolves applicable per-product cost rules and is the correct read-side port for product cost attribution.

The `marketing.ad_spends` table (Drizzle schema: `/packages/contracts/db/schema/marketing.ts`) carries MANUAL rows with `startDate`/`endDate` text columns for overlap queries but no `bucketStart`. AUTOMATIC Go-sync rows live in a separate `sync.ad_spends` table, Go-owned, written by `/packages/api/go/internal/sync/repositories/adspend/ad_spend_pg.go`.

---

## Problem

1. **Every deduction in `GetProfitMarginReport` is hardcoded 0.** `taxAmountCents`, `feesAmountCents`, `operationalAmountCents`, and `warrantyAmountCents` are never populated. `costAmountCents` likewise. The dashboard's P&L chart is meaningless.

2. **`GetDashboardOverview` returns `grossMargin: {}`, `grossMarginPercent: 0`, and `roas: 0` unconditionally.** Merchants cannot see whether their store is profitable from the overview.

3. **`GetProductPerformanceReport` returns zero for every metric on every product.** The product performance table is an empty shell.

4. **Four of five `ChartType` values return empty series.** `SALES_PER_WEEKDAY`, `SALES_PER_HOUR`, `SALES_PER_REGION`, and `REVENUE_PER_SHIFT` all hit the `if (chartType !== ChartType.REVENUE) return { series: [] }` guard.

5. **`FeesConfiguration` child shapes are `z.unknown()`.** `gatewayFees`, `checkoutFees`, and `shippingFee` carry no type contract (`/packages/api/typescript/src/finance/entities/FeesConfiguration.ts` lines 22–24), making fee computation impossible without unsafe casts.

6. **`OperationalCostRepository` has no date-range overlap query.** The port at `/packages/api/typescript/src/finance/repositories/OperationalCostRepository/OperationalCostRepository.ts` exposes only `findById` and `list` (paginated by store). There is no `findOverlapping(storeId, from, to)` for analytics to sum operational costs over a period.

7. **The MANUAL ad-spend query in `GetProfitMarginReport` uses `gte(adSpends.bucketStart, from)`** (line 98), which excludes all MANUAL rows because `bucketStart` is always NULL for MANUAL entries (it exists only for AUTOMATIC Go-written rows). MANUAL spend is therefore silently dropped from the marketing deduction bucket.

---

## Goal

After this workstream, the merchant P&L dashboard reflects real numbers: taxes, gateway/checkout/shipping fees, product costs, operational costs, warranty reserve, and marketing spend (MANUAL) are all summed and deducted from revenue in `GetProfitMarginReport` and `GetDashboardOverview`; the product performance table shows real `unitsSold`, `revenueAmountCents`, `costAmountCents`, and attributed margin per product; and three of the four previously-stubbed chart types (`SALES_PER_WEEKDAY`, `SALES_PER_HOUR`, `SALES_PER_REGION`) return real SQL-aggregated series.

---

## Decisions

1. **Analytics reads finance via a new `FinanceQueryService` port (direct Drizzle), not by subscribing to W5 integration events.** The analytics use cases are synchronous reads; event subscription would require a projection that does not yet exist. The `FinanceQueryService` is declared as an abstract class following the `XQueryService` naming convention established in the codebase (see `ProductCostQueryService` at `/packages/api/typescript/src/catalog/services/ProductCostQueryService/ProductCostQueryService.ts`). It lives in a new `finance/services/FinanceQueryService/` folder parallel to other query services. (new)

2. **`FinanceQueryService` returns a typed `FinanceSummarySchema` DTO for a given `(storeId, from, to)` window** carrying: `taxRateFraction`, `gatewayFeeRateFraction`, `checkoutFeeRateFraction`, `shippingFeeFlatCents`, `operationalTotalCents`, `warrantyRateFraction`, `reportingCurrency`. The Drizzle implementation resolves each field by calling the existing finance Drizzle repositories directly (not by importing use cases). Return type is Zod-typed. (new)

3. **`FeesConfiguration` child VO types are defined in this workstream as a prerequisite for fee computation.** Three new value object schemas — `GatewayFeeSchema`, `CheckoutFeeSchema`, `ShippingFeeSchema` — replace `z.unknown()` in `/packages/api/typescript/src/finance/entities/FeesConfiguration.ts`. These VOs live in `/packages/api/typescript/src/finance/entities/` alongside the aggregate (not in `shared/objects` because they are finance-internal). The `FeesConfigurationSchema` arrays and nullable field are retyped accordingly.

4. **`OperationalCostRepository` gains a `findOverlapping(storeId, from, to, tx?)` method.** The port at `OperationalCostRepository.ts` is extended; the Drizzle impl uses `NOT (endDate < from OR startDate > to)` overlap semantics (with `endDate IS NULL` treated as open-ended, using `OR endDate IS NULL`). The Mock impl returns `[]`. This method is consumed only by `FinanceQueryService`. (new method on existing artifact)

5. **MANUAL ad-spend fix: switch from `bucketStart` to `startDate`/`endDate` overlap.** In `GetProfitMarginReport`, the `adSpends` query replaces `gte(adSpends.bucketStart, from)` with the same overlap filter the `DrizzleAdSpendManualRepository.breakdown()` already uses: `gte(adSpends.endDate, from.toISOString())` AND `lte(adSpends.startDate, to.toISOString())`. AUTOMATIC spend from `sync.ad_spends` is out of scope for this workstream.

6. **Product cost attribution uses the existing `ProductCostQueryService`.** `GetProfitMarginReport` and `GetProductPerformanceReport` call `ProductCostQueryService.findApplicable({ storeId, at: periodStart })` and multiply resolved `unitCost.amountCents` by `unitsSold` per order line. The analytics use cases receive `ProductCostQueryService` via DI, following the cross-BC read port pattern established by the catalog context.

7. **FX: `FxRateService` wraps `FxRateRepository.findEffective` for multi-currency conversion.** A new thin `FxRateService` class in `finance/services/FxRateService/` encapsulates "convert amountCents from sourceCurrency to reportingCurrency as of date". Identity pairs (same currency) return factor 1.0 without hitting the DB (per `FxRate` entity comment). The service is registered in `finance/registry.ts`. `GetProfitMarginReport` and `GetDashboardOverview` use it to normalize all monetary deduction buckets to the reporting currency. (new)

8. **`GetChart` implements `SALES_PER_WEEKDAY`, `SALES_PER_HOUR`, and `SALES_PER_REGION` via direct Drizzle queries on `sales.orders`.** `SALES_PER_WEEKDAY` groups by `EXTRACT(dow FROM orders.externalCreatedAt)` (0=Sunday through 6=Saturday); `SALES_PER_HOUR` groups by `EXTRACT(hour FROM orders.externalCreatedAt)`; `SALES_PER_REGION` groups by `orders.shippingAddress->>'region'` (JSONB text extract, NULL rows omitted). `REVENUE_PER_SHIFT` is NOT implemented — there is no shift table; it continues to return `{ series: [] }` until a shift entity and table exist.

9. **Layer boundaries are preserved.** `FinanceQueryService` return schema uses `z.uuid()` / `z.string()` / `z.number()` (not `z.instance(Id)`). `GatewayFeeSchema`, `CheckoutFeeSchema`, `ShippingFeeSchema` live on the entity layer and may use `z.enum()` for closed platform sets. No new controllers are added; no OpenAPI surface changes in this workstream.

10. **Analytics `registry.ts` is updated** to register `ProductCostQueryService` (Drizzle impl) and `FxRateService` alongside the existing `GoalRepository`. The `FinanceQueryService` token is exported from `finance/services/FinanceQueryService/index.ts` and registered in `finance/registry.ts`; analytics resolves it via the shared DI container.

---

## User Stories

**US-1 — Merchant views real P&L breakdown**
Given a merchant has configured taxes, fees, and has operational costs in the system,
When they open the Profit & Loss report for a date range,
Then each period row shows non-zero `taxAmountCents`, `feesAmountCents`, `operationalAmountCents`, `warrantyAmountCents`, `costAmountCents` derived from real finance data, and `profitAmountCents` / `marginPercent` are computed correctly as `revenue - (cost + tax + fees + marketing + operational + warranty)`.

**US-2 — Dashboard overview shows gross margin**
Given a merchant has product costs configured,
When they load the dashboard overview,
Then `grossMarginInReportingCurrency` and `grossMarginPercent` reflect revenue minus cost of goods — no longer 0.

**US-3 — Product performance table shows real metrics**
Given a merchant has orders with line items and product costs are configured,
When they open the product performance report,
Then each product row shows the real `unitsSold`, `revenueAmountCents`, `costAmountCents`, `profitAmountCents`, and `marginPercent` for the selected window.

**US-4 — MANUAL ad-spend is included in marketing deduction**
Given a merchant has recorded manual ad-spend entries with a date range (no `bucketStart`),
When the P&L report is computed,
Then those manual spend entries appear in the `marketingAmountCents` deduction bucket.

**US-5 — Developer can request SALES_PER_WEEKDAY, SALES_PER_HOUR, or SALES_PER_REGION charts**
Given orders exist in the requested window,
When the `GetChart` use case is called with one of those three chart types,
Then a non-empty series is returned with one point per distinct bucket value (day-of-week 0–6, hour 0–23, or region string).

---

## Acceptance Criteria

1. `GetProfitMarginReport` returns non-zero `taxAmountCents`, `feesAmountCents`, `operationalAmountCents`, `warrantyAmountCents`, and `costAmountCents` when corresponding finance entities exist for the store and period. `profitAmountCents = revenueAmountCents - (sum of all deductions)`. `marginPercent = profitAmountCents / revenueAmountCents * 100` (0 when revenue is 0). Verified by an integration test seeding Taxes, FeesConfiguration, OperationalCost, WarrantyReserve, and ProductCost records.

2. `GetProfitMarginReport` includes MANUAL ad-spend rows in `marketingAmountCents` via `startDate`/`endDate` overlap (not `bucketStart`). Verified by seeding a MANUAL `adSpends` row with null `bucketStart` and asserting non-zero marketing total.

3. `GetDashboardOverview` returns non-zero `grossMarginInReportingCurrency.amountCents` and `grossMarginPercent` when product cost records exist for the store's orders. `roas` is computed as `revenueInReportingCurrency.amountCents / marketingSpendInReportingCurrency.amountCents` when both are non-zero (0 when marketing spend is 0).

4. `GetProductPerformanceReport` returns correct `unitsSold`, `revenueAmountCents`, `costAmountCents`, and `profitAmountCents` for each product when order lines reference that product and a matching `ProductCost` record exists. Verified by an integration test seeding orders with JSONB `lines` referencing a product id and a matching ProductCost.

5. `GetChart` with `ChartType.SALES_PER_WEEKDAY` returns series with one point per distinct day-of-week present in the orders window; `ChartType.SALES_PER_HOUR` returns one point per distinct hour; `ChartType.SALES_PER_REGION` returns one point per distinct non-null region string in `shippingAddress`. Verified by integration tests added to `GetChart.test.ts`.

6. `FeesConfiguration` entity's `gatewayFees` is typed as `GatewayFeeSchema[]`, `checkoutFees` as `CheckoutFeeSchema[]`, and `shippingFee` as `ShippingFeeSchema | null`. `z.unknown()` is removed from `FeesConfigurationSchema`. Existing `DrizzleFeesConfigurationRepository.test.ts` passes with the typed schemas.

7. `OperationalCostRepository.findOverlapping(storeId, from, to)` returns all non-deleted rows whose date range overlaps `[from, to]`, including open-ended rows (`endDate IS NULL`). Verified in `DrizzleOperationalCostRepository.test.ts`.

8. `FinanceQueryService` abstract class, Drizzle impl, and Mock are registered in `finance/registry.ts` and resolvable from an integration `TestBed`. `FxRateService` is registered in the same registry.

9. `bun tsc` and `bun run test` (analytics + finance suites) pass clean after all changes.

---

## Open Questions

1. **W1a/W1b split?** If /plan reveals the artifact count exceeds a single safe PR, the natural seam is: W1a = FeesConfiguration VO typing + OperationalCostRepository.findOverlapping + FinanceQueryService port + FxRateService (infra/entity layer); W1b = wire all deductions into the four use cases + chart type implementations (application layer). Flag at /plan time.

2. **REVENUE_PER_SHIFT deferral scope.** There is no `shifts` table or entity in the current schema. This spec explicitly defers `REVENUE_PER_SHIFT`. Should this be tracked as a separate issue in ClickUp before W1 closes?

3. **ProductPerformanceReport line attribution.** The `orders.lines` JSONB shape varies by platform (Shopify, NuvemShop, Kiwify). The `ProductCostQueryService` resolves cost rules per product, but summing `unitsSold` requires parsing JSONB line items. Does a canonical line-shape projection (referenced in `GetProductPerformanceReport.ts`'s JSDoc) need to land before W1b, or can this workstream parse the JSONB inline with a platform-variant key lookup?

4. **Multi-currency FX scope.** When a store has orders in multiple currencies, should each deduction bucket be individually converted to the reporting currency, or is the current single-dominant-currency approximation (revenue pick) acceptable for the first real implementation?

---

## Out of Scope

- AUTOMATIC Go-owned `sync.ad_spends` aggregation into the TS analytics layer.
- `REVENUE_PER_SHIFT` chart type (no shift entity or table).
- W5 integration events or event-driven projection updates.
- CartPanda / Yampi line-item normalization specifics.
- New API controllers or SDK regeneration (no new HTTP surface).
- NFRs: latency, throughput, i18n, a11y, rate-limiting.
