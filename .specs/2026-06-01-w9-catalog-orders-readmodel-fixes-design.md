# Catalog & Orders Read-Model Fixes — Design Spec (W9)

**Date:** 2026-06-01
**Status:** Draft
**Bounded Context:** cross-context: catalog, sales
**Kind:** bug
**Story Points:** 8 — 6 artifacts (3 bug fixes + 1 new controller + 2 new projection+projector pairs); new projection+projector pair (Product + Variant) triggers the +1 tier
**Part of:** .specs/2026-06-01-bk-dash-crucial-gaps-closure-roadmap-design.md (master roadmap)
**Depends on:** none (Wave 0)

## Context

The bk-dash polyglot port has a cluster of read-model bugs in two bounded contexts that silently corrupt the data merchants see. The catalog context has two problems: the `GetProductsList` use case at `/packages/api/typescript/src/catalog/usecases/GetProductsList.ts` reads `tags` directly off the `catalog.products` table, but SPEC-10 moved merchant-curated tags into a separate `catalog.product_overrides` table (`/packages/contracts/db/schema/catalog.ts` lines 70–87). The `GetProductDetail` use case at `/packages/api/typescript/src/catalog/usecases/GetProductDetail.ts` already LEFT JOINs `product_overrides` correctly (lines 63–68) — `GetProductsList` needs to mirror this join. Additionally, the `ProductCostOptionItemInputSchema` in `/packages/api/typescript/src/catalog/entities/ProductCost.ts` line 30 declares `variantIds: z.array(z.uuid()).min(1)`, but the `ProductCostSolver` in `/packages/api/typescript/src/sales/services/ProductCostSolver/optionExpansion.ts` lines 73–81 already handles empty `variantIds` as a "generic cost applies to all variants of this product" fallback — the input path enforces `min(1)` making the generic-cost feature unreachable. A `GenerateProductCostCsv` export controller also does not exist in `/packages/api/typescript/src/catalog/controllers/index.ts` despite the import controller `BulkImportProductCostsFromCsvController` being present; there is no export round-trip.

The sales context has two related problems: `GetOrderDetail` in `/packages/api/typescript/src/sales/usecases/GetOrderDetail.ts` SELECTs only `orderOverrides.paymentStatus` from the `sales.order_overrides` LEFT JOIN, but the schema at `/packages/contracts/db/schema/sales.ts` lines 185–201 shows `order_overrides` holds six additional override columns (`revenueAmountCents`/`revenueCurrency`, `shippingAmountCents`/`shippingCurrency`, `feesAmountCents`/`feesCurrency`, `taxesAmountCents`/`taxesCurrency`, `productCostByLine`) that are never surfaced. `GetOrdersList` in `/packages/api/typescript/src/sales/usecases/GetOrdersList.ts` and its controller `/packages/api/typescript/src/sales/controllers/GetOrdersListController.ts` have no `paymentMethod` filter, no sort parameter, and no per-row cost/profit/margin fields in the output — columns that exist on `sales.orders` (`paymentMethod`, `subtotalCents`, `shippingTotalCents`, `taxTotalCents`) and would enable per-order P&L display.

Finally, `/packages/api/typescript/src/catalog/index.ts` declares `internalHandlers = {}` and `externalHandlers = {}`, meaning the `integration.shared.product.updated` and `integration.shared.variant.updated` integration events emitted by go-worker (contracts at `/packages/contracts/generated/typescript/src/wire/events/product-updated.ts` and `variant-updated.ts`) have no TS consumer. Without these handlers writing to TS-side Product and Variant projections, catalog reads after a data-wipe/backfill cannot be served from TS-owned state.

## Problem

1. **Tags always empty in product list.** `GetProductsList` reads `r.tags` from `catalog.products`, which has no `tags` column since SPEC-10 — `products` rows will carry `undefined`/null for that field. The `GetProductDetail` workaround (LEFT JOIN `product_overrides`) is not mirrored in the list query, so every product shows an empty tag array regardless of what the merchant configured.

2. **Order detail omits six override fields.** `GetOrderDetail` joins `order_overrides` but only projects `overridePaymentStatus`; the revenue, shipping, fees, taxes, and per-line product cost columns are selected as `null` and never returned, making the override row effectively invisible to callers beyond payment-status correction.

