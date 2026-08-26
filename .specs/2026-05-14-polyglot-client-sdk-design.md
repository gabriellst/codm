# Polyglot Client SDK — Design Spec

**Date:** 2026-05-14
**Status:** Draft
**Bounded Context:** cross-cutting — `packages/contracts`, `packages/api/{typescript,rust,go}`, `packages/client`
**Kind:** chore (infrastructure refactor with OSS readiness target)
**Story Points:** 13 — multi-language coordination across contracts emitters + 3 OpenAPI emitters + 3 client generators + new compliance contract + auto-generated aggregate Client class per language; legitimate split candidate (see Open Questions).

## Context

`feat/clean-polyglot` is repurposing the clinical fork codebase as a polyglot template. Three backends (`packages/api/typescript/`, `packages/api/rust/`, `packages/api/go/`) emit per-service OpenAPI specs at `public/docs/openapi.json` (Rust/TS) or `public/openapi.json` (Go); three client packages (`packages/client/typescript/`, `packages/client/rust/`, `packages/client/go/`) generate symmetric SDKs from those specs. Cross-boundary types (enums, integration events) live in `packages/contracts/` and are emitted into `generated/{typescript,rust,go}/` consumed by every service.

**Pass-8 generators.** Each client has a `scripts/sdk.ts` that calls `scripts/lib/discover-apis.ts` to walk `packages/api/<lang>/**/public/**/openapi.json` and emits per-service output. TS uses Kubb (`packages/client/typescript/scripts/sdk.ts`), Rust uses progenitor 0.10 via a `sdk-codegen` binary (`packages/client/rust/src/bin/sdk-codegen.rs`), Go uses oapi-codegen v2 via `go tool` (`packages/client/go/scripts/sdk.ts`). Discovery currently returns `{ lang, service, specPath }` where today `service === lang` for all three (case 1 in `discover-apis.ts:69`).

**Existing pieces.** The Go OpenAPI walker (`packages/api/go/core/pkg/openapi/emit.go:Generate`) is already implemented and tested (ported from `dev:packages/channel/pkg/openapi/`) but unused — `packages/api/go/cmd/emit-openapi/main.go` hardcodes empty paths. The TS OpenAPI emitter (`packages/api/typescript/core/src/utils/OpenAPI.ts`) supports discriminated unions through `processDiscriminatedUnions()` and tags controllers `internal`/`external` at `buildTags()`. Integration events are registered as OpenAPI components via `registerEvents()` (line 312). The TS contracts emitter (`packages/contracts/codegen/emit-wire-ts.ts:92`) produces `z.integrationEvent({...})` schemas; the helper at `packages/api/typescript/core/src/utils/schema/ExtraTypes.ts:181` builds `{ payload, ownerId }` without a `name` field, so `z.discriminatedUnion('name', [...])` degrades silently. The dev-branch reference pattern for `configureClient` lives at `dev:packages/client/src/http/{index,config}.ts`.

**Long-term OSS vision.** This codebase is intended to become open-source polyglot client generation for OpenAPI. The current Pass-8 layout splits each language into its own client subpackage, which over-fragments the surface for OSS consumers. The aim is a single `packages/client/` package that exposes a generator CLI, a shared library, and committed per-target outputs under `dist/`.

**Anchors absent.** No aggregate `Client` class in any language. No `configureClient` in the polyglot branch. No `external/`/`internal/` split in the client output (the OAS tag mechanism exists but no consumer reads it). No shared spec-preprocessing or compliance-validation helper. No published OpenAPI contract documenting what shapes our generator accepts. Orphan directories `packages/client/api_typescript/` and `packages/client/api_rust/` exist from a path-resolution bug during Pass-8 restructuring.

## Problem

The Pass-8 client SDK pipeline works end-to-end (9 gates green) but has eight structural gaps that compound when a new api or service is added, and prevent the project from being shippable as OSS:

