# PRODUCT_VARIANTS Pipeline Fix + NuvemShop Variant Fan-out — Design Spec (W3)

**Date:** 2026-06-01
**Status:** Draft
**Bounded Context:** cross-context: go/sync, go/webhooks
**Kind:** bug
**Story Points:** 2 — two focused surgical edits (one resolver line-deletion, one mapper constructor change + fan-out loop); both are Go-only with no new projections, no migrations, and no cross-service contract changes; +0 tiers.
**Part of:** .specs/2026-06-01-bk-dash-crucial-gaps-closure-roadmap-design.md (master roadmap)
**Depends on:** none (Wave 0)

## Context

The Go sync worker in `packages/api/go/internal/sync` operates a **pipeline executor** pattern: when a store integration activates, `IntegrationActivatedHandler` (`handlers/integration_activated_handler.go:59`) calls `pipelineresolver.Resolve(StoreIntegrationType)` to obtain the list of pipelines to run, creates a `SyncJob`, then calls `executor.ExecuteAsync` which iterates the job's pipeline list and looks up each one in `pipelines.Factory.Get(platform, name)`.

For `SALES_CHANNEL` integrations, `pipelineresolver.Resolve` (`services/pipelineresolver/resolver.go:16`) returns `[ORDERS, PRODUCTS, PRODUCT_VARIANTS]`. However, the `Factory` has no entry for `(SHOPIFY, PRODUCT_VARIANTS)` or `(NUVEM_SHOP, PRODUCT_VARIANTS)` — because **both platforms handle variants inline within the PRODUCTS pipeline**: `ShopifyProductsPipeline` (`services/pipelines/shopify/products.go`) and `NuvemshopProductsPipeline` (`services/pipelines/nuvemshop/products.go`) each contain a nested loop that extracts embedded `variants[]` from every product page and publishes `ExternalProductVariantUpdated` per variant. The executor's `Get` miss at `executor.go:137-139` causes `job.Fail("unknown pipeline: PRODUCT_VARIANTS")` for every automatic backfill.

A separate, independent gap exists in the **webhook path**: the NuvemShop `ProductUpdatedMapper` (`webhooks/mappers/nuvemshop/product_updated.go`) fetches the full product JSON from the NuvemShop API and normalizes the product, but it only emits one `ExternalProductUpdated` event — it does not call `ExtractVariantsFromProductRaw` or the `ProductVariantNormalizer`. The `*syncnuvemshop.ProductVariantNormalizer` is already constructed and in the DI graph (`sync/module.go:213`), but `ProductUpdatedMapper` does not receive it as a constructor argument. The Shopify webhook mapper (`webhooks/mappers/shopify/product_updated.go`) performs the correct fan-out (product + N variant events), so NuvemShop webhooks leave variant data stale after every product edit.

## Problem

1. **Every automatic SALES_CHANNEL backfill fails at the PRODUCT_VARIANTS step.** `pipelineresolver.Resolve(SALES_CHANNEL)` includes `enums.SyncPipelineProductVariants`, but no platform has a pipeline registered under that name — variants are already emitted inline by `SyncPipelineProducts`. The executor calls `job.Fail("unknown pipeline: PRODUCT_VARIANTS")`, marking the entire sync job FAILED.

2. **NuvemShop product webhook events do not fan out variant events.** `ProductUpdatedMapper.Map` returns exactly one event (`ExternalProductUpdated`). Variant mutations received via `product/updated` webhook (price changes, SKU edits, stock) are silently dropped, leaving the catalog's variant read-models stale until the next full bulk sync. The `ProductVariantNormalizer` and `ExtractVariantsFromProductRaw` helper already exist and are used by the bulk pipeline — they are simply not wired into the webhook mapper.

## Goal

After this fix, triggering a SALES_CHANNEL integration (Shopify or NuvemShop) automatically produces a successful sync job that processes orders, products, and all embedded variants without failure. Separately, every inbound NuvemShop `product/updated` webhook emits one `ExternalProductUpdated` event followed by one `ExternalProductVariantUpdated` per embedded variant — matching the Shopify webhook mapper's existing behavior.

## Decisions

1. **Remove `enums.SyncPipelineProductVariants` from `Resolve(SALES_CHANNEL)`.** The resolver returns `[ORDERS, PRODUCTS]` for `SALES_CHANNEL`. This is the minimal, correct fix: both PRODUCTS pipelines (Shopify and NuvemShop) already fan out variant events inline, so no variant data is lost. Registering a dedicated `PRODUCT_VARIANTS` pipeline would duplicate variant processing and require each platform to expose a separate variants-only API call, which neither Shopify nor NuvemShop needs or supports in this way. Traced to: the brief (option a), and the existing `ShopifyProductsPipeline` and `NuvemshopProductsPipeline` design comments documenting the inline fan-out.

