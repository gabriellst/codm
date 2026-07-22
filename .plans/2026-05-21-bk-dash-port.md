# BK Dash Port — Master Plan (Plan-of-Plans)

> **For agentic workers / Ralph loop:** This is a MASTER plan that decomposes
> the BK Dash port into 14 self-contained sub-plans. Each subsequent Ralph
> iteration produces ONE sub-plan via `/plan`, then later iterations execute
> each sub-plan via `/build`. Do NOT attempt to implement against this master
> plan directly — implement against the sub-plans.
>
> **Why a master plan, not a single /plan?** The spec covers 11 bounded
> contexts plus a Go sync worker. `/plan` says: *"If the spec covers multiple
> independent subsystems… suggest breaking this into separate plans — one
> per subsystem. Each plan should produce working, testable software on its
> own."* This master plan IS that suggestion, made concrete.

**Goal:** Port the BK Dash backend per `.specs/2026-05-21-ddd-modeling-bk-dash.md` into the template-fullstack monorepo, matching CLAUDE.md / docs/BACKEND.md / `.claude/skills/*` conventions.

**Architecture (revised iter 39 — see Polyglot rebase addendum at end of file for full details):** A TS API (`packages/api/typescript/`) holds 11 bounded contexts (Identity → Analytics) under `src/<bc>/`. A Go sync worker (`packages/api/go/`) hosts the sync + webhooks BCs under `internal/<bc>/`. Both sides consume `packages/api/{typescript,go}/core/` (polyglot framework primitives: mediator, outbox, UnitOfWork, HttpRouter, BaseEntity, AppError, types.Controller). Cross-language enums + integration events + DB schema are authored in `packages/contracts/` (TypeSpec wire/ + Drizzle db/schema/) and emitted to per-language generated/ folders. Provider webhooks land on the Go worker via Redis Streams (`events:<event-name>`) consumed by TS handlers; Go publishes via `packages/api/go/core/services/mediator/redis_mediator.go`; TS consumes via `packages/api/typescript/core/src/services/Mediator/RedisExternalMediator.ts`.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod, Kafka, Go (sqlc, pgx, fx), PostgreSQL.

**Spec:** `.specs/2026-05-21-ddd-modeling-bk-dash.md`
**Sub-plans:** 14
**Estimated iterations until first sub-plan executable:** 2 (iteration 1 = master plan, iteration 2+ = sub-plans)

---

## Known Structural Caveats (recorded for future iterations)

1. **Spec format mismatch.** The spec is a DDD strategic modeling document (7 sections: Requirements / Event Storming / Screens & Commands / BCs / Context Mapping / Design Decisions / Technical Spec). It lacks `/brainstorm`'s 6 enforced sections (Context / Problem / Goal / Decisions / User Stories / Acceptance Criteria). Per `/plan`'s legacy spec tolerance, we treat the spec's §1.2 Functional Requirements as **implicit User Stories**, the spec's §1.3 Non-Functional Requirements + Design Decisions as **Decisions**, and the spec's §3 command/read rules as **Acceptance Criteria**. Each sub-plan will enumerate the specific ACs it inherits from the spec.

2. **Graph CLI broken.** `bun scripts/graph/cli/index.ts build` fails because the Go adapter expects `packages/channel/internal` (a medscall artifact not present in template-fullstack). Sub-plans cannot use the graph's `validate-plan` step until the Go adapter is fixed to tolerate the polyglot paths (`packages/api/{go,typescript}/internal/`). **Workaround for now:** every sub-plan does manual sibling lookup via `find`/`grep` of `packages/api/{go,typescript}/internal/` (or the medscall reference repo for missing conventions) and embeds the convention in its task descriptions. **Fix tracked as sub-plan P0-FIX-GRAPH (optional, P1).** *Iter 39 note:* polyglot may have already shipped a graph-adapter fix; verify before re-emitting sub-plans in iter 43.