1. **OpenAPI dialect drift across emitters.** TS emits 3.1.0 (`OpenAPI.ts:261`), utoipa emits 3.1.0, Go walker emits 3.1.0 (`emit.go:101`). Neither progenitor 0.10 nor oapi-codegen v2 consumes 3.1 cleanly, so both client generators carry near-identical downgrade logic (`packages/client/rust/src/bin/sdk-codegen.rs:139-215` and `packages/client/go/scripts/sdk.ts:67-122`). Two implementations, two bug surfaces — Pass-8 already burned a cycle on `type: ["X","null"]`.

2. **api-go's OpenAPI is empty despite having a controller.** `packages/api/go/cmd/emit-openapi/main.go` hardcodes `Paths: map[string]any{}` based on a stale "worker-only" assumption. `packages/api/go/internal/transcoding/controllers/transcoder_callback.go` is a controller; the walker in `core/pkg/openapi/emit.go` already discovers it. Result: client-rust's `src/go/mod.rs` and client-go's `pkg/go/client.gen.go` are stubs.

3. **IntegrationEvent leaks into OpenAPI surfaces as broken schema.** `packages/api/typescript/public/docs/openapi.json` exposes `components.schemas.IntegrationEvent` as a `oneOf` of 9 variants with `discriminator: null`. Root cause: the contracts wire emitter calls `z.integrationEvent({...payload})` without a `name` literal; `BaseIntegrationEventSchema` (`BaseIntegrationEvent.ts:4`) has no `name` field; `z.discriminatedUnion('name', [...])` degrades silently. But the deeper problem is that integration events shouldn't be OpenAPI schemas at all — they're contracts-package types, consumed directly by each language, not transmitted as endpoint payloads.

4. **No URL/HTTP configuration layer.** Every Kubb-generated function takes `config: { client?: typeof fetch }` per call. There is no `configureClient({ <service>: baseUrl })` equivalent to dev's `packages/client/src/http/`. Callers must pass base URLs at every call site.

5. **No aggregate Client class anywhere.** TS users `import { publishVideo } from '@template/client-typescript/rust'` — flat function imports per service. Rust and Go are the same shape. There is no typed `client.rust.publishVideo(...)` routing surface. Adding a new api folder doesn't produce a new accessor automatically.

6. **External/internal duplication-by-tag.** The TS OpenAPI emitter tags every controller `internal` or `external` based on path. For the polyglot template every endpoint is available to both frontend and backend; the difference is which artifacts the consumer imports (hooks/zod for frontend, plain class methods for backend). The tag split adds artifact volume without informational gain.

7. **Layout over-fragments the OSS surface.** The Pass-8 layout has three sibling subpackages (`packages/client/{typescript,rust,go}/`), each with its own `package.json` (or `Cargo.toml` / `go.mod`), its own `scripts/sdk.ts`, and its own discovery wiring. For an OSS generator this is the wrong shape — consumers want one package that produces N target outputs.

8. **No published OpenAPI compliance contract.** The current generators silently handle a specific subset of OpenAPI shapes (operationId required, single-file specs, nullable form normalization, discriminator-with-mapping, JSON content-type only, no SSE, no webhooks, no cross-file `$ref`). None of this is documented; consumers learn it by failure.

Plus two cleanup tails:

9. **Orphan output directories.** `packages/client/api_typescript/` and `packages/client/api_rust/` exist from a Pass-8 path-resolution bug. The bug is fixed; the leftovers aren't cleaned.

10. **Monolithic generator scripts.** Each `scripts/sdk.ts` has a `processPlan(plan)` doing six things in sequence. Adding a new step requires editing the middle of that function instead of composing.

## Goal

Make the polyglot client SDK pipeline **symmetric, discovery-driven, composable, and OSS-shippable** so that:

