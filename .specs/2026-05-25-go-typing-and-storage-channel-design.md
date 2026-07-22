# Go Backend Typing Hardening + Storage-Owned Channel Persistence — Design Spec

**Date:** 2026-05-25
**Status:** Draft — pending grill
**Bounded Contexts:** Go service — `internal/sync`, `internal/webhooks`, `internal/integrations`, `core`
**Kind:** refactor + feature
**Origin:** 10-agent audit of `packages/api/go` against the reference `bk-company/go-worker-monorepo/api`.

> Sourced from a parallel read-only audit (10 subagents) cross-checked against the reference repo. Findings corroborated independently across agents; the two highest-impact bug claims (dead `WebhookEventType` field, `NUVEMSHOP`/`NUVEM_SHOP` + `CARTPANDA`/`CART_PANDA` spelling split) were verified by grep.

## Context

The Go service ships HTTP controllers, a webhook intake, and a sync pipeline that persists canonical aggregates (Order, Product, ProductVariant, Transaction) and publishes wire integration events for TS consumers. The core utilities (`httputil.DecodeRequest` w/ validator/v10, `httputil.RespondError`/`RespondJSON`, a transactional outbox + `UnitOfWork`, generic mediator) and the full wire enum catalog (`contracts-go/wire/enums.go`: `SalesPlatform`, `PaymentStatus`, `TransactionKind`, `CurrencyCode`, …) already exist and are used correctly in the write-side aggregates. The gaps are where code deviated from those primitives.

The reference repo demonstrates the target persistence pattern: storage owns a buffered Go channel + a batching `Accumulator`; producers (pipeline + handler) push typed entities and never save directly; the storage goroutine drains, bulk-writes, and **only after the write succeeds** emits the integration event — i.e. the event is published from inside the storage service, post-persist.

## Problem

**P1 — No controller uses the decode/validate/respond utilities.** 0 of 9 controllers use `httputil.DecodeRequest`/`RespondError`/`RespondJSON`. Each hand-rolls `json.NewDecoder`, manual `r.URL.Query().Get`, manual path-splitting (`extractJobID`, `extractLastPathSegment`), and local `writeJSON/writeErr/writeError/writeAccepted` helpers. The local `response.go` files emit `{"error":"..."}` instead of the structured `{"code","message"}` envelope — silently breaking SDK error-code parsing.

**P2 — Webhook event/platform are stringly typed.** `WebhookReceivedPayload.Platform` + `.Event` are raw `string`; `WebhookEventType` (line 16) is dead (written, never read). The controller parses 4 query params by hand. `WebhookMapper`/`WebhookVerifier` `Platform()`/`Event()` return `string`; both factory maps key on `string`. No enum covers non-Shopify webhook platforms.

**P3 — Platform spelling split (verified bug).** `sync/module.go` uses `NUVEM_SHOP`/`CART_PANDA` (from `wire.SalesPlatform`); `webhooks/module.go` uses `NUVEMSHOP`/`CARTPANDA`. The two contexts disagree on the canonical id for the same provider → latent routing mismatch.

**P4 — Enum-typing gaps (census).** The `Transaction` aggregate stores `kind`/`status`/`gateway` as raw `string` with **no enum validation** (only a non-empty check) — unlike its sibling `OrderTransaction`, which validates all three; the normalizer passes provider lowercase `"sale"` straight through. `SyncJob.Platform` (the write-authority aggregate) is unvalidated `string`. `SyncStatus` has no `Valid()` and is serialised as `string` in 4 output DTOs (+ a hardcoded `'RUNNING'` SQL literal). `Pipeline.Platform()` returns `string` while `Pipeline()` returns the typed enum.

**P5 — `map[string]any` entity snapshot + publish-before-save.** All three handlers build the wire event's `Entity` field as a hand-rolled `map[string]any` with `string(o.Platform())` casts; Product/Variant snapshots omit most fields. The handler upserts then builds+saves the wire event as two separate steps (not atomic, and the wire event can be saved even though it's outside the upsert's transaction). Embedding the full entity is the *documented decision* — the defect is the untyped map + the non-atomic publish, not the embedding.

**P6 — Synchronous per-row persistence, no channel/batch.** The pipeline validates the Order then discards it (double construction with the handler), publishes inline through the mediator → handler does a per-row `UpsertOrder`. A 10k-order sync = 10k sequential UPSERTs blocking the request + 10k outbox rows. The reference decouples fetch from save via a channel + batched bulk write.

