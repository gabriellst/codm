# Event-Driven Sync Trigger + Progress Events — Design Spec

> Status: draft · Date: 2026-05-26 · BCs: Go `sync`, Go `core` (mediator/outbox), TS `integration`
> Sketch phase — three forks resolved (see Decisions); sub-questions in Open Questions.

## Context

When a merchant connects an integration, the Go worker must pick it up and start
pulling provider data (orders/products/variants/transactions) into the canonical
store — the role `NewWorker` + `SyncIntegrationSetHandler` played in the legacy
`bk-dash-backend` (NestJS) codebase. There, connecting emitted `sync.integration-set`,
a handler resolved `(category → pipelines)` and HTTP-called the Go worker.

Here the wiring is half-built:

- **Trigger publish side (TS) exists.** `ConnectIntegration` raises `IntegrationActivatedEvent`
  (in-process, outbox); `IntegrationActivatedHandler` bridges it to the cross-service
  `IntegrationActivatedIntegrationEvent` (`integration.shared.integration.activated`)
  via `ExternalMediator` → Redis Streams. The wire doc states the intent verbatim:
  Go should *"(a) start polling on the integration's schedule, (b) accept incoming
  webhooks for it, and (c) backfill any window of provider data."*
- **Trigger consume side (Go) does not exist.** `RedisExternalMediator` is **publish-only**:
  `Register()` is a no-op, `Start()` only pings. No `IntegrationEventHandler` is registered
  anywhere. The in-process `OutboxDispatcher` is *provided but never `Start()`'d*.
- **Pull machinery (Go) exists.** `StartSync` (PENDING job) → `ExecuteSync`/`ExecuteAsync`
  → `executor` → `pipelines.Factory.Get(platform, name)` → Shopify pipelines (real) /
  `PendingPipeline` (stubs) → `ExternalXUpdated` events → storage drain → Postgres.
- **Progress wire events exist but are unpublished.** `…progress_updated`
  (`{storeIntegrationExternalId, pipeline, percent, message}`, ephemeral) and
  `…last_sync_updated` (`{platform, storeIntegrationExternalId, syncedAt, rowsTouched,
  succeeded}`, persisted by TS → `StoreIntegration.lastSyncAt`) are generated in both
  languages; Go publishes neither and the TS consumer marks `progress_updated` PENDING.
- **SSE to the frontend does NOT exist** (corrected 2026-05-26 during planning). There is no
  `/events` endpoint and no broadcaster in Go — `RegisterCallback` is called only in tests,
  no controller returns `EventPayloads`, and the `listen_events.go` the redis mediator's
  comment references was never ported from medscall. Only *framework readiness* exists (a
  `Flush()` helper + an OpenAPI describer for an `EventPayloads`/`ServerEvent` SSE endpoint).
  The full vertical — `ListenEventsController` + `EventPayloads` + frontend `useServerEvents`
  — exists and works in `~/Desktop/Projetos/medscall/monorepo` and will be **ported in Plan B**.
  The frontend is dependency-ready (`@microsoft/fetch-event-source` + a `progress.tsx` primitive).

## Problem

A merchant connecting an integration does not trigger any sync. Go cannot consume the
activation event (no inbound consumer), and even if it could, the event carries neither
provider **credentials** nor the provider-side **externalId** needed to (a) page the
provider API and (b) key the progress/last-sync wire events. There is no live progress
signal to the dashboard.

## Goal

After `ConnectIntegration` (or an inactive→active toggle), the Go worker autonomously,
idempotently starts a backfill sync for that integration, persists the pulled entities,
streams job-level progress to the dashboard, and reports completion back to TS — driven
by the activation event, not an HTTP push from TS.

## Decisions

Three forks were settled in design review (2026-05-26):

- **D1 — Credentials via an enriched event + capability handle.** The activation event gains
  `storeIntegrationExternalId` (non-secret) and `credentialHandle` (opaque, short-lived,
  exchangeable token). The secret **never** rides the bus. Go exchanges the handle for the
  plaintext credentials. *Rejected:* plain S2S fetch-by-id (ambient authority, not a
  capability); credentials-on-event (secret on the bus); Go-shares-vault-key (duplicates
  vault, leaks master key into Go).