- Adding a new api folder under `packages/api/<service>/` auto-produces a new client accessor in all three language clients with no hand-edits to scripts or registries. The implementation language of the service is irrelevant — discovery only cares that an `openapi.json` exists.
- Every consumer — frontend React component, backend cross-service call, worker script — uses the **same surface** per language: `Client.create({...})` in TS, `Client::builder()` in Rust, `client.New(client.Config{...})` in Go. Frontend additionally consumes hooks and zod schemas alongside; backend uses the class methods directly.
- The OpenAPI emit layer is uniform across the three backends (single dialect, single source of truth per concern), and the shapes our generator accepts are published as a compliance contract.
- Integration events stay in the contracts package where they belong; OpenAPI describes HTTP endpoints only.
- The `packages/client/` package is a single OSS-shippable unit: one `package.json`, one generator CLI, one shared library, committed per-target outputs under `dist/`.
- Generator scripts are composed of small named pipeline steps (`discover → preprocess → buildPlan → run → emit*`) so the next person adding a step doesn't have to read 200 lines of orchestration to find the insertion point.

## Decisions

1. **OpenAPI 3.0.3 emit everywhere.** TS emitter (`OpenAPI.ts:261`) declares `openapi: '3.0.3'` and rewrites `anyOf:[X, {type:'null'}]` and `type:[X,'null']` to `{...X, nullable: true}` at emit time. utoipa emits 3.0 (via builder option or one-line post-process in `emit_openapi.rs`). Go walker (`core/pkg/openapi/emit.go`) declares `3.0.3`. The downgrade logic in `client-rust/src/bin/sdk-codegen.rs` and `client-go/scripts/sdk.ts` is removed; their replacements in `packages/client/lib/preprocess.ts` only validate, not transform.

2. **api-go's `cmd/emit-openapi/main.go` calls `openapi.Generate(".", "public/openapi.json")`.** The hand-rolled empty-paths stub is replaced with the existing walker. `transcoder_callback.go` appears in the spec automatically.

3. **`ApiSource` drops the `lang` field.** `discoverApis()` returns `{ service, specPath }[]` where `service` is the `packages/api/<service>/` folder name. Subdirectory-nested services (Case 2 in current `discover-apis.ts`) are removed — one openapi per service folder. Today's three services: `typescript`, `rust`, `go`.

4. **No external/internal tag split.** `OpenAPI.ts:buildTags` stops emitting the `internal`/`external` tags. Every endpoint surfaces in the single generated client per service. Frontend consumes hooks + zod schemas + types alongside the Client class; backend consumes the Client class methods.

5. **Integration events leave OpenAPI entirely.** `registerEvents()`, `synthesizeServerEventName()`, `synthesizeServerEvent()`, and the `IntegrationEvent` schema registration are removed from `packages/api/typescript/core/src/utils/OpenAPI.ts`. utoipa never lists `IntegrationEvent` in `components(schemas(...))`. The Go walker's event registration (`core/pkg/openapi/events.go`) is removed or short-circuited. The integration event union is consumed by each language directly from `packages/contracts/generated/<lang>/`.

6. **`z.discriminatedUnion('name', […])` correctness fixed at the source.** `packages/api/typescript/core/src/utils/schema/ExtraTypes.ts:integrationEvent()` takes the event name as its first arg and bakes `name: z.literal(name)` into the produced schema. `packages/contracts/codegen/emit-wire-ts.ts:92` emits `z.integrationEvent('integration.video.uploaded', {...payload})`. Same fix lands in `emit-wire-rs.ts` (serde `#[serde(tag = "name")]` enum variants) and `emit-wire-go.ts` (typed const `Name` field). This is correctness in the contracts package, no longer an OpenAPI concern.

7. **TS client emits a class with `static create`.** Each service folder gets `<service>/Client.ts` exporting `class <Service>Client { static create(config) }`. The aggregate `src/index.ts` exports `class Client { static create(config) }` with one property per discovered service. Service property names come from `discoverApis()`, sanitized for JS identifiers (replace non-`[a-zA-Z0-9_]` with `_`, prefix `_` if leading digit, suffix `Svc` on reserved words). Class names are PascalCase of the service folder.

