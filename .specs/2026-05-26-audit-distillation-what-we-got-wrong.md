# Audit Distillation — Everything We Got Wrong, Reworked, or Mis-decided

> **Status:** retrospective / guardrail spec
> **Date:** 2026-05-26
> **Scope:** the whole bk-dash → polyglot-template port (brainstorm → DDD spec → plans → Go/TS build → refactor batches 1 & 2 → session/store context → sales-order strip).

## Method

This document was produced in **two passes**.

**Pass 1** distilled **27 Claude Code session hook-logs** under `.claude/audit/` (~360 MB, 2026-05-17 → 2026-05-26). The high-signal records (every `UserPromptSubmit`, every end-of-turn assistant message, every subagent result, plus per-file edit-churn markers) were extracted into 54 chronological digest chunks, mined in parallel by **54 Sonnet sub-agents**, and clustered into the 13 root-cause patterns in Part I. Result: **306 findings** (90 high).

**Pass 2** was triggered by a direct challenge — *"do you think that was really everything? we talked about a lot of stuff"* — which exposed that the hook-logs are a **lossy slice**: they carry only the *final* assistant message per turn. Verifying against the real transcripts (`~/.claude/projects/.../*.jsonl`, 133 sessions / 540 MB) showed pass 1 had captured **~5 % of the assistant prose, 0 % of tool-result error context, and only 27 of 133 sessions**. Pass 2 re-extracted from the **full transcripts** — *every* assistant text block, full untruncated human prompts, `[USER INTERRUPTED]` markers, and error-bearing tool results — into 111 chunks mined by **111 Sonnet sub-agents**. Result: **751 more findings** (147 high), tagged by workstream.

**Combined: 1,057 findings.** The full transcripts revealed the repo hosted **three distinct workstreams**, so pass-2 findings are split:

| Workstream | Pass-2 findings | What it is |
|---|---:|---|
| **backend-port** | 282 | the bk-dash → polyglot DDD backend — the subject of Parts I–III. Pass 2 **confirmed and sharpened** all 13 root causes with the actual mid-turn/interrupt evidence (see Part IV for net-new nuances). |
| **expo-app** | 419 | a **separate React-Native / Expo workout-fitness app** built in the same repo dir — not covered by pass 1 at all. See **Part V**. |
| **tooling-meta** | 45 | skills, CLI, tsconfig, autonomous-loop, vim, and the audit method itself. See **Part VI**. |

The raw artifacts are kept under `.claude/audit/_chunks{,2}/`, `.claude/audit/_findings{,2}/`, and `_consolidated{,2}.md` for traceability — every claim traces to a `chunk NNN`.

### Distribution of findings by area

| Area | Findings | High |
|---|---:|---:|
| architecture-ddd | 55 | 22 |
| schema-zod | 48 | 12 |
| go-backend | 38 | 14 |
| process-workflow | 34 | 5 |
| events-handlers | 21 | 9 |
| tooling-cli-scaffold | 21 | 4 |
| ids-enums | 17 | 9 |
| over-engineering-scope | 16 | 4 |
| repository-persistence | 12 | 1 |
| testing | 11 | 1 |
| naming-terminology | 11 | 2 |
| project-direction | 10 | 2 |
| sdk-contracts | 5 | 2 |
| projections-readmodel | 3 | 2 |
| frontend | 3 | 1 |

---

## Part I — The 13 root-cause patterns

These are the recurring failure modes behind the 306 individual findings, ordered by leverage (how much rework they caused × how often they recurred). Each pattern names the **one durable rule** that would have prevented the most rework.

### RC-1 · Inventing structure instead of grounding in the named reference codebase  *(highest leverage)*

The single most expensive pattern. The user repeatedly pointed at a concrete reference implementation, and the agent repeatedly designed from first principles instead — then had to throw the work away.

- Go worker structure invented (`handshake` endpoint, `integrations/shopify` subfolder, orchestrator layer, separate outbox folder) instead of mirroring `go-worker-monorepo`'s pipeline/normalizer/channel layout. *(chunk 007, 016, 025)*
- `ProductCostHandler` written as a "best-guess" stub when the real 594-line NestJS source sat at `bk-dash-backend/backend-old/...`. *(chunk 020)*
- Go domain/integration event pattern, persistence (async Go-channel + batched bulk-save), and controller shape invented instead of copied from the medscall `channel`. *(chunk 007, 025)*
- Hand-rolled `CredentialExchangeClient` / `GoSyncWorkerClient` proposed when the generated symmetric SDK already covered the direction. *(chunk 044, 018, 019)*

> *"Im not really sure i like the current proposed structure … please follow the same structure of go-worker-monorepo regarding pipelines, channels"* — *"what the hell is handshake supposed to mean? the go-worker-monorepo doesnt have it"* — *"Please inspire yourself more in the medscall channel … check the go skills"* (said 3×).

**Rule RC-1:** When the user names a reference repo/path, **read it before designing anything.** Replicate its package layout, event envelope, controller shape, and persistence pattern verbatim. Never derive a structure from first principles when a canonical example is on disk. Before proposing any cross-service client, `grep packages/client/dist/` to see if a generated client already exists.

### RC-2 · Over-modeling: aggregates, repos, tables, caches, and commands that were never needed

