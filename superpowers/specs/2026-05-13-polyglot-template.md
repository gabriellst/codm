# Polyglot Template — Design Spec

> **Supersedes** `/tmp/handofss/polyglot.md` §17 "Execution Status" and the P1.5–P1.9 master/sub-plans under `superpowers/plans/`. Those documents reflect intent; this one reflects what we will actually ship.
>
> **Branch:** `feat/clean-polyglot`. Current commit `e45dfabd` is the starting point we are rebuilding from, not a checkpoint we extend.

---

## Context

The branch was supposed to produce a polyglot fullstack template — a video streaming VOD showcase implemented across **TypeScript + Bun**, **Rust + axum**, and **Go + fx**, sharing a single Postgres, codegen'd SDKs, and TypeSpec-sourced wire contracts.

Reality of the branch today:

| Artifact | State |
|---|---|
| `contracts/` | ✅ Correct. TypeSpec wire (3 enums + 9 events) + Drizzle schema (21 tables across 8 pgSchemas) + ts/rs/go emitters all working. **Keep as-is.** |
| `framework/{ts,rs,go}` | ❌ Flattened layout, lost dependency direction, leaks medscall vocabulary (Brazilian VOs, Currency/Country/Language enums). |
| `api/ts/src/video/` | ❌ 3-file stub. Not a real bounded context. |
| `api/rs/src/video/` | ❌ Contains `game.rs`/`game_status.rs`/`game_slug.rs` — feat/polyglot's game context copied with the folder renamed `video/` but the code never adapted. |
| `api/go/video/` | ❌ The entire dev:channel WhatsApp/whatsmeow context. Wrong domain entirely. |
| `client/{ts,rs,go}` | ⚠️ Minimal scaffolds. Empty until APIs emit OpenAPI. |
| `app/{web,expo}` | ⚠️ Carried-over clean-2 scaffolds. Deferred per the original plan. |
| `e2e/` | ⚠️ Old medscall E2Es. Deferred. |

The single correct decision so far is the contracts package. Everything downstream of contracts needs to be rebuilt from the right source branches:

- **TypeScript reference for framework + api:** `dev:packages/api/src/shared` (framework shape) and `dev:packages/api/src/<context>` (bounded-context recipe).
- **Rust reference for framework + api:** `feat/polyglot:packages/api-rs/src/shared` (framework) and `feat/polyglot:packages/api-rs/src/<context>` (recipe).
- **Go reference for framework + api:** `dev:packages/channel/internal/shared` (framework) and `dev:packages/channel/internal/<context>` (recipe).

For every artifact we (re)introduce, the canonical recipe is read from these branches before code is written. No new architecture invented from memory.

---

## Problem

The current `feat/clean-polyglot` tree gives the **illusion** of a polyglot template — directories named correctly, codegen running, framework folders present — but cannot demonstrate the architecture because:

1. **Framework lost its semantics.** `framework/ts/src/{outbox, unitofwork, mediators, db, http, repositories, jobs, tracing, registry}` flattens dev's `shared/{types, services, utils, db, entities, objects, errors, events, repositories, middleware}` hierarchy. There is no longer a clean split between **types** (interfaces, base classes), **services** (concrete cross-cutting infrastructure), and **utils** (lang/runtime helpers). Consumers don't know where to find `BaseEntity` vs `InternalMediator` vs `Config`.
2. **Framework leaks domain.** Brazilian VOs (`cnpj.go`, `cpf.go`, `phone.go`) and medscall enums (`Currency`, `NotificationLevel`, `Language`, `Country`, `RoleType`) live inside what is supposed to be a context-agnostic primitives package. The template should ship a generic framework and let the showcase domain own its vocabulary.
3. **APIs implement the wrong domain.** A user cloning the repo and running `bun dev` cannot actually exercise the video streaming flows from `polyglot.md §5.4`. api-rs has no controllers wired, no webhook receivers, no SSE Fanout. api-go has zero workers — instead it ships a WhatsApp gateway. api-ts has one query, one entity, one controller.
4. **Framework position is ambiguous.** A top-level `packages/framework/` reads as a "shared library across api+app+e2e" — but it isn't shared with frontends. The frontends consume the SDK (`client/{ts,rs,go}`), not the framework. Framework only matters to the api of its language.