**P7 — Aggregates live inside `/storage`, mixing domain with persistence.** The canonical aggregates (`Order`, `OrderLine`, `OrderTransaction`, `OrderTransactionFee`, `Product`, `ProductVariant`, `Transaction`) and their value objects (`MonetaryAmount`, `PostalAddress`, `UtmTags`) live in `internal/sync/storage/<entity>/` and `storage/objects/` — i.e. the domain model is a sub-package of the persistence layer. `SyncJob` already lives correctly in `internal/sync/entities/`, so the codebase is inconsistent. The reference keeps the domain in `internal/<ctx>/entities` (flat `package entities`) and reserves `storage/<entity>/` for the `XStorage` interface + its DB impl.

## Goal

Bring the Go service onto its own primitives and the reference's persistence pattern: every controller decodes+validates+responds through `httputil`; webhook event/platform and the census gaps are typed enums with a single canonical platform spelling; the wire event is a typed snapshot emitted **transactionally, post-save, from inside the storage service**; and persistence flows through a storage-owned channel + batching accumulator for all four entities, preserving both sync and async job modes.

## Decisions

### Typing & boundaries

1. **All controllers adopt `httputil`.** Every controller in `internal/{sync,webhooks,integrations}/controllers` is rewritten to: a typed request struct with `from:"body|query|param|header"` + `validate` + `json|name` tags; `httputil.DecodeRequest[T]` as the first call; `httputil.RespondError`/`RespondJSON` for output. Delete `internal/sync/controllers/response.go` and `internal/webhooks/controllers/response.go`, plus `extractJobID`/`extractLastPathSegment`/`errStr`/`errMissingJobID`. Path params use `from:"param"` (Go 1.22 `r.PathValue`). `Metadata()` sets `Request`, `Response`, `Status`, `Errors`. Pattern reference: `medscall/.../controllers/archive_remote.go`.

2. **Webhook `event` enum = the sync event names.** A typed `EventName` (string enum, with `Valid()` + `ParseEventName`) lives in `internal/sync/enums/`. Its members are the four canonical event names currently in `internal/sync/events` (`sync.external_order_updated`, `…_product_updated`, `…_product_variant_updated`, `…_transaction_updated`). `internal/sync/events` references the enum so there is one source of truth. Rationale: we own the webhook URL we register with each provider, so `?event=` is ours to set to the canonical name — no need to mirror provider topics. The controller validates `event` via `oneof`; `WebhookMapper.Event()` returns `EventName`; the mapper factory keys on `(WebhookPlatform, EventName)`. `WebhookReceivedPayload.Event` is typed; **`WebhookEventType` is removed**.

3. **`WebhookPlatform` enum, one canonical spelling.** New typed enum (location: `internal/sync/enums/` alongside `EventName`, or `internal/webhooks/enums/` — see Open Questions) covering SHOPIFY, NUVEM_SHOP, CART_PANDA, YAMPI, KIWIFY, STRIPE, META, TIKTOK, GOOGLE_ADS, with `Parse`. **Canonical spelling = the underscore form** (`NUVEM_SHOP`, `CART_PANDA`) to match `wire.SalesPlatform`/`wire.CheckoutPlatform`; this resolves P3. `WebhookVerifier.Platform()` + `WebhookMapper.Platform()` return it; `WebhookVerifierFactory` + mapper `Factory` maps key on it; the `pendingMapperProviders` `[][2]string` becomes a typed `[]pendingPair{Platform, Event}`. The controller parses the inbound `platform` param via `oneof` + `ParseWebhookPlatform`.

4. **Census enum fixes (use existing `wire` enums; add `Valid()` where missing).**
   - `Transaction` aggregate: `kind`/`status`/`gateway` → `wire.TransactionKind`/`wire.TransactionStatus`/`wire.PaymentGateway`, parsed + validated in `NewTransactionFromProviderPayload` (mirroring `OrderTransaction`); the Shopify transaction normalizer maps provider strings → wire values (like `order_normalizer.mapGateway`). Split `ErrTxMissingKindStatus` into per-field errors.
   - `SyncJob.Platform` → `wire.SalesPlatform`, parsed in `NewSyncJob` (returns error).
   - `SyncStatus` gains `Valid()`; output DTOs (`StartSyncOutput`, `ExecuteSyncOutput`, `GetSyncStatusOutput`, `SyncJobSummary`) type `Status` as `enums.SyncStatus`; `syncjob_pg` scan guards with `Valid()`; hardcoded `'RUNNING'` SQL literal → `string(enums.SyncStatusRunning)`.
   - `Pipeline.Platform()` → `wire.SalesPlatform`; the pipeline `Factory` keys on it.
   - `*Input.Platform`/`PaymentStatus`/`PaymentMethod`/`PaymentGateway`/`Status`/`Kind` fields (Order, OrderLine, OrderTransaction, OrderTransactionFee, Product, ProductVariant, Transaction) → the matching `wire` enum types.