3. **No siblings in target context.** Most BCs being ported don't exist anywhere in this repo today. The "read one sibling per kind" guidance from `/plan` Phase 1.4 is satisfied by reading polyglot's `packages/api/go/internal/transcoding/` (Go) or any sibling under `packages/api/typescript/src/` (TS). For BC-specific patterns absent on polyglot, medscall's `packages/api/src/contexts/*` remains a secondary reference; sub-plans cite the sibling path used.

4. **`/task-breakdown` overlay applies per sub-plan**, not to this master. Each sub-plan crossing ≥3 BCs or producing ≥10 artifacts will invoke `/task-breakdown` internally.

---

## Decomposition

The 14 sub-plans below match the Ralph loop's phase ordering (`.plans/2026-05-21-bk-dash-port-ralph-prompt.md` PHASE ORDER section), with one sub-plan per natural unit of working software.

### Foundation phase

| Sub-plan ID | Title | Scope | Dependencies | Est. tasks |
|---|---|---|---|---|
| **P0-FOUNDATION** | ✅ SUPERSEDED by polyglot rebase (iter 39) | Replaced by `packages/contracts/` (TypeSpec `wire/{enums,events}/*.tsp` → emits TS+Go+Rust shapes; Drizzle `db/schema/*.ts` → emits SQL migrations consumed by both sides). Per-language framework primitives ship in `packages/api/{typescript,go}/core/` already. The §7.0 enum + integration-event content now lands as iteration 41 (TypeSpec authoring). | (none) | 0 (deleted) |

### Go worker phase

| Sub-plan ID | Title | Scope | Dependencies | Est. tasks |
|---|---|---|---|---|
| **PG-GO-WORKER** | Go BCs on polyglot framework (REDUCED iter 39) | Add `packages/api/go/internal/{sync,webhooks}/` BCs consuming `packages/api/go/core/` (mediator, outbox, HttpRouter, BaseEntity, AppError, types.Controller — already shipped on polyglot). Mirror the `packages/api/go/internal/transcoding/` structural template (controllers/, entities/, enums/, errors/, events/, handlers/, middleware/, objects/, repositories/<aggregate>/, services/, usecases/, module.go). Port one provider pipeline end-to-end (Shopify Orders) as exemplar. No framework rebuild — polyglot already shipped Redis mediator, outbox dispatcher, UnitOfWork, embedded-postgres test harness, pkg/httputil, pkg/validation, pkg/openapi. | Iter 41 (contracts wire/), Iter 42 (Drizzle schema) | ~12 |

### Per-BC phase (each produces a working, queryable context)

