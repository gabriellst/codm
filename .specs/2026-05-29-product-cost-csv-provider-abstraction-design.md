# ProductCost CSV Import — Provider Abstraction (MANUAL + SHOPIFY) — Design Spec

**Date:** 2026-05-29
**Status:** Approved
**Bounded Context:** catalog (+ `packages/contracts`: two new wire enums)
**Kind:** feature
**Story Points:** 8 — single-context but broad: a provider abstraction (base + 2 parsers + 2 processors + facade/registry), a 3-impl `ProductQueryService` handle/title resolver, a 3-impl `ProductCost.saveMany`, two contracts enums, a use-case rewrite, a controller discriminated-union + SDK regen, and tests. No migration, no cross-service contract — so no decomposition needed (well under 13).

## Context

Today, `BulkImportProductCostsFromCsv` (`packages/api/typescript/src/catalog/usecases/BulkImportProductCostsFromCsv.ts`) is a single-format importer: it hand-rolls its own CSV tokenizer with `content.split(/\r?\n/)` + `line.split(',')` (no quoting/escaping/BOM — documented as "spreadsheet exports only"), validates each row inline in a local `buildRow()`, then loops over valid rows inside one transaction doing — per row — a `productCosts.findByStoreAndProduct(...)`, a `productCosts.save(...)`, and a `domainEventRepository.save(...)`. For N rows that's ~3N DB round-trips. The required columns are a bespoke bk-dash shape (`productId`, `variantIds`, `quantity`, `quantityModifier`, `costType`, `unitCostAmountCents`, …). Per-row failures accumulate as loose `{ row: number, message: string }` strings in the output.

The aggregate it writes, `ProductCost` (`catalog/entities/ProductCost.ts`), keys on `(storeId, productId)` and holds `options: ProductCostOption[]`, each option holding `items` with `variantIds: uuid[]`, `quantity`, `quantityModifier`, `unitCost`, `shipping`. Its repository (`catalog/repositories/ProductCostRepository/`) exposes `findById`, `findByStoreAndProduct`, `list`, `save`, `delete` — there is **no `*Many` method anywhere in the codebase**. `save` already uses `INSERT … ON CONFLICT (id) DO UPDATE`.

The catalog read-models needed to resolve a Shopify export to internal ids exist: `products` (`packages/contracts/db/schema/catalog.ts`) carries `handle`, `externalId`, `platform`, `storeIntegrationId`; `variants` carries `title`, `sku`, `externalId`, `productExternalId`, `storeIntegrationId`. Crucially, the Go Shopify sync (`packages/api/go/internal/sync/services/shopify/product_normalizer.go:137-153`) sets `variants.title` to the Shopify variant title, **falling back to `option1 / option2 / option3` joined by `" / "`** when Shopify sends "Default Title" — so `variants.title` is exactly the field a Shopify cost-export row's composed option name matches against. `ProductQueryService` (`catalog/services/ProductQueryService/`) today only has `findById` / `findByIds` — no handle/SKU resolver yet.

Supporting facts: `DomainEventRepository.saveMany(events, tx)` already exists (`packages/api/typescript/core/src/repositories/DomainEventRepository.ts`). There is **no frontend consumer** of `POST /product-costs/import-csv` — only the generated SDK hook `useBulkImportProductCostsFromCsv` and the use-case test — so the request/response shape can change with low blast radius. No CSV library is installed today.

A faithful reference implementation exists on disk at `/Users/gabrielaraujo/Desktop/Projetos/bk-company/bk-dash-backend/backend-old/src/modules/products/` (`utils/ProductCostCsv/` parsers + `services/ProcessProductCostCsv.ts` registry + `utils/ProductCostCsv/processors/shopify.ts`). Per the project's modeling rule ("if a reference implementation exists on disk, read it and mirror its structure"), this design mirrors its **parser + processor + registry** split, adapted to our Clean/DDD layering (persistence + events live in the use case, not the processor).

## Problem

1. Only one hardcoded CSV format is supported; there is no way to import a Shopify product export (the dominant real-world source of cost-of-goods data).
2. The hand-rolled `String.split` tokenizer breaks on quoted fields with embedded commas/newlines and on BOM-prefixed exports — which real provider CSVs routinely contain.
3. The importer does ~3N DB round-trips (per-row `find` + `save` + event `save`); there is no bulk write path.
4. Per-row errors are loose strings (`{ row, message }`) — they can't be i18n'd by the frontend and tests are forced to assert on free text, violating the project's "assert on the code, never the message" rule.

## Goal

A store operator can bulk-import product costs from **either** the bespoke MANUAL format **or** a Shopify product export, choosing the provider explicitly. Shopify rows are resolved to internal products/variants by handle + variant title; all valid costs are written in a single bulk insert; and every per-row failure is reported as a typed, i18n-able error code with its row number. Adding a third provider later means adding one parser + one processor + one enum value — no use-case or repository change.

