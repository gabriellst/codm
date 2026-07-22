# Refactor Batch 2 — 2026-05-25

A batch of 17 refactor specs: a Wave-0 removal of the entire **video domain**
(the Rust service, the Go analytics/search/transcoding workers, the TS `/ui`
context, the `video`/`channel`/`engagement` schemas + wire events — a streaming
showcase carried over from another project), then a
shared `MonetaryAmount` value object, wire-enum export hygiene, a canonical
`SessionSchema` (with a session-persisted active store), entity-event
simplification, projection removal in favour of direct-join query services, a
billing-webhook flow rewrite mirroring the Go spec, and a handful of
validation/pagination cleanups. Grouped into 7 waves (0–6); designed for
execution by a clean-context agent.

> Sibling to `.specs/2026-05-23-refactor-batch/` (batch 1, complete). Same
> conventions, same execution model.

---

## Agent ground rules

Read these before opening any spec.

1. **Work in wave order.** Wave N+1 starts only after every spec in Wave N is
   `done`. Within a wave, pick any spec whose `Depends on:` is satisfied.
2. **One spec at a time.** For each spec:
   1. Read the spec front-to-back, including `Notes`.
   2. Read every file listed in `Affected files`.
   3. Implement the change as described in `Scope`.
   4. Run `bun tsc` and the affected test suites; both must pass before checking off.
   5. Commit (one commit per spec, use the project's commit skill).
   6. Set the spec's `Status:` to `done` and tick the matching row in this README's status table.
3. **Don't touch items marked `Out of scope`.**
4. **If a spec is wrong or blocked**, change `Status:` to `blocked`, add a `## Blocker`
   section to the spec, stop. Don't escalate to the next spec — surface it.
5. **One PR per wave.** PR title: `refactor(wave-N): <wave name>`. Open the PR only
   when every spec in the wave is `done`.
6. **No autonomous scope creep.** If you find a related cleanup that isn't in any spec,
   note it in the PR description as a follow-up. Do not implement.

## Glossary (must-know before starting)

| Term | Where defined |
|---|---|
| BoundedContext, EventHandler, Projector, Repository, QueryService | `CLAUDE.md` + `.claude/skills/<artifact>/SKILL.md` |
| `BaseValueObject` / `BasePrimitiveValueObject` / `.toJSON()` | `@template/core-typescript` (`core/src/objects/`) |
| `MonetaryAmount` | Wave 1 spec SPEC-01 — `src/shared/objects/MonetaryAmount.ts` |
| Wire enums (enum-only, no `…Schema`) | Wave 1 spec SPEC-02 — `packages/contracts/generated/typescript/src/wire/enums/` |
| `SessionSchema` (`{ user, session }`) + `session.storeId` | Wave 2 specs SPEC-04 / SPEC-07 |
| `XQueryService` (read-side, direct Drizzle joins) | `.claude/skills/query/typescript/SKILL.md` + Wave 4 |
| Webhook ingest pattern (received → mapper handler → external event → internal handler → domain event) | Wave 5 spec SPEC-13 + `.specs/2026-05-24-go-sync-restructure-design.md` |

## Cross-cutting decisions

These apply across many specs — internalize once, apply everywhere:

- **The video domain is removed in Wave 0 (SPEC-17).** After it, the backend is TS + Go only
  and there is no `/ui` context, no `video`/`channel`/`engagement` schemas, no Rust. Specs that
  previously touched those (SPEC-02's Rust emitter, SPEC-10's `VideoFeedProjection`/`GetVideoFeed`)
  only deal with what remains. Don't add Rust- or video-aware code.
- **Template repo, no production data.** Schema/migration changes need no data backfill;
  migrations may be additive or destructive without a data-migration step.
- **`src/shared/objects/`** is the home for value objects shared across bounded contexts
  (today it's empty). Per-context VOs still live in `<ctx>/objects/`.
- **`MonetaryAmount` validates `amountCents >= 0`** at the VO. Entities that need a stricter
  bound (e.g. `Goal.targetAmount` > 0, `OperationalCost` > 0) add `.positive()` in their own
  schema where the VO is embedded — the VO stays permissive so refunds / zero values remain valid.
- **Wire enums export the enum only** — no co-exported `…Schema`. Every consumer writes
  `z.enum(TheEnum)` itself. This includes the contracts codegen template (it must stop emitting
  `…Schema` and stop referencing `${ref}Schema` in event payloads).
- **One canonical `SessionSchema`** shaped `{ user: { id, … }, session: { …, storeId } }`, used by
  GetSession, AuthAccountMiddleware, RequireStoreMember, and read by controllers as
  `session: z.object({ user: z.object({ id: z.string() }) })`. No bare `userId`. Middlewares
  **parse** `request.ctx` with this schema; no `as` casts.
- **`storeId` is a session property**, persisted on the better-auth `sessions` record (like
  `actorId`/`ownerId` in the medscall reference), surfaced on the session and set via an explicit
  "switch active store" endpoint.
- **Domain events embed the typed entity** under the entity's name (`z.domainEvent({ goal: GoalSchema })`)
  and are populated by serialising the entity with `.toJSON()` at publish time. The SPEC-14
  `entity: z.record(...)` snapshot pattern and all per-field entity payloads are replaced.
  Integration (cross-service) events stay lean wire shapes; delete events stay id-only;
  changed-fields no-op detection is dropped (the `*Updated` event always publishes).
- **No projections on the TS side.** Reads join base tables directly via `XQueryService`. The
  Go-owned `carts` table stays (Go writes it); only the TS projection/projection-repo abstractions go.

## Waves

### Wave 0 — Subsystem removal (runs first)

Big subtraction before the cleanups, so the rest of the batch operates on a smaller surface (and SPEC-02 / SPEC-10 simplify). Stream A (Rust) is independent of B–G (Go + TS + contracts + frontend).

- [SPEC-17](./SPEC-17-remove-video-domain.md) — Remove the entire **video domain**: the Rust service, the Go `analytics`/`search`/`transcoding` workers, the whole TS `/ui` context, the `video`/`channel`/`engagement` DB schemas + the video-only `analytics`/`search` tables, the 9 video/engagement wire events, the `notifications` video handler, and the unused frontend `channelBaseUrl`. Cleanly isolated — no e-commerce coupling. *(new task)*

### Wave 1 — Shared primitives + wire enums (2 streams)

- [SPEC-01](./SPEC-01-monetary-amount-vo.md) — **Stream A**. Shared `MonetaryAmount` VO in `src/shared/objects/`; replace the 6 duplicated money shapes (Goal, OperationalCost, ProductCost, AdSpend, OrderOverrideFields, sales read-model). *(notes #1 + #17)*
- **Stream B (sequential)** — both touch wire-enum imports:
  - [SPEC-02](./SPEC-02-wire-enums-enum-only.md) — Wire enums export the enum only; codegen stops emitting `…Schema`; ~300 consumers switch to `z.enum(X)`; event-codegen template updated; Go/Rust emitters verified. *(note #11)*
  - [SPEC-03](./SPEC-03-no-context-enum-reexport.md) — Delete the `<ctx>/enums/index.ts` re-export blocks in sales/marketing/billing; import wire enums directly. *(note #10)*

### Wave 2 — Session (1 stream, sequential)

- [SPEC-04](./SPEC-04-session-schema-getsession.md) — Canonical `SessionSchema`; `GetSession` returns it (much simpler). *(note #4)*
- [SPEC-05](./SPEC-05-authaccount-returns-session.md) — `AuthAccountMiddleware` attaches the `SessionSchema` shape; controllers read `session.user.id`. *(note #9)*
- [SPEC-06](./SPEC-06-require-store-member-parse.md) — `RequireStoreMember` (+ `RequireStoreRole`) parse `SessionSchema`/ctx with Zod; drop the `as` casts. *(note #13)*
- [SPEC-07](./SPEC-07-storeid-on-session.md) — Persist `activeStoreId` on the better-auth session; surface `session.storeId`; add a "switch active store" endpoint. *(note #14)*

### Wave 3 — Entity events (1 stream, sequential)

- [SPEC-08](./SPEC-08-events-embed-entity-tojson.md) — Domain entity events embed the typed entity schema; publish via `.toJSON()`; drop per-field + `entity: z.record(...)`. *(note #3)*
- [SPEC-09](./SPEC-09-remove-changed-fields.md) — Remove changed-fields tracking from entity update methods + use cases. *(note #2)*

### Wave 4 — Read-side: query services over projections (1 stream, sequential)

- [SPEC-10](./SPEC-10-strip-projections.md) — Delete all TS projections, projectors, and projection repositories (incl. the cart repo); rewrite `GetVideoFeed` to aggregate base tables; relocate the cart→order link write. *(note #16)*
- [SPEC-11](./SPEC-11-product-order-query-services.md) — Replace the orphaned Product/Order read-models with `ProductQueryService` + `OrderQueryService` (return shape defined inside the service). *(note #8)*
- [SPEC-12](./SPEC-12-productcost-handler-order-query.md) — `ProductCostApplicationHandler` reads orders via `OrderQueryService`, not direct Drizzle. *(note #15)*

### Wave 5 — Billing webhook flow (1 stream)

- [SPEC-13](./SPEC-13-billing-webhook-rewrite.md) — Rewrite billing-webhook ingest: controller publishes a raw `BillingWebhookReceivedEvent`; a mapper handler emits `ExternalSubscriptionUpdatedEvent`; an internal handler publishes the true subscription domain events. Removes `webhookEventType`. *(notes #7 + #6)*

### Wave 6 — Validation & pagination polish (3 streams, parallel)

- [SPEC-14](./SPEC-14-paginated-query-helper.md) — **Stream A**. Migrate paginated controllers to `z.paginatedQuery({...})`. *(note #5)*
- [SPEC-15](./SPEC-15-productcost-daterange-refine.md) — **Stream B**. Move `ProductCost` date-range validation into the entity schema's `.refine()`. *(note #12)*
- [SPEC-16](./SPEC-16-adspend-schema-fix.md) — **Stream C**. Fix `AdSpendSchema` — `z.iso.date()` dates, clean platform enum, `MonetaryAmount` spend. *(note #18)*

## Status table

| Spec | Title | Wave | Stream | Lang impact | Status |
|------|-------|------|--------|-------------|--------|
| 17 | Remove the video domain | 0 | A / B–G | Rust + Go + TS + Contracts + App | done |
| 01 | MonetaryAmount shared VO | 1 | A | TS | done |
| 02 | Wire enums export enum-only | 1 | B | TS + Contracts | done |
| 03 | No context enum re-export | 1 | B | TS | done |
| 04 | SessionSchema + GetSession | 2 | — | TS | done |
| 05 | AuthAccountMiddleware returns Session | 2 | — | TS | done |
| 06 | RequireStoreMember parse (no casts) | 2 | — | TS | done |
| 07 | storeId persisted on session | 2 | — | TS + Contracts | done |
| 08 | Events embed entity via toJSON | 3 | — | TS | done |
| 09 | Remove changed-fields tracking | 3 | — | TS | done |
| 10 | Strip projections + projection repos | 4 | — | TS + Contracts | done |
| 11 | Product/Order query services | 4 | — | TS | done |
| 12 | ProductCost handler → OrderQueryService | 4 | — | TS | done |
| 13 | Billing webhook flow rewrite | 5 | — | TS | done |
| 14 | z.paginatedQuery migration | 6 | A | TS | done |
| 15 | ProductCost date-range refine | 6 | B | TS | done |
| 16 | AdSpendSchema fix | 6 | C | TS | done |

## Reference

- Project conventions: `CLAUDE.md`
- Skills (per-artifact playbooks): `.claude/skills/<name>/SKILL.md`
- Batch 1 (complete): `.specs/2026-05-23-refactor-batch/`
- Go webhook/event-layer model SPEC-13 mirrors: `.specs/2026-05-24-go-sync-restructure-design.md`
- Session reference (persisted `actorId`/`ownerId`): `/Users/gabrielaraujo/Desktop/Projetos/medscall/monorepo` (dev)
