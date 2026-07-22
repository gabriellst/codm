# Refactor Batch — 2026-05-23

A batch of 25 refactor specs covering Zod migration, type-system cleanup, Id/Platform unification, Connect-flow rework, event/handler organization, and Product BC + feature gaps. Grouped into 6 waves; designed for execution by a clean-context agent.

---

## Agent ground rules

Read these before opening any spec.

1. **Work in wave order.** Wave N+1 starts only after every spec in Wave N is `done`. Within a wave, pick any spec whose `Depends on:` is satisfied.
2. **One spec at a time.** For each spec:
   1. Read the spec front-to-back, including `Notes`.
   2. Read every file listed in `Affected files`.
   3. Implement the change as described in `Scope`.
   4. Run `bun tsc` and the affected test suites; both must pass before checking off.
   5. Commit (one commit per spec, use the project's commit skill).
   6. Set the spec's `Status:` to `done` and tick the matching row in this README's status table.
3. **Don't touch items marked `Out of scope`.**
4. **If a spec is wrong or blocked**, change `Status:` to `blocked`, add a `## Blocker` section to the spec, stop. Don't escalate to the next spec — surface it.
5. **One PR per wave.** PR title: `refactor(wave-N): <wave name>`. Open the PR only when every spec in the wave is `done`.
6. **No autonomous scope creep.** If you find a related cleanup that isn't in any spec, note it in the PR description as a follow-up. Do not implement.

## Glossary (must-know before starting)

| Term | Where defined |
|---|---|
| BoundedContext, EventHandler, ExternalMediator, Projector, Repository | `CLAUDE.md` + `.claude/skills/<artifact>/SKILL.md` |
| `tryCatch` / `tryCatchAsync` | `@template/core-typescript` exports (Wave 1 spec SPEC-16) |
| `Id.fromSeed(...)` | Wave 3 spec SPEC-20 — replaces `Id.fromHash` and `HashedID` |
| `PLATFORM_REGISTRY`, `PlatformDescriptor`, `AuthMode` | Wave 3 spec SPEC-19 — `core/src/schemas/platform.ts` |
| Handler folder layout (parent + sub-handlers) | Wave 5 spec SPEC-12 |
| Multi-event handler (`event: readonly EventClass[]`) | Wave 5 spec SPEC-12 |

## Cross-cutting decisions

These apply across many specs — internalize once, apply everywhere:

- **No Rust API in this repo.** Cross-language items are TS + Go + Contracts only.
- **Template repo, no production data.** ID-algorithm changes don't need data migrations.
- **All schemas are Zod.** Use `z.literal` for fixed values, `z.object` for structures, `z.enum` for wire enums. Schemas should be runtime-validated AND used as controller output types so the SDK regen carries the types to the frontend.
- **Sub-handlers `extends EventHandler` but are NOT re-exported** from `handlers/internal.ts` / `handlers/external.ts`. Barrel discipline gates mediator registration.

## Waves

### Wave 1 — Zod migration + carry-over (1 stream, serial)

All edits touch the same Zod schema files on different lines. Single agent, single PR.

- [SPEC-01](./SPEC-01-zod-uuid-email.md) — `z.string().uuid()` → `z.uuid()`, `z.string().email()` → `z.email()`
- [SPEC-03](./SPEC-03-zod-date-coerce.md) — `z.string().date()` → `z.coerce.date()`
- [SPEC-04](./SPEC-04-zod-native-enum.md) — `z.nativeEnum(X)` → `z.enum(X)`
- [SPEC-08](./SPEC-08-zod-iso-datetime.md) — `z.string().datetime()` → `z.date()` in use cases
- [SPEC-09](./SPEC-09-zod-deprecations.md) — sweep remaining Zod deprecations
- [SPEC-16](./SPEC-16-trycatch-utility.md) — `try/catch` → `tryCatch` / `tryCatchAsync`
- [SPEC-25](./SPEC-25-integration-event-name-sweep.md) — carry-over: drop `name:` from integration-event constructors in 5 test files

### Wave 2 — Type-system cleanup (1 stream, serial)

All edits touch Drizzle repository files. SPEC-13 first (biggest rewrite — eliminates much of 06/07).

- [SPEC-13](./SPEC-13-schema-parse-hydration.md) — Entity hydration via `Entity.schema.parse(...)`, not field-by-field assembly
- [SPEC-05](./SPEC-05-tx-drizzleclient.md) — Repository / Query methods: `tx?: DrizzleClient`
- [SPEC-06](./SPEC-06-remove-enum-casts.md) — Drop `as GoalType` / `as CurrencyCode` casts on already-typed props
- [SPEC-07](./SPEC-07-remove-as-any.md) — Drop `as any` and casts on already-inferred select returns

### Wave 3 — Id / Platform / Hash refactor (3 streams parallel)

- [SPEC-20](./SPEC-20-id-fromseed-unify.md) — **Stream A**. `Id.fromSeed(...)` UUIDv5 deterministic; delete `Id.fromHash` (SHA-256) + `HashedID()` + `HashedID.ts`; mirror in Go core
- [SPEC-19](./SPEC-19-platform-registry-schemas.md) — **Stream B**. Lift platform mapping out of integration BC into `core/src/schemas/platform.ts`; introduce `PLATFORM_REGISTRY` + `AuthMode` enum
- [SPEC-02](./SPEC-02-entity-id-zinstance.md) — **Stream C**. Entity schemas use `z.instance(Id)` instead of `z.string().uuid()` for id fields

### Wave 4 — Connect flow rework (2 streams)

- [SPEC-18](./SPEC-18-handshake-verifies-scopes.md) — **Stream A**, fully parallel. `HandshakeService` reads required scopes from `PLATFORM_REGISTRY` and asserts granted scopes match
- **Stream B (sequential)**:
  - [SPEC-21](./SPEC-21-exchanger-returns-displayname.md) — OAuth exchanger returns `{ tokens, displayName?, contactEmail? }`
  - [SPEC-23](./SPEC-23-integration-identifier-unify.md) — Single `integrationIdentifier` input; each exchanger interprets per platform
  - [SPEC-15](./SPEC-15-manual-credentials-exchanger.md) — Sibling abstract `ManualCredentialsExchanger` with same return shape; controller dispatches by `authMode`
  - [SPEC-22](./SPEC-22-connect-flow-fail-fast.md) — Drop defensive ternaries in `ConnectIntegration`; fail fast based on registry

### Wave 5 — Event / handler organization (2 streams)

- [SPEC-14](./SPEC-14-updated-events-full-entity.md) — **Stream A**. `*Updated` integration events carry the full entity JSON; drop `changedFields`. Touches contracts + Go publishers + TS handlers.
- **Stream B (sequential)**:
  - [SPEC-12](./SPEC-12-handler-per-event-subhandlers.md) — Drop `On` prefix; folder layout for multi-effect handlers; **EventHandler accepts `EventClass | readonly EventClass[]` for multi-event subscription**; barrel-gated registration
  - [SPEC-24](./SPEC-24-campaign-binding-publisher-split.md) — Split `CampaignProductBindingPublisher` (2 handlers in 1 file) into the new shape

### Wave 6 — Product BC + feature gaps (3 streams)

- [SPEC-10](./SPEC-10-product-tags-override-entity.md) — **Stream A**. `ProductOverride` entity in catalog BC carries `tags`; drop `tags` from canonical Product; expose via `ProductQueryService`
- [SPEC-11](./SPEC-11-product-cost-handler-port.md) — **Stream B** (likely serial-after-10). Port `ProductCostHandler` + `ProductCostSolver` from bk-dash; applies cost to `OrderOverride.productCostByLine`
- [SPEC-17](./SPEC-17-drop-gosyncworkerclient.md) — **Stream C**, fully parallel. Delete `GoSyncWorkerClient/` folder; use `@template/client-typescript/go` SDK

## Status table

| Spec | Title | Wave | Stream | Lang impact | Status |
|------|-------|------|--------|-------------|--------|
| 01 | Zod uuid / email | 1 | — | TS | done |
| 03 | Zod date → coerce | 1 | — | TS | done |
| 04 | Zod nativeEnum → enum | 1 | — | TS | done |
| 08 | Zod iso.datetime | 1 | — | TS | done |
| 09 | Zod deprecation sweep | 1 | — | TS | done |
| 16 | tryCatch utility | 1 | — | TS | done |
| 25 | Integration-event `name:` sweep | 1 | — | TS | done |
| 13 | Schema-parse hydration | 2 | — | TS | done |
| 05 | `tx?: DrizzleClient` | 2 | — | TS | done |
| 06 | Remove enum casts | 2 | — | TS | done |
| 07 | Remove `as any` | 2 | — | TS | done |
| 20 | `Id.fromSeed` unify | 3 | A | TS + Go | done |
| 19 | Platform registry | 3 | B | TS + Contracts | done |
| 02 | Entity ids `z.instance(Id)` | 3 | C | TS | done |
| 18 | Handshake verifies scopes | 4 | A | TS | done |
| 21 | Exchanger returns displayName | 4 | B | TS | done |
| 23 | `integrationIdentifier` unify | 4 | B | TS | done |
| 15 | Manual credentials exchanger | 4 | B | TS | done |
| 22 | Connect flow fail-fast | 4 | B | TS | done |
| 14 | Updated events full entity JSON | 5 | A | TS + Go + Contracts | done |
| 12 | Handler-per-event + multi-event | 5 | B | TS | done |
| 24 | Campaign-binding publisher split | 5 | B | TS | done |
| 10 | Product tags via ProductOverride | 6 | A | TS + Go + Contracts | done |
| 11 | ProductCostHandler port | 6 | B | TS | done |
| 17 | Drop GoSyncWorkerClient | 6 | C | TS | done |

## Reference

- Project conventions: `CLAUDE.md`
- Skills (per-artifact playbooks): `.claude/skills/<name>/SKILL.md`
- bk-dash source for SPEC-11: `/Users/gabrielaraujo/Desktop/Projetos/bk-company/bk-dash-backend/backend-old/src/modules/products/`