Whole vertical slices were built and then deleted. The agent defaulted to "model it as a first-class aggregate with a repository" when the domain wanted something far leaner.

Deleted/invalidated after being built or specced:
- `Customer` aggregate (only normalized fields on Order were needed). *(005)*
- `SubscriptionEvent` entity + `SubscriptionEventPayloadSummary` VO + full repository quartet + projection — **events are already persisted in the outbox/`domainEvent` table.** *(009, 010, 011, 012)*
- `Plan` persistence + `SubscriptionPayment` aggregate + 4 subscription-lifecycle commands — Plan is a code enum+quotas; payments are stored events. *(005)*
- `Lead` entity (→ event), `RefreshToken`/`PasswordResetToken` aggregates (→ better-auth owns them). *(005)*
- `Productivity`/Kanban bounded context, Analytics read-models, projections across contexts — speculative. *(005, 006, 030)*
- `webhook_deliveries` dedup table → model arrival as an event with a partial unique index. *(011)*
- Speculative cache-invalidation port + `invalidate()` handler before any cache existed. *(014, 015)*
- Entity telemetry methods/fields (`markHandshakeSucceeded`, `recordSyncCompleted`, `valid`, `lastSyncAt`) that duplicate what events already say — **547 lines deleted.** *(041)*
- `changedFields` delta tracking arrays built but never used. *(018, 030)*
- 7 per-chart endpoints → 1 discriminated endpoint; 4 granular `OrderOverride` commands → 1 typed command. *(005, 006)*

> *"all events are inherently saved in domainEvent repository … it should just be an event, not an entity"* — *"There's no need to apply that invalidate stuff, let's not think about caching for now"* — *"These methods … are unnecessary, because we emit events to inform that"*.

**Rule RC-2:** Model **only** what has identity + lifecycle + invariants on the write side AND a confirmed need. Prefer: event over entity for "things that happened"; code enum+quotas over a persisted `Plan`; framework-owned (better-auth) over hand-modeled auth tokens; a single discriminated endpoint/command over N variants; no projections/caches/read-models until denormalization is actually required. When in doubt, **don't build it** — ask.

### RC-3 · Building leaf internals before the high-level flow was confirmed

The agent burned 6+ iterations on entity internals, repos, and VOs for billing/webhooks before validating the webhook→event→handler pipeline with the user — then discarded it when the direction was corrected. *(010, 002→spec, 012)*

> *"Well, about the billing flow, what really should happen: … Even if that's against the spec, that's the real flow that should happen."*

**Rule RC-3:** For any ingestion/choreography feature, **confirm the high-level pipeline shape with the user before coding leaf artifacts.** Sketch `Controller → Mapper → Event → Handler → Entity` and get a yes before writing entities/repos.

### RC-4 · Controller `InputSchema` envelope — the most widespread correctness bug

**39 of 62 TS controllers** declared domain fields flat at the schema root (siblings of `ctx`) instead of under `body:`/`query:`/`params:`. Since `FastifyHttpRouter` assembles `{ body, params, query, ctx, raw }`, every flat field silently parsed to `undefined` at runtime. *(049, 050)* Related: `z.paginatedQuery({...})` used as the root schema (flat-merges); `ctx` nested inside `paginatedQuery`; POST used for list/report reads; `z.array()`/`z.boolean()`/`z.stringToDate()` used where `z.stringToArray()`/`z.stringToBoolean()`/`z.coerce.date()` were required.

> *"a lot of them doesnt specify from where data is going to be, 'query', 'body', 'params', it just flat out say it's on controller"* — *"spawn 10 sonnet agents to check"*.

**Rule RC-4 (controller binding contract):**
- Every `InputSchema` top-level key is exactly one of `body`, `query`, `params`, `ctx`. Never a flat domain field.
- `ctx` always top-level — never inside `z.paginatedQuery()` or any sub-object.
- Reads = `GET` with `query: z.paginatedQuery({...})`; never POST for list/report.
- Query arrays via `z.stringToArray(el, { min })`; query booleans via `z.stringToBoolean()`; query dates via `z.stringToDate()`. Body dates via `z.coerce.date()` (already-parsed JSON).
- This must become a `bad_practice` entry in the `controller` skill `registry.yaml` and a guard in the scaffold. *(050)*

### RC-5 · Schema layer-boundary discipline (`z.instance(Id)`, `z.enum`, wire exports, shared VOs)

Pervasive across 5+ bounded contexts. The rules below were re-derived painfully and are now in MEMORY but were violated at scale.

