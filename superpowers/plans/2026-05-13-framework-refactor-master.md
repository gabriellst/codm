> ⚠️ **SUPERSEDED** — see `superpowers/specs/2026-05-13-polyglot-template.md` and the rebuild plan `superpowers/plans/2026-05-13-polyglot-template-rebuild.md`. This document is preserved for history only; do not execute its tasks.

# Framework Refactor — Master Plan (P1.5 – P1.9)

> **Status:** This is the overview plan. Each sub-phase (P1.5 / P1.6 / P1.7 / P1.8 / P1.9) gets its own detailed TDD plan under `superpowers/plans/` when it's about to start. This document maps the whole pivot so the user can sanity-check direction before any code moves.

**Goal:** Extract context-agnostic architectural primitives into a `packages/framework/{ts,rs,go}` package per language, so each `packages/api/<lang>` becomes thin (bounded contexts only) and the polyglot template uses **existing standards** from the clean-2 / feat/polyglot / dev branches instead of reinventing helpers in `contracts/`.

**Why this pivot:**
- The current `contracts-ts` emitter reimplemented a stopgap `_z.ts` helper instead of using the battle-tested augmented `z` (with `z.integrationEvent`, `z.domainEvent`, `z.paginatedQuery`, `z.instance`, ...) that already lives in `packages/api/ts/src/shared/utils/schema/`.
- The current `contracts-rs` emitter uses a declarative `macro_rules!` stopgap instead of the real proc-macro DSL from `feat/clean-rust` (which supports `z.string().min(N).max(M).optional()` chains parsed in `dsl.rs`).
- Generated event classes don't match the existing `GameCreatedIntegrationEvent extends BaseIntegrationEvent` pattern — codegen drops the class wrapper.
- All three backends (TS, Rust, Go) share the SAME architecture (mediators, outbox, UoW, base entity/value-object/event types, error system) but currently those primitives only exist in scattered branches. A unified `framework/` package gives every backend the same vocabulary.

**Outcome after these 5 phases:**

```
packages/
├── framework/
│   ├── ts/        # augmented z, BaseEntity/Event/VO, mediators, UoW, outbox, OpenAPI emitter, errors
│   ├── rs/        # core types (Entity, Schema, Id, DomainEvent, IntegrationEvent, Handler), macros crate (entity!, value_object!, *_event!, traced_impl, ...)
│   └── go/        # types, mediators, outbox, httprouter, pkg/openapi, pkg/validation, base entity
├── contracts/
│   ├── wire/      # TypeSpec (3 enums + 9 events) — already done
│   ├── db/        # Drizzle (21 tables across 8 pgSchemas) — already done
│   ├── codegen/   # emitters that USE framework primitives (refactored in P1.8)
│   └── generated/{ts,rs,go}/  # codegen output — uses framework types
└── api/
    ├── ts/        # thin: only bounded contexts (auth, video reads, notifications) — P2
    ├── rs/        # thin: only bounded contexts (video/channel/engagement writes) — P3
    └── go/        # thin: only bounded contexts (transcoding, search, analytics) — P4
```

**Tech stack:** unchanged from current. `framework/ts` matches existing api/ts deps (zod ^4, drizzle-orm, tsyringe-neo, fastify, opentelemetry). `framework/rs` matches `feat/polyglot` (axum, sqlx, utoipa, tokio, serde, strum, chrono, opentelemetry). `framework/go` matches dev:channel (uber/fx, pgx/v5, validator/v10, golang-migrate, redis, orchestrion).

---

## Source mapping (what gets lifted from where)

### `framework/ts` ← `clean-2:packages/api/ts/src/shared/`