8. **Rust client emits a `Client` struct with `ClientBuilder`.** Each service folder is a module (`pub mod <service>`); the top-level `Client` struct exposes one field per discovered service, constructed via `Client::builder().<service>(url).…build()?`. Service identifiers sanitized per `RUST_RESERVED` (already implemented). Tracing/auth attached via shared `reqwest::Client` passed to the builder.

9. **Go client emits a `Client` struct with `New(Config)` constructor.** `packages/client/dist/go/pkg/client/client.go` is auto-generated, embedding one `*ClientWithResponses` per discovered service. Service identifiers sanitized per `GO_RESERVED` (already implemented). HTTP/tracing attached via shared `*http.Client` on `Config`.

10. **Generators are pipe-style.** Each generator entry point has a flat `main()` that chains pure-ish steps: `discoverApis → preprocessSpec → buildPlan → runGenerator → emitServiceClient → emitAggregateClient`. No `processPlan(plan)`-style fat orchestrators. Shared steps live in `packages/client/lib/`. One responsibility per function; file writes are the only side effects, isolated in named `emit*` functions. No function in the pipeline exceeds 30 LOC.

11. **Stay on Kubb / progenitor 0.10 / oapi-codegen v2.** No generator swaps. Re-evaluate ogen for Go and progenitor 0.11 for Rust in a future spec only if Decision 1 reverses.

12. **Cleanup orphans.** `packages/client/api_typescript/` and `packages/client/api_rust/` deleted as part of this work.

13. **Layout collapses to a single `packages/client/` package.** The three Pass-8 sub-packages are merged. Final tree:

    ```
    packages/client/
    ├── package.json                  # @template/client (generator + shared library)
    ├── README.md
    ├── COMPLIANCE.md                 # published OpenAPI contract (see Decision 14)
    ├── lib/                          # discover, preprocess, sanitize, render-class
    │   ├── discover.ts
    │   ├── preprocess.ts
    │   ├── sanitize.ts
    │   └── render/{typescript,rust,go}.ts
    ├── generators/
    │   ├── typescript.ts             # orchestrates Kubb
    │   ├── rust.ts                   # spawns rust-codegen below
    │   ├── rust-codegen/             # Cargo crate hosting progenitor (single binary)
    │   │   ├── Cargo.toml
    │   │   └── src/main.rs
    │   └── go.ts                     # spawns `go tool oapi-codegen`
    └── dist/
        ├── typescript/               # @template/client-typescript — checked in
        │   ├── package.json
        │   └── src/{<service>/, http/, index.ts}
        ├── rust/                     # template-client-rust — checked in
        │   ├── Cargo.toml
        │   └── src/{lib.rs, <service>/}
        └── go/                       # template/client-go — checked in
            ├── go.mod
            └── pkg/{client/, <service>/}
    ```

    The Cargo workspace root references `packages/client/generators/rust-codegen/` (host) and `packages/client/dist/rust/` (output) as members. The shared library `scripts/lib/discover-apis.ts` moves to `packages/client/lib/discover.ts` and is no longer cross-imported by sibling packages.

14. **`packages/client/COMPLIANCE.md` documents the OpenAPI contract.** Twelve numbered rules covering: required 3.0.3 dialect, required `operationId` per operation, single-file specs only, `application/json` content-type only (v1), nullable form normalization (only `nullable: true`), discriminated unions need full `mapping` + literal-typed discriminator field per variant, optional `tags` for grouping, empty `paths: {}` produces a valid empty client package, SSE endpoints marked `x-tpl-sse: true` are skipped, no webhooks (v1), no cross-file `$ref`, vendor extensions namespaced `x-tpl-*`. A `preprocessSpec` step in `packages/client/lib/preprocess.ts` validates input against this contract and rejects non-compliant specs with a clear error message naming the rule that failed.

15. **SSE endpoints flagged and skipped.** api-rust's `GET /v1/events` SSE handler is annotated so the emitted OpenAPI carries `x-tpl-sse: true` on the operation. `preprocessSpec` drops these operations from the spec before handing it to each generator. The runtime SSE client lives outside the generated SDK; consumers wire it via `EventSource`/`reqwest-eventsource`/equivalent.