| Sub-plan ID | BC | Scope (commands × reads) | Dependencies | Est. tasks |
|---|---|---|---|---|
| **P1-IDENTITY** | BC1 Identity | C01–C11, T01–T06. BetterAuth wiring, User + UserPreferences aggregates, FcmRegistrationToken, Lead event, password lifecycle. | contracts/wire + core (iter 41) | ~25 |
| **P2-TENANCY** | BC2 Tenancy | C12–C20, T07–T10. Store + StorePreferences + StoreMembership, Role enforcement, store-credit gate (depends on P3 PLAN_QUOTAS). | P1-IDENTITY, P3-BILLING | ~22 |
| **P3-BILLING** | BC11 Billing | C56–C57, T38–T39. Subscription aggregate, SubscriptionEvent stream, PlanQuotas code-const, Kiwify webhook handler, ChangeExternalSubscription, `shared.SubscriptionQuotaUpdated` publisher. | P1-IDENTITY | ~18 |
| **P4-INTEGRATION** | BC3 Integration | C21–C25, T11–T12. StoreIntegration with deterministic UUIDv5, IntegrationCredentialSecret vault, MarketingAdAccount discovery, OAuth flow orchestration, TS→Go HTTP handshake/sync calls, ReintegrationBatch fan-out. | P2-TENANCY, PG-GO-WORKER | ~24 |
| **P5-CATALOG** | BC5 Catalog | C27–C32, T16–T19. Product/Variant canonical projections (Go-written, TS-read), ProductCost aggregate with options + items + quantityHash, ProductTag commands (canonical exception), BulkImportFromCsv. | P4-INTEGRATION | ~22 |
| **P6-SALES** | BC4 Sales | C26, T13–T15. Order/Cart canonical projections (Go-written), OrderTransaction nested with typed fees[], unified UpdateOrderOverride with typed OrderOverrideFields, OrderTransactionRecorded/Refunded/Disputed downstream handlers, Cart→Order linking on CHECKOUT_COMPLETED. | P4-INTEGRATION, P5-CATALOG | ~20 |
| **P7-MARKETING** | BC6 Marketing | C33–C38, T20–T22. Campaign/AdSet/Ad canonical, unified AdSpend (AUTOMATIC + MANUAL via type discriminator), CampaignProductBinding, ReconcileMarketingAccounts dual-trigger (cron + dashboard-query). | P4-INTEGRATION, P5-CATALOG | ~22 |
| **P8-TRACKING** | BC7 Tracking | T23–T24 (no commands — Go-owned). PixelEvent canonical projection, funnel query, pixel-script-snippet read. Sales-side handler for CHECKOUT_COMPLETED Cart-linking. | P4-INTEGRATION, P6-SALES | ~10 |
| **P9-FINANCE** | BC8 Finance | C39–C48, T25–T29. Taxes aggregate (time-effective), FeesConfiguration parent + GatewayFee[]/CheckoutFee[]/ShippingFee children, OperationalCost (typed enums), WarrantyReserve, FxRate append-only projection, hourly CaptureFxRates cron. | P2-TENANCY | ~22 |
| **P10-NOTIFICATIONS** | BC10 Notifications | C53–C55, T37. Notification + NotificationDelivery, FCM/email dispatch, 15-min dedupe, daily-digest scheduler keyed on UserPreferences.timezone + dailyNotificationsEnabled, per-Store opt-in order-push, invitation/handshake-failed routing. | P1-IDENTITY, P2-TENANCY, P4-INTEGRATION, P6-SALES | ~16 |
| **P11-ANALYTICS** | BC9 Analytics | C49–C52, T30–T36. Goal aggregate, single discriminated Chart endpoint (REVENUE / REVENUE_PER_SHIFT / SALES_PER_WEEKDAY / SALES_PER_HOUR / SALES_PER_REGION), DashboardOverview, ProductPerformance, ProfitMargin, GoalsList, admin reads (`x-admin-secret`), multistore queries, per-currency aggregation with date-effective FxRate conversion. | All previous BCs | ~25 |

### Integration phase

| Sub-plan ID | Title | Scope | Dependencies | Est. tasks |
|---|---|---|---|---|
| **PE-E2E** | End-to-end test suite | `packages/e2e` flows: signup → connect-integration → webhook-ingest → query-dashboard; subscribe → cancel; manual-override → analytics-invalidate; multistore consolidated dashboard; daily-digest delivery; pixel-funnel completeness. | All P*-BC and PG-GO-WORKER | ~15 |
| **PR-REVIEW** | Aggregate review + final hardening | Run `bun scripts/review.ts --pr` across the whole branch. Triage every HIGH finding. Fix without changing behavior. Re-run until zero HIGH. Run `bun sdk` regeneration and confirm `packages/client/dist/` is committed. Run all quality gates one last time. | PE-E2E | ~10 |

---

## Total artifact volume (informational)

| Category | Count |
|---|---|
| Sub-plans | 14 |
| Total Tasks across all sub-plans (estimate) | ~270 |
| Total files created (estimate) | ~400 |
| Total bounded contexts | 11 |
| Total commands (per spec §3) | 57 |
| Total reads (per spec §3) | 39 |
| Go pipelines (one per provider × entity type) | ~25 |
| Drizzle migrations | ~15 |

---

## Dependency Graph

