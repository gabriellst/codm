# Go Sync Restructure — Design Spec (Spec A of 3)

**Date:** 2026-05-24
**Status:** Approved
**Bounded Context:** Go service — `internal/sync` + new `internal/integrations` (cross-language coordination with TS `integration` BC)
**Kind:** chore (architectural restructure)
**Story Points:** 13 — new `sync_job` aggregate + `ExternalXUpdatedEvent`/handler layer (behavioral change to existing pipelines) + integrations BC extraction + cross-language `marketing_reconcile` deletion; planned as two atomic commits.

> **Spec A of a 3-spec sequence.** Spec B = webhook flow rewrite (single controller + `WebhookReceivedEvent` + per-`(platform,event)` mapper factory, reusing this spec's `ExternalXUpdatedEvent`/handler layer). Spec C = sync kinds expansion (TRANSACTIONS / DISPUTES / MARKETING_METRICS* / CAMPAIGNS + marketing-reconcile re-introduction as `SyncPipelineName.MARKETING_METRICS`). This spec must land before B and C.

## Context

The Go service at `packages/api/go/internal/` currently bundles three concerns under a single `sync/` folder:

```
packages/api/go/internal/
├── webhooks/                            (9 per-platform controllers + dispatcher — rewritten in Spec B)
└── sync/
    ├── canonical/                       (Order/Product/ProductVariant structs + objects/)
    ├── clients/                         (ShopifyHTTPClient)
    ├── controllers/
    │   ├── sync_controller.go           (POST /sync — fire-and-forget, synchronous)
    │   ├── marketing_reconcile.go       (POST /marketing/reconcile)
    │   └── integrations_handshake.go    (POST /integrations/handshake — squats here)
    ├── normalizers/shopify/             (per-entity normalizers)
    ├── orchestrator/                    (picks pipeline, runs it)
    ├── outbox/pg_outbox_writer.go       (canonical → wire translator)
    ├── pipelines/                       (factory + Shopify orders/products + pending stubs)
    ├── repositories/                    (PgOrderRepository, PgProductRepository, PgProductVariantRepository)
    ├── syncio/types.go                  (RunInput/RunResult — shared by pipelines + normalizers to break import cycle)
    └── module.go
```

The reference `go-worker-monorepo/api/internal/` splits `sync/` and `integrations/` as independent bounded contexts, each shaped DDD-style: `entities/ events/ handlers/ usecases/ services/{<platform>/, executor/, pipelines/} repositories/ storage/<entity>/`. In the reference, pipelines normalize and **publish `ExternalXUpdatedEvent`**; per-entity handlers consume those events, persist the canonical entity, and publish wire-events through the outbox. The `sync_job` aggregate (`enums/sync_status.go`: PENDING/RUNNING/COMPLETED/FAILED/CANCELLED) tracks each run's lifecycle, and the controller surface is `start_sync / execute_sync / async_execute_sync / list_sync_jobs / get_sync_status / cancel_sync`.

The handoff at `.plans/2026-05-23-bk-dash-port-handoff.md` documents the current Go state through iter 348 — including iter 325's addition of `integrations_handshake.go` to `sync/` (now identified as belonging in its own BC) and iter 321's `HttpGoSyncWorkerClient` design (`packages/api/typescript/src/integration/services/GoSyncWorkerClient/`) that already anticipated an async `sync_job` shape. The TS side has a parallel `integration` BC at `packages/api/typescript/src/integration/`; Go currently has no matching BC.

The reusable outbox infrastructure already lives correctly under `core`: `core/services/outbox/outbox_dispatcher.go` (poll/claim/dispatch) + `core/repositories/{domain_event_repository.go,pg_domain_event_repository.go}`. Only the sync-specific translator (`sync/outbox/pg_outbox_writer.go`) is misplaced.

## Problem

1. **BC boundary drift.** `integrations_handshake.go` lives in `sync/` but belongs to integrations — it mirrors the TS-side `integration/` BC, which has no Go counterpart.
2. **Folder shape diverges from the reference.** `canonical/`, `clients/`, `normalizers/`, `orchestrator/`, `outbox/`, top-level `pipelines/`, `repositories/pg_*_repository.go`, and `syncio/` don't map to the reference's DDD shape. Engineers can't navigate by analogy to `go-worker-monorepo`.
3. **Canonical types are separated from their persistence.** `canonical/order.go` defines the struct while `repositories/pg_order_repository.go` persists it — a refactor touches two unrelated folders.
4. **No event indirection between pipeline and persistence.** Pipelines call `OutboxWriter` directly to translate canonical→wire and persist. There's no `ExternalXUpdatedEvent` layer where webhook ingest (Spec B) and sync pull could converge on a shared per-entity handler. Without it, Spec B must either duplicate persistence logic or invent the layer itself.
5. **No `sync_job` aggregate.** `POST /sync` is fire-and-forget. Callers can't poll a run's status, list past runs, cancel an in-flight sync, or retry a failed one. The reference's 6-controller surface requires the aggregate.
6. **`orchestrator` misnomer.** The reference calls the same role `services/executor/`. The rename clarifies it's the runner inside a `sync_job`, not a workflow engine.

## Goal

Restructure the Go service so `internal/sync/` owns the data-pull lifecycle (`sync_job` aggregate, pipelines, receiver→normalizer→`ExternalXUpdatedEvent`→handler→storage chain, 6 reference controllers) and `internal/integrations/` owns the connection lifecycle (handshake controller + future handshake pipelines). Per-entity handlers become the canonical persistence + wire-event publication site, so Spec B's webhook flow publishes into the same handlers without new persistence code. The sync-specific outbox translator disappears; the `core` dispatcher is untouched. Engineers can read `go-worker-monorepo` to learn the architecture, then navigate template-fullstack's Go service by exact analogy.

This spec does **not** introduce Spec B's webhook rewrite or Spec C's new pipeline kinds. The `ExternalXUpdatedEvent` layer introduced here is what Spec B reuses unchanged.

## Decisions

1. **Extract `internal/integrations/` as a separate BC.** Move `integrations_handshake.go` → `internal/integrations/controllers/handshake.go` + its usecase. No Go-side `Integration` aggregate (TS owns it) — Go's integrations BC holds the handshake controller + usecase + future handshake pipelines. Shape: `integrations/{controllers,usecases,services/pipelines,errors,module.go}`.
2. **Delete `sync/orchestrator/`; replace with `sync/services/executor/`** (same role — runs a pipeline inside a `sync_job` — reference-aligned name).
3. **Delete `sync/outbox/`.** Canonical→wire translation moves into per-entity handlers (`sync/handlers/<entity>_updated_handler.go`). The `OutboxWriter` port + `PgOutboxWriter` struct disappear. `core/services/outbox/outbox_dispatcher.go` is unchanged.
4. **Delete `sync/canonical/`;** canonical structs move to `sync/storage/<entity>/<entity>.go` alongside the storage interface (`<entity>_storage.go`) + PG impl (`<entity>_pg.go`). The `canonical/objects/` value types move with their owning entity.
5. **Delete `sync/clients/`;** `shopify_http_client.go` → `sync/services/shopify/client.go`. Per-platform clients live under `services/<platform>/`.
6. **Delete `sync/normalizers/`;** per-entity normalizers → `sync/services/<platform>/<entity>_normalizer.go`.
7. **Move `sync/pipelines/` → `sync/services/pipelines/`.** Interface + factory at `services/pipelines/{pipeline.go,factory.go}`; per-platform impls at `services/pipelines/<platform>/<entity>.go`; `pending.go` kept. **Factory keyed by `(platform, SyncPipelineName)`** (today it's platform-only).
8. **`sync/syncio/types.go` → `sync/services/pipelines/types.go`.** `RunInput`/`RunResult` live in the same package as the `Pipeline` interface, eliminating the cross-package import cycle that justified `syncio/`.
9. **Introduce the `sync_job` aggregate** at `sync/entities/sync_job.go` with `SyncStatus` enum (`sync/enums/sync_status.go`: PENDING/RUNNING/COMPLETED/FAILED/CANCELLED). Lifecycle: `start_sync` creates PENDING → `execute_sync`/`async_execute_sync` transitions to RUNNING → terminal status set on pipeline return. Persisted via `sync/repositories/syncjob/{syncjob_repository.go,syncjob_pg.go}`. Invariants (e.g. "cannot cancel a COMPLETED job") raise typed `BaseError`.
10. **Introduce 6 reference controllers** (`start_sync`, `execute_sync`, `async_execute_sync`, `list_sync_jobs`, `get_sync_status`, `cancel_sync`), each with a 1:1 usecase in `sync/usecases/`. The existing `POST /sync` route stays, now delegating to start_sync→execute_sync synchronously for back-compat; `HttpGoSyncWorkerClient.triggerSync` keeps working unchanged.
11. **Introduce the `ExternalXUpdatedEvent` layer** at `sync/events/external_{order,product,product_variant}_updated.go`. Pipeline `Execute()` publishes these (via `core/repositories/DomainEventRepository`) instead of writing to storage. Per-entity handlers at `sync/handlers/<entity>_updated_handler.go` consume them, persist the canonical entity to storage, and publish the wire-event. This is the layer Spec B's webhook flow reuses unchanged.
12. **`SyncPipelineName` enum (`sync/enums/sync_pipeline_name.go`) starts with `ORDERS`, `PRODUCTS`, `PRODUCT_VARIANTS` only.** Spec C adds TRANSACTIONS / DISPUTES / MARKETING_METRICS / MARKETING_METRICS_CONCURRENT / MARKETING_METRICS_TWO_PHASE / CAMPAIGNS.
13. **Delete `marketing_reconcile.go` + its TS-side coordination in this spec.** Remove the Go controller, plus `GoSyncWorkerClient.triggerMarketingReconcile` (abstract) + `HttpGoSyncWorkerClient`/`MockGoSyncWorkerClient` impls + `MarketingReconcileRequest`/`MarketingReconcileResponse` types + any callers. `/marketing/reconcile` returns 404 between Spec A and Spec C landing (accepted risk — see Risks & Migration).
14. **Keep `sync/module.go` flat** (one `fx.Module`); add `integrations/module.go` for the extracted BC. Both registered in the app's module composition.
15. **Migration ordering: two atomic commits** — (a) integrations BC extraction, (b) sync restructure + `sync_job` + event layer. fx rewires atomically per commit; no half-wired intermediate state.

## User Stories

- **Story 1:** As a developer learning the Go service, I want its folder shape to mirror `go-worker-monorepo/api/internal/{sync,integrations}`, so I can navigate template-fullstack by analogy to the reference. *(Decisions 1–8, 14; AC-1, AC-2)*
  - Given the reference's `sync/{entities,events,handlers,usecases,services,repositories,storage}` layout, when I open template-fullstack's `internal/sync/`, then I find the same folders with the same responsibilities.
  - Given I know integrations is its own BC in the reference, when I look for the handshake controller, then it's in `internal/integrations/`, not `sync/`.

- **Story 2:** As an operator triggering a sync, I want each run tracked as a `sync_job` I can poll, list, and cancel, so I can observe and control in-flight syncs. *(Decisions 9, 10; AC-3, AC-4)*
  - Given a sync was started, when I `GET` its status, then I see PENDING/RUNNING/COMPLETED/FAILED/CANCELLED.
  - Given a job already COMPLETED, when I cancel it, then the aggregate raises a typed error and the status is unchanged.

- **Story 3:** As a developer building Spec B (webhook flow), I want the `ExternalXUpdatedEvent → handler → storage` layer already in place, so webhook ingest reuses it without writing new persistence code. *(Decision 11; AC-6)*
  - Given the Shopify orders pipeline runs, when it finishes normalizing, then it publishes `ExternalOrderUpdatedEvent` and the order handler persists the canonical order + publishes the wire-event.

- **Story 4:** As the TS-side `HttpGoSyncWorkerClient`, I want `POST /sync` to keep its synchronous contract, so existing sync triggers don't break mid-restructure. *(Decision 10; AC-5)*
  - Given the old `POST /sync` payload, when called, then it still returns a synchronous result (delegating to start_sync→execute_sync internally).

## Acceptance Criteria

- [ ] **AC-1:** `internal/integrations/` exists with the handshake controller + usecase; `internal/sync/` no longer contains `integrations_handshake.go`; `POST /integrations/handshake` is still served (Go integration test).
- [ ] **AC-2:** `sync/{canonical,clients,normalizers,orchestrator,outbox,pipelines,syncio}` are deleted; `sync/{entities,events,handlers,usecases,services/{<platform>,executor,pipelines},repositories/syncjob,storage/<entity>}` are present (`go build ./...` green).
- [ ] **AC-3:** The `sync_job` aggregate exists with the `SyncStatus` lifecycle; cancelling a COMPLETED job raises a typed `BaseError` (unit test asserts on the error code).
- [ ] **AC-4:** All 6 controllers are served (`start_sync`, `execute_sync`, `async_execute_sync`, `list_sync_jobs`, `get_sync_status`, `cancel_sync`) — each with a 1:1 usecase.
- [ ] **AC-5:** `POST /sync` still returns a synchronous result; the `HttpGoSyncWorkerClient.triggerSync` test stays green; `bun tsc` clean.
- [ ] **AC-6:** Running the Shopify orders pipeline publishes `ExternalOrderUpdatedEvent`; the order handler persists the canonical order to storage AND saves the wire-event (Go integration test asserts both the storage row and the event row).
- [ ] **AC-7:** The pipeline factory is keyed by `(platform, SyncPipelineName)`; resolving `(SHOPIFY, ORDERS)` returns the orders pipeline; an unregistered pair returns a typed error.
- [ ] **AC-8:** `marketing_reconcile.go` is deleted (`/marketing/reconcile` → 404); TS-side `triggerMarketingReconcile` + `MarketingReconcileRequest`/`Response` types + callers are removed; `bun tsc` clean.
- [ ] **AC-9:** The `OutboxWriter` port + `PgOutboxWriter` struct no longer exist; canonical→wire translation lives in the per-entity handlers; `core/services/outbox/outbox_dispatcher.go` is unchanged.
- [ ] **AC-10:** `go build ./...` + `go test ./...` green; `bun tsc` green across TS workspaces.

## Risks & Migration

- **`/marketing/reconcile` 404 window (Decision 13).** Between Spec A and Spec C landing, the route is gone and the TS-side `triggerMarketingReconcile` is removed. Accepted per scoping decision. Mitigation: Spec C should land promptly after A+B; if a marketing reconcile is needed in the interim, trigger it via `POST /sync` once Spec C's `MARKETING_METRICS` kind exists. Confirm no production scheduler currently calls `/marketing/reconcile` before deleting.
- **Pipeline behavioral change (Decision 11).** Pipelines stop writing to storage directly and instead publish `ExternalXUpdatedEvent`. The persistence path now runs through a handler + the outbox dispatcher (async by default). Existing pipeline tests that asserted "row written after `Execute()`" must be rewritten to assert "event published after `Execute()`" + a separate handler test for "row written after event handled". The synchronous `POST /sync` back-compat path (Decision 10) must account for this — `execute_sync` either dispatches the handler inline or waits for the dispatcher, so the synchronous response still reflects completed work.
- **Two-commit ordering (Decision 15).** Commit (a) integrations extraction must not break sync's fx wiring; commit (b) sync restructure is large. Each commit must independently pass `go build ./...` + `go test ./...`.

## Open Questions

- **`execute_sync` synchronous-vs-dispatcher semantics.** Decision 11 makes persistence async via the outbox dispatcher, but Decision 10's `POST /sync` back-compat path is synchronous. Does `execute_sync` invoke the handler inline (bypassing the dispatcher for the synchronous path) or block on the dispatcher draining the just-published event? To resolve during `/plan` — leaning inline-handler-invocation for the synchronous path, dispatcher for `async_execute_sync`.
- **Canonical struct test migration.** `canonical/*_test.go` move with their structs into `storage/<entity>/`. Whether they stay as pure struct tests or fold into storage round-trip tests is a `/plan` detail.