## Goal

Ship a polyglot fullstack template where:

1. **Each api package owns its framework as a co-located subpackage** treated as an external dependency by the api code, mirroring `dev:shared`'s shape with all domain vocabulary stripped.
2. **The showcase video streaming domain is fully implemented** across the three apis exactly as `polyglot.md §5` and the §5.4 vertical slice describe, using the framework primitives and the contracts.
3. **Every artifact in every api is recipe-traceable** to the source branch (`dev` for TS+Go, `feat/polyglot` for Rust). No architectural details invented mid-flight.
4. **Contracts package is preserved** — already working, already aligned with the design.

---

## Decisions (locked)

### D1. Framework location

Framework lives **inside each api package** as a co-located sibling of the source tree, declared as its own workspace member / Cargo workspace member / Go module:

```
packages/api/ts/
  framework/                    # @template/framework-ts (Bun workspace package)
    package.json
    src/
  src/                          # api code; imports `@template/framework-ts`
  package.json                  # @template/api-ts; depends on @template/framework-ts

packages/api/rs/
  framework/                    # template-framework-rs (Cargo workspace member)
    Cargo.toml
    src/
    macros/                     # template-framework-rs-macros (proc-macro crate)
      Cargo.toml
      src/
  Cargo.toml                    # template-api-rs; depends on template-framework-rs
  src/

packages/api/go/
  framework/                    # template/framework-go (independent Go module)
    go.mod
    ...
  go.mod                        # template/api-go; replace directive → ./framework
  cmd/
  <context>/
```

**Why co-located, not top-level:**
- Framework is per-language, per-api. It does not exist independently of its api.
- Co-location reinforces the boundary the user wanted: *"framework should be treated like an external package for every language api"*. The api imports it via package name, not relative paths.
- Stripping a backend via `bunx create-template` removes one folder (`packages/api/<lang>/`) and its framework drops out with it — no cross-package surgery.

**Path resolution per language:**
- **TS:** Bun's `workspaces` picks up `packages/api/ts/framework/package.json` automatically. The api imports `@template/framework-ts` like any external dep.
- **Rust:** Cargo workspace `members = ["packages/api/rs", "packages/api/rs/framework", "packages/api/rs/framework/macros"]`. api crate declares `template-framework-rs = { path = "framework" }`.
- **Go:** `packages/api/go/framework/go.mod` is its own module. `packages/api/go/go.mod` has `require template/framework-go v0.0.0` + `replace template/framework-go => ./framework`.

### D2. Reset api/{ts,rs,go} fully

The current `api/{ts,rs,go}/src/video/` trees are deleted as part of this work. Each api is rebuilt context-by-context. For every artifact written, the implementer reads the canonical recipe from the source branch first:

| Language | Source branch | Reference path |
|---|---|---|
| TypeScript | `dev` | `packages/api/src/{shared, <context>}` |
| Rust | `feat/polyglot` | `packages/api-rs/src/{shared, <context>}` |
| Go | `dev` | `packages/channel/internal/{shared, <context>}` |

Skills (`.claude/skills/<artifact>/<lang>/SKILL.md`) codify the recipes after the apis stabilize. For now, branches are the source of truth.

### D3. Framework shape mirrors `dev:shared`, stripped of domain

`dev:packages/api/src/shared` is the canonical TS framework shape. We mirror it 1:1, then remove anything domain-specific. Same exercise for Rust (`feat/polyglot:packages/api-rs/src/shared`) and Go (`dev:packages/channel/internal/shared`).

What stays (the **infrastructure subset** of shared):