```
            iter 41 (contracts/wire)  +  iter 42 (contracts/db/schema)
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
          PG-GO-WORKER    P1-IDENTITY      (parallel possible after iter 42)
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
            P3-BILLING                   (waits for P3)
                │
                ▼
            P2-TENANCY
                │
       ┌────────┴─────────┐
       ▼                  ▼
  P4-INTEGRATION       P9-FINANCE
       │
   ┌───┼───────────────┐
   ▼   ▼               ▼
  P5  P6              P7
 CAT SALES        MARKETING
       │
       ▼
    P8-TRACKING
       │
       └──────────────────┐
                          ▼
                  P10-NOTIFICATIONS
                          │
                          ▼
                  P11-ANALYTICS
                          │
                          ▼
                      PE-E2E
                          │
                          ▼
                      PR-REVIEW
```

**Critical path (post-rebase):** iter 41 → iter 42 → P3 → P2 → P4 → P5 → P6 → P8 → P10 → P11 → PE → PR. P0-FOUNDATION (the original "Foundation phase") collapsed into iterations 41+42 of `packages/contracts/`.

**Parallelizable workstreams** (per CLAUDE.md "Tasks that change together live together"):
- Iter 41+42 unblock PG and P1 simultaneously (run in parallel after contracts land).
- P3 + P9 can run in parallel after P2.
- P5 + P7 can run in parallel after P4.
- P6 + P7 + P8 form a fan after P5.

A Ralph iteration can spawn 2–3 disjoint sub-plans in parallel via the `Agent` tool **only when the dependency graph allows AND the sub-plans touch disjoint file sets**. Cross-context coordination must go through the `shared.*` integration events declared in P0-FOUNDATION.

---

## Ralph loop execution protocol

The Ralph loop at `.plans/2026-05-21-bk-dash-port-ralph-prompt.md` is the controller. **This master plan does NOT replace `/build`'s task execution** — it dispatches `/plan` invocations to produce per-sub-plan implementation plans, then `/build` invocations to execute them.

**Per Ralph iteration after this one:**

1. Read `.plans/2026-05-21-bk-dash-port.progress.md` to see which sub-plan is next per dependency graph.
2. If the next sub-plan's `.plans/2026-05-21-bk-dash-port-<sub-plan-id>.md` does NOT exist → invoke `/plan` to produce it (one iteration).
3. If the sub-plan exists but its tasks aren't all checked → invoke `/build` to execute the next task batch (one iteration per logical chunk).
4. If all sub-plans are executed and PR-REVIEW is green → emit completion promise.

**Iteration types:**

| Iteration type | What happens | Stops when |
|---|---|---|
| Master (this one) | Master plan written | After this iteration |
| Sub-planning | One sub-plan written via `/plan` | After the sub-plan file lands + commit |
| Building | Tasks within a sub-plan executed via `/build` | After tsc+lint+test pass for the chunk + commit |
| Reviewing | `bun scripts/review.ts --pr` + fixes | After 0 HIGH findings |
| Final | Completion promise | When all criteria from Ralph prompt are met |

---

## Sub-plan template (for each future sub-plan)

Each sub-plan MUST follow `/plan`'s standard structure:

```
# <Sub-plan title> — Implementation Plan

> **For agentic workers:** Execute via `/build`. ...

**Goal:** <one sentence distilled from the spec section covered>
**Architecture:** <2-3 sentences>
**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod, ...
**Spec:** .specs/2026-05-21-ddd-modeling-bk-dash.md (sections §<n>, §<m>)
**Master plan:** .plans/2026-05-21-bk-dash-port.md (sub-plan <ID>)
**Depends on sub-plans:** <list>
**Tasks:** <N>
**Estimated minutes:** <sum>

## Task 1: <observable behavior>
... (per /plan format)

## Final Validation
- [ ] bun tsc
- [ ] bun lint
- [ ] bun test affected
- [ ] AC mapping (spec command/read → test path)
```

---

## Validation of this master plan

This master plan deliberately does NOT have:
- `Final Validation` block with `bun tsc` — there's nothing to compile; this is a dispatcher.
- AC mapping — ACs are mapped per sub-plan.
- Code blocks — no code is shipped from this document.

This master plan DOES have:
- Concrete sub-plan IDs that future iterations target.
- An honest dependency graph executable by humans or by parallel `Agent` dispatches.
- Acknowledgement of the spec/skill mismatch and the graph-CLI gap.
- A pointer-only structure — every implementation decision is deferred to the sub-plan that owns it.