3. **Order list has no paymentMethod filter, sort, or per-row P&L.** A merchant filtering by payment method (PIX, boleto, credit card) cannot do so; the list is always sorted `DESC externalCreatedAt` with no override; and there are no cost/profit/margin columns per row even though `orders.subtotalCents`, `shippingTotalCents`, and `taxTotalCents` are available.

4. **Generic-cost items unreachable.** `ProductCostOptionItemInputSchema.variantIds` has `.min(1)`, preventing the caller from expressing "this cost tier applies to all variants of this product". The `ProductCostSolver` already handles `item.variants?.length === 0` (line 73 `optionExpansion.ts`) so the solver capability exists but the input path blocks it.

5. **No CSV export for product costs.** `BulkImportProductCostsFromCsvController` at `/packages/api/typescript/src/catalog/controllers/BulkImportProductCostsFromCsvController.ts` imports cost data from CSV but there is no corresponding export. A merchant cannot download the current cost configuration to edit and re-import it.

6. **No TS consumer for Go product/variant sync events.** `catalog/index.ts` wires `externalHandlers = {}` — `integration.shared.product.updated` and `integration.shared.variant.updated` events land on the outbox but are never dispatched to handlers. Without `ProductProjection` and `VariantProjection` backed by handlers that upsert into `catalog.products` and `catalog.variants`, a future data-wipe would leave the TS read path dark until Go re-backfills.

## Goal

Fix all six catalog and sales read-model gaps: product list tags now reflect merchant-configured values via a LEFT JOIN on `product_overrides`; order detail exposes all six override columns; order list gains a `paymentMethod` filter, `sort` parameter, and per-row `subtotalCents`/`shippingCents`/`taxCents`/`productCostCents`/`profitCents` enrichment; generic cost items (empty `variantIds`) become expressible through the input path; a `GenerateProductCostCsv` endpoint round-trips the MANUAL import format; and the catalog context registers `ProductUpdatedHandler` + `VariantUpdatedHandler` as external handlers so Go-emitted sync events are consumed in TS.

## Decisions

1. **`GetProductsList` LEFT JOINs `product_overrides`** grouped by `(productId, storeId)` to retrieve tags — identical to the pattern already used in `GetProductDetail`. No new table, no schema change.

2. **`GetOrderDetail` adds all six override columns to the SELECT clause** — `revenueAmountCents`/`revenueCurrency`, `shippingAmountCents`/`shippingCurrency`, `feesAmountCents`/`feesCurrency`, `taxesAmountCents`/`taxesCurrency`, `productCostByLine` — and maps them to typed nullable fields in the output schema, COALESCing each with the corresponding canonical `orders.*` value where sensible (revenue and shipping), and returning `null` when no override row exists for cost/fees/tax fields.

3. **`ProductCostOptionItemInputSchema.variantIds` drops `.min(1)` to `.min(0)`** (effectively `.array(z.uuid())`). The `variantsHash` for an empty array is `''` (stable: `[].sort().join('|')`). No migration needed — the constraint lives only in the input schema, not in the DB column. The `ProductCostOptionItemSchema` entity-side keeps `z.instance(Id)` for variant items and retains an `isGeneric` derivation from `variantIds.length === 0`.

4. **`GetOrdersList` adds `paymentMethod` filter (optional `z.stringToArray(z.enum(PaymentMethod))`), `sort` parameter (optional `z.enum(['externalCreatedAt', 'totalCents'])` defaulting to `externalCreatedAt`), `sortDir` (optional `z.enum(['asc', 'desc'])` defaulting to `desc`), and per-row enrichment fields.** Per-row P&L fields (`subtotalCents`, `shippingTotalCents`, `taxTotalCents`) come from `orders.*` directly (already in the table); `productCostCents` and `profitCents` are `null` at list level — full P&L attribution (solver) belongs to the detail view, not the list. This keeps the list query a single JOIN without fan-out per row.