### Persistence (the channel refactor)

5. **Storage owns a channel + batching accumulator — all four entities.** Each `Storage` interface (order, product, product_variant, transaction) is reshaped to `InputChannel() chan<- []*Entity`, `Start(ctx) error`, `Close()`, dropping the synchronous `UpsertX(ctx, e)` from the producer-facing surface. A generic `Accumulator[T]` + `Saver[T]` is ported to `core` (from the reference's `shared/types/accumulator.go`). Batch size + flush interval are package consts (start: 1000 / 1s). fx `Lifecycle` `OnStart` launches each storage's `Start` goroutine; `OnStop` calls `Close`.

6. **Handlers construct once and enqueue.** `OrderUpdatedHandler` (and the three siblings) stop upserting and stop building the wire event. They receive `ExternalXUpdatedEvent`, construct the canonical aggregate **once** from `Input`, and push it to `storage.InputChannel()`. This removes the pipeline's validate-then-discard double construction (the pipeline no longer pre-validates; it publishes the event carrying `Input`, the handler is the single construction site).

7. **Wire event emitted transactionally, post-save, inside storage.** `Storage.Save(batch)` runs, in **one `UnitOfWork` transaction**: the bulk upsert **and** the insert of one typed wire `*UpdatedEvent` per entity into the outbox (transactional outbox → "saved ⇒ event row exists" atomically). The outbox dispatcher delivers them out-of-band. The wire event's `Entity` field is built from a **typed snapshot struct** (typed `wire.*` enum fields, full entity, no `string(...)` casts, no `map[string]any`). The `serialiseLines`/`serialiseTransactions`/`money()` JSONB `map[string]any` helpers in `order_pg.go` become typed structs too.

8. **Sync + async job modes preserved.** Both `Executor.Execute` (sync) and `Executor.ExecuteAsync` (async) remain, mirroring the reference's two job modes. Sync `Execute` enqueues then **flushes and waits** for the relevant storage channel(s) to drain + save before reporting `COMPLETED` (a flush barrier). Async `ExecuteAsync` enqueues, marks the job `RUNNING`, and returns; a background flush advances it to `COMPLETED`. The `POST /sync/jobs/{id}/execute` vs `/execute-async` controllers map to these.

### Structure (entities vs storage)

9. **Aggregates + value objects move out of `/storage` into `/entities` (+ `/objects`); `storage/<entity>/` becomes interface + Postgres impl only.** The canonical aggregates relocate from `internal/sync/storage/<entity>/<entity>.go` to a flat `internal/sync/entities/` package (joining the existing `SyncJob`): `entities.Order`, `entities.OrderLine`, `entities.OrderTransaction`, `entities.OrderTransactionFee`, `entities.Product`, `entities.ProductVariant`, `entities.Transaction`. Their value objects relocate from `storage/objects/` to `internal/sync/objects/` (`objects.MonetaryAmount`, `objects.PostalAddress`, `objects.UtmTags`). After the move, each `internal/sync/storage/<entity>/` package holds **only** the `Storage` interface (`package <entity>`, importing `entities`) and its Postgres implementation — mirroring the reference's `OrderStorage interface { InputChannel() chan<- []*entities.Order; Start(ctx); Close() }` shape. The `*Input` DTOs (constructor inputs) move with their aggregates into `entities`. The storage `snapshot.go` (wire serialisation) stays in `storage/<entity>/` since it is a persistence/wire concern, and imports `entities`.

## New order flow (target)

```
pipeline (scheduled)  ─┐ publishes ExternalOrderUpdatedEvent{Input}
                       ├─► OrderUpdatedHandler.Handle
webhook mapper (intake)┘    └─ construct *Order ONCE ─► storage.InputChannel() <- []*Order
                                                              │  Accumulator (1000 / 1s tick)
                                                              ▼
                                                        storage.Save(batch)
                                                              │  UnitOfWork tx:
                                                              │   1. bulk upsert orders
                                                              │   2. insert typed OrderUpdatedEvent (per entity) → outbox
                                                              ▼  commit ⇒ outbox dispatcher delivers wire events
```

## User Stories

- **S1 (controllers):** As an SDK consumer, controllers validate input via validator/v10 and return structured `{code,message}` errors, so client error handling works. *(D1; AC-1)*
- **S2 (webhook typing):** As an integrator, the webhook endpoint accepts only the canonical `(platform, event)` pairs and routes by typed enum, so a misconfigured registration is rejected at the boundary. *(D2, D3; AC-2, AC-3)*
- **S3 (enum hardening):** As a developer, closed-set fields are typed enums validated at construction, so an invalid `kind`/`status`/`platform` can't persist. *(D4; AC-4)*
- **S4 (persistence):** As an operator, a large sync batches its writes through a storage channel and the wire event is emitted only after the entity is durably saved, so consumers never see an order that isn't persisted. *(D5–D8; AC-5, AC-6, AC-7)*

## Acceptance Criteria

- [ ] **AC-1:** Every controller calls `httputil.DecodeRequest` first + `RespondError`/`RespondJSON`; both `response.go` files and the path-extraction helpers are deleted; `go build ./...` green.
- [ ] **AC-2:** `WebhookReceivedPayload` has typed `Platform`/`Event`, no `WebhookEventType`; the controller rejects an unknown platform or event with 400 via `oneof` before the factory.
- [ ] **AC-3:** A single `WebhookPlatform` spelling is used across `sync` + `webhooks`; no `NUVEMSHOP`/`CARTPANDA` literals remain; factory maps + interfaces are enum-keyed.
- [ ] **AC-4:** `Transaction` rejects an invalid `kind`/`status`/`gateway` with a typed error (unit test); `SyncJob` rejects an invalid platform; `SyncStatus.Valid()` guards the scan path.
- [ ] **AC-5:** Each storage exposes `InputChannel`/`Start`/`Close`; the fx lifecycle starts/stops the goroutines; producers no longer call a synchronous `UpsertX`.
- [ ] **AC-6:** The wire `*UpdatedEvent` is built from a typed snapshot struct (no `map[string]any`, no `string(enum)` casts) and is inserted in the same transaction as the bulk upsert (handler/storage test asserts both rows commit together).
- [ ] **AC-7:** Sync `Execute` reports `COMPLETED` only after the batch is saved (flush barrier); async `ExecuteAsync` returns `RUNNING` and a later flush completes it.
- [ ] **AC-8:** `go build ./...` + `go test ./...` + `go vet ./internal/...` green; `bun sdk` regenerates clean.
- [ ] **AC-9:** The seven aggregates live in `internal/sync/entities` (flat `package entities`) and their VOs in `internal/sync/objects`; no aggregate or VO type remains under `internal/sync/storage/**`; each `storage/<entity>/` package contains only the `Storage` interface + its pg impl (+ `snapshot.go`). `go build ./...` green, no import cycle.

## Risks & Migration

- **Blast radius:** ~30 files across 4 areas. Sequence so the contract-locking changes (enums, interfaces) land before the behavior changes. Stage by phase (typing → controllers → storage channel → executor wiring).
- **Transactional outbox + bulk size:** 1000 upserts + 1000 outbox rows in one tx may be large; tune batch size, and confirm the `UnitOfWork` supports a bulk write + multi-row outbox insert in one tx.
- **Flush barrier for sync mode:** needs a completion signal from storage back to the executor (per-job `WaitGroup`/done-channel, or a synchronous `Flush()` that blocks). Implementation detail for the plan.
- **SDK regen:** webhook controller request shape + any wire snapshot field additions change the OpenAPI; `bun sdk` must be re-run. Coordinate with the parallel SPEC-17 SDK refactor if still in flight.
- **Provider-topic → canonical-event registration:** moving `event` to the canonical name means webhook registration scripts/docs must register `?event=sync.external_order_updated` (not `orders/updated`). Document this.
- **Entity move (D9):** merging per-entity sub-packages into one flat `package entities` risks identifier collisions (e.g. two `ErrMissingPlatform`) and import cycles (`entities` must not import `storage`; `storage` imports `entities`; `events`/normalizers import `entities`). Sequence the move as one atomic task right before the storage reshape; resolve collisions by keeping the existing prefixed error names; verify no cycle with `go build ./...`.

## Open Questions (grill)

1. **Pipeline path:** keep publishing `ExternalXUpdatedEvent` (Input only) → handler constructs once + enqueues (unifies pipeline + webhook on one event; **proposed**), OR have the pipeline build the entity and push to the channel directly (reference-style, drops the event for the sync path)?
2. **Enum location:** `WebhookPlatform` + `EventName` under `internal/sync/enums/` (user said sync/enums for the event enum) vs a shared `internal/shared/enums/` (webhooks importing sync/enums creates a sync→ ... coupling — acceptable since webhooks already imports sync/events). Confirm.
3. **Coarse sync event:** the reference also emits a coarse `orders.sync` (IDs only) event per store. We keep the per-entity `OrderUpdatedEvent` (typed snapshot). Do we *also* want the coarse batch event, or is per-entity sufficient? (Proposed: per-entity only; coarse event out of scope.)
4. **Flush-barrier mechanism** for sync `Execute` — per-job done-channel vs synchronous `Flush()`. Defer to the plan, or decide now?