---

## Next Ralph iteration target

**SUPERSEDED by polyglot rebase addendum below.** The original "produce P0-FOUNDATION" target was completed on `feat/bk-dash` and is now subsumed by polyglot's `packages/contracts/` + `packages/api/{go,typescript}/core/`. The current next-step plan lives in the addendum (iterations 40–44):

- **Iter 40** (this iteration): master-plan path rewrite to polyglot layout.
- **Iter 41**: author BK Dash TypeSpec wire/ files (enums + integration events). `bun run codegen:wire`.
- **Iter 42**: author BK Dash Drizzle schemas under `packages/contracts/db/schema/`. `bun run drizzle:generate`.
- **Iter 43**: re-emit all 12 sub-plans in parallel against the new layout.
- **Iter 44+**: resume Phase 4 (TS BCs under `packages/api/typescript/src/<bc>/`) + reduced PG-GO-WORKER (Go BCs under `packages/api/go/internal/<bc>/`).

---

## Notes for future iterations

- Each sub-plan should re-state its own AC mapping derived from the spec sections it covers — do not rely on this master plan's high-level list.
- When `/plan` Phase 2 asks "Does this file structure match what you have in mind?" during a sub-plan, the Ralph loop must accept its own structure and proceed — there is no human to ack mid-loop. Document the decision in the sub-plan's `Notes` section.
- The graph-CLI failure means `bun scripts/graph/cli/index.ts validate-plan` will fail per sub-plan. Treat that as a known warning, not a blocker. Polyglot may have already fixed this; verify before adopting `validate-plan` in the iter 43 re-emit.
- **Sibling-artifact convention source (post-rebase):** `packages/api/go/internal/transcoding/` for Go BCs; pick any sibling under `packages/api/typescript/src/` (e.g. `notifications/`, `auth/`) for TS BCs. The medscall codebase remains a secondary reference but the polyglot internal/ examples are now the primary convention source.

---

## Polyglot rebase addendum (iteration 39 — 2026-05-21)

**The previous branch `feat/bk-dash` is abandoned. This plan now executes on `feat/bk-dash-polyglot`, cut from `origin/polyglot`.**

### Why

The polyglot branch has been evolving in parallel — it landed a full polyglot framework while we were building a worse re-implementation of it on `feat/bk-dash`:
- `packages/api/{go,rust,typescript}/core/` — per-language framework primitives (mediator, outbox dispatcher, UnitOfWork, HttpRouter, DomainEventRepository, BaseEntity, AppError + codes + mapper, types.Controller, pkg/httputil, pkg/validation, pkg/openapi)
- `packages/api/{go,rust,typescript}/internal/<bc>/` — per-language bounded-context home
- `packages/contracts/` — cross-language source of truth: TypeSpec source under `wire/{enums,events}/`, emitters under `codegen/emit-wire-{ts,go,rs}.ts` producing `generated/{typescript,go,rust}/wire/`. Drizzle schemas under `db/schema/` author the canonical migrations; sqlc + any other consumer reads the same SQL.
- `internal/transcoding/` is a fully worked Go BC example to mirror.

### What changed in the layout

Old (`feat/bk-dash`):
- `packages/go-worker/internal/{shared,sync,webhooks}/` — homegrown Go framework + domain
- `packages/api/src/shared/{types,enums,constants,errors,events}/bk-dash/` — TS shared types (P0-FOUNDATION)
- `packages/api/src/contexts/<bc>/` — TS BCs

New (`feat/bk-dash-polyglot`):
- `packages/api/go/internal/<bc>/` — Go BCs (sync, webhooks, …) consuming `packages/api/go/core/`
- `packages/api/typescript/src/<bc>/` — TS BCs consuming `packages/api/typescript/core/`
- `packages/contracts/wire/{enums,events}/*.tsp` — cross-language enums + integration events authored in TypeSpec, emitted to TS+Go+Rust
- `packages/contracts/db/schema/*.ts` — Drizzle schemas authored once, migrations emitted to `packages/contracts/db/migrations/` and consumed by both sides
- `packages/contracts/generated/{typescript,go}/wire/` — generated wire shapes both runtimes import