- **`z.instance(Id)` belongs ONLY on entity and value-object schemas.** Events, use-case Input/Output, controllers, and query DTOs keep plain `z.uuid()`/`z.string()` (wire boundary). An over-broad audit flagged ~280 candidates; the correct scope was ~30. *(054, 028, 052, 027)* And critically: `z.instance(Id)` is **not** a breaking cascade — its transform outputs the primitive string, so repo hydration and call-sites don't change. *(028)*
- **Closed sets are `z.enum(SomeEnum)` referencing a real `export enum` in `enums/`** — never inline `z.enum(['a','b'])`, never `as const` arrays, never `z.string()`/`z.string().min(1)`. *(003, 052, 052)*
- **Wire packages export the enum value only, never a pre-built schema.** Entities write `z.enum(GoalType)` themselves; no `type: GoalTypeSchema`. No context re-exports shared enums — all flow from `/wire`. *(030, 030)*
- **One shared `MonetaryAmount` VO in `shared/objects/`** — it was duplicated in 4 contexts with positive-vs-nonnegative drift, and local shadow copies kept reappearing in use cases. *(030, 042)*
- Entity validation (e.g. date-range) belongs in a schema `.refine()` so `this.validate()` runs it — **but** keep the inline named-error guard too, because `BaseEntity` maps `.refine()` failures to a generic `INVALID_ENTITY` (the named guard is the only way to surface a specific domain error). *(030, 039)*
- Rehydrate via `Entity.schema.parse(row)`, never field-by-field `as EnumType` assembly. *(018)*
- Modern Zod v4 only: `z.uuid()`, `z.email()`, `z.coerce.date()`, `z.enum()`, `z.iso.datetime()` — never the `z.string().uuid()`/`.date()`/`nativeEnum` forms. *(018)*
- Shared registries (platform descriptors, auth modes) are `z.object`+`z.literal`/`z.enum` so they exist at runtime and type controller outputs — never plain TS interfaces/`as const`. *(020, 040)*

### RC-6 · Canonical aggregate shape comes from the spec, not the wire event

Order/Product/Variant were built from the lean wire-event payload (flat), missing nested entities (`OrderLine`), VOs (`MonetaryAmount`), and proper structure. The wire event and the canonical aggregate are **different contracts**. *(013, 014, 015)* The agent also left these aggregates as schema-only rows with no defined domain shape, then got confused about where the shape lived. *(013, 038)*

> *"The Product, Order and possibly Variant are not aligned with the spec definition of the canonical entity, OrderLine is an example."*

**Rule RC-6:** Derive aggregate shape from the spec's BC "Aggregates" bullets (nested entities + VOs). Strategy: Go-side aggregate (write) + TS-side read-model (read); the wire event is the contract between them, not the source of the shape.

### RC-7 · Event-driven write-side discipline

- **No event sourcing for domain aggregates.** Plain imperative methods (`activate`/`cancel`/`markPaid`); events are logs + triggers only. Event sourcing is for projections only. The `Subscription` aggregate was twice built as an `applyEvent()` projection. *(008, 011)*
- **Transition handler does an atomic load → method → save.** Never publish a domain event speculatively before the entity is loaded/mutated/persisted. `ExternalSubscriptionUpdatedHandler` emitted `SubscriptionCancelled` before any row existed. *(048)*
- **`*Updated` events carry the full entity JSON** (`entity: <Entity>` via `.toJSON()`), never a `changedFields` delta. *(018, 030)*
- **`entityId` and `ownerId` are optional** on `BaseDomainEvent` — not every event owns an entity (raw webhook receipt). *(011, 012)*
- **Integration-event constructors take `ownerId` + `payload` only** — `name` comes from the static class field (mirror domain events). *(018)*
- **Never `z.instanceof(Request)` (or any non-serializable runtime object) in an event payload** — use a `SerializedRequest` VO with `deserialize()`; snapshot the request *before* any verification (body streams are single-read). *(048, 048)*
- **Webhook ingest = raw `WebhookReceivedEvent` → mapper-resolving handler (factory by platform) → `ExternalXxx` event → internal handler → true domain event.** No mapping in the controller; for billing, the mapper infers type/externalId from the body and the use-case output is `z.void()`. *(004, 006, 010, 012, 016)*
- **One handler class per event name** (drop the `On` prefix). Orchestrated side-effects live in a `<EventName>Handler/` folder whose sub-handlers **extend the existing `EventHandler`** (no new `SubHandler<E>` abstraction) and are injected. *(018, 021)*
- Cross-service `ExternalMediator` must wire BOTH publish and consume (the Go `RedisExternalMediator` shipped publish-only, silently dropping inbound events); background loops (outbox dispatcher) must be started via `fx.Invoke`/lifecycle hook, not just `fx.Provide`. *(044, 044)*

### RC-8 · Marking work "done" without verifying; verification via the wrong signal

