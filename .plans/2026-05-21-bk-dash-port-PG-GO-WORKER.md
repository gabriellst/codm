# PG-GO-WORKER — Go Sync + Webhooks BCs (Polyglot) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox tracking.
> Each Task wraps one observable behavior in an outer RED→GREEN cycle.
> Files land under `packages/api/go/internal/{sync,webhooks}/` only.
> The Go framework already exists at `packages/api/go/core/` — DO NOT rebuild it.

**Goal:** Add two Go bounded contexts to the polyglot monorepo — `internal/sync/` (provider backfill polling) and `internal/webhooks/` (inbound provider event ingestion) — consuming the existing `packages/api/go/core/` framework. Port the Shopify Orders pipeline end-to-end as the exemplar; subsequent provider pipelines (Nuvemshop, CartPanda, Yampi, Kiwify, Meta, GoogleAds, TikTok) are deferred to follow-up tickets, each repeating the same shape.

**Architecture:** Two Go BCs sit alongside `internal/transcoding/` under `packages/api/go/internal/`. Both consume `packages/api/go/core/` for mediator (Redis Streams), outbox, UnitOfWork, HttpRouter, BaseEntity, AppError, types.Controller, pkg/{httputil,validation,openapi}. Persistence is `pgx/v5` via `sqlc` queries generated against `packages/contracts/db/migrations/*.sql` (Drizzle-emitted; one source of truth for both Go and TS). Cross-language enums + integration event payloads come from `packages/contracts/generated/go/wire/{enums.go,events.go}`. The Go worker is a **publish-only** participant in the event bus — `redis_mediator.go` writes to `events:<event-name>` Redis Streams; TS consumes via `RedisExternalMediator.ts`. The Go BCs do NOT consume integration events (no external.ts handlers needed for the exemplar).

**Inversion vs the original bk-dash-backend:** webhooks land DIRECTLY on the Go worker (`POST /webhooks/:platform/:type`), Go writes ONLY Postgres (no MongoDB), and the outbox event names match the TS-side `BkDashIntegrationEventRegistry` topics exactly.

**Stateless auth:** TS owns credentials end-to-end via BC4-Integration. The Go worker is fed `{accessToken, storeDomain}` per `/sync` invocation and uses them transiently. No credentials context, no OAuth, no handshake endpoint.

**Tech Stack:** Go 1.24+, `pgx/v5`, `sqlc`, `go-chi/chi` (re-exported via `core/services/HttpRouter`), `google/uuid`, `redis/go-redis/v9` (transitively via core mediator).
**Spec:** `.specs/2026-05-21-ddd-modeling-bk-dash.md` (§5.2, §"Sync Engine Separation", §"Idempotent Ingest", §"Deterministic IDs")
**Master plan:** `.plans/2026-05-21-bk-dash-port.md` (sub-plan PG-GO-WORKER)
**Depends on:** Iter 41 (`packages/contracts/wire/` BK Dash enums + integration events); Iter 42 (`packages/contracts/db/schema/` BK Dash Drizzle schemas → `packages/contracts/db/migrations/*.sql`); polyglot `packages/api/go/core/` (already shipped, NOT rebuilt here).
**Tasks:** 12
**Estimated minutes:** ~210

## Revisions

**Iteration 43 (2026-05-21) — polyglot rebase rewrite (from 13 → 12 tasks):**
- **Entire framework-rebuild scope DROPPED.** Polyglot already ships everything we used to build by hand:
  - Tasks 3 (Kafka producer + outbox publisher) → use `packages/api/go/core/services/mediator/redis_mediator.go` + `core/services/outbox/`.
  - Task 4 (chi router + auth middleware) → use `core/services/HttpRouter` + `core/middleware/`.
  - Task 9 (Deterministic UUIDv5 helper) → use `core/objects/HashedID.go` (namespace already pinned to `f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e`).
  - Task 16 (Quality gates / lint orchestration) → polyglot `go.mod` + Nx `project.json` already cover this; new BCs inherit.