```
framework/<lang>/
  types/        — base classes, interfaces (BaseEntity, BaseEvent, Controller, Middleware, Handler, Router, Repository, UnitOfWork, BoundedContext, BaseError)
  events/       — Base{Event, DomainEvent, IntegrationEvent} classes/traits
  entities/     — BaseEntity / AggregateRoot (no concrete entities)
  objects/      — BaseValueObject + BasePrimitiveValueObject + generic VOs only (Id, Email, PersonName, Money, Address, Range)
  errors/       — BaseError + base codes (VALIDATION_ERROR, NOT_FOUND, UNAUTHORIZED, FORBIDDEN, CONFLICT, INTERNAL_ERROR, ...)
  services/
    Mediator/         — Internal + External interfaces + adapters (EventEmitter2/Channel/Redis)
    UnitOfWork/       — UoW interface + factory + concrete adapters
    OutboxDispatcher/ — abstract + concrete adapter
    HttpRouter/       — Router interface + framework-binding adapter (Fastify/axum/net/http)
    Logging/          — Logger interface + adapter
    CommandQueue/     — interface + BullMQ/Redis adapters (TS), background job runners (Rust/Go)
    ExternalServiceProxy/ — typed SDK gateway base
  repositories/     — Repository interface + DomainEventRepository (interface + concrete)
  db/               — db client/config/drivers, jsonb custom type, saveWithOptimisticLock helper. NO schema definitions (those live in contracts).
  middleware/       — generic cross-cutting only: trace_context, request_id, CORS, recovery, idempotency, signature_verify. NO auth, NO tenancy, NO session.
  utils/            — Config, GlobalErrorMapper, OpenAPI emitter, Tracing, TryCatch, paths, sse, decorators
  schema/    (TS)   — augmented z (integrationEvent, domainEvent, paginatedQuery, paginatedResponse, instance, session helpers)
  macros/    (RS)   — proc-macro crate (entity!, value_object!, domain_event!, integration_event!, event_handler!, error_codes!, traced_impl, dto!, discriminated_union!, job!)
  index.ts / lib.rs / module.go — barrel
```

What does **not** belong in framework (lives in api code):

- Concrete entities, value objects, enums, errors, controllers, use cases, handlers, projectors, repositories. (`Video`, `Channel`, `VideoStatus`, `ReactionType`, etc.)
- Brazilian VOs (`CPF`, `CNPJ`, `RG`, `Phone`, `ZipCode`) and medscall enums (`Currency`, `NotificationLevel`, `Language`, `Country`, `RoleType`, `BrazilianState`). These were carry-overs and must be deleted.
- Authentication / session handling. **api-ts owns better-auth.** The framework provides middleware *types*, not auth implementation.
- Per-context registries. Each context exports its own DI bindings (`registry.{ts,rs,go}`); framework provides the registry **interface** only.

### D4. Showcase domain — exactly as `polyglot.md §5`

Locked: video streaming VOD with stubbed externals (storage = local FS, transcoder = sleep+webhook, push = `push_log` table, search = Postgres FTS, profanity = wordlist scan).

Bounded contexts and owners — **frozen** as the polyglot.md table specifies:

| Context | Owner(s) | Demonstrates |
|---|---|---|
| `auth` | api-ts | better-auth, session, middleware, query use case |
| `channel` | api-rs (writes), api-ts (reads) | aggregate + child collection, atomic projection ops |
| `video` | api-rs (writes), api-ts (reads), api-go (workers) | aggregate with child entities, state machine, webhook ingress, SSE |
| `engagement` | api-rs (writes), api-ts (reads) | high-volume atomic ops (views/reactions), comment aggregate, profanity refinement |
| `transcoding` | api-go | external SDK call (stubbed Mux), retry/idempotency, queue consumer |
| `search` | api-go | cross-context projection, batch indexing, scheduled jobs |
| `notifications` | api-ts | external integration (Expo Push stub), fan-out handler |
| `analytics` | api-go | time-series projection, periodic rollup cron, atomic counters |
| `ui` | api-ts | BFF query use cases (cross-aggregate joins for the frontend) |

The §5.4 vertical-slice walkthrough (creator upload → distribution → viewer journey → periodic rollup) is the acceptance test for "the template demonstrates the architecture." If any step in §5.4 can't run end-to-end at completion, the spec hasn't shipped.

### D5. Contracts package stays as-is

`packages/contracts/` is the one piece that already matches the design (3 wire enums + 9 integration events in TypeSpec; Drizzle schema with pgSchema namespaces; ts/rs/go emitters). No changes to its layout, codegen, or output. We only verify it after framework moves (codegen consumers in `framework/<lang>` are now under `api/<lang>/framework`, so import paths in the emitters update).

### D6. Plans are reset

`superpowers/plans/2026-05-13-framework-refactor-master.md` and the P1.5–P1.9 sub-plans are **superseded by this spec**. A new phased plan is written from this spec via `/plan` (see §Phase plan below for the outline). The old plans stay in `plans/` for history but are marked `[SUPERSEDED — see specs/2026-05-13-polyglot-template.md]` at the top.