| What | From | Notes |
|---|---|---|
| `schema/` (augmented `z`: integrationEvent, domainEvent, baseEvent, paginatedQuery, paginatedResponse, instance, session) | `shared/utils/schema/` | The PRIMARY win — codegen will use this instead of `_z.ts` |
| `events/types/` (BaseEvent, BaseDomainEvent, BaseIntegrationEvent) | `shared/types/Base*Event.ts` | The class wrappers codegen needs to extend |
| `entities/` (BaseEntity, AggregateRoot) | `shared/entities/` + `shared/types/` | Domain entity scaffold |
| `objects/` (BaseValueObject, BasePrimitiveValueObject, ValueObject equality) | `shared/objects/` | Plus generic VOs: Email, PersonName, Money, Address, Range, Id. **Brazilian VOs (CPF, CNPJ, RG, BirthDate, Phone, ZipCode) stay in api/ts** — context-specific. |
| `errors/` (BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors) | `shared/errors/` + `shared/types/BaseError.ts` | **Split required:** context-specific error codes (medscall game errors) stay in api/ts; base codes (VALIDATION_ERROR, UNAUTHORIZED, NOT_FOUND, etc.) lift |
| `mediators/` (InternalMediator + ExternalMediator interfaces + EventEmitter2 + Redis adapters + Spy/Mock for tests) | `shared/services/Mediator/` | Abstract interfaces are framework; adapters can stay in framework as optional infrastructure |
| `unitofwork/` (UnitOfWork interface, factory, mock + drizzle adapters) | `shared/services/UnitOfWork/` + `shared/types/UnitOfWork.ts` | |
| `outbox/` (OutboxDispatcher abstract + Drizzle adapter) | `shared/services/OutboxDispatcher/` | |
| `repositories/` (DomainEventRepository interface + Drizzle adapter + mocks) | `shared/repositories/DomainEventRepository/` | |
| `http/` (Router, MainRouter, Controller, Middleware, Handler types, HttpRouter w/ Fastify adapter) | `shared/types/{Router,Controller,Middleware,Handler}.ts` + `shared/services/HttpRouter/` | |
| `openapi/` (OpenAPI 3 emitter walking Controllers + Handlers + Errors) | `shared/utils/OpenAPI.ts` | |
| `tracing/` (autoTrace decorator, OTel propagation) | `shared/utils/Tracing.ts` | |
| `errors/mapper/` (GlobalErrorMapper) | `shared/utils/GlobalErrorMapper.ts` | |
| `utils/` (TryCatch, decorators/WithRetry, Config, paths, sse, ForwardRequest, Http) | `shared/utils/*` | |
| `db/` (drizzle client, config, drivers, jsonb custom type, saveWithOptimisticLock helper) | `shared/db/drizzle/{client,config,drivers,types,utils,saveWithOptimisticLock}` | The `schema/shared.ts` (events + outbox tables) **goes to contracts**, not framework — already done in P1 Task 15. |

