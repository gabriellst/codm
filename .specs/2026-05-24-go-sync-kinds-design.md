# Go Sync Kinds Expansion — Design Spec (Spec C of 3)

**Date:** 2026-05-24
**Status:** Approved
**Bounded Context:** Go service — `internal/sync`
**Kind:** feature
**Story Points:** 8 — 6 new `SyncPipelineName` values + one new canonical entity end-to-end (Transaction: entity + storage + event + handler + migration + Shopify pipeline) + PENDING pipelines for the other 5 kinds + marketing-reconcile re-introduction as a sync kind.

> **Spec C of a 3-spec sequence.** Depends on **Spec A** (built) — its `(platform, SyncPipelineName)` pipeline factory, the executor that runs `job.Pipelines` (a list), the `ExternalXUpdatedEvent → handler → storage` pattern, and the `PendingPipeline`. Spec C extends all of these with new kinds. Independent of Spec B.

## Context

After Spec A, `internal/sync` runs data-pull pipelines selected by `(platform, enums.SyncPipelineName)`. The enum currently holds `ORDERS`, `PRODUCTS`, `PRODUCT_VARIANTS` only (`internal/sync/enums/sync_pipeline_name.go`). The `services/pipelines.Factory` resolves a `Pipeline` per `(platform, name)`; the `services/executor.Executor` marks a `sync_job` RUNNING, runs each named pipeline (publishing `ExternalXUpdatedEvent`s through a sync/async publisher), and marks COMPLETED/FAILED. Each entity kind has the full chain: a canonical aggregate in `storage/<entity>/`, an `events/external_<entity>_updated.go`, a `handlers/<entity>_updated_handler.go` (persist + publish wire event), and per-platform pipelines in `services/pipelines/<platform>/`. Non-implemented `(platform, kind)` pairs register a `PendingPipeline` returning `ErrPipelinePending` (graceful, surfaced as not-implemented, never a 500).

The reference `go-worker-monorepo/api/internal/sync` defines the full kind set the showcase aspires to — `enums/sync_entity_type.go` lists `ORDERS PRODUCTS TRANSACTIONS DISPUTES MARKETING_METRICS MARKETING_METRICS_CONCURRENT MARKETING_METRICS_TWO_PHASE CAMPAIGNS` — with `storage/{transaction,dispute,marketingmetric,campaign}` and per-platform normalizers (`services/shopify/transaction_normalizer.go`, `dispute_normalizer.go`; `services/google|facebook|tiktok/...` for marketing).

Spec A's T10 deleted the `/marketing/reconcile` controller; the spec accepted a 404 window with Spec C re-introducing marketing reconcile as a sync kind. The TS-side `triggerMarketingReconcile` is being removed by a parallel refactor (SPEC-17, replacing `GoSyncWorkerClient` with a generated SDK).

## Problem

1. **Only 3 of the 8 reference kinds exist.** The factory + executor support multiple kinds, but `TRANSACTIONS / DISPUTES / MARKETING_METRICS / MARKETING_METRICS_CONCURRENT / MARKETING_METRICS_TWO_PHASE / CAMPAIGNS` aren't registered — a `start_sync` requesting them fails enum validation, not a graceful "pending."
2. **No standalone settlement-transaction read model.** Order payment attempts are embedded in the `Order` aggregate (`order.transactions`), but provider-level gateway/settlement transactions (Shopify `/transactions`) — which carry settlement timing, fees, and payout linkage distinct from the order's line payments — have no canonical home.
3. **Marketing reconcile has no path.** Spec A removed `/marketing/reconcile`; nothing replaced it. A merchant can't trigger a marketing-metrics pull.

## Goal

Add the 6 missing `SyncPipelineName` values so the factory + `start_sync` accept them. Ship **one** new kind end-to-end as the reference — `TRANSACTIONS` (a standalone gateway/settlement `Transaction` canonical entity, distinct from `order.transactions`) — with the full Spec A chain: entity + storage + `ExternalTransactionUpdatedEvent` + handler + migration + a real Shopify transactions pipeline. Register `PendingPipeline`s for the other 5 kinds so they resolve gracefully. Re-introduce marketing reconcile as `POST /sync` with `pipelines:[MARKETING_METRICS]` (the kind resolves to a PENDING pipeline until a real marketing pipeline lands), closing Spec A's 404 window with the canonical sync path rather than a bespoke route.

## Decisions