---

## User stories

> Personas: **template author** (us, building the template), **template adopter** (developer cloning it to start a real project), **template explorer** (engineer reading it to learn the patterns).

### US-1 — Explorer reads one bounded context and understands the whole architecture
> *As a template explorer, when I open any one bounded context (e.g. `packages/api/rs/src/video/`), I see entities, value objects, enums, errors, events, repositories, controllers, use cases, handlers, and projectors organized in folders named after First-Class Citizens, with each artifact small enough to read in a sitting.*

**Acceptance:**
- Every bounded context has the same top-level folder layout per language (driven by the source branch's recipe).
- No artifact silently combines two First-Class Citizens (e.g. a controller does not contain use case logic).
- Each file imports framework primitives via the package name (`@template/framework-ts`, `template-framework-rs`, `template/framework-go`), never via relative paths.

### US-2 — Adopter strips a backend and the framework drops out with it
> *As a template adopter who only wants TS and web, when I run `bunx create-template my-app` and deselect Rust and Go, my generated project has zero references to those toolchains, no `packages/api/rs/` directory, no `packages/api/go/` directory, and `bun install && bun dev` succeeds.*

**Acceptance:**
- `scripts/create-template.ts` removes `packages/api/<deselected-lang>/` (which carries the framework as a subdirectory — no orphan framework folder left at top level).
- Root `package.json`, `Cargo.toml`, `nx.json`, `docker-compose.yml`, `CLAUDE.md` are stamped to drop the language.
- `bun install && bun dev` runs the selected backends + frontends without errors.

### US-3 — Author adds a new pattern to one language and the recipe is traceable
> *As the template author working on api-rs, when I add a `webhook` artifact in the `video` context, I read `feat/polyglot:packages/api-rs/src/<context>/webhooks/` first to confirm the recipe, then write the file mirroring that shape, importing only framework primitives.*

**Acceptance:**
- No new architectural shape lands without a corresponding branch-side reference (cite in commit message: `ref: feat/polyglot:packages/api-rs/src/channel/webhooks/whatsapp.rs`).
- Reviews flag any artifact that doesn't match its branch reference.

### US-4 — §5.4 vertical slice runs end-to-end on a fresh clone
> *As a template adopter, when I clone the repo, run `bun install && bun contracts && bun dev`, then trigger the §5.4 creator-uploads-viewers-watch flow via the web app, every step of §5.4 succeeds with traces visible in LGTM.*

**Acceptance:**
- Storage stub generates a signed upload URL, the storage webhook flips the video to `PROCESSING`.
- Transcoder stub sleeps, fires `job-done` webhook, video goes to `READY` then (if channel.autoPublish) `PUBLISHED`.
- Integration events `video.published`, `reaction.added`, `comment.posted`, `view.recorded` propagate via outbox to consumers; api-ts feed projection updates, api-go search index updates, api-rs SSE broadcasts.
- Frontends receive SSE updates without page reload.
- Nightly analytics job rolls up daily stats.

### US-5 — Adopter swaps a stub for a real provider without touching domain code
> *As a template adopter ready to wire real S3 + real Mux + real Expo Push, when I replace the stub bindings in the registry, my domain code (entities, use cases, handlers) does not change.*

**Acceptance:**
- `StorageService`, `TranscoderService`, `PushDeliveryService`, `ProfanityService` are framework-defined interfaces (not concrete classes).
- Stubs are concrete implementations registered in each context's `registry.{ts,rs,go}`.
- Domain code depends on interfaces, not stubs.

### US-6 — Framework type-checks and unit-tests independently
> *As the template author, when I run `bun x tsc --noEmit && bun test` inside `packages/api/ts/framework/`, it passes without any api/<context> import. Same for `cargo check -p template-framework-rs` and `cd packages/api/go/framework && go build ./... && go test ./...`.*

**Acceptance:**
- Framework has zero imports from any `<context>/` directory.
- Framework tests cover augmented `z` helpers (TS), proc-macro expansion (RS), and base service interfaces (all three).

---

## Workspace layout (post-spec)

```
packages/
├── contracts/                               # ✅ Untouched (already correct)
│   ├── wire/                                # TypeSpec (3 enums + 9 events)
│   ├── db/                                  # Drizzle (text+jsonb, pgSchema-namespaced)
│   ├── codegen/                             # emit-wire-{ts,rs,go} + post-drizzle
│   └── generated/{ts,rs,go}/                # Codegen output
│
├── api/
│   ├── ts/
│   │   ├── package.json                     # @template/api-ts
│   │   ├── framework/                       # @template/framework-ts
│   │   │   ├── package.json
│   │   │   └── src/{types, events, entities, objects, errors, services, repositories, db, middleware, utils, schema}/
│   │   └── src/{auth, video, channel, engagement, notifications, ui, shared}/
│   │
│   ├── rs/
│   │   ├── Cargo.toml                       # template-api-rs
│   │   ├── framework/                       # template-framework-rs
│   │   │   ├── Cargo.toml
│   │   │   ├── src/{types, errors, events, repositories, db, services, jobs, middleware, utils}/
│   │   │   └── macros/                      # template-framework-rs-macros
│   │   │       ├── Cargo.toml
│   │   │       └── src/{entity, value_object, event, event_handler, error_codes, traced, dto, discriminated_union, dsl, field_plan}.rs
│   │   └── src/{video, channel, engagement, shared}/
│   │
│   └── go/
│       ├── go.mod                           # template/api-go (replace → ./framework)
│       ├── framework/                       # template/framework-go (own go.mod)
│       │   ├── go.mod
│       │   └── {types, entities, objects, errors, events, services, repositories, db, middleware, config, utils, pkg}/
│       └── cmd/api/main.go, {transcoding, search, analytics, shared}/
│
├── client/
│   ├── ts/                                  # Kubb → typed hooks + SDK against all 3 apis
│   ├── rs/                                  # progenitor
│   └── go/                                  # oapi-codegen
│
├── app/
│   ├── web/                                 # React + Vite + TanStack
│   └── expo/                                # Expo Router
│
└── e2e/                                     # Playwright
```

---

## Pattern allocation (per-language artifact map)

Locked per `polyglot.md §5.3`:

| Pattern | Owner | Lang | Source-branch recipe |
|---|---|---|---|
| Aggregate Root | api-rs `video`, `channel`, `engagement.comment` | rs | `feat/polyglot:packages/api-rs/src/game/entities/game.rs` |
| Aggregate with child entities | api-rs `video → VideoChapter[] + VideoCaption[]` | rs | feat/polyglot game + items pattern |
| Value Object | api-rs `VideoTitle, VideoSlug, Duration, CommentBody, ChannelHandle` | rs | feat/polyglot `game_title.rs`, `game_slug.rs` |
| Enum (state machine) | api-rs `VideoStatus` (transitions enforced in `Video::publish/archive`) | rs | feat/polyglot game_status |
| Enum (closed vocab) | contracts wire (`ReactionType`, `NotificationKind`) | shared | contracts/wire/enums |
| Domain Error | api-rs per context (e.g. `VIDEO_ALREADY_PUBLISHED`, `INVALID_STATUS_TRANSITION`) | rs | feat/polyglot `error_codes!` macro |
| Application Error | api-rs / api-ts per context (e.g. `VIDEO_NOT_FOUND`, `CHANNEL_NOT_OWNED_BY_USER`) | rs/ts | dev:shared/errors + per-context |
| Schema (TypeSpec) | contracts/wire | n/a | already done |
| Use Case (command) | api-rs `CreateVideo`, `MarkVideoUploaded`, `PublishVideo`, `ArchiveVideo`, `PostComment`, `ReactToVideo`, `RecordView`, `SubscribeToChannel` | rs | feat/polyglot game usecases |
| Query Use Case | api-ts `GetVideoFeed`, `GetChannelPage`, `GetVideoDetail`, `GetMyWatchHistory`, `SearchVideos` | ts | dev:ui queries |
| Controller | api-rs HTTP endpoints + api-ts query endpoints; webhook endpoints in api-rs | rs/ts | dev controllers, feat/polyglot controllers |
| Repository | per context, interface + concrete + mock | each | dev / feat/polyglot per context |
| Service | `StorageService`, `TranscoderService`, `ProfanityService`, `PushDeliveryService` (interfaces in framework? **No** — interfaces in the *owning* context; framework only provides the base type for ExternalServiceProxy) | rs/ts/go | dev `ExternalServiceProxy` base |
| Middleware | `RequireAuth`, `RequireChannelOwnership`, `RateLimit`, `IdempotencyKey`, `SignatureVerify` (auth middleware in api-ts; the rest in api-rs) | ts/rs | dev middlewares, feat/polyglot middleware |
| Domain Event | api-rs per aggregate (`VideoCreated`, `VideoUploaded`, `VideoTranscoded`, `VideoPublished`, `CommentPosted`, `ReactionAdded`, `ChannelSubscribed`, `ViewRecorded`) | rs | feat/polyglot events |
| Integration Event | contracts/wire (9 events) | shared | already done |
| Internal Handler | api-rs `PublishOnTranscodedHandler` (publishes integration event) | rs | dev internal.ts pattern, ported |
| External Handler | api-go `EnqueueTranscodingJobHandler`, `IndexVideoHandler`; api-ts `NotifySubscribersHandler` | go/ts | dev external.ts pattern |
| Projection — cross-context | api-ts `VideoFeedProjection` (in `ui/` context) | ts | dev:ui projections |
| Projection — within-context | api-rs `ChannelStatsProjection` | rs | feat/polyglot pattern |
| Projection — analytics | api-go `VideoWatchAnalytics` | go | dev:channel projections |
| Projector — canonical find→apply→save | api-ts `VideoFeedProjector` | ts | dev:ui projector |
| Projector — atomic ops | api-rs `ChannelStatsProjector.incrementSubscriberCount`, api-go `ViewAnalyticsProjector.markViewBatch` | rs/go | dev atomic patterns |
| UnitOfWork | every write use case (framework) | all | dev / feat/polyglot |
| Outbox + Dispatcher | framework + contracts.shared.outbox/events tables; `source` partitions | all | dev / feat/polyglot |
| Cross-service SDK call | api-go → api-rs (transcoder-done callback), api-ts → api-rs (subscriber lookup) | go/ts | dev `ExternalServiceProxy` |
| Webhook receiver | api-rs `POST /v1/webhooks/{storage,transcoder}` | rs | feat/polyglot webhooks (if present) or new |
| SSE broadcaster | api-rs `GET /v1/events` (Fanout) | rs | feat/polyglot SSE |
| Background worker | api-go consumes Redis Streams | go | dev:channel outbox consumer |
| Scheduled cron | api-go `AggregateDailyAnalyticsJob` (nightly) | go | new (no direct dev recipe) |
| Optimistic locking | `version` column on every aggregate | all | dev `saveWithOptimisticLock` |
| Idempotency | `idempotency_keys` table; webhook handlers | rs | feat/polyglot middleware |

---

## Cross-cutting

- **Auth.** api-ts owns sessions via better-auth. Other apis verify via cookie + `GET /v1/session` SDK call. Middleware *types* live in framework; the auth *implementation* lives in `api/ts/src/auth/`.
- **Tenant.** Single `tenant_id` column on every domain table (`contracts/db/schema/*.ts`). Middleware extracts from JWT. Lives in `api/<lang>/src/shared/middleware/` of each api.
- **Tracing.** OTel everywhere → LGTM (Grafana + Loki + Tempo + Mimir) in docker-compose. Framework provides:
  - TS: tsyringe interceptor + `autoTrace` decorator.
  - RS: `#[traced_impl]` proc-macro (auto-instruments every method on annotated types — controllers, use cases, handlers, jobs).
  - Go: orchestrion-driven (or manual `otel.Tracer` wrapper in framework/services/httprouter).
- **Webhooks.** api-rs only. `POST /v1/webhooks/<provider>` with `signature_verify` + `idempotency` middleware (both framework primitives). Verified payloads become integration events.
- **SSE.** api-rs only. `GET /v1/events`, Fanout singleton (OnceLock + mpsc per client), 15s keepalive, broadcasts `IntegrationEventEnvelope` discriminated union from contracts.
- **Outbox.** Shared `shared.outbox` + `shared.events` tables (in contracts/db). `source` text column distinguishes producers (`API_TS`, `API_RS`, `API_GO`). Each api polls only its source rows.
- **Validation.** Every flat DB row passes through an entity/query schema parser before becoming typed (the `parse-at-boundary` rule from `polyglot.md §6`). Framework provides the base classes/macros; per-context code declares schemas.

---

## Anti-invention guardrails

The single biggest failure mode of this branch was inventing architecture that doesn't exist in dev/feat-polyglot. Hard rules to prevent recurrence:

1. **Every artifact references a source-branch file in its commit message.** Format: `ref: <branch>:<path>`. Reviewers reject commits without a reference unless the artifact is genuinely new (and even then, justify why no existing recipe applies).
2. **Framework changes touch zero domain code.** A PR that adds/changes a framework primitive must not modify any `<context>/` file. If a domain change is needed, it's a separate PR.
3. **No new framework primitives invented mid-domain-work.** If a context needs something framework doesn't have, write the framework primitive *first* with its own tests, then consume it.
4. **Generated files have a `// ref:` header pointing to the codegen emitter that produced them.** Already done by current `contracts/codegen/`; preserve.

---

## Phase plan (overview only — full plan via `/plan`)

```
P0  Tombstone old plans + reset api/{ts,rs,go} (delete src/video, keep package.json/Cargo.toml/go.mod shells)
P1  Move framework/{ts,rs,go} → api/<lang>/framework/, restore dev:shared hierarchy, strip domain leakage
        P1a TS: framework lift + restructure + de-medscall, update contracts/codegen TS emitter import paths
        P1b RS: framework lift + restructure, update contracts/codegen RS emitter import paths
        P1c GO: framework lift + restructure + de-medscall, update contracts/codegen GO emitter import paths
P2  api-ts: auth (better-auth) + ui (BFF queries) + notifications + read projections for channel/video/engagement
P3  api-rs: write contexts (video aggregate + state machine, channel, engagement) + webhooks + SSE Fanout
P4  api-go: workers (transcoding, search indexer, view aggregator) + nightly analytics cron
P5  SDK matrix: client-ts (Kubb), client-rs (progenitor), client-go (oapi-codegen) — all 3 consume all 3 apis
P6  Skills authoring: per-artifact, per-language playbooks codifying the source-branch recipes
P7  Dev orchestration: docker-compose (PG + Redis + LGTM), nx run-many, root scripts polish
P8  bunx create-template: prune by selected backends/frontends (single-folder removal per backend now that framework is co-located)
P9  Frontends (app-web, app-expo) — deferred from polyglot.md, picked up here
P10 E2E for §5.4 vertical slice
```

**Critical path:** P0 → P1 → P2 → P3 → P5. Once any one api consumes the framework and produces an OpenAPI doc that client-ts can codegen against, the tendon is proven.

---

## Open questions

1. **Should there be a `packages/api/<lang>/framework/` README pointing to `dev:shared` so explorers can compare?** Probably yes — it makes the recipe traceability visible to readers who don't dig into commit messages. Cheap to add.
2. **Where does the better-auth Drizzle schema live — `contracts/db/schema/auth.ts` (already there) or `api/ts/src/auth/db/`?** Contracts already has it. Keep there. The api-ts `auth/` folder consumes the contracts schema like every other context.
3. **Do we keep `apps/web` + `apps/expo` deferred (per original polyglot.md §13 P6/P7) or co-deliver with backends?** Defer is fine; P9 in the phase plan accommodates that.
4. **`framework/<lang>` package names — confirm:** `@template/framework-ts`, `template-framework-rs` (+ `template-framework-rs-macros`), `template/framework-go`. These already match the source-branch package names.

---

## Self-review

- **Spec coverage:** every observable problem from the gathered context (flattened framework, wrong-domain code in apis, domain leakage in framework, ambiguous framework position) has a corresponding decision.
- **Anti-invention:** D2 mandates branch references per artifact; "Anti-invention guardrails" §1–4 codify the rule.
- **Decision lineage:** D1 derives from the user's explicit preference (framework co-located, treated as external package); D2 from user's "start from scratch" answer; D3 from "dev:shared as source-of-truth"; D6 from "supersede with single spec".
- **Type consistency:** package names match across all three languages and across the spec body. Bounded-context names match `polyglot.md §5.2` table verbatim.
- **No placeholders.** Every "TBD" surfaced as an open question in §Open questions.