2. **Inject `*syncnuvemshop.ProductVariantNormalizer` into `ProductUpdatedMapper` and add a variant fan-out loop mirroring `ShopifyProductsPipeline.Run` and `shopify/product_updated.go:Map`.** The mapper fetches the full product JSON from the NuvemShop API (for the product event) — that same raw bytes already contain the embedded `variants[]` array. Reusing `syncnuvemshop.ExtractVariantsFromProductRaw` + `ProductVariantNormalizer.Normalize` follows the established pattern across both the pipeline and the Shopify webhook mapper. No new types, no new DI registrations beyond passing the already-constructed normalizer. The `webhooks/module.go` `provideMapper` call for `ProductUpdatedMapper` gains one additional constructor argument (`*syncnuvemshop.ProductVariantNormalizer` is already in the fx graph via `sync/module.go:213`). Traced to: the brief (second fix), the `shopify/product_updated.go` reference pattern, and the existing `*syncnuvemshop.ProductVariantNormalizer` in `sync/module.go:213`.

3. **Scope: Shopify and NuvemShop only.** The resolver fix is platform-agnostic (it removes the name from the resolver, so it affects all platforms equally). The webhook fan-out fix is NuvemShop-only. No changes to CartPanda, Yampi, Kiwify, or any marketing platform pipeline. Traced to: brief scope constraint.

4. **Per-variant normalization failures in the webhook mapper are skipped (not fatal), matching the Shopify mapper's behavior.** A malformed or structurally invalid variant should not poison the product event already queued. Traced to: `shopify/product_updated.go:73-80` (existing canonical pattern).

5. **No new integration events or contract changes.** `ExternalProductVariantUpdated` already exists in `sync/events/` and its handler (`handlers.ProductVariantUpdatedHandler`) is already registered with the mediator in `sync/module.go:382-399`. The fix is purely a wiring correction. Traced to: codebase — the event, handler, and mediator registration are all present.

## User Stories

**Story 1 — Automatic backfill completes successfully**

Given a merchant activates a Shopify or NuvemShop SALES_CHANNEL integration,
When the `IntegrationActivatedHandler` resolves pipelines and runs the sync job,
Then the job completes with status COMPLETED (not FAILED), having processed ORDERS and PRODUCTS (including inline variants).

**Story 2 — NuvemShop product webhook fans out variant events**

Given a merchant edits a product with two variants on NuvemShop,
When NuvemShop delivers a `product/updated` webhook to `POST /webhooks`,
Then the `ProductUpdatedMapper` emits one `ExternalProductUpdated` event and two `ExternalProductVariantUpdated` events (one per embedded variant), and the `ProductVariantUpdatedHandler` persists both variants to the catalog read-model.

**Story 3 — NuvemShop product webhook with no variants emits only the product event**

Given a NuvemShop product has no variants (empty `variants[]`),
When the `product/updated` webhook arrives,
Then `ProductUpdatedMapper` emits exactly one `ExternalProductUpdated` event and zero `ExternalProductVariantUpdated` events.

## Acceptance Criteria

1. `pipelineresolver.Resolve(wire.StoreIntegrationTypeSALES_CHANNEL)` returns `[]enums.SyncPipelineName{enums.SyncPipelineOrders, enums.SyncPipelineProducts}` — length 2, no `SyncPipelineProductVariants`.

2. A unit test for `pipelineresolver.Resolve` asserts `len(result) == 2` and that `SyncPipelineProductVariants` is absent for `SALES_CHANNEL`.

3. Running `executor.Execute` (or `ExecuteAsync`) with a `SyncJob` whose `Pipelines` is `[ORDERS, PRODUCTS]` for platforms SHOPIFY and NUVEM_SHOP produces a COMPLETED job; the test uses mock pipeline stubs via a test-local `Factory` to confirm no unknown-pipeline failure path is hit.

4. `nuvemshop.ProductUpdatedMapper.Map` called with a product JSON body containing N variants returns `1 + N` events: one `ExternalProductUpdated` followed by N `ExternalProductVariantUpdated`, each carrying the correct parent product canonical ID.

5. `nuvemshop.ProductUpdatedMapper.Map` called with a product JSON body where `variants: []` returns exactly 1 event (`ExternalProductUpdated`).

6. `nuvemshop.ProductUpdatedMapper.Map` called with a product JSON body where one variant has a malformed sub-object returns `1 + (N-1)` events (bad variant skipped, product and valid variants emitted). This matches the Shopify mapper's skip-on-bad-variant behavior.

7. `go build ./...` and `go vet ./...` pass with zero errors in `packages/api/go`.

## Out of Scope

- CartPanda, Yampi, Kiwify: their PRODUCTS pipelines are `PendingPipeline` stubs and their webhook mappers are `PendingMapper` stubs. No changes.
- The `PAYMENT_GATEWAY` resolver path (returns `[TRANSACTIONS, DISPUTES]`): untouched.
- `SyncPipelineProductVariants` enum value: it can remain in `enums/` as it may be referenced by existing `SyncJob` records in the DB. Only the resolver return value changes.
- Webhook deduplication logic: not in scope, no changes to the `(platform, externalEventId)` index or outbox.