1. **Add 6 `SyncPipelineName` values** to `internal/sync/enums/sync_pipeline_name.go`: `TRANSACTIONS`, `DISPUTES`, `MARKETING_METRICS`, `MARKETING_METRICS_CONCURRENT`, `MARKETING_METRICS_TWO_PHASE`, `CAMPAIGNS`; all added to `Valid()`.
2. **New standalone `Transaction` canonical entity** at `internal/sync/storage/transaction/transaction.go` — fields: `id, platform, externalId, storeId, storeIntegrationId, storeIntegrationExternalId, orderExternalId, kind (sale/refund/...), status, amount (storage/objects.MonetaryAmount), gateway, processedAt`. Single `NewTransactionFromProviderPayload(TransactionInput)` constructor validating required scalars (mirrors `order.go`). Distinct from the `OrderTransaction` value objects embedded in the Order aggregate — this is the provider's settlement record.
3. **`storage/transaction/{transaction_storage.go,transaction_pg.go}`** — `Storage` interface (`UpsertTransaction`) + PG impl, mirroring `storage/order`.
4. **`transactions` table migration** (Drizzle `packages/contracts/db/schema/sync.ts` — extend the file Spec A created) — columns matching the entity; UPSERT keyed on deterministic id.
5. **`events/external_transaction_updated.go`** — `ExternalTransactionUpdatedEvent = DomainEvent[ExternalTransactionUpdatedPayload{Input TransactionInput}]`, name `sync.external_transaction_updated`, `NewExternalTransactionUpdated(input, storeID)`.
6. **`handlers/transaction_updated_handler.go`** — consumes `ExternalTransactionUpdatedEvent`, rebuilds the aggregate, `storage.UpsertTransaction`, publishes the `integration.shared.transaction.updated` wire event as a **Go-typed payload built in-handler** (RESOLVED: no `packages/contracts` regen now — the SDK codegen is red from the parallel refactor; emit the event by name with a typed Go payload, mirroring how the order handler builds its wire event; adding the formal wire contract + cross-language binding is a follow-up once the parallel refactor lands). Registered with the mediator in `module.go`.
7. **Real Shopify transactions pipeline** at `internal/sync/services/pipelines/shopify/transactions.go` — `Pipeline() == enums.SyncPipelineTransactions`, pages the Shopify transactions endpoint via the existing Shopify client, normalizes via a new `services/shopify/transaction_normalizer.go`, publishes `ExternalTransactionUpdatedEvent`s through the injected publisher.
8. **PENDING pipelines for the other 5 kinds** — register `PendingPipeline`s for `(SHOPIFY, DISPUTES)`, `(SHOPIFY, MARKETING_METRICS)`, and the marketing pairs, so the factory resolves them with `ErrPipelinePending` instead of an unknown-pair error.
9. **Marketing reconcile re-introduction.** No bespoke route. `POST /sync` with `pipelines:["MARKETING_METRICS"]` is the path; the kind resolves to a PENDING pipeline today (real marketing pipeline is a follow-up). Documents closing Spec A's `/marketing/reconcile` 404 window.
10. **`module.go` wiring** — register the Shopify transactions pipeline + the transaction handler (mediator) + the new PENDING pipelines; extend `pendingPipelineProviders()` to cover the new `(platform, kind)` pairs.

## User Stories

- **Story 1:** As a merchant, I want to start a `TRANSACTIONS` sync, so settlement transactions are pulled + persisted. *(Decisions 1–7, 10; AC-1, AC-2)*
  - Given a `start_sync` with `pipelines:["TRANSACTIONS"]` for a Shopify integration, when executed, then the Shopify transactions pipeline publishes `ExternalTransactionUpdatedEvent`s and the handler upserts each canonical transaction + publishes the wire event.
- **Story 2:** As a developer, I want unimplemented kinds to resolve gracefully, so requesting `DISPUTES` returns "pending," not a hard error. *(Decision 8; AC-3)*
  - Given `start_sync` with `pipelines:["DISPUTES"]`, when executed, then the job runs the PENDING pipeline and surfaces `ErrPipelinePending` (job FAILED with the pending message), not an unknown-pair 500.
- **Story 3:** As a merchant, I want to trigger a marketing-metrics reconcile, so the path exists post-Spec-A. *(Decision 9; AC-4)*
  - Given `POST /sync` with `pipelines:["MARKETING_METRICS"]`, when called, then the request is accepted and the kind resolves (PENDING today).

## Acceptance Criteria

- [ ] **AC-1:** `SyncPipelineName.Valid()` returns true for all 6 new values; `start_sync` accepts a job with `pipelines:["TRANSACTIONS"]` (enum test + usecase test).
- [ ] **AC-2:** The Shopify transactions pipeline, given a transactions page, publishes one `ExternalTransactionUpdatedEvent` per row; the `TransactionUpdatedHandler` upserts the canonical transaction to `storage/transaction` + saves the `integration.shared.transaction.updated` wire event (pipeline test + handler test).
- [ ] **AC-3:** The factory resolves `(SHOPIFY, DISPUTES)` (and the other PENDING kinds) to a `PendingPipeline` returning `ErrPipelinePending` — not an unknown-pair error (factory test).
- [ ] **AC-4:** `POST /sync` with `pipelines:["MARKETING_METRICS"]` is accepted (enum-valid) and the executor runs the resolved (PENDING) pipeline without a 500 (controller/executor test).
- [ ] **AC-5:** `Transaction` aggregate rejects missing required scalars (`externalId`, `storeId`, `amount`) with typed errors (entity unit test).
- [ ] **AC-6:** `transactions` table migration generates clean (only the new table) + applies; the PG storage round-trips a transaction (integration test, skips if DB unreachable).
- [ ] **AC-7:** `go build ./...` + `go test ./...` + `go vet ./internal/sync/...` green.

## Risks & Migration

- **Docker / migration:** like Spec A's `sync_jobs`, the `transactions` table migration applies via `bun migrate:dev`; the PG round-trip test skips when the DB is unreachable. Needs Docker up for live verification.
- **Wire event addition:** if `integration.shared.transaction.updated` isn't in the wire contract (`packages/contracts`), it must be added there + regenerated, OR the handler emits a generic shape. Resolve in `/plan` — prefer adding the wire event to the contract so TS consumers can subscribe; if codegen is blocked by the parallel refactor, emit the event by name with a typed Go payload and defer the cross-language binding.
- **TRANSACTIONS vs order.transactions:** the new standalone `Transaction` is the provider settlement record, NOT the order's embedded payment lines. Naming chosen to avoid confusion (`storage/transaction` aggregate vs `storage/order`'s `OrderTransaction` VO). Reviewers should not "dedupe" them — they model different things.

## Open Questions

- (Resolved) **Wire-event codegen**: Go-only typed payload now (Decision 6); formal `packages/contracts` wire event + cross-language binding deferred to a follow-up once the parallel SPEC-17 refactor lands and `bun sdk` is green again.