- **Tasks 6, 7, 8 stay DROPPED** (handshake / credentials / handshake-real) per iter 35 — TS BC4-Integration owns the entire credential lifecycle.
- **Old Task 1 (scaffold), Task 2 (postgres pool), Task 5 (healthz) DROPPED** — module + pool + health all live under `packages/api/go/` (or `core/`) already.
- **Old Task 14 (`/marketing/reconcile/<platform>` stub) DROPPED** — defer to P7-MARKETING when the BC actually lands; not in PG scope.
- **sqlc setup re-pointed.** `sqlc.yaml` now reads `packages/contracts/db/migrations/*.sql` directly; the deleted `internal/shared/db/sql/migrations/0001_orders_placeholder.sql` is gone for good.
- **Mediator is publish-only.** No outbox table for now (future enhancement); events flow `usecase → handler.publish(IntegrationEvent[T]) → redis_mediator.go → Redis Streams events:<name> → TS RedisExternalMediator.ts`.
- **Folder shape now matches `internal/transcoding/` exactly:** `controllers/ entities/ enums/ errors/ events/ handlers/ middleware/ objects/ repositories/<aggregate>/ services/ usecases/ module.go`.

---

## Convention reference (read once during planning, NOT re-read by /build)

**Polyglot Go framework (`packages/api/go/core/`):**
- `services/mediator/{internal_mediator.go,external_mediator.go,redis_mediator.go,log_mediator.go,memory_mediator.go}` — publish/subscribe primitives. Go worker uses `redis_mediator` for outbound integration events.
- `services/outbox/` — outbox dispatcher (table-backed; optional for PG — keep events transactional vs use case if/when adopted).
- `services/UnitOfWork/` — transaction scope; entities go in via repos, events come out via mediator.
- `services/HttpRouter/` — chi-backed router with controller auto-registration.
- `types/{Controller.go,Middleware.go,Handler.go,events.go}` — interfaces every BC artifact implements. `types.IntegrationEvent[T]` is the generic envelope.
- `entities/BaseEntity.go` — provides `id`, lifecycle helpers; aggregate roots embed.
- `errors/{AppError.go,codes.go,mapper.go}` — typed error vocabulary; `mapper.go` is what `HttpRouter` consults to render the HTTP response.
- `objects/HashedID.go` — `objects.HashedID(platform, externalId string) string` — UUIDv5 with `BK_DASH_NAMESPACE = f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e`. **Use directly.**
- `pkg/httputil`, `pkg/validation`, `pkg/openapi` — request/response helpers, validation hooks, OpenAPI emission.
- `middleware/` — defaults (logging, recovery, request ID).
- `module.go` — fx-style composition root contributed by each BC; the BC's `module.go` returns its controllers/handlers and the root composes them.

**Sibling BC template (`packages/api/go/internal/transcoding/`):**
- Mirror this folder shape verbatim for `internal/sync/` and `internal/webhooks/`. Subfolders only created when populated.
- `module.go` exposes `func Module() core.Module` returning controllers + handlers + repositories registered with the DI container.

**Generated contracts (`packages/contracts/generated/go/wire/`):**
- `enums.go` — every cross-language enum the spec defines (Platform, WebhookType, PaymentStatus, …). **Import — do not re-declare.**
- `events.go` — every integration event payload struct + the canonical event-name constant (e.g. `EventNameSharedOrderUpdated = "integration.shared.order.updated"`).

**Drizzle migrations (`packages/contracts/db/migrations/*.sql`):**
- Authored once via `packages/contracts/db/schema/*.ts` + `bun run drizzle:generate`. Both TS Drizzle and Go sqlc read these.
- For the exemplar: `orders` table lands when P6-SALES schema ships (iter 42); PG-GO-WORKER's sqlc generation depends on that migration existing.

---

## Task 1: Scaffold `internal/sync/` BC skeleton + `module.go` + wire into polyglot composition root