**Stays in api/ts** (context-specific):
- `auth/`, `clinic/`, `doctor/`, `patient/`, `service/`, `game/`, `ui/` bounded contexts — entities, value objects, use cases, controllers, repositories, handlers, projectors, registry per context.
- Brazilian VOs (CPF, CNPJ, RG, BirthDate, Phone, ZipCode).
- Medscall-specific enums (BrazilianState, Country, Currency, Language, NotificationLevel).
- Drizzle schemas per context (auth.ts, game.ts, ui.ts) → these will be replaced by contracts/db/schema/* anyway.

**Moves to contracts** (already done in P1):
- `shared/db/drizzle/schema/shared.ts` (events + outbox tables) → `contracts/db/schema/infrastructure.ts`.

---

### `framework/rs` ← `feat/polyglot:packages/api-rs/` (fallback: `feat/clean-rust:packages/api/`)

| What | From | Notes |
|---|---|---|
| `core/types/` (Entity, Schema, BaseError, Id, DomainEvent, IntegrationEvent, Handler, Job, UnitOfWorkFactory, Tx, BoundedContext) | `packages/api-rs/src/shared/types/` | All of it |
| `core/errors/` (BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors, ApiError barrel pattern) | `packages/api-rs/src/shared/errors/` | Context errors stay in api/rs |
| `core/repositories/` (DomainEventRepository trait + PgDomainEventRepository) | `packages/api-rs/src/shared/repositories/` | Interface lifts; concrete impl can lift as optional |
| `core/db/` (pagination, pg_enum helper, pool wiring) | `packages/api-rs/src/shared/db/` | |
| `core/services/` (SSE Fanout, OutboxDispatcher, InternalMediator, ExternalMediator + Redis adapter) | `packages/api-rs/src/shared/services/` | |
| `core/jobs/` (JobRunner trait, scheduler) | `packages/api-rs/src/shared/jobs/` | |
| `core/middleware/` (trace_context, idempotency, signature_verification) | `packages/api-rs/src/shared/middleware/` | |
| `core/utils/` (config, telemetry, global_error_mapper) | `packages/api-rs/src/shared/utils/` | |
| **`macros/`** (entity!, value_object!, domain_event!, integration_event!, event_handler!, job!, discriminated_union!, dto!, error_codes!, traced_impl) | `packages/api-rs/macros/` | **Critical** — codegen calls `integration_event!` with z.* DSL. Macros expand into framework types via `::template_framework_rs::*` paths. |
| `macros/src/dsl.rs` (z.\* DSL parser) | same | Heads + modifiers as documented |
| `macros/src/field_plan.rs` (per-field codegen — input/output types, parse/validate) | same | |

**Stays in api/rs** (context-specific):
- `packages/api/rs/src/<context>/` — entity, value-object, controllers, events, handlers, projections, repositories per bounded context (video, channel, engagement, transcoding, search).
- `packages/api/rs/src/shared/container.rs` — the per-app DI container (each app has its own).

**Cargo workspace** changes:
- Move `packages/api-rs/macros` to `packages/framework/rs/macros` (or keep at top-level `packages/framework-macros-rs`).
- New workspace members: `packages/framework/rs`, `packages/framework/rs/macros`.
- `packages/api/rs` becomes `package.dependencies = { template-framework-rs = "..." }`.

---

### `framework/go` ← `dev:packages/channel/`

| What | From | Notes |
|---|---|---|
| `core/config/` | `internal/shared/config/` | Config struct, env loading, validation |
| `core/db/` | `internal/shared/db/sql/` + `internal/shared/db/dbutil/` | PG client, embedded migrations, conversion helpers |
| `core/entities/base_entity.go` | `internal/shared/entities/` | BaseEntity with UUID + domain event collector |
| `core/enums/` (Environment, Country, Currency, Platform, LogLevel, Language) | `internal/shared/enums/` | Generic enums lift; medscall-specific (e.g., GroupRole) stays in api/go |
| `core/errors/` (AppError, ErrorCode, HTTP mapper) | `internal/shared/errors/` | Context error codes stay in api/go |
| `core/middleware/` (APIKey, CORS, Logging, Recovery, Session) | `internal/shared/middleware/` | |
| `core/objects/` (ID, Address) | `internal/shared/objects/` | CNPJ stays in api/go if not needed by polyglot showcase |
| `core/repositories/` (DomainEventRepository interface + PG impl) | `internal/shared/repositories/` | |
| `core/services/httprouter/` | `internal/shared/services/httprouter/` | fx-integrated HTTP router |
| `core/services/mediator/` (InternalMediator channel-based + ExternalMediator Redis) | `internal/shared/services/mediator/` | |
| `core/services/outbox/` (dispatcher: poll, retry, per-owner concurrency) | `internal/shared/services/outbox/` | |
| `core/services/unitofwork/` | `internal/shared/services/unitofwork/` | |
| `core/types/` (DomainEvent[T], IntegrationEvent[T] generics, Controller, Handler[I,O], Middleware) | `internal/shared/types/` | |
| `core/module.go` (shared fx.Module) | `internal/shared/module.go` | |
| `pkg/httputil/` (ErrorResponse, RespondJSON, RespondError) | `pkg/httputil/` | |
| `pkg/openapi/` (reflection-based OpenAPI 3.1 emitter) | `pkg/openapi/` | **Important:** no swag — emits from controller metadata + reflection |
| `pkg/validation/` (validator/v10 wrapper) | `pkg/validation/` | |

**Stays in api/go** (context-specific):
- `internal/<context>/` — entities, controllers, use cases, handlers, projectors, repositories, services/gateway impls per context.
- Channel-specific enums (ChannelStatus, MessageType, Direction, GroupRole, RemoteType, PresenceType).
- Channel domain events + integration events.
- WhatsApp gateway impl (whatsmeow) — domain-specific.

**Go module structure:** single `go.mod` at `packages/framework/go/go.mod` with module path `template/framework-go`. `packages/api/go/go.mod` declares `require template/framework-go` + a `replace` directive pointing at `../../framework/go`.

---

## The 5 sub-phases

Each sub-phase has its own detailed TDD plan written when it's about to start. Below is the high-level task list per phase.

### P1.5 — Extract framework/ts

**Order of work (≈18 tasks expected in the detailed plan):**

1. Scaffold `packages/framework/ts/` with package.json (`@template/framework-ts`) and subdir layout.
2. Lift `shared/utils/schema/` → `framework/ts/src/schema/` (the augmented `z`).
3. Lift `shared/types/Base*Event.ts` → `framework/ts/src/events/`.
4. Lift `shared/entities/BaseEntity.ts` + `shared/types/AggregateRoot.ts` → `framework/ts/src/entities/`.
5. Lift `shared/objects/{BaseValueObject, BasePrimitiveValueObject, ValueObject, Id, Email, PersonName, Money, Address, Range}.ts` → `framework/ts/src/objects/`. (Brazilian VOs left in api/ts.)
6. Split `shared/errors/index.ts` → framework base codes + api/ts context codes.
7. Lift mediators (interfaces + adapters) → `framework/ts/src/mediators/`.
8. Lift UnitOfWork (interface + factory + mock) → `framework/ts/src/unitofwork/`.
9. Lift OutboxDispatcher (interface + Drizzle adapter) → `framework/ts/src/outbox/`.
10. Lift DomainEventRepository (interface + Drizzle adapter) → `framework/ts/src/repositories/`.
11. Lift Controller, Handler, Middleware, Router types → `framework/ts/src/http/`.
12. Lift Fastify HttpRouter adapter → `framework/ts/src/http/adapters/`.
13. Lift OpenAPI emitter → `framework/ts/src/openapi/`.
14. Lift Tracing, GlobalErrorMapper, TryCatch, Config → `framework/ts/src/utils/`.
15. Lift Drizzle client/config/drivers/types (NOT schemas) → `framework/ts/src/db/`.
16. Set up root barrel + per-area barrels in `framework/ts/src/index.ts`.
17. Rewire `packages/api/ts` imports from `@shared/*` → `@template/framework-ts`. **This is the biggest single chunk** — likely 100+ files re-imported. May warrant codemod via ts-morph.
18. Verify framework's own type-check passes (`bun x tsc --noEmit` inside framework/ts/).

**Critical decisions in P1.5:**
- Use `tsyringe-neo` (matches current api/ts) for DI in framework.
- Keep `peerDependency: zod ^4.0.0` so contracts-ts and api/ts agree on the same zod version.
- `framework/ts/package.json` "main" points to `./src/index.ts` (no build step — Bun resolves TS workspaces natively).

---

### P1.6 — Port framework/rs

**Order of work (≈12 tasks):**

1. Scaffold `packages/framework/rs/{Cargo.toml, src/lib.rs, macros/Cargo.toml, macros/src/lib.rs}` (the macros sub-crate).
2. Copy `shared/types/*` from feat/polyglot (or feat/clean-rust) → `framework/rs/src/types/`.
3. Copy `shared/errors/*` → `framework/rs/src/errors/`.
4. Copy `shared/repositories/domain_event_repository*` → `framework/rs/src/repositories/`.
5. Copy `shared/db/{pagination, pg_enum, pool}` → `framework/rs/src/db/`.
6. Copy `shared/services/{outbox, mediator, sse}` → `framework/rs/src/services/`.
7. Copy `shared/jobs/{runner, scheduler}` → `framework/rs/src/jobs/`.
8. Copy `shared/middleware/*` → `framework/rs/src/middleware/`.
9. Copy `shared/utils/{config, telemetry, global_error_mapper}` → `framework/rs/src/utils/`.
10. Copy macros crate from `feat/polyglot:packages/api-rs/macros/` → `packages/framework/rs/macros/` (all 9 macros + dsl.rs + field_plan.rs).
11. Update macro expansion paths from `::monorepo_api::shared::types::*` → `::template_framework_rs::types::*` (or use a re-export shim crate so paths stay stable).
12. Update root `Cargo.toml` workspace members + workspace.dependencies. Verify `cargo check -p template-framework-rs` passes (will fail at first; iterate fixes).

**Critical decisions in P1.6:**
- macros crate stays its own proc-macro crate (can't be in the same crate as the framework lib — proc-macros must be their own crate).
- `extern crate self as template_framework_rs;` in `framework/rs/src/lib.rs` so the macros' expansions resolve cleanly.

---

### P1.7 — Port framework/go

**Order of work (≈10 tasks):**

1. Scaffold `packages/framework/go/{go.mod, internal/, pkg/}` with module path `template/framework-go`.
2. Copy `internal/shared/config/` from dev:channel → `framework/go/config/`.
3. Copy `internal/shared/{db, entities, enums (generic only), errors, middleware, objects (generic), repositories, types}` → `framework/go/{db,entities,enums,errors,middleware,objects,repositories,types}/`.
4. Copy `internal/shared/services/{httprouter, mediator, outbox, unitofwork}` → `framework/go/services/`.
5. Copy `internal/shared/module.go` → `framework/go/module.go`.
6. Copy `pkg/{httputil, openapi, validation}` → `framework/go/pkg/`. (Keep `pkg/` semantics — these are Go's convention for public exports.)
7. Adjust import paths from `monorepo/api/...` → `template/framework-go/...` throughout.
8. Add `go.sum` and verify `go build ./...` in `framework/go/` passes.
9. Add `template/framework-go` as a dependency in `packages/api/go/go.mod` (with a `replace` directive pointing to `../../framework/go` for local development).
10. Update `Cargo.toml` and Bun workspaces if any Go-side wiring needs (nope — go.mod is independent of Bun/Cargo).

**Critical decisions in P1.7:**
- Single module (not split internal+pkg). All framework-exported types live alongside.
- fx.Module is provided by `framework/go.SharedModule` — bounded contexts compose it.

---

### P1.8 — Refactor contracts codegen to use framework

**Order of work (≈10 tasks):**

1. Delete `packages/contracts/generated/ts/src/wire/_z.ts` (the stopgap).
2. Update `emit-wire-ts.ts`: import z from `@template/framework-ts/schema`; emit `z.integrationEvent({ ... })` (payload only, no name arg — the framework's helper signature matches the existing `GameCreatedIntegrationEventSchema = z.integrationEvent({ gameId, ... })` pattern).
3. Extend `emit-wire-ts.ts`: emit class wrappers for each event extending `BaseIntegrationEvent<typeof Schema>`, with static `name` + static `schema` (matches the existing pattern verbatim).
4. Update `emit-wire-ts.test.ts`: assertions expect `z.integrationEvent({` (no name arg), class wrapper, static `name`, static `schema`.
5. Delete `packages/contracts/generated/rs/src/integration_event.rs` (the stopgap macro_rules!).
6. Update `emit-wire-rs.ts`: emit `integration_event!("wire.name" => Name { field: z.X() })` invocations using the **real z.\* DSL** from `framework/rs::macros`. Type map: integer int64 → `z.int()`, integer int32 → `z.int()` (or `z.int32()` if DSL distinguishes), string → `z.string()`, boolean → `z.boolean()`, date-time → `z.date()`, url → `z.string()` (or `z.url()` if DSL adds it), enum-ref → `z.r#enum(EnumName)`.
7. Add `use template_framework_rs::macros::integration_event;` (or similar) at top of generated `events.rs`.
8. Update `emit-wire-rs.test.ts`: assertions expect z.\* DSL inside macro invocations.
9. Update `lib.rs` emission: depend on framework instead of declaring its own `integration_event` module.
10. Regenerate all bindings + verify both languages compile against framework: `bun x tsc --noEmit` on contracts-ts, `cargo check -p template-contracts-rs`.

**Critical decisions in P1.8:**
- The existing TS `integrationEvent` helper takes payload only (no name arg). The class supplies the name. So contracts-ts MUST generate the class too — otherwise it can't supply the name.
- Rust z.* DSL doesn't have a built-in `url` type. Map `url` field-type to `z.string()` for now (with a TODO to add `.refine(url::Url::parse)` later as a framework-level VO).
- For Rust enum references: codegen emits `crate::wire::enums::VideoStatus`; the macros need to accept type paths in z.r#enum() — verify against feat/polyglot macros.

---

### P1.9 — Finish contracts (Go emitter + pipeline + e2e)

**Order of work (≈6 tasks — Go has no macros, simpler):**

1. Implement `emit-wire-go.ts` with TDD (3 tests: enums, events, envelope unmarshal).
2. Generated Go: `type VideoStatus string` consts + ParseVideoStatus func; structs with json tags + `func (e Event) EventName() string` methods; `IntegrationEvent` interface + `UnmarshalIntegrationEvent` switch.
3. Update root `package.json` `bun contracts` script chaining tsp:compile → emit-wire-ts → emit-wire-rs → emit-wire-go → drizzle:generate → drizzle:post.
4. Author `codegen/post-drizzle.ts` (preserves the 0001 GIN index migration on regenerate).
5. End-to-end verification: clean state, `bun contracts`, verify all outputs land, `bun x tsc --noEmit` on contracts-ts, `cargo check -p template-contracts-rs`, `go build` on contracts-go.
6. Commit + close P1.9 + mark parent P1 task as completed.

---

## Sequencing & dependencies

```
                P1.5 framework/ts
                       │
                       ▼
              ┌────────┼────────┐
              │        │        │
              ▼        ▼        ▼
         P1.6/rs   P1.7/go   (independent — but RS needed before P1.8's RS refactor)
              │        │
              └────┬───┘
                   ▼
              P1.8 contracts refactor (TS uses framework/ts; RS uses framework/rs/macros)
                   │
                   ▼
              P1.9 contracts finish (Go emitter + pipeline + e2e)
                   │
                   ▼
              Resume P2 (api/ts thin) onwards
```

**Critical path:** P1.5 → P1.6 → P1.8 → P1.9. P1.7 can run in parallel with P1.6 or be deferred until P4 (api/go) actually needs it. For simplicity I keep it sequential after P1.6.

**Estimated total scope:**
- P1.5: largest (≈18 tasks, broad TS code movement + import rewiring)
- P1.6: medium (≈12 tasks, mostly file copies + path adjustments)
- P1.7: medium (≈10 tasks, file copies + module setup)
- P1.8: small-medium (≈10 tasks, but each touches both emitters)
- P1.9: small (≈6 tasks, Go is the simplest)

---

## Open questions to settle before P1.5 starts

1. **Move existing api/ts to thin-bounded-contexts now or wait?** P1.5 lifts framework primitives but leaves the medscall bounded contexts in api/ts. The medscall code gets stripped when we get to P2 (api-ts video streaming bounded contexts). Or do you want to strip medscall bounded contexts AS PART OF P1.5 (cleaner state but more disruptive)?

2. **Brazilian VOs (CPF, CNPJ, RG, etc.) — keep or delete?** They're medscall-specific. Two options:
   - **a) Delete them in P1.5** when we drop medscall context — they're not needed for the video streaming template.
   - **b) Keep as commented examples** in api/ts for users who want regional VO patterns.
   
   My recommendation: **delete** (clean template). Users can add back via the skill `value-object/ts/SKILL.md`.

3. **`framework/{ts,rs,go}` exact naming.** Package names:
   - TS: `@template/framework-ts`
   - Rust crate: `template-framework-rs`
   - Go module: `template/framework-go`
   
   Confirm or push back.

4. **Do we strip ALL medscall bounded contexts now, or just lift framework?** The medscall `auth/`, `game/`, `ui/` contexts will become useless once we move to video streaming domain (P2-P4). Stripping them in P1.5 keeps the tree clean during framework extraction.

5. **TDD scope for these phases.** Each lifted file has tests in api/ts already. Bring tests along? Or treat lift as mechanical and trust the existing tests? My recommendation: **bring the tests** — they're the safety net during the import rewiring (especially the `shared/utils/schema/` tests that verify `z.integrationEvent` behavior).

---

## Detailed plans written when each phase starts

After this master plan is approved, I'll write the full TDD plans:
- `superpowers/plans/2026-05-14-p1.5-framework-ts.md` (when P1.5 starts)
- `superpowers/plans/2026-05-XX-p1.6-framework-rs.md`
- ... etc.

These will follow the same writing-plans rigor as `2026-05-13-p1-contracts.md` (bite-sized TDD steps, exact code, commits per task).

---

## Self-Review

**Spec coverage:** maps every framework concern in TS + RS + GO with source paths from the three exploration agents. Sub-phases are independently completable; dependencies are documented.

**Placeholder scan:** none. Open questions are explicitly called out for user confirmation.

**Type consistency:** package names (`@template/framework-ts`, `template-framework-rs`, `template/framework-go`) referenced consistently. Class/trait names (BaseIntegrationEvent, IntegrationEvent trait) match the source patterns.

---

## Execution Handoff

This is the **master plan only**. To proceed:

1. User confirms direction (and answers the 5 open questions above).
2. I write the full TDD plan for P1.5.
3. Execute P1.5 via subagent-driven-development (no reviewers per memory `feedback_skip_reviewer_subagents`).
4. Move to P1.6, write its plan, execute. Repeat for P1.7 → P1.8 → P1.9.
5. After P1.9, resume P2 (api/ts video streaming bounded contexts using framework).