### What carried over from `feat/bk-dash`

- `.specs/2026-05-21-ddd-modeling-bk-dash.md` — the spec
- `.plans/2026-05-21-bk-dash-port*.md` — this master plan, the 12 sub-plans, the progress log, the Ralph prompt (all 16 files)
- `.claude/skills/{ddd-spec,ui-composition}/` — locally authored skills

### What was DROPPED (re-implemented on polyglot)

- `packages/go-worker/` (entire directory, ~40 files, 38 iterations of work) — replaced by `packages/api/go/core/` (already on polyglot) + `packages/api/go/internal/{sync,webhooks}/` (to be authored)
- `packages/api/src/shared/{types,enums,constants,errors,events}/bk-dash/` (P0-FOUNDATION TS) — replaced by `packages/contracts/wire/` (cross-language) + `packages/api/typescript/core/` (TS framework)
- The PG-GO-WORKER sub-plan as written (16 tasks of framework rebuild) — most of its scope is moot now; survives as a thin sub-plan covering only "add `internal/sync/` + `internal/webhooks/` BCs under `packages/api/go/`"

### Conceptually carried over

The decisions baked into the dropped Go code transfer as design knowledge to the rewrite:
- Shopify order normalizer logic (decimal-to-cents, multi-allocation discount summing, payment-status mapping, UTM extraction from note_attributes) — must be re-implemented under `packages/api/go/internal/sync/services/shopify/`
- Mapper Registry + Verifier Registry pattern — to be re-implemented under `packages/api/go/internal/webhooks/{mappers,verifiers}/`
- `objects.HashedID(platform, externalId)` with the locked `BK_DASH_NAMESPACE = f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e` constant — the constant becomes a TypeSpec scalar in `packages/contracts/wire/`, the helper exists once per language under `packages/api/<lang>/core/objects/`
- Spec-shaped `OrderEventPayload` envelope — authored as a TypeSpec event in `packages/contracts/wire/events/`, generated TS+Go types consumed by both sides

### Next-step plan (iterations 40+)

1. **Iteration 39 (this one)**: cut branch + cherry-pick docs/spec/plans + commit. Done in this iteration.
2. **Iteration 40**: append a master-plan revision pass that updates every sub-plan reference in this file to point at the new layout (mechanical; mostly path rewrites + framework references).
3. **Iteration 41**: author BK Dash TypeSpec wire/ files (enums + integration events). Run `bun run codegen:wire`. Sanity check generated TS+Go.
4. **Iteration 42**: author BK Dash Drizzle schemas under `packages/contracts/db/schema/`. Run `bun run drizzle:generate`. Verify SQL output is sqlc-friendly.
5. **Iteration 43**: re-emit all 12 sub-plans in parallel against the new layout. Same parallel-agents pattern that produced the originals.
6. **Iteration 44+**: resume Phase 4 (TS BCs) + the slimmed PG-GO-WORKER (Go BCs) builds on the polyglot framework.

### What this means for the Ralph prompt

The phase order in `.plans/2026-05-21-bk-dash-port-ralph-prompt.md` now reads:
- **Phase 1 (DONE → moot)**: P0-FOUNDATION — superseded by `packages/contracts/` + polyglot core.
- **Phase 2 (DONE → moot)**: shared.* integration event catalog — moves to `packages/contracts/wire/events/`.
- **Phase 3 (REDUCED)**: Go worker port — now reduces to "add Go BCs (sync, webhooks) under `packages/api/go/internal/`, consuming `packages/api/go/core/`". No framework rebuild.
- **Phase 4 (UNCHANGED)**: TS BCs in dependency order, now under `packages/api/typescript/src/`.
- **Phase 5 (UNCHANGED)**: E2E.
- **Phase 6 (UNCHANGED)**: review.

The completion criteria stay the same; the work that delivers them moves to a much better-supported foundation.