16. **Vendor extensions namespaced `x-tpl-*`.** Existing in-tree extensions are renamed in the same pass: `x-zod-refinements` → `x-tpl-zod-refinements`, `x-tag` → `x-tpl-tag`, `x-event-name` (removed with Decision 5), `x-discriminators` → `x-tpl-discriminators`, `x-enum-varnames` → `x-tpl-enum-varnames`, `x-unknown` → `x-tpl-unknown`. Any consumer code (Kubb post-processing) is updated accordingly.

## User Stories

This is internal infrastructure with an OSS-readiness target — the actors are developers maintaining the template and consumers integrating it.

- **Story 1: Template maintainer adds a new api service.** As a maintainer, I want adding `packages/api/billing/` with an `openapi.json` to automatically produce `client.billing` accessors in all three language clients, so that I never edit a discovery list or a Client class by hand.
  - Given `packages/api/billing/public/openapi.json` exists, when I run `bun sdk`, then `packages/client/dist/typescript/src/billing/Client.ts`, `packages/client/dist/rust/src/billing/mod.rs`, and `packages/client/dist/go/pkg/billing/client.gen.go` are generated, plus the aggregate `Client` in each language exposes a `billing` accessor.
  - Given the new service folder is named `billing-v2`, when I run `bun sdk`, then the property is sanitized to a valid identifier in each language (`client.billing_v2` in TS, `pub mod billing_v2` in Rust, `Client.BillingV2` in Go).

- **Story 2: Backend developer cross-calls another backend.** As a developer in api-typescript, I want to call api-rust's `publishVideo` through a typed class, so that I get autocomplete, type safety, and one place to attach auth/tracing.
  - Given `Client.create({ rust: { baseUrl: 'http://localhost:3031' } })`, when I call `client.rust.publishVideo({ id })`, then the request is typed end-to-end against `packages/api/rust/public/docs/openapi.json` and the response type comes from the same spec.
  - Given a custom `fetch` is passed in `ClientConfig`, when any method is invoked, then it uses that fetch instance for tracing/middleware.

- **Story 3: Frontend developer renders backend data.** As a frontend developer, I want to call `useGetVideoFeed()` in a React component and import the matching Zod schema for form validation, so that frontend code consumes the same OpenAPI spec the backend exposes.
  - Given `configureClient({ typescript: 'https://api.example.com' })` is called at app boot, when a component renders `useGetVideoFeed(params)`, then the hook calls the typescript service through the configured base URL and returns typed data.
  - Given a form needs to validate input shaped like the controller body, when the developer imports the corresponding zod schema from the generated `dist/typescript/src/<service>/zod`, then validation matches what the backend will enforce.

- **Story 4: Template maintainer enforces consistency.** As a maintainer, I want all three OpenAPI specs to declare the same dialect (`3.0.3`) and exclude internal contracts (integration events) from their components, so that the generator scripts don't carry compensating logic and downstream consumers never trip on the contracts-vs-OpenAPI boundary.
  - Given any of the three backends emits its openapi, when I inspect `jq '.openapi'` on the result, then I see `"3.0.3"`.
  - Given any of the three backends emits its openapi, when I inspect `jq '.components.schemas | keys'`, then `IntegrationEvent` is not in the list.

- **Story 5: Template maintainer extends a generator.** As a maintainer, I want each generator entry point to be a flat pipeline of small named functions, so that adding a new emit step means inserting one line in `main()`, not editing the middle of a 200-line `processPlan`.
  - Given I want to add a post-generation lint pass, when I open `packages/client/generators/typescript.ts`, then I can see the full pipeline in `main()` and add the step between `emitServiceClient` and `emitAggregateClient`.