- **D1a — The exchange is a normal TS controller consumed via the symmetric SDK** (decided
  2026-05-26). The Go→TS client codegen already exists: `bun sdk` runs `generators/go.ts`
  (`oapi-codegen`) and emits a Go client per backend into `packages/client/dist/go/pkg/<service>`,
  aggregated in `pkg/client/client.go` as `client.Typescript.<Op>()`. So we add an
  `ExchangeCredentialsController` under `integration`, regenerate, and Go calls the typed
  method — mirroring how TS calls `client.go.sync(...)`. *Rejected:* a thin hand-rolled Go
  HTTP client (the symmetric pipeline already produces the typed one; hand-rolling would
  violate `project_sdk_client_singleton`). **Consequence (see Open Questions):** the pipeline
  has no per-operation surface scoping, so this controller also generates a frontend
  React-Query hook unless we extend `preprocess.ts` — runtime S2S auth is mandatory either way.
- **D2 — Handler creates the job, then runs `ExecuteAsync` in a detached goroutine.** The
  consumer handler is fast and non-blocking: `StartSync` → `go executor.ExecuteAsync(jobID)`.
  This **forces wiring `OutboxDispatcher.Start()`** (the async path delivers entity events
  via the outbox). *Accepted risk:* a process restart mid-backfill strands the job in
  `RUNNING` (mitigation deferred — see Open Questions). *Rejected for v1:* a PENDING-job
  poller/runner (more infra than v1 warrants).
- **D3 — Job-level progress, published by the executor, streamed over a Go SSE vertical
  ported from medscall** (premise corrected 2026-05-26 — the SSE endpoint did not exist).
  `percent = floor(100 × completedPipelines / totalPipelines)`, emitted at **pipeline
  boundaries** by the executor (which owns the pipeline list and each pipeline's
  `RowsTouched` for the `message`). No `Pipeline.Run` contract change. **Plan B builds**
  `ListenEventsController` (`GET /events`) + `EventPayloads` doc-type (mirroring medscall's
  `packages/channel/internal/shared/controllers/listen_events.go`): it registers an
  `ExternalMediator.RegisterCallback` and fans every integration event to per-client SSE
  channels — so the executor's `Publish(IntegrationProgressUpdatedEvent)` reaches the
  dashboard with no whitelist. Frontend ports medscall's `useServerEvents` hook + a sync
  progress UI on the existing `progress.tsx`. *Rejected:* intra-pipeline percent (cursor
  pagination has no total — would be fabricated); TS re-broadcast (extra hop once Go owns
  the SSE channel).