**Files:**
- Create: `packages/api/go/internal/sync/module.go`
- Create: `packages/api/go/internal/sync/README.md` (one-paragraph "what this BC owns")
- Create empty placeholders so the folder shape is visible (`.gitkeep` if needed): `controllers/`, `entities/`, `enums/`, `errors/`, `events/`, `handlers/`, `middleware/`, `objects/`, `repositories/`, `services/`, `usecases/`
- Modify: `packages/api/go/cmd/api/main.go` (or wherever polyglot composes modules) to register `sync.Module()`
- Test: `packages/api/go/internal/sync/module_test.go` — asserts `Module()` returns a non-nil `core.Module` with empty controller/handler slices (Tasks 4–6 add content)

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** `bounded-context`
**Depends on:** (none — polyglot core is in)

- [ ] **Step 1: Failing test** — `TestSyncModule_RegistersWithoutPanic`. Calls `sync.Module()`, asserts not nil.
- [ ] **Step 2: Verify failure** — `cd packages/api/go && go test ./internal/sync/...` fails with "no Go files in …/sync".
- [ ] **Step 3: Implement minimal `module.go`** mirroring `internal/transcoding/module.go`. Return an empty `core.Module{Name: "sync"}` for now.
- [ ] **Step 4: Wire** into the polyglot composition root next to the transcoding module registration.
- [ ] **Step 5: Verify** `go test ./internal/sync/...` passes; `go build ./...` succeeds.
- [ ] **Step 6: Commit** — `feat(api-go): scaffold sync BC skeleton (PG Task 1)`

---

## Task 2: Scaffold `internal/webhooks/` BC skeleton + `module.go` + register

**Files:**
- Create: `packages/api/go/internal/webhooks/module.go`
- Create: `packages/api/go/internal/webhooks/README.md`
- Empty placeholders: `controllers/`, `mappers/`, `verifiers/`, `services/`, `errors/`, `events/`, `enums/`
- Modify: composition root to register `webhooks.Module()`
- Test: `packages/api/go/internal/webhooks/module_test.go`

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** `bounded-context`
**Depends on:** Task 1 (composition-root edit pattern)

- [ ] Same RED→GREEN cycle as Task 1. Commit message: `feat(api-go): scaffold webhooks BC skeleton (PG Task 2)`.

---

## Task 3: sqlc config + initial generation for `orders` (reads `packages/contracts/db/migrations/*.sql`)

**Files:**
- Create: `packages/api/go/sqlc.yaml` — points `schema:` at `../../contracts/db/migrations/*.sql`, points `queries:` at `internal/sync/repositories/order/queries/*.sql`, output `internal/sync/repositories/order/gen/`
- Create: `packages/api/go/internal/sync/repositories/order/queries/orders.sql` — `:one`/`:many` queries: `UpsertOrder`, `FindOrderForUpdate`, `GetOrderByID`, `ListOrdersByStoreID`
- Generated: `packages/api/go/internal/sync/repositories/order/gen/{db.go,orders.sql.go,models.go}`
- Modify: root `package.json` — add `"codegen:sqlc": "cd packages/api/go && sqlc generate"` if not already present
- Test: `packages/api/go/internal/sync/repositories/order/gen/models_smoke_test.go` — compile-time assertion that `gen.Order` struct contains the canonical columns

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** `repository`
**Depends on:** Iter 42 (`packages/contracts/db/schema/order.ts` + emitted `migrations/*_orders.sql`); Task 1