## Decisions

1. **Provider is explicit.** A new TypeScript enum `ProductCostCsvProvider { MANUAL, SHOPIFY }` (in `catalog/enums`, via `/enum` — **not** a `packages/contracts` wire enum, since it never crosses a service boundary) is passed in the request; the importer routes on it. It reaches the SDK through the controller schema + `openapi.registerEnums`. No header auto-detection. (`MANUAL` = today's bespoke columns, preserved; `SHOPIFY` = new.)
2. **Tokenize with `papaparse`** (+ `@types/papaparse`), added to `packages/api/typescript`. (The reference uses `csv-parse`; `papaparse` is the equivalent chosen here — both handle quotes/BOM/embedded commas.)
3. **MANUAL and SHOPIFY coexist.** The bespoke format becomes the `MANUAL` provider (keeps kit/`MULTIPLE` costType + `quantityModifier` expressiveness Shopify's flat export can't represent, plus its existing test); `SHOPIFY` is added alongside.
4. **`saveMany` only** — bulk write is added; bulk read is not. The per-distinct-product `findByStoreAndProduct` lookups remain (now bounded by distinct products, not rows).
5. **Shopify cost metadata comes from request params.** Since a Shopify export has neither currency nor a cost-effective date, the `SHOPIFY` request carries `currency` + `effectiveDate` (→ option `startDate`) and an optional `endDate`, applied to all Shopify rows. `quantity=1`, `quantityModifier=EQ`, `shipping=0`, `costType=SINGLE`.
6. **Shopify resolution mirrors `bk-dash-backend`:** group rows by `handle`; resolve product by `handle` and variant by matching the row's composed option name (`[option1 value, option2 value, option3 value].filter(Boolean).join(' / ')`) against `variants.title`, all scoped by `storeIntegrationId`, via one bulk lookup. Unresolved handle/variant rows are **skipped** — but surfaced as typed error rows (see Decision 8) rather than the reference's silent `console.warn`.
7. **Parser + Processor pair per provider, behind a `ProductCostCsvParser` facade/registry** (mirrors the reference's `ProcessProductCostCsv`). Parsers are pure (CSV → canonical rows); processors do resolution + grouping (CSV-agnostic). Persistence + event emission live in the **use case**, not the processor (our convention), unlike the reference.
8. **Typed row errors.** The closed set of row-failure codes is a typed `CatalogCsvImportErrors` union in `catalog/errors` (via `/errors`, registered with HTTP statuses) — **not** a `packages/contracts` wire enum. The facade returns `errors: ProductCostCsvRowError[]` where `ProductCostCsvRowError = { row: number; code: CatalogCsvImportErrors; value?: string }`. The use-case output schema's `errors` carries the same `{ row, code, value? }` shape — `code` is a `z.string()` (a registered `CatalogCsvImportErrors` code the frontend i18n's, typed at the producer via the union). These are partial-success **data**, not thrown errors, so they carry a typed code rather than a `BaseError` instance.
9. **`ProductCostRepository.saveMany(entities, tx)`** is added to the port + Drizzle + Mock — one multi-row `INSERT … ON CONFLICT (id) DO UPDATE` via `.values(array)`, incrementing version per entity.
10. **One Created/Updated event per aggregate** (was one per row), persisted via `DomainEventRepository.saveMany(events, tx)` in the same transaction as `saveMany`.
11. **Controller request body is a discriminated union on `provider`** — `MANUAL` needs only `csvContent`; `SHOPIFY` additionally requires `currency` + `effectiveDate` (optional `endDate`). SDK is regenerated.
12. **No migration** — `products`, `variants`, `product_costs` already exist. Both new enums are TS-only (consumed by the catalog controller + SDK); no Go service consumes them, so there is **no cross-service contract**.

## User Stories

- **Story 1:** As a store operator, I want to import a Shopify product-export CSV and have its per-variant "Cost per item" become product costs, so that I don't re-key costs by hand.
  - Given a SHOPIFY integration with products/variants already synced, when I import a Shopify CSV with `provider=SHOPIFY`, `currency`, and `effectiveDate`, then each row whose `handle` + composed option name resolves to a known variant is written as a `SINGLE` cost item under one `ProductCost` per product, and the response reports `createdCount`/`updatedCount`.
  - Given a Shopify row whose handle is unknown or whose composed variant name doesn't match any `variants.title`, when I import, then that row is skipped, `skippedCount` increments, and `errors[]` contains `{ row, code: UNKNOWN_HANDLE | UNRESOLVED_VARIANT, value }`.
  - Given a Shopify CSV with quoted fields containing commas, when I import, then the fields tokenize correctly (no longer split mid-value).

- **Story 2:** As a store operator, I want to keep importing the bespoke MANUAL format unchanged, so that existing tooling and kit/multi-variant costs still work.
  - Given a MANUAL CSV with today's columns, when I import with `provider=MANUAL`, then behavior matches today (each row → one option; multiple rows for the same product roll into one aggregate), with the only differences being typed error codes and a single bulk write.

- **Story 3:** As a frontend developer, I want import failures returned as typed codes, so that I can show a localized message and assert on the code in tests.
  - Given a MANUAL row with an invalid `currency`, when I import, then `errors[]` contains `{ row, code: INVALID_CURRENCY, value: "<bad value>" }` and no message string is relied upon.

- **Story 4:** As a backend developer adding a new cost-CSV provider later, I want to register one parser + one processor + one enum value, so that I don't touch the use case or repository.

## Acceptance Criteria

- [ ] AC-1: `ProductCostCsvProvider { MANUAL, SHOPIFY }` exists as a `catalog` TypeScript enum and `CatalogCsvImportErrors` as registered `catalog` error codes (neither in `packages/contracts`); `ProductCostCsvProvider` is present in the generated SDK after `bun sdk` (via the controller schema).
- [ ] AC-2: `POST /product-costs/import-csv` accepts a body discriminated on `provider`; `SHOPIFY` requires `currency` + `effectiveDate` (optional `endDate`); `MANUAL` requires only `csvContent`. Missing required provider fields fail controller validation.
- [ ] AC-3: With `provider=SHOPIFY` and seeded `products`/`variants` for the integration, importing a Shopify CSV resolves rows by `handle` + composed option name against `variants.title` (scoped by `storeIntegrationId`) and creates one `ProductCost` per product with one `SINGLE` item per matched variant, using request `currency`/`effectiveDate`.
- [ ] AC-4: Shopify rows with an unknown handle, an unmatched variant name, or a blank composed variant name are skipped, increment `skippedCount`, and appear in `errors[]` with the corresponding typed `code`.
- [ ] AC-5: `provider=MANUAL` reproduces today's import behavior (same created/updated/skipped outcomes for the existing test fixtures), with errors now carried as typed `code`s.
- [ ] AC-6: Quoted CSV fields containing commas/newlines and a BOM-prefixed file parse correctly under both providers (papaparse).
- [ ] AC-7: `ProductCostRepository.saveMany(entities, tx)` exists on the port, Drizzle impl (single multi-row `INSERT … ON CONFLICT DO UPDATE`), and Mock impl; a repository integration test verifies a mixed insert+update batch persists correctly and increments `version`.
- [ ] AC-8: The use case persists all valid aggregates via `saveMany` and all aggregate events via `DomainEventRepository.saveMany` inside a single transaction, emitting exactly one Created/Updated event per aggregate (verified via `DomainEventRepository.findByType`).
- [ ] AC-9: The output schema's `errors[]` is `{ row: int≥0, code: string (a registered CatalogCsvImportErrors code), value?: string }`; no test asserts on a free-text message.
- [ ] AC-10: `bun tsc`, `bun lint`, and the catalog test suite pass; SDK regenerated.

## Component Map

TypeScript-local (no `packages/contracts`):
- `catalog/enums/ProductCostCsvProvider.ts` → `ProductCostCsvProvider { MANUAL, SHOPIFY }` (via `/enum`)
- `catalog/errors/index.ts` → `CatalogCsvImportErrors` union (via `/errors`, see vocabulary below)

`packages/api/typescript/src/catalog/`:
- `services/ProductCostCsvParser/` — facade/registry (the injected "CsvParser service"):
  - `ProductCostCsvParser.ts` — port: `parse(input) → Promise<{ builds: ProductCostBuildInput[]; errors: ProductCostCsvRowError[] }>`
  - `DefaultProductCostCsvParser.ts` — registry keyed by `ProductCostCsvProvider → { parser, processor }`; runs parse → process
  - `MockProductCostCsvParser.ts`
  - `types.ts` — `ParsedProductCostRow`, `ProductCostBuildInput`, `ProductCostCsvRowError` (Zod-typed)
  - `parsers/BaseProductCostCsvParser.ts` — papaparse tokenization + per-row Zod validation + error collection
  - `parsers/ManualProductCostCsvParser.ts`, `parsers/ShopifyProductCostCsvParser.ts`
  - `processors/ManualProductCostCsvProcessor.ts` (identity: rows already carry internal ids)
  - `processors/ShopifyProductCostCsvProcessor.ts` (group by handle → resolve → build; injects `ProductQueryService`)
- `services/ProductQueryService/` — add `resolveProductsWithVariantsByHandles(storeIntegrationId, handles[], tx?) → ResolvedProductWithVariants[]` (`{ handle, productId, variants: { title, variantId }[] }`, Zod-typed) to port + Drizzle + Mock.
- `repositories/ProductCostRepository/` — add `saveMany(entities, tx?)` to port + Drizzle + Mock.
- `usecases/BulkImportProductCostsFromCsv.ts` — rewrite: inject `ProductCostCsvParser` + `ProductCostRepository`; `parse()` → group builds by `(storeId, productId)` merging options → per distinct product `findByStoreAndProduct` → create-or-append → collect entity + one event → `saveMany` + events `saveMany` in one tx. Output schema `errors` → typed `{ row, code, value? }`.
- `controllers/BulkImportProductCostsFromCsvController.ts` — body becomes provider DU.
- `registry.ts` — register `ProductCostCsvParser` (mock/integration/real) + the per-provider parser/processor classes.

Tests:
- `parsers/*.test.ts` (unit) — Manual + Shopify tokenization, quoting/BOM, per-row typed error codes.
- `ProductQueryService` resolver integration test.
- `DrizzleProductCostRepository.saveMany` integration test (mixed insert+update).
- `BulkImportProductCostsFromCsv.test.ts` — MANUAL (port existing fixtures) + SHOPIFY (seed products/variants, assert created aggregates, skipped unresolved with codes, events via `findByType`).

## Error Vocabulary (`ProductCostCsvImportError`)

Header/structural: `MISSING_REQUIRED_COLUMN`.
Field validation (both providers as applicable): `INVALID_PRODUCT_ID`, `INVALID_CURRENCY`, `INVALID_COUNTRY`, `INVALID_START_DATE`, `INVALID_END_DATE`, `VARIANT_IDS_REQUIRED`, `INVALID_VARIANT_ID`, `INVALID_QUANTITY`, `INVALID_QUANTITY_MODIFIER`, `INVALID_UNIT_COST`, `INVALID_SHIPPING`, `INVALID_COST_TYPE`, `INVALID_COST`, `DISPLAY_NAME_TOO_LONG`.
Shopify resolution: `MISSING_HANDLE`, `UNKNOWN_HANDLE`, `BLANK_VARIANT_NAME`, `UNRESOLVED_VARIANT`.
Catch-all for an unexpected entity invariant during build: `ROW_INVALID`.

## Out of Scope

- An importer UI / file-upload form in `packages/app` and its locale keys (no consumer exists today; this spec ships the typed codes for a future UI to i18n).
- SKU-based or Handle+options fallback matching (we mirror the reference: variant-title match only).
- Importing costs for single-variant products whose Shopify row has blank option values (composed name is empty → skipped + `BLANK_VARIANT_NAME`, mirroring the reference's limitation).
- Bulk `findByStoreAndProducts` (read N+1 stays; `saveMany` only, per decision 4).
- Any change to the `ProductCost` entity, the `ProductCostSolver`, or the Go sync.

## Risks & Migration

- **Output contract change**: `errors[].message: string` → `errors[].{ code, value? }`. No frontend consumer exists, so the only updates are the SDK (regen) and the use-case test. Flagged so it's a deliberate break, not an accident.
- **Event volume change**: one event per aggregate instead of per row — any downstream handler counting events sees fewer; none exist today beyond projections that key on the aggregate.
- **Resolution depends on synced catalog**: Shopify import only resolves variants the Go sync has already materialized into `variants`; an un-synced store yields all-skipped rows with `UNKNOWN_HANDLE`/`UNRESOLVED_VARIANT` (correctly surfaced, not a silent failure).

## Open Questions

1. Should a fatal header error (`MISSING_REQUIRED_COLUMN`) stay a partial-success row-0 entry (as today), or become a thrown 400 application error registered in `catalog/errors` + `GlobalErrorMapper`? Default: keep as row-0 typed entry for consistency with the partial-success contract.
2. Re-import semantics for MANUAL are preserved as **append** (today's behavior). Shopify re-import of the same product appends another option each time rather than replacing — acceptable for now, or should Shopify replace prior options for the same `(product, currency, startDate)`? Default: keep append; revisit if duplicate options become a problem.

## Inspirations & Reference

- `bk-dash-backend/backend-old/src/modules/products/services/ProcessProductCostCsv.ts` — provider registry/router.
- `…/utils/ProductCostCsv/base.ts` — base parser + `ParsedCsvRow` canonical shape + per-row error collection.
- `…/utils/ProductCostCsv/processors/shopify.ts` — group-by-handle, bulk handle/variant lookup, variant-name matching, skip-on-unresolved.
- `packages/api/go/internal/sync/services/shopify/product_normalizer.go:137-153` — confirms `variants.title` = `option1 / option2 / option3` join.