- **D8 — Split into two plans** (decided 2026-05-26). **Plan A — event-driven trigger:**
  Layers 1–3 + credential exchange + externalId threading (Layer 4's externalId part). Ships
  auto-sync end-to-end, observable via the existing `GetSyncStatus` polling. **Plan B —
  progress over SSE:** the SSE vertical, executor progress/last-sync publishing, the
  `lastSyncAt` re-add + migration + TS `last_sync_updated` handler, and the frontend hook +
  progress UI. Plan B depends on Plan A. Each is independently testable.

## Work breakdown

### Layer 1 — Inbound cross-service consumer (Go `core`, BC-agnostic linchpin)

`RedisExternalMediator` gains a real consume side, symmetric to its publish side:

- `Register(h IntegrationEventHandler)` — store handlers keyed by `EventName()`.
- `Start(ctx)` — for each registered stream `events:<EventName>`, launch an `XREADGROUP`
  consumer-group loop (consumer group per service so TS and Go each get a copy):
  read → decode `{data: json}` → unmarshal to a `RawIntegrationEvent` → dispatch to the
  handler → `XACK` on success; leave un-ACK'd on error for redelivery.
- `core/module.go` adds `fx.Invoke` lifecycle hooks to `Start()` **both** the external
  mediator consumer **and** the `OutboxDispatcher` (the latter closes the D2 dependency).

### Layer 2 — Credential capability handle + exchange controller (TS `integration`)

- **Mint (publish path).** When `IntegrationActivatedHandler` (TS) bridges the domain event
  to the wire event, mint a random `credentialHandle`, store `handle → storeIntegrationId`
  in Redis with a TTL comfortably exceeding outbox delivery latency (proposed 15 min), and
  set `storeIntegrationExternalId` + `credentialHandle` on the wire event.
- **Exchange controller.** `ExchangeCredentialsController` (e.g. `POST /credentials/exchange`)
  → `{ handle }` resolves to `storeIntegrationId` in Redis → opens the vault
  (`CredentialVault`) → returns the **only** secret bit: `{ credentials: Record<string,string>,
  cursor? }`. Everything else Go needs (`externalId`, `platform`, `type`) is already on the
  event, so the response stays minimal. **Idempotent / multi-use within TTL** so outbox
  redelivery of the activation event can re-exchange (see Open Questions on single-use).
  Guarded by **service-to-service auth middleware** (rejects session/browser tokens) — this
  is mandatory because the operation also surfaces in the frontend SDK (D1a / Open Questions).
- **Regenerate.** `bun emit-openapi && bun sdk` re-emits `integration`'s `openapi.json` and
  regenerates both the Go service client (`pkg/typescript.ExchangeCredentials`) and the TS
  app SDK.

### Layer 2b — Wire Go's consumption of the generated client (Go `core`, one-time)

The generated Go→TS client lands in `packages/client/dist/go/pkg/typescript/` but
`packages/api/go` does not import it yet. First Go→TS call pays a one-time setup:
- `go.mod` require/replace pointing at the generated `template/client-go` package.
- An `fx` provider constructing the aggregate client with `TS_API_BASE_URL` from config —
  the Go mirror of TS's `Client.create({...})` in `shared/registry.ts`. After this, every
  future Go→TS call is free (just add a controller + `bun sdk`).

### Layer 3 — The trigger handler (Go `sync`)

`internal/sync/handlers/integration_activated_handler.go`, implementing
`mediator.IntegrationEventHandler`, registered with the `ExternalMediator` via `fx.Invoke`:

1. `EventName()` → `"integration.shared.integration.activated"`.
2. `Handle`: resolve pipelines from `(type, platform)` — the `resolvePipelines` analogue,
   a small resolver in the sync BC (e.g. `SALES_CHANNEL → [ORDERS, PRODUCTS, PRODUCT_VARIANTS]`,
   `PAYMENT_GATEWAY → [TRANSACTIONS, DISPUTES]`, `MARKETING_PLATFORM → [MARKETING_METRICS_CONCURRENT, CAMPAIGNS]`).
3. Exchange `credentialHandle` at TS via the generated client —
   `client.Typescript.ExchangeCredentials({ handle })` → `{ credentials, cursor? }`
   (`externalId`/`platform`/`type` already came on the event).
4. `StartSync({ storeId, storeIntegrationId, storeIntegrationExternalId, platform, pipelines })`
   — creates the PENDING job; the existing `FindRunning` guard provides idempotency against
   redelivery.
5. `go executor.ExecuteAsync(jobID)` — detached.

### Layer 4 — Thread externalId + emit progress (Go `sync`)

- `StartSyncInput` and the `SyncJob` entity gain `StoreIntegrationExternalID` (already present
  on the `/sync` back-compat request, currently dropped — this also un-drops it). Required so
  the executor can key the progress/last-sync wire events.
- Pipelines need provider credentials at runtime — `RunInput.Credentials` already exists;
  thread the exchanged credentials from the job/handler into the run.
- The `executor` gains an `ExternalMediator` (or a narrow `ProgressReporter` port). It:
  - publishes `IntegrationProgressUpdatedEvent` at each pipeline boundary
    (`percent`, `pipeline`, `message` from `RunResult.RowsTouched`);
  - publishes `IntegrationLastSyncUpdatedEvent` on terminal state (Complete/Fail).

### Layer 5 — Consume completion (TS `integration`) — Plan B

**Correction (2026-05-26):** `StoreIntegration.lastSyncAt` was deliberately removed from the
write model (`integration/handlers/external.ts` documents the removal; the entity has no such
field). Per the 2026-05-26 decision we **re-add it**:
- `StoreIntegration` entity + schema gain `lastSyncAt: Date | null` (+ a Drizzle migration on
  the `store_integrations` table).
- A TS external handler `IntegrationLastSyncUpdatedHandler` consumes `last_sync_updated`
  (TS `RedisExternalMediator` already has a working consumer; register the handler in
  `integration/handlers/external.ts`) → loads the StoreIntegration by `externalId` → sets
  `lastSyncAt = syncedAt` → saves.
- `progress_updated` needs **no** TS consumer (frontend reads it from Go's `/events` once the
  SSE vertical lands).

## User Stories

- As a merchant, when I connect a store, a backfill starts on its own and I see a live
  progress bar without refreshing.
- As a merchant, after a sync finishes, the integration shows its last-synced time.
- As the platform, an activation event redelivered by the outbox does not start a duplicate
  sync.

## Acceptance Criteria

1. Connecting an integration (no HTTP `client.go.sync` call) results in a Go `SyncJob` for it
   reaching `COMPLETED`, with rows persisted.
2. `RedisExternalMediator` consumes `events:integration.shared.integration.activated` and
   dispatches to the registered handler; `OutboxDispatcher` runs.
3. The activation wire event carries `storeIntegrationExternalId` + `credentialHandle`; the
   secret is never serialized onto the event.
4. `POST /internal/credentials/exchange` returns plaintext credentials only for a valid,
   unexpired handle, behind S2S auth, off the public SDK surface.
5. The dashboard receives `progress_updated` over `/events` with monotonic job-level percent
   and a terminal `last_sync_updated`; TS updates `lastSyncAt` from the latter.
6. A redelivered activation event does not create a second concurrent job (idempotent on the
   RUNNING guard).
7. `bun tsc` + `bun run test` + Go `go test ./...` green.

## Risks & Migration

- **Handle TTL vs outbox latency.** Too-short TTL expires before delivery; single-use breaks
  on redelivery. Mitigation: generous TTL + idempotent exchange (Open Questions).
- **Stranded RUNNING jobs** on restart (D2 accepted) — needs a reaper eventually.
- **Consumer-group semantics.** Adding a Go consumer group to streams TS already consumes
  must not steal TS's deliveries — separate groups per service.
- Template repo, no production data — no backfill/migration concerns for schema changes
  (adding `storeIntegrationExternalId` columns/fields).

## Open Questions

1. **Go→TS client shape — RESOLVED (D1a).** The symmetric Go codegen already exists
   (`generators/go.ts` → `pkg/typescript`); use a generated controller, not a hand-rolled
   client. One-time consumption wiring captured in Layer 2b.
1a. **Surface scoping — RESOLVED: path (a)** (decided 2026-05-26). Ship the exchange
   controller with **runtime S2S auth only** and accept that the op appears (inert without a
   service token) in the frontend SDK. The cleaner fix — extending `preprocess.ts` with an
   `x-internal`/tag filter that strips tagged ops from the `pluginReactQuery` output while
   keeping them in the service clients (`pluginClient` + Go `oapi-codegen`) — is deferred as
   a separate **"pipeline should write it" follow-up**, not a blocker for this feature.
   **S2S auth (OQ#5) is therefore load-bearing and in-scope here.**
2. **Handle single-use vs multi-use.** Multi-use-within-TTL survives outbox redelivery
   simplest; single-use is tighter but needs the exchange to tolerate "already consumed" as
   non-fatal when paired with the RUNNING-job idempotency guard. Proposed: multi-use within
   a short TTL.
3. **Reaper for stranded RUNNING jobs** — follow-up, or in-scope minimal (mark RUNNING jobs
   older than N min as FAILED on boot)?
4. **`resolvePipelines` source of truth** — hardcoded map in Go sync, or derived from a
   shared `(type, platform) → pipelines` contract so TS and Go agree?
5. **S2S auth mechanism — RESOLVED: shared `INTERNAL_SERVICE_KEY` header** (decided
   2026-05-26). The convention already exists in `.env.example`
   (*"bypass header for privileged cross-service calls"*) but is **referenced nowhere in code**
   — neither `core/src/utils/Config.ts` (has `API_URL`, `GO_WORKER_BASE_URL`) nor the Go
   config wires it. So this slice must build it:
   - **TS:** add `INTERNAL_SERVICE_KEY` (+ `TS_API_BASE_URL` is N/A — TS already knows its own
     `API_URL`) to the Config env schema; add an `InternalServiceKey` middleware that compares
     a request header to `Config.env.INTERNAL_SERVICE_KEY` and throws `UNAUTHORIZED` otherwise;
     apply it to `ExchangeCredentialsController` only.
   - **Go:** add `INTERNAL_SERVICE_KEY` + the TS base URL to Go config; the `fx` provider for
     the generated client (Layer 2b) attaches the header on every Go→TS request.