- **Story 6: OSS consumer integrates the generator on their own spec.** As an external developer adopting this generator, I want to read `packages/client/COMPLIANCE.md` and know exactly what shape my OpenAPI spec must take, so that I can prepare my upstream emitter once and never debug silent generator failures.
  - Given my spec violates one of the documented rules (e.g. missing `operationId` on an operation), when I run the generator, then it exits non-zero with an error message naming the failing rule and the offending operation path.
  - Given my spec is fully compliant, when I run the generator, then it produces TS/Rust/Go clients with no warnings.

## Acceptance Criteria

- [ ] **AC-1:** `jq '.openapi'` returns `"3.0.3"` for all three of `packages/api/typescript/public/docs/openapi.json`, `packages/api/rust/public/docs/openapi.json`, `packages/api/go/public/openapi.json`.

- [ ] **AC-2:** `jq '.paths | keys | length'` on `packages/api/go/public/openapi.json` returns `≥1` and includes the path served by `internal/transcoding/controllers/transcoder_callback.go`.

- [ ] **AC-3:** `jq '.components.schemas | keys | map(select(. == "IntegrationEvent")) | length'` returns `0` for all three openapi.json files. The integration event union is not present as an OpenAPI schema component.

- [ ] **AC-4:** `jq '.. | objects | select(.tags? != null) | .tags | .[]' | sort -u` on every openapi.json file does NOT contain `"internal"` or `"external"`. Tags are domain-only.

- [ ] **AC-5:** `discoverApis()` (now at `packages/client/lib/discover.ts`) returns `{ service, specPath }[]` (no `lang` field) and is consumed identically by all three generators. Adding `packages/api/billing/public/openapi.json` (then `bun sdk`) produces `packages/client/dist/typescript/src/billing/`, `packages/client/dist/rust/src/billing/`, and `packages/client/dist/go/pkg/billing/` without script edits.

- [ ] **AC-6:** `packages/client/dist/typescript/src/index.ts` exports `class Client` with a `static create(config: ClientConfig): Client` method. `Client.create({ typescript: { baseUrl: '...' }, rust: { baseUrl: '...' }, go: { baseUrl: '...' } }).rust.publishVideo({ id })` type-checks under `bun tsc`.

- [ ] **AC-7:** `packages/client/dist/typescript/src/<service>/Client.ts` exists for every discovered service, exporting `class <Service>Client` with `static create(config)`. Service property names are valid JS identifiers; PascalCase folder name becomes the class name. Reserved words and non-identifier chars are sanitized.

- [ ] **AC-8:** `packages/client/dist/rust/src/lib.rs` exports `pub struct Client` and `pub struct ClientBuilder`. `Client::builder().typescript("...").rust("...").go("...").build()?.rust().publish_video(&id).await` compiles under `cargo check --workspace`.

- [ ] **AC-9:** `packages/client/dist/go/pkg/client/client.go` exports `type Client struct { ... }` and `func New(cfg Config) (*Client, error)`. `client.New(client.Config{RustURL: "..."}).Rust.PublishVideoWithResponse(ctx, id)` compiles under `cd packages/client/dist/go && go build ./...`.

- [ ] **AC-10:** `z.discriminatedUnion('name', […])` on `IntegrationEventSchema` in `packages/contracts/generated/typescript/src/wire/events/index.ts` resolves variants by `name` literal at parse time. `IntegrationEventSchema.parse({ name: 'integration.video.uploaded', payload: {...}, ownerId: '...' })` returns the `VideoUploadedEvent` variant; `IntegrationEventSchema.parse({ name: 'unknown', ... })` throws.

- [ ] **AC-11:** `packages/client/dist/typescript/src/http/index.ts` exists, exporting `configureClient({ <service>: baseUrl })` and using the configured base URL when none is passed explicitly to `<Service>Client.create()`.

- [ ] **AC-12:** Each generator entry (`packages/client/generators/{typescript,rust,go}.ts`) has a `main()` that is a flat sequence of named function calls: `discoverApis`, `preprocessSpec`, `buildPlan`, `runGenerator`, `emitServiceClient`, `emitAggregateClient`. File writes only happen inside `emit*` functions. No function in any pipeline exceeds 30 LOC.