5. **`GenerateProductCostCsv` is a new GET controller** at `/product-costs/export-csv` (catalog context). It accepts `storeIntegrationId` in `query`, reads all non-deleted `ProductCost` rows for that integration via `ProductCostRepository.findByStoreIntegration`, and serialises them into the MANUAL CSV format (same columns as `ManualProductCostCsvParser.requiredColumns` in `/packages/api/typescript/src/catalog/services/ProductCostCsvParser/parsers/ManualProductCostCsvParser.ts`). The response is `text/csv` with `Content-Disposition: attachment`. The output schema wraps a `csvContent: z.string()` so the SDK can pass it through; the controller sets `Content-Type` via a raw response header.

6. **`ProductProjection` and `VariantProjection` are lightweight free-record projections** (no base class) living in `catalog/projections/`. They carry the same shape as `catalog.products` and `catalog.variants` respectively, derived from the Drizzle table definitions. Their purpose is a TS-owned confirmation that `catalog.products`/`catalog.variants` rows exist (Go owns the writes; TS needs the read acknowledgment for cache invalidation). Because Go already writes the rows directly via UPSERT, the projectors' job is **not** to re-write the rows but to trigger any TS-side invalidation needed on product/variant change. For W9, the projectors register on the external mediator and acknowledge the events; full cache-invalidation wiring belongs to W1.

7. **`ProductUpdatedHandler` and `VariantUpdatedHandler` extend `EventHandler`**, placed in `catalog/handlers/external.ts` and registered in `catalog/index.ts` via `import * as externalHandlers from './handlers/external'`. They subscribe to `integration.shared.product.updated` and `integration.shared.variant.updated` respectively (from `/packages/contracts/generated/typescript/src/wire/events/product-updated.ts` and `variant-updated.ts`). For W9, the handler bodies are stubs (`// W1 wires cache-invalidation here`) — the registration and type-safe event consumption are what W9 delivers.

8. **Layer boundaries per the program's cross-cutting Decision 8.** Controller `InputSchema` keys are `ctx`/`query`/`body` only; `z.instance(Id)` stays on entity/VO schemas only; events and handler classes use `z.uuid()`/`z.string()`; `z.enum(Enum)` for `PaymentMethod`, `ProductStatus`, etc.

## User Stories

**S1 — Product list tags**

Given a merchant who has added tags to a product via the `AddProductTag` use case (stored in `catalog.product_overrides`), when they call `GET /products`, then each product row in the response includes the merchant-configured tag array instead of `[]`.

- AC-1, AC-2

**S2 — Order detail override fields**

Given a merchant who has applied a revenue + shipping override to an order via `UpdateOrderOverride`, when they call `GET /orders/:id`, then the response includes `overrideRevenue`, `overrideShipping`, `overrideFees`, `overrideTaxes`, `overrideProductCostByLine` fields (each nullable), and `overridden` remains `true`.

- AC-3, AC-4

**S3 — Order list filtering and enrichment**

Given a merchant on a store with PIX and credit card orders, when they call `GET /orders?paymentMethod=PIX`, then only PIX orders appear; when they call `GET /orders?sort=totalCents&sortDir=asc`, then results are ordered ascending by total; and each row includes `subtotalCents`, `shippingTotalCents`, `taxTotalCents` from the canonical order row.

- AC-5, AC-6, AC-7

**S4 — Generic cost item**

Given a merchant creating a `ProductCost` with one option containing a single item that applies to all variants (empty `variantIds: []`), when they call `POST /product-costs`, then the aggregate is created and the `ProductCostSolver` resolves it as a generic fallback cost for all order variants of that product.

- AC-8

**S5 — Product cost CSV round-trip**

Given a merchant with three product costs configured in a store integration, when they call `GET /product-costs/export-csv?storeIntegrationId=<id>`, then they receive a MANUAL-format CSV file; when they upload that file back via `POST /product-costs/import-csv` with `provider=MANUAL`, then the import succeeds without row errors.

- AC-9, AC-10

**S6 — Go sync event consumption**

Given go-worker emitting `integration.shared.product.updated` and `integration.shared.variant.updated` after a Shopify backfill, when the TS outbox dispatcher delivers these events, then the `ProductUpdatedHandler` and `VariantUpdatedHandler` handle them without error (no-op for W9; cache-invalidation in W1).

- AC-11

## Acceptance Criteria

1. `GetProductsList` output: for a product that has a non-empty `tags` array in `catalog.product_overrides`, the corresponding item in the response `items` array has `tags` matching the stored array; for a product with no override row, `tags` is `[]`.