- Specs marked `done` while 19 enum casts / 24 `as any` / 6 field-by-field repos / inline guards remained. *(027, 041)* README said "17 done" while 14 file headers still said `todo`. *(042, other#1)*
- "Fixed and verified" claimed from CLI `tsc` while the editor still showed `Cannot find module 'bun:test'`; then deflected to "editor state" instead of re-checking the fix. *(047, 047)*
- Test files were excluded from `tsc`, hiding **~400 real errors** (stale `userId`→`storeId` drift) until the tsconfig was corrected. *(043)*
- Full `bun run test` skipped after 39 controller fixes + SDK regen; verification was type-check-only. *(050)*

**Rule RC-8:** Don't claim done/verified without running the actual gate and reading the output. Include test files in the editor `tsconfig` (move excludes to `tsconfig.build.json`). After bulk controller/schema changes, run `bun run test` — `tsc` alone misses runtime contract breaks. When a user says "still broken," re-examine the fix before blaming tooling state. (See superpowers `verification-before-completion`.)

### RC-9 · Process & orchestration discipline

- **Confirm the merge target.** A worktree was nearly merged into `dev` (unrelated history) instead of `feat/bk-dash-polyglot` — "would have been catastrophic." *(026)*
- **`git checkout HEAD -- <path>` before assuming parallel work.** Missing `notifications/`/`ui/` dirs (tracked at HEAD, wiped from the working tree) were misattributed to the user's parallel rewrite for **7 iterations.** *(011, 012)* (Now memory: `feedback_try_git_checkout_before_deferring`.)
- **Don't defer cleanup assuming a parallel actor handles it** — a deferred dead-caller cleanup left a committed `tsc` break. *(039)*
- **Subagents over-reach.** Build subagents touched the billing context / 122 unrelated files to pass their own `tsc` gate; reverted. Verify subagent work reaches tsc-clean and stays in scope. *(051, 014→go#14)*
- **Write a phased plan before cross-cutting refactors.** "Move platform.ts" silently grew into a 20+-descriptor, multi-BC, new-connection-model refactor done incrementally. *(040, 023)*
- **Contract lockfile for parallelism.** Mutable `packages/contracts/` events serialized all BCs through one file; freeze TypeSpec contracts in a Phase 0 before parallel BC work. *(012)*
- **Vertical slice, not a 30-min timebox.** One cohesive OAuth/connect trio was split across 3 iterations (3 commits, 3 context re-reads). *(012)*
- **Don't `git stash` during a plan with regen steps** (`emit-openapi`/`bun sdk` modify tracked files → pop conflicts that silently revert applied edits). Commit or discard first. *(034)*
- **Don't `--no-verify`** unless the user authorizes it in the same turn; surface the hook failure instead. (Recurred ~5× — markdown commits, OOM eslint, parallel-refactor red tsc.) *(008, 012, 018→tooling, 039, 051)*
- **Inherited policy must be re-stated in the loop prompt** (the `--no-verify` authorization, env vars) — don't rely on tribal knowledge carrying across sessions. *(012)*
- **Run the real `/build` gates** (per-task spec-compliance review + end-of-build `scripts/review.ts --pr`) or get explicit approval to skip; an 81-task build ran with only ad-hoc no-regression gating. *(035)*
- **Stage specific files**, never `git add -A`, especially with parallel agents — TB5's work got bundled into a stranger's `feat: wip`. *(039, 022)*
- **Commit critical generated docs immediately** — a ~4,700-line spec was lost to a GitHub rewind. *(006)*

### RC-10 · DI & factory patterns

- Factories declare concrete implementations **statically inside the class** (like `BillingWebhookMapperFactory`). No `register()` method; no `injectAll`; no `Map` — use `Partial<Record<Enum, Impl>>` keyed by wire enums. *(019, 040, 019)*
- Pass concrete implementations **manually as constructor args**, not via `@injectAll(AbstractToken)`. *(019, 040)*
- Classes with primitive constructor params (`string | undefined`) can't be `@injectable()` — register via `useFactory` in the BC `registry.ts`. *(011)*
- **Don't inject `DrizzleClient` in a use-case constructor** — resolve it inside `handle()` via `this.di` (tsyringe decorator-metadata fails in Bun test isolation otherwise). *(034)*
- Inject collaborators (e.g. auth hooks) as direct constructor deps of the consumer (better-auth), not via a separate DI token. *(009)*

### RC-11 · Repository / persistence boundary

- Repository **ports and mocks** type `tx?: Transaction` (infra-agnostic); **only the Drizzle impl** casts to `DrizzleClient` via a single `private client(tx)` helper. Drizzle must not leak above infrastructure. *(048, 018, 027)* (Note: an earlier instruction said the opposite — `tx?: DrizzleClient` everywhere — and was later reversed; `feedback_repository_tx_drizzleclient` is the current truth.)
- Cross-context reads go through an `XQueryService` (Zod-typed returns), never raw Drizzle in handlers/use-cases. *(030, 014)*
- Don't port Mock-adapter tests (`.clear()`, seed helpers) onto Drizzle adapters — rely on `testBed.reset()`. *(015)*
- Don't `as never`/`as any` to silence `BaseError` generic mismatches — assign the correct `DomainErrors`/`ApplicationErrors` union. *(016)*
- Check `packages/contracts/db/schema/index.ts` for name collisions before adding a table (`billingSubscriptions` vs polyglot's `channel.subscriptions`). *(008)*

### RC-12 · Naming / ubiquitous language

- **`platform`, never `provider`** (system-wide). `adAccountExternalId`/`businessAccountExternalId` not `marketingAdAccountId`; `status` not `externalStatus`; `paymentStatus` not `financialStatus`; "Charts" not "Graphs"; `Integration` not `Connectivity`. *(005, 006)*
- **`XQueryService`, never `XLookupService`.** *(014, 015)*
- **`Description`, never `Descriptor`** (platform metadata). *(040)*
- One canonical name per concept across mode-variants (`shopDomain`, not `shopDomain`/`storeDomain`). *(041)*
- **Define platform enums before any code uses them** — `NUVEMSHOP`/`NUVEM_SHOP` and `CARTPANDA`/`CART_PANDA` split across modules and caused silent misrouting. *(025)*
- `ConnectionMode { OAUTH, CREDENTIALS, MANUAL }`: CREDENTIALS = API-backed credential exchange, MANUAL = field-mapping with no API — don't collapse them under one `MANUAL`. *(040)*
- When porting a legacy codebase, do a single naming-harmonization pass toward the target ubiquitous language; don't propagate `integrationSet`/`virtualStore` coupling names. *(004, 006)*

### RC-13 · Project-direction pivots (genuine course changes, not mistakes)

These are decisions that **changed** during the project. Anything written against the old direction is stale. Recorded so future work doesn't resurrect them:

| From | To | Evidence |
|---|---|---|
| Mongo + Postgres dual persistence | **Single Postgres** | *"we'll just use postgres for the future one"* (004) |
| New `packages/go-worker/` from scratch | **Reuse the `polyglot` branch** framework + `contracts` package | *"create a checkout from the polyglot branch which already has framework-ish stuff"* (007, 009) |
| Kafka messaging | **Redis (`RedisExternalMediator`)** | *"We'll ditch kafka to use RedisExternalMediator"* (007) |
| TS + **Rust** + Go | **Rust removed entirely** (clean code-graph tooling, builders, adapters) | *"rust was removed, we dont need it anymore for this project"* (051) |
| VOD/video + transcoding + search contexts | **Removed** (Go contexts + TS `/ui` BFF + contracts + frontend + wire events) | SPEC-17 (032, 033) |
| medscall / VOD showcase domain | **e-commerce / bk-dash** showcase | (CLAUDE.md vs 05-25 digests) |
| Random UUIDs for canonical entities | **Deterministic UUIDv5(platform, externalId)** via `Id.fromSeed`; random = `Id.value()` (UUIDv7) | (006, 003, 021) |
| Full `Operator + Company + Membership` + Apple Sign In | **Simple user-switch, no passwords** | *"it should be simpler … i just change my name to be the company name"* (001) |
| Multi-controller per webhook/chart | **Single controller + query-param + discriminated union** | (005, 016) |
| `storeId` as URL path param | **`ctx.membership.storeId` (stamped by `RequireStoreMember`)** | *"storeId still being used as params … should be used in ctx"* (041, 042) |
| `SessionSchema` in `core` | **Owned by the `auth` BC**; controllers read `ctx.user.id` (nested), not `ctx.session.userId` | (042, 030) |

---

## Part II — Notable individual high-severity findings worth re-reading

Beyond the patterns, these specific traps cost real time and are easy to repeat:

- **Handshake gating & transaction boundaries:** run exchange + handshake (and **scope verification**, not just token-liveness) *before* opening any DB transaction; a failed handshake must abort with **no DB writes**. Don't hold a DB connection across a provider HTTP round-trip. *(041, 041, 041)*
- **5 store-scoped controllers shipped without `RequireStoreMember`** — a silent membership-check security gap. Every store-scoped controller MUST include it. *(042)*
- **Middleware must parse `request.ctx` through a Zod `CtxSchema`**, never `as` casts; attach `user`/`session` matching the canonical `SessionSchema`. *(030)*
- **Go: aggregate structs with unexported fields can't JSON-serialize through the outbox** — carry the normalized input DTO in the event and reconstruct in the handler. *(038)*
- **Go: use `httputil.DecodeRequest[T]` / `RespondJSON` / `RespondError`** + `from:"param"` struct tags (Go 1.22 `r.PathValue`); never hand-roll body decode, manual path splitting, or local `writeErr` helpers (they emit the wrong error envelope). Populate `Request/Response/Status/Errors` in every `Metadata()` or OpenAPI emission goes blind. *(022 ×5)*
- **Go: entities under `internal/<ctx>/entities/`, storage interfaces stay in `storage/<entity>/`** — don't put domain types in `/storage`, and beware `sed` rewriting `order.Storage → entities.Storage`. *(025, 026)*
- **Frontend: verify screenshot inferences against the actual HTML DOM** (Playwright) — image-only analysis invented dialogs, wrong primitives, and phantom URL params; app-shell controls (date/store/currency) are inherited, not route params. *(002)*
- **`bun test` and `tsc` must run from `packages/api/typescript`** (reflect-metadata preload), and `bun sdk` must run after any controller add/delete (stale ops otherwise). *(016, 039)*
- **`BaseError` stores the code in `.name`**, not `.message` — assert `(caught as BaseError).name === 'CODE'`. *(035)*
- **Flow tests: use delta assertions**, not absolute event counts — `testBed.reset()` doesn't clear `OutboxAwareMockDomainEventRepository` in mock mode. *(048)*
- **Never hand-edit generated files** (`z.uuid()` patched into `contracts/generated`) — fix the TypeSpec source (`userId: uuid`) so it survives `bun sdk`. *(054)*

---

## Part III — Recommended guardrails (turn lessons into prevention)

Concrete, where each lesson should be codified so the next pass is autonomous:

1. **`controller` skill `registry.yaml`** — add `bad_practice`: "domain fields flat at InputSchema root" and "`ctx` nested inside `z.paginatedQuery`"; add the GET-for-reads + `z.stringToArray`/`z.stringToBoolean` patterns. Update the scaffold to emit `body:`/`query:`/`params:` wrappers. *(RC-4)*
2. **`entity` / `value-object` / `schema` skills** — encode the `z.instance(Id)`-only-on-entities/VOs boundary, `z.enum(Enum)` for closed sets, wire-exports-enum-only, shared-`MonetaryAmount`, and refine+named-guard pair. *(RC-5)*
3. **`event` / `handler` / `projector` skills** — encode: no event-sourcing for aggregates; atomic load→method→save in transition handlers; full-entity-JSON `*Updated` payloads; optional `entityId`/`ownerId`; serializable VO (not `z.instanceof(Request)`); webhook mapper+factory chain; one-handler-per-event-name + EventHandler sub-handlers. *(RC-7)*
4. **`repository` skill** — `tx?: Transaction` on ports/mocks, `DrizzleClient` cast only in the Drizzle impl; `schema.parse` hydration; no Mock-only `.clear()` on Drizzle tests. *(RC-11)*
5. **Go skills (`controller`/`entity`/`repository`/`service`)** — `httputil` pipeline, `from:"param"` tags, entities-vs-storage placement, typed snapshots (no `map[string]any`), enum-typed fields + `Valid()`, complete `Metadata()`. *(RC-1, Part II)*
6. **CLAUDE.md** — add a short "Reference repos" section listing `go-worker-monorepo`, `bk-dash-backend`, `medscall/monorepo` and the rule "read the reference before designing"; record the RC-13 pivots so stale directions (Rust, Kafka, Mongo, video) aren't resurrected.
7. **`scripts/review.ts` & tooling** — keep all paths in sync with `packages/api/typescript/src`; derive `emit-openapi.ts` routers from `src/index.ts`; clean stale `.claude/worktrees/` to avoid Nx duplicate-root breakage; keep test files in the editor tsconfig.
8. **`/build` & loop prompts** — Phase 0 contract lockfile; Step 0 workspace-health check (`tsc`+tests green at HEAD, `git checkout HEAD --` before assuming parallel work); confirm merge target; restate inherited `--no-verify` authorization; never `git add -A` under parallel agents; commit before regen (no `git stash`).
9. **Process defaults** — confirm high-level flow before leaf internals; write a phased `.plans/` plan before cross-cutting refactors; vertical slice as the atomic unit; don't ship stubs; surface scope-creep at ~7 deliverables and propose a split.

Many of these already landed in auto-memory during the project (26 entries in `MEMORY.md`); this spec is the superset and the rationale behind them. **Add the Expo/RN guardrails from Part V to the `react`/`expo` variants of the `component`/`primitive`/`form`/`route`/`sheet` skills, and the controller-mock + controllers-first sequencing to the `controller`/`sdk` skills.**

---

## Part IV — Pass-2 net-new backend nuances

Pass 2 confirmed the 13 root causes; these are the *additional* backend rules its deliberation-layer view surfaced (not in Parts I–III):

- **Each concrete Mediator owns its own lifecycle.** `connect`/`startConsuming`/`disconnect` were leaked into callers behind an `instanceof RedisExternalMediator` guard — a leaky abstraction. Put lifecycle in the implementation's constructor / uniform abstract `start()`/`stop()`. *(chunk 071)*
- **A platform registry that gates multiple flows must carry operational metadata from the start** (`authMode`, `scopes`, `inputTokens`, `outputTokens`) — a pure `(type → platforms)` type-map needs immediate rework once connect/handshake/scope-verify depend on per-platform config. *(108)*
- **`inputTokens` are mode-specific**: OAUTH vs CREDENTIALS have *structurally different* inputs (Shopify CREDENTIALS needs clientId/clientSecret/storeDomain; OAUTH needs others). Don't model one flat token set. *(091)*
- **When the user says "remove this," remove it** — don't counter-propose a renamed/slimmed alternative (`platformScopes()` instead of deleting). *(090)*
- **`.input()` on any event/DTO schema that embeds an entity using `z.instance(Id)`** — preserves wire-safe string serialization; four finance events broke without it. *(106)*
- **`z.iso.date()` not `z.coerce.date()`** when the codebase stores/transfers dates as ISO strings — `coerce` produces `Date` and cascades type breaks into entities/events. (Refines RC-5: body-vs-query date helper choice is codebase-dependent.) *(109)*
- **Don't ask the user to arbitrate a base-class decision the storage model already dictates** (JSON-embedded = Value Object; own table + lifecycle = Entity). *(043)*
- **bk-dash (the source system) is the source of truth for platform categorization** — not the template's existing registry. CartPanda/Yampi are *checkouts*, Kiwify/Hotmart *inactive infoproducts*; the agent mis-categorized them as sales channels. *(090)*
- **Audit `entity.toJSON()` event-construction sites before converting entity schemas to `z.instance(VO)`** — they need the `as unknown as Z.infer<typeof Schema>` cast or tsc breaks ripple. *(043)*
- **Verify semantic constraints before swapping a local schema for a shared one** — analytics `MonetaryAmount` was signed (gross margin can be negative) while the shared VO was `nonnegative()`; a blind swap would have broken negative-margin reporting. Name collision ≠ semantic equivalence. *(092)*

---

## Part V — The Expo workout app (separate product)

The repo dir also hosted an entirely separate **React-Native / Expo fitness app** (workouts, exercises, social feed, login animations, Apple sign-in). 419 pass-2 findings, **26 high in `frontend` alone**. These are RN/Expo-specific and were absent from the pass-1 spec. The patterns:

### V-1 · Data layer & sequencing (the single most-repeated correction)
- **Mock data lives in API controllers (`override mockController = true` + `.example([...])`), never in `lib/mockData.ts` or a frontend in-memory store.** Flagged as "a major issue," repeated across chunks 003/061.
- **Controllers-first → `bun sdk` → then frontend screens.** The agent repeatedly built rich screens before the SDK existed. *(003)*

### V-2 · Expo Router conventions
- **Private folders use `_` prefix, not `-`** (the `-` is TanStack Router's convention from the skill). With `-components/`, Expo Router registered every component as a route → 30+ "missing default export" warnings. *(008)*
- **`_` excludes individual *files*, not folders** — `_components/` still registers its files as routes; prefix the files (`_CategoryBar.tsx`). *(040)*
- **The router IS the sheet/modal state machine** — use a `(sheets)` route group with `presentation: 'modal'`; don't build a Zustand `useExpenseSheet` open/close store. *(040)*
- **iOS `fullScreenModal` has no auto back arrow** — configure an explicit `headerLeft` → `router.back()`. *(099)*
- **Controller paths are relative within a BC** — the BoundedContext prepends the context name, so `/social/profile/me` becomes `/v1/social/social/...`. *(012)*

### V-3 · `@expo/ui/swift-ui` bridge traps (a whole class of churn)
- Wrap SwiftUI components in **`<Host>`** or native crash. *(040)*
- **`systemImage` only renders when a `label` is provided.** *(054)*
- **Don't pass both `label` and `children`** to a SwiftUI Button (renders both); use `accessibilityLabel`. *(028)*
- **Raw strings into bridge props (`footer`, `title`) crash** ("Text strings must be rendered within a `<Text>`") — wrap in `<Text>`. *(013)*
- **`frame()` must come *after* `buttonStyle('glass')`** for equal-size glass buttons. *(054)*
- **`Picker pickerStyle('wheel')` must be wrapped in `Form > Section`** to receive gesture forwarding; a bare `<Host>` doesn't. *(013)*
- **Don't wrap native SwiftUI components in `Pressable`** — it intercepts the native gesture stream; use sibling absolute-backdrop + sheet View. *(013)*
- **Glass `tint` is not an iOS selection pattern** — use an outer border ring / `glassProminent`. *(028)*
- **SwiftUI press flicker** comes from the default Button style competing with `glassEffect({interactive:true})`, NOT from React re-renders — don't reach for `useMemo`. *(028)*

### V-4 · Native modules require a rebuild
- `expo-localization`, `react-native-gesture-handler` etc. fail at runtime ("Cannot find native module") if added to `package.json` without `prebuild`/autolinking + a dev-client rebuild. **Warn about the rebuild before installing**, and check the dep is in Expo's supported list. *(040, 055)*

### V-5 · Keyboard / forms / state
- **Tap-to-dismiss keyboard:** use `onStartShouldSetResponderCapture` on the container (capture phase) — but only fire dismiss on *unclaimed* touches, not on input taps (which causes blur/refocus flicker → use a `Pressable onPress` for that case). *(027, 028)*
- **SwiftUI `TextField` doesn't respond to `Keyboard.dismiss()`** (it uses `@FocusState`) — track the `TextFieldRef` and call `ref.blur()`. *(027)*
- **No `setState` during render** (e.g. inside a `form.Subscribe` render prop) — React "cannot update a component while rendering" warning. *(027)*
- **Load the `/form` skill before writing TanStack Form** — the canonical pattern (Zod-schema validators, `DeepPartial` defaults, computed `defaultValues` that auto-sync when async data arrives, `safeParse` Subscribe gate) is non-obvious. **Don't** sync server state into the form via `useEffect`, and **don't** add a parallel Zustand mirror store or a `FormHost` wrapper — lift the form to a shared owner and pass it as a prop. *(021, 027, 049)*

### V-6 · Styling / design system
- **A CSS token must exist in `global.css` before using its Tailwind class** — `bg-accent-danger/10` with a missing `--color-accent-danger` renders an invisible element. *(047)*
- **Tailwind v4 content auto-detect misses deeply-nested / `(parens)` folders** — add explicit `@source` directives or styles silently drop. *(008)*
- **Single primitive with CVA variants**, not sibling components (`ChromeButton`/`GhostButton`) — and **extend the root primitive's props interface** (`PressableProps`/`ViewProps`) for the `className`/`...rest` escape hatch, never bolt on an ad-hoc `className?: string`. *(061, 055)*
- **`flex` ≠ `flex-1`** in RN/NativeWind — bare `flex` collapses a container to content height; use `flex-1` to fill. *(009)*
- **`borderStyle:'dashed'` + `borderRadius` clips at corners** in RN — draw the dashed outline with SVG (and set explicit `width`/`height`/`viewBox` on `<Svg>`). *(004, 047)*
- **`headerSearchBarOptions` conflicts with `presentation:'pageSheet'`** — the bar won't render; use a JS `TextInput` or change presentation. *(004)*

### V-7 · Social BC wiring
- **Wire `AuthAccountMiddleware` as the baseline** for any authenticated context — an empty middlewares array with controllers reading `ctx.user` crashes at runtime. *(012)*
- **Don't gate the discovery read the redirect target itself needs** — `GetMyProfile` gated by `RequireUsernameMiddleware` starved the claim-username sheet of its data. *(013)*
- **Keep gate routing in the `customErrorHandler` chain**, not a re-introduced `useEffect` redirect. *(013)*

### V-8 · RN/Expo debugging discipline (general, recurred badly here)
- **Don't strip a TypeScript error and move on** — read it; the `variant="glass"` prop error and several invisible-element bugs were the agent ignoring tsc. *(054)*
- **Don't iterate blindly on unknown native APIs** — `AddExpenseSheet.tsx` was rewritten 4× against `@expo/ui` guesswork; read the docs / search first. *(040, 054)*
- **Don't assert the platform from a screenshot** ("that's Android / Gboard" when the user was on iOS). Ask. *(054)*
- **Don't substitute an API against stated user intent** (RN `Modal` instead of the native `BottomSheet` the user asked for; `Intl` instead of fixing the `expo-localization` rebuild). *(040)*
- **`global.css` design tokens and the `BetterAuth` `socialProviders.apple` config were silently wiped during git-restore / linter churn** — verify critical config/token files survived any restore or auto-format. *(063)*

---

## Part VI — Audit-method & autonomous-loop lessons (tooling-meta)

The full transcripts also indicted the *process* around this kind of work — including this very audit:

- **Hook-logs are not transcripts.** Pass 1's "306 findings, comprehensive" claim was built from ~5 % of the assistant side; always follow `transcript_path`, never apply arbitrary size caps to digests, and **report coverage statistics alongside any audit count** — a finding count without coverage is misleading. *(chunk 031 — this task)*
- **Validate a parser/heuristic against one real sample before running at scale** — the consolidator parsed 14 of 306 on the first run (assumed `## F`, actual `## F1`); the pass-2 error-detector caught file-read dumps as "errors." *(031)*
- **Autonomous loops must self-terminate on a persistent block.** The Ralph loop spun **40–60 identical "Halting — Case 1, dirty tree"** iterations (chunks 020/052/105/107) because unrelated dirty Expo files sat outside its allowlist. After 2–3 identical blocks, escalate/stop/notify — never spin. And **verify a clean, allowlist-matching tree before launching any loop.**
- **Worktree isolation fails silently if a sub-agent runs in the default cwd** — a rename task executed on the source `v1.8` branch instead of the worktree. Verify the sub-agent's cwd for any file-move/rename task. Don't silently abandon the isolation strategy when it breaks — surface it (it changes where commits land). *(036)*
- **tsc baseline measurement pitfalls:** temp tsconfigs in `/tmp` make `extends` resolve to nothing → silent lenient fallback ("0 errors" lie); `composite`/`incremental` + a stale `.tsbuildinfo` makes error counts jump 3→16→13 run-to-run; `--composite false` doesn't match how tsserver loads the project. **Clear `.tsbuildinfo`, keep temp configs in the package root, reproduce with the editor's exact flags**, and clean up `.measure.tsbuildinfo` artifacts. *(041)*
- **The `bun:test` / `Cannot find module` editor errors** trace to two tsconfig bugs: `typeRoots` pointing at non-existent paths (silently disabling *all* `@types` autoload) and the test-file `exclude` living on the editor `tsconfig.json` instead of `tsconfig.build.json`. Keep tests in the editor project; put the exclude on the build config. *(007, 041)*
- **Don't re-open decisions the user already resolved** ("but we want ssr, where are the questions?"; single-word "Continue" after a courtesy pause) and **don't defend a placement the user rejected** ("I'd push back on this one" re: `packages/app/styles`). Surface gates only when scope genuinely changes.
- **Personal ergonomics ≠ project config** — `EDITOR=nvim` belongs in user shell config, not project `settings.json`; and don't chase 8-turn rabbit holes (Karabiner → SpaceFN → proxy terminal) for a vim-remap — surface `/keybindings-help` and the env-capture-at-launch gotcha early. *(046)*

---

## Appendix — provenance

**Pass 1 (hook-logs → 306 findings):**
- Digest builder: `.claude/audit/_build_digest.py` → `.claude/audit/_chunks/chunk-001..054.md`
- Per-chunk findings: `.claude/audit/_findings/finding-001..054.md` (7 chunks no signal: 023, 024, 031, 036, 045, 046, 053)
- Consolidated corpus: `.claude/audit/_findings/_consolidated.md`; consolidator `.claude/audit/_consolidate.py`

**Pass 2 (full transcripts → 751 findings):**
- Digest builder: `.claude/audit/_build_digest2.py` (sources `~/.claude/projects/.../*.jsonl`, all assistant text blocks + genuine prompts + `[USER INTERRUPTED]` + error tool-results) → `.claude/audit/_chunks2/chunk-001..111.md`
- Per-chunk findings: `.claude/audit/_findings2/finding-001..111.md`
- Consolidated by workstream → category: `.claude/audit/_findings2/_consolidated2.md`; consolidator `.claude/audit/_consolidate2.py`