- [ ] **AC-13:** `packages/client/generators/rust-codegen/src/main.rs` no longer contains `rewrite_version` or `rewrite_nullable`. `packages/client/generators/go.ts` no longer contains `normalizeNullables` or `writePreprocessedSpec`. The replacement `packages/client/lib/preprocess.ts` validates against COMPLIANCE.md and rejects non-canonical input — it does not transform.

- [ ] **AC-14:** The directories `packages/client/typescript/`, `packages/client/rust/`, `packages/client/go/`, `packages/client/api_typescript/`, `packages/client/api_rust/` no longer exist. The flat layout from Decision 13 is in place.

- [ ] **AC-15:** `packages/client/COMPLIANCE.md` exists and documents the twelve rules from Decision 14. Each rule is numbered, has "MUST" / "MAY" / "MUST NOT" phrasing, and a one-line rationale. `preprocessSpec` validates each rule and emits an error message naming the failing rule when violated.

- [ ] **AC-16:** `jq '.. | objects | keys | .[] | select(startswith("x-tpl-"))' packages/api/typescript/public/docs/openapi.json` returns non-empty (project vendor extensions present). The same query for `select(. == "x-zod-refinements" or . == "x-tag" or . == "x-event-name" or . == "x-discriminators" or . == "x-enum-varnames" or . == "x-unknown")` returns empty (legacy un-namespaced extensions are gone).

- [ ] **AC-17:** Operations annotated with `x-tpl-sse: true` are excluded from every generator's output. `grep -r 'listen_events\|listenEvents' packages/client/dist/` returns no matches. Such operations are present in the source openapi.json files (visible via `jq '.paths | to_entries[] | select(.value | .. | objects | ."x-tpl-sse"? == true)'`).

- [ ] **AC-18:** Full gate sweep clean: `bun tsc`, `bun lint`, `bun run test`, `bun contracts`, `bun emit-openapi`, `bun sdk`, `cargo check --workspace`, `cargo test -p template-core-rust -p template-api-rust -p template-client-rust`, `cd packages/api/go && go build ./... && go test ./...`, `cd packages/client/dist/go && go build ./...`.

## Open Questions

- **Split or one spec?** This spec covers two distinguishable phases: (A) the OpenAPI emit-side cleanup (Decisions 1–6, 14–16) and (B) the client-side rebuild (Decisions 7–13). Each could ship as its own plan, with A enabling B. Recommend revisiting at `/plan` time — if the plan exceeds ~25 tasks, split into `2026-05-14-polyglot-openapi-contract` and `2026-05-14-polyglot-client-aggregate-class`. Single-spec is workable, just heavy.

- **Naming for `dist/`.** The convention everywhere else gitignores `dist/`. Here it's committed. Alternatives: `output/`, `sdks/`, `packages/`. Keeping `dist/` per user direction; if it bites later, rename is mechanical.

- **Rust `Client::builder()` ergonomics for missing services.** When a consumer only configures one service (`.rust(url)` but not `.typescript(url)`), should `client.typescript()` panic at first call, or should the builder require all services? Lean toward "require all" for typing simplicity, but happy to revisit if the experience is bad.

## Unforeseen Angles

- The OpenAPI compliance contract is the keystone for OSS readiness. Without it, generator silence-on-failure is the default and consumers debug-by-blame. With it, every failure is mappable to a documented rule. Worth writing the contract before the validator code — the contract is the spec for the validator.

- Decision 13's flat layout has a non-obvious win: `packages/client/lib/discover.ts` is now self-contained. Today's `scripts/lib/discover-apis.ts` is imported by three sibling subpackages through brittle relative paths (`../../../../scripts/lib/discover-apis`). Collapsing the layout eliminates the cross-package import entirely.

- Decision 15 (SSE flagging) is small in code but it's the moment we acknowledge SSE is a non-OpenAPI surface. Future webhook-receiver support would follow the same pattern — `x-tpl-webhook: true` flags an operation as "ignore me at codegen, document me elsewhere."