- [ ] **Step 1: Failing smoke test** referencing `gen.UpsertOrderRow` (doesn't exist yet).
- [ ] **Step 2: Author `sqlc.yaml`** + the queries file. `UpsertOrder` uses `INSERT … ON CONFLICT (platform, external_id) DO UPDATE … RETURNING *, (xmax = 0) AS is_new`. `FindOrderForUpdate` locks the row with `FOR UPDATE` for the diff path.
- [ ] **Step 3: Run `bun run codegen:sqlc`**; commit generated files.
- [ ] **Step 4: Verify** smoke test passes; `go build ./...` clean.
- [ ] **Step 5: Commit** — `feat(api-go): sqlc config + orders queries reading contracts migrations (PG Task 3)`

---

## Task 4: Canonical `Order` entity (Go-side write model)

**Files:**
- Create: `packages/api/go/internal/sync/entities/Order.go` — exported struct + constructor `NewOrder(...)` enforcing invariants; embeds `entities.BaseEntity` from `core/`. Holds canonical fields per spec §5.2: `StoreID`, `Platform` (`wire.Platform`), `ExternalID`, `PaymentStatus` (`wire.PaymentStatus`), `TotalCents`, `TotalCurrency`, `Lines []OrderLine`, `Transactions []OrderTransaction`, etc.
- Create: `packages/api/go/internal/sync/entities/Order_test.go`
- Create: `packages/api/go/internal/sync/errors/codes.go` — `ErrInvalidOrderTotal`, `ErrUnknownPaymentStatus` etc. as `core/errors.AppError` instances

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** `entity`, `errors`
**Depends on:** Task 1

- [ ] Tests assert: `NewOrder` with negative `TotalCents` returns `ErrInvalidOrderTotal`; ID equals `objects.HashedID(platform, externalId)` when not pre-set.
- [ ] Implement; commit: `feat(api-go): canonical Order entity + sync errors (PG Task 4)`

---

## Task 5: `OrderRepository` interface + Postgres impl with `SaveResult` diff detection

**Files:**
- Create: `packages/api/go/internal/sync/repositories/order/order_repository.go` — interface `OrderRepository` with `Save(ctx, *entities.Order) (*SaveResult, error)`, `FindByID(ctx, string) (*entities.Order, error)`. `SaveResult{IsNew bool, ChangedFields []string}`.
- Create: `packages/api/go/internal/sync/repositories/order/order_postgres.go` — `PostgresOrderRepository` implementing the interface. Uses `gen.FindOrderForUpdate` → diff → `gen.UpsertOrder`. Diff returns camelCase field names matching the wire payload.
- Create: `packages/api/go/internal/sync/repositories/order/order_postgres_test.go` — table-driven tests over a fake `gen.Querier` + compile-time interface satisfaction assertion. Real-Postgres test deferred to Task 11.

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** `repository`
**Depends on:** Tasks 3, 4

- [ ] Tests: new-row path emits `IsNew: true, ChangedFields: nil`; existing-row + same payload emits `IsNew: false, ChangedFields: []`; existing-row + changed `PaymentStatus` emits `["paymentStatus"]`.
- [ ] Commit: `feat(api-go): PostgresOrderRepository with diff-detecting SaveResult (PG Task 5)`

---

## Task 6: Shopify order normalizer service (Shopify REST payload → canonical Order)

**Files:**
- Create: `packages/api/go/internal/sync/services/shopify/order_normalizer.go` — `func NormalizeOrder(raw []byte) (*entities.Order, error)`. Decimal-to-cents, multi-allocation discount summing, payment-status mapping, UTM extraction from `note_attributes`. ID = `objects.HashedID("SHOPIFY", externalID)`.
- Create: `packages/api/go/internal/sync/services/shopify/order_normalizer_test.go`
- Create: `packages/api/go/internal/sync/services/shopify/testdata/order_paid.json` (real Shopify Admin REST fixture)
- Create: `packages/api/go/internal/sync/services/shopify/client.go` — minimal Shopify Admin REST client (`func New(accessToken, storeDomain string) *Client`; `func (c *Client) FetchOrdersPage(ctx, cursor) (page, nextCursor, error)`). Used by the pipeline in Task 7.

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** `service`
**Depends on:** Task 4

- [ ] Tests assert: `orderId == objects.HashedID("SHOPIFY", "8123456789")`, `paymentStatus == wire.PaymentStatusPaid`, totals match fixture, line discount sums correctly.
- [ ] Commit: `feat(api-go): shopify order normalizer + admin REST client (PG Task 6)`

---

## Task 7: `ExecuteSync` use case + Shopify Orders pipeline

**Files:**
- Create: `packages/api/go/internal/sync/usecases/execute_sync.go` — orchestrator. Input: `{StoreID, Platform, Pipelines []PipelineKey, AccessToken, StoreDomain}`. Dispatches per pipeline via `services/pipelines/factory.go`.
- Create: `packages/api/go/internal/sync/usecases/execute_sync_test.go`
- Create: `packages/api/go/internal/sync/services/pipelines/pipeline.go` — `SyncPipeline` interface (`Execute(ctx, input) error`).
- Create: `packages/api/go/internal/sync/services/pipelines/factory.go` — pipeline registry, `Resolve(platform, key) (SyncPipeline, error)`.
- Create: `packages/api/go/internal/sync/services/pipelines/shopify/order_pipeline.go` — paginated fetch via `services/shopify.Client` → normalize → `OrderRepository.Save` → publish `wire.SharedOrderUpdated` integration event via mediator on each row. Emits `wire.SharedIntegrationProgressUpdated` every 5%.
- Create: `packages/api/go/internal/sync/services/pipelines/shopify/order_pipeline_test.go`

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** `usecase`, `service`
**Depends on:** Tasks 5, 6; `core/services/mediator/redis_mediator.go`

- [ ] Tests use a fake Shopify client + fake repo + spy mediator. Assert one `SharedOrderUpdated` published per row + progress events at every 5% threshold.
- [ ] Commit: `feat(api-go): ExecuteSync use case + shopify orders pipeline (PG Task 7)`

---

## Task 8: `POST /sync` controller

**Files:**
- Create: `packages/api/go/internal/sync/controllers/execute_sync_controller.go` — `types.Controller` impl. Binds `POST /sync`, validates body via `pkg/validation`, calls `usecases.ExecuteSync`.
- Create: `packages/api/go/internal/sync/controllers/execute_sync_controller_test.go`
- Modify: `packages/api/go/internal/sync/module.go` — register controller.

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** `controller`
**Depends on:** Task 7

- [ ] Tests cover: 202 on accepted job, 400 on missing fields, 502 wrapping a downstream `AppError` from the pipeline.
- [ ] Commit: `feat(api-go): POST /sync controller (PG Task 8)`

---

## Task 9: Webhook mappers — `WebhookMapper` interface + `Registry` + Shopify HMAC verifier

**Files:**
- Create: `packages/api/go/internal/webhooks/mappers/mapper.go` — interface `WebhookMapper { Execute(ctx, Input) (Output, error) }`, `Registry` keyed by `(wire.Platform, wire.WebhookType)`, sentinel `ErrNoMapper`.
- Create: `packages/api/go/internal/webhooks/mappers/types.go` — `Input{Body []byte, Headers http.Header, StoreContext StoreContext}`, `Output{Events []types.IntegrationEvent[any]}`.
- Create: `packages/api/go/internal/webhooks/mappers/mapper_test.go`
- Create: `packages/api/go/internal/webhooks/verifiers/shopify/shopify_verifier.go` — HMAC-SHA256 over raw body with `X-Shopify-Hmac-Sha256`. Secret resolution: shared `SHOPIFY_CLIENT_SECRET` env (option 3 from iter 35 question — simplest, mirrors bk-dash-backend).
- Create: `packages/api/go/internal/webhooks/verifiers/shopify/shopify_verifier_test.go`
- Create: `packages/api/go/internal/webhooks/services/store_context_lookup.go` — interface + Postgres impl that resolves `(platform, storeDomain) → StoreID` against the TS-owned `store_integrations` table (read-only).

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** `service`, `value-object`
**Depends on:** Task 2

- [ ] Registry tests: Register/Lookup/duplicate-registration-panics/unknown-pair-returns-ErrNoMapper.
- [ ] Verifier tests: valid HMAC → ok; tampered body → error; missing header → error.
- [ ] Commit: `feat(api-go): webhook mapper Registry + shopify HMAC verifier + StoreContextLookup (PG Task 9)`

---

## Task 10: `ShopifyOrderUpdatedMapper` + generic `POST /webhooks/:platform/:type` controller

**Files:**
- Create: `packages/api/go/internal/webhooks/mappers/virtualStore/shopify/ShopifyOrderUpdatedMapper.go` — composes `services/shopify.NormalizeOrder` + `OrderRepository.Save` (imported from `internal/sync`) + builds `types.IntegrationEvent[wire.SharedOrderUpdatedPayload]` envelope with `{orderId, storeId, platform, externalId, paymentStatus, totalCents, totalCurrency, isNew, changedFields}`. Returns events; does NOT publish.
- Create: `packages/api/go/internal/webhooks/mappers/virtualStore/shopify/ShopifyOrderUpdatedMapper_test.go`
- Create: `packages/api/go/internal/webhooks/controllers/receive_webhook.go` — generic for all `(platform, type)`. Reads body, runs verifier (per-platform — looked up via verifier Registry), looks up mapper, calls `mapper.Execute`, publishes each event via mediator, returns 200. Status mapping: 401 on HMAC mismatch, 404 on unknown pair, 400 on malformed body, 502 on mapper error.
- Create: `packages/api/go/internal/webhooks/controllers/receive_webhook_test.go`
- Modify: `packages/api/go/internal/webhooks/module.go` — register the controller + Registry-populate `(SHOPIFY, ORDER_UPDATED) → ShopifyOrderUpdatedMapper`.

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** `controller`, `handler`
**Depends on:** Tasks 5, 6, 9

- [ ] Tests:
  - Happy path: real Shopify body + valid HMAC + `(SHOPIFY, ORDER_UPDATED)` URL → 200, fake `OrderRepository.Save` called with canonical Order, spy mediator received one `SharedOrderUpdated` event.
  - 401 on HMAC mismatch.
  - 404 on `(SHOPIFY, UNKNOWN_TYPE)`.
  - 400 on non-JSON body.
  - 502 when fake repo returns an error.
- [ ] Commit: `feat(api-go): ShopifyOrderUpdated mapper + generic /webhooks/:platform/:type controller (PG Task 10)`

---

## Task 11: Real-Postgres integration test via polyglot embedded postgres harness

**Files:**
- Create: `packages/api/go/internal/sync/repositories/order/order_postgres_integration_test.go` — uses `core/testing/embedded_postgres` (already shipped on polyglot). Boots PG in-process, applies `packages/contracts/db/migrations/*.sql`, exercises `PostgresOrderRepository.Save` against a real DB.

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** `test`
**Depends on:** Tasks 3, 5

- [ ] Tests: insert-then-upsert-same → `IsNew: false, ChangedFields: nil`; insert-then-upsert-with-changed-status → `ChangedFields: ["paymentStatus"]`; concurrent saves don't deadlock.
- [ ] Commit: `test(api-go): real-postgres integration coverage for OrderRepository (PG Task 11)`

---

## Task 12: End-to-end test — Shopify webhook → Postgres → Redis Stream → reread

**Files:**
- Create: `packages/api/go/internal/webhooks/e2e/shopify_order_e2e_test.go` — boots embedded postgres + miniredis (or a real Redis container). Wires the full webhook controller + `ShopifyOrderUpdatedMapper` + `PostgresOrderRepository` + `redis_mediator`. POSTs a real Shopify payload. Asserts: 200 response; Postgres row exists with canonical fields; a `XREAD` on `events:integration.shared.order.updated` returns one message with the matching `orderId`.

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** `test`, `e2e`
**Depends on:** Tasks 10, 11

- [ ] Commit: `test(api-go): e2e shopify webhook → postgres → redis stream (PG Task 12)`

---

## Final Validation

- [ ] `cd packages/api/go && go build ./...` — 0 errors
- [ ] `cd packages/api/go && go test ./internal/sync/... ./internal/webhooks/...` — all pass (unit + integration + e2e)
- [ ] `cd packages/api/go && golangci-lint run ./internal/sync/... ./internal/webhooks/...` — 0 issues (config inherited from polyglot root)
- [ ] `bun tsc && bun lint` (root) — TS side unaffected
- [ ] `bun x nx affected -t build --base=dev` — green
- [ ] Manual smoke: with local Postgres + Redis running, `cd packages/api/go && go run ./cmd/api`, then `curl localhost:<polyglot-port>/healthz` → 200 (health already provided by `core/`)
- [ ] AC mapping (spec §5.2 + §"Idempotent Ingest" + §"Deterministic IDs"):
  - `objects.HashedID("SHOPIFY", externalId)` matches TS-side `objects.HashedID` byte-for-byte → covered by `order_normalizer_test.go:"orderId equals HashedID(SHOPIFY:externalId)"` + cross-language check on the wire constant in `packages/contracts/`
  - Idempotent UPSERT — `order_postgres_integration_test.go:"reupsert same payload is no-op"`
  - Diff-detecting `SaveResult` — `order_postgres_test.go:"changed payment status emits changedFields"`
  - HTTP `POST /sync` → `execute_sync_controller_test.go:"runs the shopify orders pipeline"`
  - HTTP `POST /webhooks/:platform/:type` → `receive_webhook_test.go:"happy path publishes SharedOrderUpdated"`
  - Progress events every 5% → `order_pipeline_test.go:"emits SharedIntegrationProgressUpdated every 5%"`
  - Redis Stream delivery → `shopify_order_e2e_test.go:"reads back SharedOrderUpdated on events:* stream"`

## Notes

- This sub-plan ships the **exemplar pipeline only** (Shopify Orders). Each subsequent provider × entity-type combo (Shopify Products/Variants, Nuvemshop Orders, CartPanda, Yampi, Kiwify subscriptions, Meta Ads, Google Ads, TikTok, Stripe transactions, Pixel events) is the same shape repeated: one normalizer + one pipeline + one mapper. They are deferred to the per-BC sub-plans (P5-CATALOG, P6-SALES, P7-MARKETING, P8-TRACKING). Each per-BC plan adds a `packages/api/go/internal/sync/services/<platform>/<entity>_*.go` subtree plus the matching `internal/webhooks/mappers/<group>/<platform>/<Type>Mapper.go`.
- Sqlc generation runs against `packages/contracts/db/migrations/*.sql`. Whenever a per-BC sub-plan adds a new migration, re-run `bun run codegen:sqlc` and commit the regenerated `internal/<bc>/repositories/<aggregate>/gen/` output.
- `BK_DASH_NAMESPACE = f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e` is locked in `core/objects/HashedID.go`. The TS-side `core/objects/HashedID.ts` (polyglot) and any future Rust port must mirror byte-for-byte — mismatched namespace = mismatched IDs = duplicate canonical rows.
- The Go worker is **publish-only** on the event bus. If/when a Go BC needs to react to integration events from TS, add `handlers/external.go` per the `internal/transcoding/` template + register a consumer with `redis_mediator`.
- Outbox table is intentionally out of scope. Mediator is fire-after-write; a future enhancement may add a `core/services/outbox` table-backed dispatcher used jointly with `UnitOfWork`.
- Per-store HMAC secret resolution chose option 3 from iter 35's open question (`SHOPIFY_CLIENT_SECRET` env, `X-Shopify-Shop-Domain` identifies the store). Documented in `verifiers/shopify/shopify_verifier.go` header comment.
- The `internal/marketing/reconcile/<platform>` stub from the old Task 14 moves to P7-MARKETING; PG-GO-WORKER no longer owns it.