2. `GetProductsList` uses a LEFT JOIN on `catalog.product_overrides` (not a subquery or second round-trip) — verifiable by reading the Drizzle query in the updated use case.

3. `GetOrderDetail` output includes `overrideRevenue: { amountCents, currency } | null`, `overrideShipping: { amountCents, currency } | null`, `overrideFees: { amountCents, currency } | null`, `overrideTaxes: { amountCents, currency } | null`, `overrideProductCostByLine: Array<{ lineId, costAmountCents, costCurrency }> | null` — each `null` when no override row exists, populated when the override row carries a value.

4. Existing `GetOrderDetail` test suite passes; a new test case inserts an `order_overrides` row with `revenueAmountCents`, calls the use case, and asserts the revenue override is present in the output.

5. `GetOrdersList` accepts `paymentMethod` as a comma-separated query param (`z.stringToArray(z.enum(PaymentMethod))`); a test inserts orders with `paymentMethod = PIX` and `paymentMethod = CREDIT_CARD`, filters by `paymentMethod=PIX`, and asserts only PIX orders are returned.

6. `GetOrdersList` accepts `sort` (`externalCreatedAt` | `totalCents`) and `sortDir` (`asc` | `desc`); a test asserts the sort direction is honoured (e.g. ascending `totalCents` returns cheapest-first).

7. `GetOrdersList` output items include `subtotalCents: number`, `shippingTotalCents: number`, `taxTotalCents: number` sourced from the canonical `orders.*` columns; existing `GetOrdersList` test suite passes.

8. `ProductCostOptionItemInputSchema` accepts `variantIds: []`; `ProductCost.create` with an option containing an empty-`variantIds` item succeeds; `ProductCostSolver` resolves the generic item as the fallback cost for all order variants of that product (existing solver unit test covers this path; a new test exercises the full input→entity→solver chain).

9. `GenerateProductCostCsv` (`GET /product-costs/export-csv?storeIntegrationId=<id>`) returns a CSV whose headers match exactly the `requiredColumns` of `ManualProductCostCsvParser`; a row count in the response equals the count of non-deleted `ProductCost` rows for that integration.

10. A round-trip integration test: seed two `ProductCost` rows, call the export endpoint, feed the CSV content back to `BulkImportProductCostsFromCsv` with `provider=MANUAL`, and assert `errors` is empty and `updatedCount === 2`.

11. `catalog/handlers/external.ts` exports `ProductUpdatedHandler` and `VariantUpdatedHandler`; each is a typed `EventHandler` over `ProductUpdatedEvent` / `VariantUpdatedEvent` from the contracts package; `catalog/index.ts` imports from `./handlers/external` and passes `externalHandlers` to `BoundedContext.create`; a unit test calling `handler.handle(event)` on a stub event does not throw.

---

## Risks & Migration

- **Sub-task 3 (order list enrichment):** `subtotalCents` is already on the `orders` table — no migration needed. The `paymentMethod` column is also already on `orders` (line 66 in `sales.ts`). No schema change is required for any of the six sub-items.

- **Sub-task 4 (`variantIds: min(0)`):** The entity-level `ProductCostOptionItemSchema` retains `z.instance(Id)` for variant ids (entity layer boundary). Only the use-case/controller input path (`ProductCostOptionItemInputSchema`) relaxes `min(1)` to no minimum. Existing items in the database have non-empty `variantIds` arrays — this is additive, not breaking.

- **Sub-task 6 (projection handlers):** Go already writes `catalog.products` and `catalog.variants` directly via UPSERT — no data migration. The new TS handlers are a wire-registration fix. If the Redis external mediator is not running during tests, integration tests for the handler should use the in-process `MockExternalMediator`.

## Out of Scope

- Full per-order P&L attribution using `ProductCostSolver` at list level (CPU cost; belongs to W1's product-performance report, not the list endpoint).
- Any CartPanda / Yampi / Kiwify platform connectors or CSV parser variants.
- Shopify-format CSV export (round-trip for the SHOPIFY provider requires storing the Shopify handle on the cost row; that denormalization is a separate schema decision).
- Real cache invalidation wired to `ProductUpdatedHandler` / `VariantUpdatedHandler` (W1 owns this; W9 provides the handler shell).
