# P11-ANALYTICS — BC9 Analytics (Goal write-side + BFF reads, polyglot layout) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use `- [ ]` checkboxes for
> tracking. Each Task wraps one observable behavior in an outer RED→GREEN cycle.
>
> **Sub-plan home folders (POLYGLOT REBASE — supersedes the pre-rebase 27-task layout):**
>
> - **Write side (Goal aggregate + GoalCreated/Updated/Deleted events + commands C49–C52):**
>   `packages/api/typescript/src/analytics/`. This is a **new TS bounded context** living next to
>   `packages/api/typescript/src/auth/` and `packages/api/typescript/src/notifications/` — the
>   polyglot layout uses `src/<bc>/` flat (no `contexts/` wrapper). Mirror the structural template
>   of `packages/api/typescript/src/auth/` (controllers/, entities/, enums/, errors/, events/,
>   handlers/{internal,external}.ts, middlewares/, objects/, repositories/<aggregate>/, services/,
>   usecases/, registry.ts, index.ts).
> - **Read side (T30 DashboardOverview, T31 Chart, T32 ProductPerformance, T33 ProfitMargin,
>   T34 GoalsList, T35 AdminUserLookup, T36 AdminStoreSnapshot):**
>   `packages/api/typescript/src/analytics/queries/` (BFF subfolder INSIDE the Analytics BC).
>   **There is no `ui/` BC in polyglot** in the same sense the pre-rebase plan assumed
>   (`packages/api/typescript/src/ui/` exists only as a *video-streaming* read-side BFF and has
>   nothing to do with BK Dash). Spec §BC9 says Analytics "owns the read-side of the entire
>   system" — so every BK Dash read lives in this BC's `queries/` folder. The companion
>   `queries/` controllers live in `packages/api/typescript/src/analytics/controllers/` (same
>   barrel as Goal command controllers — see Task 1).
> - **Cross-context external handlers** (Analytics consumes integration events from Sales,
>   Catalog, Marketing, Finance, Tracking, Integration, Tenancy per spec §BC9):
>   `packages/api/typescript/src/analytics/handlers/external.ts`. In this iteration they are
>   **no-op stubs** with structured TODOs because the spec explicitly states "No materialized
>   read models are in scope for this iteration — every query is served directly against
>   canonical tables." See `# QUESTION: Q3`.

**Goal:** Land BC9 Analytics end-to-end on the polyglot layout: (a) the `Goal` aggregate with
commands C49–C52 and `GoalCreated`/`Updated`/`Deleted` domain events in a new `analytics` TS BC,
backed by the already-authored `packages/contracts/db/schema/bkdash_analytics.ts` table
(`bkdashGoals` → `goals.goals`); (b) every read declared in spec §7.9 (T30–T36) as a BFF query
use case under `analytics/queries/`, JOINing canonical projections owned by other BCs (sales,
catalog, marketing, finance, tenancy, identity, billing, integration) directly via Drizzle; with
multi-tenant scoping (`storeIds: string[]`) on EVERY read; per-currency aggregation via
`MonetaryByCurrency`; and date-effective FX conversion via the `finance.fx_rates` table P9-FINANCE
owns; admin reads (T35, T36) gated by an `x-admin-secret` header middleware authored here.

**Architecture:** One BC, two folders. Write-side lives at the BC root following the canonical
DDD shape (Goal aggregate, GoalRepository, command use cases, domain events). Read-side lives
in `queries/` as plain `Handler` query use cases that inject `DrizzleClient` directly and JOIN
across canonical tables (per `/query` SKILL "Cross-context query" pattern — direct Drizzle reads
across BC boundaries are explicitly allowed inside a BFF; entity imports across BCs remain
forbidden). FX conversion is implemented as `FxRateService` (application service colocated in
`analytics/services/`) that reads `finance.fx_rates` and resolves the most-recent
`startDate <= asOfDate` row per `(fromCurrency, toCurrency)` pair (per spec §7.0 + the
`fx_rates_pair_start_date_idx` already shipped in `packages/contracts/db/schema/finance.ts`).
Cross-context cache-invalidation handlers exist as stubs.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod (re-exported as
`z` from `@template/core-typescript`), bun:test, PGlite (integration tests).

**Spec:** `.specs/2026-05-21-ddd-modeling-bk-dash.md` §4 BC9, §7.9, §7.11 (Billing cross-refs
for T35), §7.13/§7.14 (Tenancy/Finance event consumption fragments touching Analytics).

**Master plan:** `.plans/2026-05-21-bk-dash-port.md` (sub-plan P11-ANALYTICS, polyglot
addendum at the end of the master).

**Contracts already authored (DO NOT redefine):**
- TypeSpec enums in `packages/contracts/wire/enums/`: `goal-type.tsp` (REVENUE | PROFIT),
  `chart-type.tsp` (REVENUE | REVENUE_PER_SHIFT | SALES_PER_WEEKDAY | SALES_PER_HOUR |
  SALES_PER_REGION), `timezone-mode.tsp` (PER_STORE | UNIFIED), plus `currency-code.tsp`,
  `sort-order.tsp` and every other enum the §7.9 outputs cite. Import the emitted TS via
  `@template/contracts-typescript/wire` (or whatever the emitted path is on the current branch — verify
  before Task 6). **`analytics-frequency.tsp` is unused by the Goal aggregate** — it remains
  available for any future BFF read that needs per-period bucketing but is no longer
  persisted on Goal (iter-43.6c triage dropped `frequency` as invented).
- Drizzle schema `packages/contracts/db/schema/bkdash_analytics.ts` — `bkdashGoals` (TS export)
  → `goals.goals` PG table. **Use this name at every import site** (`import { bkdashGoals }
  from '@template/contracts/db'`). **Schema realigned to spec §4 BC9 line 868 by iter-43.6c
  migrations 0015 (additive pass) + 0016 (drop pass).** Columns: `id uuid PK`, `storeId uuid
  NOT NULL`, `storeIntegrationId uuid NULL`, `type text`, `targetAmountCents bigint`,
  `targetCurrency text`, `startDate timestamptz NOT NULL`, `endDate timestamptz NOT NULL`,
  `disabledAt timestamptz NULL`, `createdAt`, `updatedAt`, `version`. Indexes:
  `goals_store_id_idx`, `goals_store_disabled_idx`, `goals_store_integration_id_idx`,
  `goals_start_date_idx`. **No `userId`** — Goal is store-owned (auth via Tenancy membership,
  not creator FK); use case resolves the actor for audit only. **No `frequency`** — Goal is a
  date-ranged target, not a bucketed counter. **No `isActive` / `progressFraction`** — soft-
  delete is `disabledAt`; progress is computed per T34 by joining canonical revenue/profit at
  read time (spec §863 "no materialized read models" rule for BC9).

**Depends on sub-plans (these BCs' canonical TS+Go tables must exist before P11 starts):**
- **P1-IDENTITY** — `auth.users` (FK target for `goals.user_id`; needed by T35 AdminUserLookup).
- **P2-TENANCY** — `tenancy.stores`, `tenancy.store_integrations`, `tenancy.store_memberships`,
  `tenancy.store_preferences` (every read; T36 AdminStoreSnapshot; `reportingCurrency` lookup).
- **P3-BILLING** — `billing.subscriptions`, `billing.subscription_events` (T35).
- **P4-INTEGRATION** — `tenancy.store_integrations.{valid, active, lastSyncAt}` (T36).
- **P5-CATALOG** — `catalog.products`, `catalog.product_variants`, `catalog.product_costs`
  (options[] + items[] + variantsHash) (T32, T33).
- **P6-SALES** — `sales.orders` (Go-written canonical, already shipped on contracts),
  `sales.order_overrides` (TS-owned write-side from P6), `sales.order_lines`,
  `sales.order_transactions` (nested with typed `fees[]`), `shipping_address` jsonb on Order
  (for T31 SALES_PER_REGION).
- **P7-MARKETING** — `marketing.ad_spends` (typed AUTOMATIC + MANUAL via discriminator),
  `marketing.campaign_product_bindings` (T30, T32, T33).
- **P8-TRACKING** — `tracking.pixel_events` (consumed event only; not used by §7.9 reads in this
  iteration).
- **P9-FINANCE** — `finance.taxes`, `finance.fees_configuration` (jsonb sub-fee arrays
  per shipped schema), `finance.operational_costs`, `finance.warranty_reserves`,
  **`finance.fx_rates`** (date-effective append-only — FxRateService reads this).

**Tasks:** 27
**Estimated minutes:** ~430

---

## Convention reference (absorbed during planning, NOT to be re-read by /build)

- **BC skeleton:** `packages/api/typescript/src/auth/` — `controllers/`, `entities/`, `enums/`,
  `errors/`, `events/`, `handlers/{internal,external}.ts`, `middlewares/`, `objects/`,
  `repositories/<Aggregate>/{<Name>Repository,Mock<Name>Repository,Drizzle<Name>Repository,index}.ts`,
  `services/`, `usecases/`, `registry.ts`, `index.ts` (`BoundedContext.create({ name, controllers,
  internalHandlers, externalHandlers, registry: INSTANCE_REGISTRY })`).
- **Root bootstrap:** `packages/api/typescript/src/index.ts` collects routers — add
  `AnalyticsRouter` to the `routers` array there.
- **Path alias:** TS path map already includes `@auth/*`, `@notifications/*`, `@ui/*` — add
  `@analytics/*` → `src/analytics/*` in `packages/api/typescript/tsconfig.json` (or root
  `tsconfig.json`, mirror existing alias placement).
- **Entity pattern:** `packages/api/typescript/src/auth/entities/User.ts` —
  `AggregateRoot<typeof Schema>`, `static schema`, `static create(...)`, `interface X extends
  XProps {}` declaration merge. Setters call `this.validate()`.
- **Repository pattern:** `packages/api/typescript/src/auth/repositories/UserRepository/` —
  abstract `extends Repository<Entity>`; `MockUserRepository`, `DrizzleUserRepository`;
  barrel re-exports.
- **Use case pattern:** `packages/api/typescript/src/auth/usecases/RegisterUser.ts` —
  `@injectable() class extends Handler<typeof Input, typeof Output>`, `readonly name = 'snake' as
  const`, `withTransaction(tx, async tx => {...})`, `BaseError<ApplicationErrors>` for not-found,
  persist via `this.domainEventRepository.save(event, tx)`.
- **Query use case pattern (BFF):** `packages/api/typescript/src/ui/usecases/SearchVideos.ts` —
  `@injectable() class extends Handler<typeof Input, typeof Output>` injecting `DrizzleClient`
  directly, no repository; `Promise.all([...])` for parallel independent reads (per `/query`
  SKILL); imports tables from `@template/contracts/db`.
- **Controller pattern:** `packages/api/typescript/src/auth/controllers/GetSession.ts` and
  `packages/api/typescript/src/ui/controllers/SearchVideos.ts` —
  `@injectable() class extends Controller<typeof Input, typeof Output>`, `readonly path`,
  `readonly method`, `readonly description`, `.example([...])` on every schema; controller
  delegates to use case via `this.<useCase>.execute(request.query | request.body)`.
- **Event pattern:** `packages/api/typescript/src/auth/events/UserRegisteredEvent.ts` —
  `z.domainEvent({...})` schema; class `extends BaseDomainEvent<typeof Schema>`;
  `static override readonly name = '<bc>.<aggregate>.<verb>' as const`; `static readonly schema`.
- **Errors pattern:** mirror an existing context's `errors/index.ts` — typed string unions per
  layer composed into `Errors`; **side-effect import** in `registry.ts` (`import './errors'`)
  registers them with the framework runtime mapper.
- **Registry pattern:** `packages/api/typescript/src/auth/registry.ts` — flat file,
  `INSTANCE_REGISTRY: InstanceRegistry` with `mock`/`integration`/`real` keys; **passed into
  `BoundedContext.create({ registry: INSTANCE_REGISTRY })`** in `index.ts` — there is no
  separate `shared/registry.ts` aggregation step in polyglot.
- **Schema helpers:** `import { z } from '@template/core-typescript'` (Zod re-export with
  `.domainEvent`, `.integrationEvent` extensions). Standard Zod for `.coerce.number()`,
  `.coerce.boolean()`. For paginated query/response, check what exists under
  `@template/core-typescript`'s utils — if absent, hand-roll inline (no `z.paginatedQuery` helper
  is guaranteed on polyglot; verify in Task 19 before relying on it).
- **DrizzleClient + Transaction:** `import { DrizzleClient } from '@template/core-typescript'`;
  `import type { Transaction } from '@template/core-typescript'`.
- **Test placement:** colocated `<Name>.test.ts`. Use `bun:test`. For use cases / handlers /
  repositories, use the polyglot test bed at `packages/api/typescript/tests/support/TestBed.ts`
  (verify name — if it's `IntegrationTestBed` or similar, mirror what `auth/usecases/*` tests
  already use). For pure entity invariants, instantiate directly without TestBed.
- **DI child container per suite:** `testContainer = container.createChildContainer()` +
  `await testBed.reset()` in `beforeEach`.
- **Given helpers home:** verify whether polyglot has `tests/support/given/` (mirroring medscall)
  or inlines fixtures. Add P11-required helpers (`givenGoal`, `givenStore`, `givenOrder`,
  `givenAdSpend`, `givenProductCost`, `givenFxRate`) at whichever location the existing tests
  use. Helpers seed **via repositories, not via use cases** (CLAUDE.md "Given helpers").
- **Migrations:** Drizzle schemas live in `packages/contracts/db/schema/`. `bkdash_analytics.ts`
  is **already authored** — no schema file to write in this sub-plan. Run
  `bun run drizzle:generate` (or whatever the polyglot script is named) only if the migration
  hasn't been generated yet from the existing schema; otherwise the migration ships with iter 42.

---

## Architectural decisions absorbed up-front (so /build does not re-decide)

1. **Goal aggregate lives in a new `analytics` BC, not in `ui`.** Per CLAUDE.md "First-Class
   Citizens", aggregates with identity, invariants, and domain events require a write-side BC.
   The BC name is `analytics` (singular, matches spec "BC9 Analytics" and master-plan label
   `P11-ANALYTICS`). The folder lives at `packages/api/typescript/src/analytics/`.

2. **Reads also live in `analytics`, under `queries/`.** Polyglot has no BK-Dash `ui` BC. Spec
   §BC9 explicitly says Analytics "owns the read-side of the entire system" — so the entire
   §7.9 read catalog (T30–T36) lives in `analytics/queries/` (use cases) +
   `analytics/controllers/` (HTTP exposure, same barrel as the C49–C52 command controllers).
   Cross-BC Drizzle JOINs from query use cases are allowed (per `/query` SKILL "Cross-context
   query" pattern). What is forbidden across BCs is **entity import** — not table read.

3. **`FxRateService` colocation.** The service that turns `MonetaryByCurrency` into a
   `MonetaryAmount` in a Store's reporting currency lives in
   `packages/api/typescript/src/analytics/services/FxRateService.ts` and is registered in
   `analytics/registry.ts`. It is **read-only against `finance.fx_rates`** (owned by P9). Query
   use cases inject it. Avoids `analytics` importing a service from `finance` and avoids `finance`
   exposing a public surface for FX lookup beyond the table. See `# QUESTION: Q1`.

4. **Reporting-currency resolution.** Every read accepts `storeIds: string[]`. The
   `reportingCurrency` on the output is resolved as: if `storeIds.length === 1`, use that store's
   `reportingCurrency` from `tenancy.store_preferences`; if `storeIds.length > 1`, use the
   `reportingCurrency` of `storeIds[0]` (deterministic) and convert everything else to it. The
   native per-currency map (`MonetaryByCurrency`) is always emitted alongside the converted scalar
   (`*InReportingCurrency`) so the UI shows the breakdown. See `# QUESTION: Q2`.

5. **`forcePaidOrders` semantics.** When `true`, every revenue/order-count read filters
   `paymentStatus IN ('PAID', 'PARTIALLY_PAID', 'AUTHORIZED')`. When `false`/`undefined`, all
   statuses included **except** `VOIDED`. Enforced via a shared
   `paidOrderFilter(forcePaidOrders, paymentStatusCol)` helper in
   `packages/api/typescript/src/analytics/queries/_helpers/orderFilters.ts` so every read uses the
   exact same predicate.

6. **Admin endpoints (T35, T36).** Use a dedicated middleware `AdminSecretMiddleware` in
   `packages/api/typescript/src/analytics/middlewares/AdminSecretMiddleware.ts` that compares the
   `x-admin-secret` request header against `Config.ADMIN_SECRET`. Throws
   `BaseError<AnalyticsInterfaceErrors>('ADMIN_SECRET_INVALID')` on mismatch (401). T35/T36
   controllers opt out of any session middleware via `skipMiddlewares` and opt in to
   `AdminSecretMiddleware`. **`Config.ADMIN_SECRET` must be added** (verify exact location of the
   polyglot `Config` object — most likely `packages/api/typescript/core/src/utils/Config.ts`; if
   absent, add it there) and `.env.example` updated.

7. **Cache-invalidation handlers — stubs in this iteration.** Spec §BC9 explicitly says no
   materialized read models in this iteration. The handlers exist in
   `analytics/handlers/external.ts` so the wiring is present (the integration-event subscriptions
   are declared), but each handler body is a structured TODO. See `# QUESTION: Q3`.

8. **Goal aggregate aligns to spec §4 BC9 line 868 (iter-43.6c triage).** Earlier iterations
   carried four invented columns (`userId`, `frequency`, `isActive`, `progressFraction`) and
   dropped two spec-required ones (`storeIntegrationId`, `disabledAt`). Iter-43.6c migrations
   0015+0016 fix this. The aggregate now has: `id`, `storeId`, `storeIntegrationId?`, `type`,
   `targetAmount` (= `targetAmountCents` + `targetCurrency`), `startDate`, `endDate` (NOT NULL),
   `disabledAt?`, `createdAt`. `DeleteGoal` (C51) sets `disabledAt = new Date()`.
   `DuplicateLastGoal` (C52) reads the most recent active goal for `(storeId, storeIntegrationId?)`
   (no user filter — Goal is store-owned) and shifts `startDate` to `previous.endDate + 1 day`
   per spec line 893. Because `endDate` is now NOT NULL, the previous `GOAL_HAS_NO_END_DATE`
   guard is no longer needed and is removed from the errors glossary.

9. **`GOAL_LOCKED` rule.** Per spec C50: "Cannot change `type` or `startDate` of a Goal that has
   already begun." `UpdateGoal` per §7.9 only accepts `targetAmount` and `endDate`, so the check
   is structural — Zod prevents `type`/`startDate` in the input. The error code stays in the
   glossary for future-proofing; the Goal entity carries a defensive `Goal.changeType()` /
   `Goal.changeStartDate()` that throws `GOAL_LOCKED` when `startDate <= now`. Single entity test
   asserts both throw.

---

## Phase 0 — Contract Lock (no behavior change; types frontend consumes)

These tasks define the schemas/types every later task references. Land first so the SDK contract
is stable.

---

## Task 1: Analytics bounded context skeleton

**Files:**
- Create: `packages/api/typescript/src/analytics/controllers/index.ts` (empty barrel)
- Create: `packages/api/typescript/src/analytics/entities/index.ts`
- Create: `packages/api/typescript/src/analytics/enums/index.ts` (re-export the four enums from
  `@template/contracts-typescript/wire` — `GoalType`, `AnalyticsFrequency`, `ChartType`, `TimezoneMode` —
  if polyglot doesn't auto-export them under a stable path, add this BC's barrel as the single
  resolution point so consumer files have one import line)
- Create: `packages/api/typescript/src/analytics/errors/index.ts`
- Create: `packages/api/typescript/src/analytics/events/index.ts`
- Create: `packages/api/typescript/src/analytics/handlers/internal.ts` (`export default {}` — empty)
- Create: `packages/api/typescript/src/analytics/handlers/external.ts` (`export default {}` — empty)
- Create: `packages/api/typescript/src/analytics/middlewares/index.ts`
  (`export default []` matching `auth/middlewares/index.ts`)
- Create: `packages/api/typescript/src/analytics/objects/index.ts`
- Create: `packages/api/typescript/src/analytics/repositories/index.ts`
- Create: `packages/api/typescript/src/analytics/services/index.ts`
- Create: `packages/api/typescript/src/analytics/usecases/index.ts`
- Create: `packages/api/typescript/src/analytics/queries/index.ts` (read-side use case barrel)
- Create: `packages/api/typescript/src/analytics/registry.ts` —
```typescript
import './errors' // side-effect: registers analytics error codes
import type { InstanceRegistry } from '@template/core-typescript'

export const INSTANCE_REGISTRY: InstanceRegistry = {
  mock: [],
  integration: [],
  real: [],
}
```
- Create: `packages/api/typescript/src/analytics/index.ts` —
```typescript
import { BoundedContext } from '@template/core-typescript'
import * as controllers from './controllers'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { INSTANCE_REGISTRY } from './registry'

const ctx = await BoundedContext.create({
  name: 'analytics',
  controllers,
  internalHandlers,
  externalHandlers,
  registry: INSTANCE_REGISTRY,
})

export default ctx.router
```
- Modify: `packages/api/typescript/src/index.ts` — `import AnalyticsRouter from '@analytics/index'`
  and append to the `routers` array (next to `AuthRouter`, `NotificationsRouter`, `UIRouter`).
- Modify: `packages/api/typescript/tsconfig.json` (or whichever tsconfig holds the existing
  `@auth/*` alias) — add `"@analytics/*": ["src/analytics/*"]`.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context
**Depends on:** contracts iter 41 + 42 committed

- [ ] **Step 1: Write the failing test** at
      `packages/api/typescript/src/analytics/index.test.ts`:
```typescript
import { describe, expect, it } from 'bun:test'
import AnalyticsRouter from './index'

describe('analytics bounded context', () => {
  it('exposes a router', () => {
    expect(AnalyticsRouter).toBeDefined()
  })
})
```

- [ ] **Step 2: Verify failure** — `bun test packages/api/typescript/src/analytics/index.test.ts`
      → module-not-found.

- [ ] **Step 3: Hand-write the folder structure** mirroring
      `packages/api/typescript/src/auth/` (the polyglot CLI may not have a `context` verb yet —
      verify before relying on `bun cli context analytics`; otherwise hand-roll).

- [ ] **Step 4: Wire `index.ts` + `registry.ts`** per the snippets above.

- [ ] **Step 5: Wire `errors/index.ts`** with the spec §7.14 AnalyticsErrors union and the
      shipped-schema-driven additions:
```typescript
// Mirror the error-codes layering used in @template/core-typescript.
// If the framework exposes BaseDomainErrors / BaseApplicationErrors / BaseInterfaceErrors,
// extend them; otherwise declare the analytics-only codes here and register with whatever
// runtime mapper the framework provides (e.g. ErrorRegistry.register).

export type AnalyticsDomainErrors =
  | 'GOAL_LOCKED'
  | 'INVALID_TARGET_AMOUNT'
  | 'INVALID_DATE_RANGE'
// (`GOAL_HAS_NO_END_DATE` removed in iter-43.6c — `goals.end_date` is NOT NULL since
// migration 0015, so C52 always has a previous endDate to shift from.)

export type AnalyticsApplicationErrors =
  | 'GOAL_NOT_FOUND'
  | 'NO_PREVIOUS_GOAL_FOUND'
  | 'USER_NOT_FOUND'
  | 'STORE_NOT_FOUND'
  | 'STORE_NOT_ACCESSIBLE'        // multi-tenant guard (storeIds outside user membership)

export type AnalyticsInterfaceErrors = 'ADMIN_SECRET_INVALID'

export type AnalyticsInfrastructureErrors = never
```
      Register each code with the runtime mapper (status: 404 for *_NOT_FOUND,
      409 for GOAL_LOCKED, 422 for INVALID_*, 403 for STORE_NOT_ACCESSIBLE, 401 for
      ADMIN_SECRET_INVALID). **Locate the polyglot mapper before writing** — likely under
      `@template/core-typescript`'s `utils/GlobalErrorMapper` (per the `auth` ctx pattern of
      `import './errors'` side-effect registration).

- [ ] **Step 6: Verify** `bun tsc && bun lint && bun test
      packages/api/typescript/src/analytics/index.test.ts` — all green.

- [ ] **Step 7: Commit**
```bash
git add packages/api/typescript/src/analytics packages/api/typescript/src/index.ts \
        packages/api/typescript/tsconfig.json
git commit -m "feat(analytics): bootstrap BC9 Analytics on polyglot layout + error glossary (P11 Task 1)"
```

---

## Task 2: Validate `bkdashGoals` schema + migration is in place

**Files:**
- Modify (none expected — verification only): `packages/contracts/db/schema/bkdash_analytics.ts`
  ships pre-authored. Confirm `bkdashGoals` is exported from
  `packages/contracts/db/schema/index.ts` barrel (and through `@template/contracts/db` re-export).
- Create: `packages/contracts/db/schema/bkdash_analytics.test.ts` (or wherever schema smoke tests
  live in polyglot — if none, skip; do NOT invent a test home) — assert columns exist:
  `bkdashGoals.userId`, `bkdashGoals.storeId`, `bkdashGoals.type`, `bkdashGoals.frequency`,
  `bkdashGoals.targetAmountCents`, `bkdashGoals.isActive`, `bkdashGoals.progressFraction`.
- Verify: a migration file exists under `packages/contracts/db/migrations/` for the
  `bkdashGoals` table (output of `bun run drizzle:generate`). If not, run the codegen script and
  commit the generated SQL alongside Task 1 — but do NOT modify the schema file itself.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /db-modelling, /migrate
**Depends on:** Task 1

- [ ] **Step 1:** Read `packages/contracts/db/schema/bkdash_analytics.ts` (already in repo) and
      `packages/contracts/db/schema/index.ts` — confirm `bkdashGoals` is re-exported. If missing,
      add the re-export.
- [ ] **Step 2:** Locate the polyglot migration directory and confirm a migration covering
      `goals.goals` exists. If not, run the polyglot drizzle codegen and commit the SQL +
      `_journal.json` + `_meta/`.
- [ ] **Step 3:** `bun tsc && bun lint` — green.
- [ ] **Step 4: Commit** (only if anything actually changed)
```bash
git commit -m "chore(analytics): confirm bkdashGoals schema export + migration in place (P11 Task 2)"
```
      (If nothing to commit — barrel already exports, migration already present — record this in
      the progress log and skip the commit.)

---

## Task 3: Goal aggregate (entity)

**Files:**
- Create: `packages/api/typescript/src/analytics/entities/Goal.ts` —
  `AggregateRoot<typeof GoalSchema>` matching `packages/api/typescript/src/auth/entities/User.ts`
  shape. Schema fields aligned to spec §4 BC9 line 868 + the iter-43.6c migrations:
  - `storeId: string` (owning Store; spec aggregate requires NOT NULL — authorization is via
    Tenancy store-membership, not a creator FK)
  - `storeIntegrationId: string | null` (optional integration-level scope per spec C49 + T34)
  - `type: GoalType` (REVENUE | PROFIT)
  - `targetAmount: MonetaryAmount` (cents + currency — map to `targetAmountCents` +
    `targetCurrency` at the repository boundary)
  - `startDate: string` (ISO timestamptz)
  - `endDate: string` (ISO timestamptz; spec aggregate requires NOT NULL — C52 shifts
    `startDate = previous.endDate + 1 day`, so open-ended rows break that semantic)
  - `disabledAt: string | null` (spec C51 soft-delete; NULL = active)
- Invariants enforced via Zod `.refine()` + setters:
  - `targetAmount.amountCents > 0` → throw `INVALID_TARGET_AMOUNT`
  - `endDate > startDate` → throw `INVALID_DATE_RANGE`
- Static factory: `static create({ storeId, storeIntegrationId, type, targetAmount, startDate,
  endDate })` — defaults `disabledAt = null`.
- Instance methods:
  - `changeTargetAmount(amount: MonetaryAmount): void` (revalidate)
  - `changeEndDate(date: string): void` (revalidate)
  - `changeType(type: GoalType): void` — defensive guard, throws `GOAL_LOCKED` if `hasBegun()`
  - `changeStartDate(date: string): void` — defensive guard, throws `GOAL_LOCKED` if `hasBegun()`
  - `disable(now?: string): void` — sets `disabledAt = now ?? new Date().toISOString()`
  - `isDisabled(): boolean` — `disabledAt != null`
  - `hasBegun(now?: string): boolean` — `startDate <= now`
- Create: `packages/api/typescript/src/analytics/entities/Goal.test.ts` — invariant tests:
  (a) valid goal accepted; (b) zero/negative target → `INVALID_TARGET_AMOUNT`;
  (c) `endDate <= startDate` → `INVALID_DATE_RANGE`;
  (d) `changeEndDate(later)` ok / `changeEndDate(earlier)` throws;
  (e) `changeType` / `changeStartDate` throw `GOAL_LOCKED` when `hasBegun(now)`;
  (f) `disable()` sets `disabledAt` non-null and `isDisabled()` flips to true.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** Task 1; contracts wire enums (already shipped)

- [ ] RED → impl → GREEN → commit
      `feat(analytics): Goal aggregate aligned to shipped bkdashGoals schema (P11 Task 3)`.

---

## Task 4: GoalRepository — abstract + Mock + Drizzle impl

**Files:**
- Create: `packages/api/typescript/src/analytics/repositories/GoalRepository/GoalRepository.ts` —
  abstract class extending `Repository<Goal>` (per the polyglot `Repository` base from
  `@template/core-typescript`), exposing:
  - `findById(id: string, tx?): Promise<Goal | undefined>`
  - `findByStoreIds(storeIds: string[], filters: { active?: boolean }, tx?): Promise<Goal[]>`
    (for T34 — `active === true` adds `disabled_at IS NULL`; `active === false` adds
    `disabled_at IS NOT NULL`; omitted = no filter)
  - `findMostRecentByStore(storeId: string, storeIntegrationId: string | null, tx?): Promise<Goal | undefined>`
    (for C52 — scoped by integration when provided, otherwise per-store)
  - `save(goal, tx?): Promise<Goal>`
  - `delete(id, tx?): Promise<void>` (NB: in this iteration, `disable()` from the entity +
    `save()` is the canonical path — `delete` is reserved for hard delete and currently throws
    `'NOT_IMPLEMENTED'`. Document in code.)
- Create: `MockGoalRepository.ts` — in-memory Map keyed by goal id.
- Create: `DrizzleGoalRepository.ts` — imports `bkdashGoals` from `@template/contracts/db`,
  queries `goals.goals` via Drizzle, rehydrates `Goal` via `new Goal({...})`. `save` uses
  `INSERT ... ON CONFLICT (id) DO UPDATE` and `incrementVersion()` per the auth repo pattern.
  Map `Goal.targetAmount` ↔ `(targetAmountCents, targetCurrency)` columns at the boundary.
- Create: `index.ts` barrel re-exporting all three names (matches auth repo convention).
- Modify: `analytics/repositories/index.ts` → `export * from './GoalRepository'`.
- Modify: `analytics/registry.ts` — bind `{ token: GoalRepository, instance: MockGoalRepository }`
  in `mock`; `DrizzleGoalRepository` in `integration`/`real`.
- Create: `DrizzleGoalRepository.test.ts` — using the polyglot integration test bed (verify
  exact import path from existing `auth/repositories/UserRepository/Drizzle*Repository.test.ts`
  if present; otherwise mirror the `tests/support/TestBed.ts` shape). Cases:
  - save → findById round-trip
  - `disable()` + save sets `isActive=false`
  - `findActiveByUserAndStores` excludes `isActive=false`
  - `findActiveByUserAndStores` filters by `(userId, storeId ∈ storeIds OR storeId IS NULL)` and
    `(endDate IS NULL OR endDate >= today)`
  - `findMostRecentByUserAndStore` returns the row with greatest `startDate`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository, /test
**Depends on:** Task 2, Task 3

- [ ] RED → impl → GREEN → commit
      `feat(analytics): GoalRepository — abstract + Mock + Drizzle on bkdashGoals (P11 Task 4)`.

---

## Task 5: Goal domain events

**Files:**
- Create: `packages/api/typescript/src/analytics/events/GoalCreatedEvent.ts` —
```typescript
import { BaseDomainEvent, z } from '@template/core-typescript'

export const GoalCreatedEventSchema = z.domainEvent({
  goalId: z.string(),
  userId: z.uuid(),
  storeId: z.string().nullable(),
  type: z.string(),                     // GoalType enum value
  frequency: z.string(),                // AnalyticsFrequency
  targetAmountCents: z.number().int(),
  targetCurrency: z.string(),
})

export class GoalCreatedEvent extends BaseDomainEvent<typeof GoalCreatedEventSchema> {
  static override readonly name = 'analytics.goal.created' as const
  static readonly schema = GoalCreatedEventSchema
}
```
- Create: `GoalUpdatedEvent.ts` — payload includes `goalId` + `changedFields: { targetAmount?,
  endDate? }` (use a nested z.object for `changedFields`).
- Create: `GoalDeletedEvent.ts` — payload `{ goalId, userId }`.
- Modify: `analytics/events/index.ts` to re-export.
- Create: `GoalCreatedEvent.test.ts` — schema parses valid payload + rejects negative
  `targetAmountCents`.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event
**Depends on:** Task 1

- [ ] RED → impl → GREEN → commit
      `feat(analytics): GoalCreated/Updated/Deleted domain events (P11 Task 5)`.

---

## Task 6: Contract Lock — Goal command DTO schemas (C49–C52)

**Files:**
- Create: `packages/api/typescript/src/analytics/schemas/index.ts` — central re-exports of the
  four `<UseCase>Input/OutputSchema` symbols (each defined inline in its use case file, Tasks
  7–10).
- Create: `packages/api/typescript/src/analytics/schemas/contracts.test.ts` — imports the four
  Input/Output schemas from the use case files (which don't exist yet — that's fine, this test
  stays RED until Task 10 closes) and asserts the **shipped-schema-aligned** shape:
  - `CreateGoalInputSchema` → `{ userId, storeId?: string | null, type, frequency, targetAmount,
    startDate, endDate?: string | null }` (no `storeIntegrationId`)
  - `CreateGoalOutputSchema` → `{ goalId }`
  - `UpdateGoalInputSchema` → `{ goalId, targetAmount?, endDate? }`
  - `UpdateGoalOutputSchema` → `void` (or empty `{}`)
  - `DeleteGoalInputSchema` → `{ goalId }`
  - `DuplicateLastGoalInputSchema` → `{ userId, storeId?: string | null }`
  - `DuplicateLastGoalOutputSchema` → `{ goalId }`

> This task is a **CONTRACT LOCK**. Once committed, Tasks 7–10 cannot change input/output shapes
> without re-running this task.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema
**Depends on:** Task 1

- [ ] Write contract assertions test (RED until Task 10).
- [ ] Commit `feat(analytics): contract test for C49–C52 Goal command schemas (P11 Task 6)`.

---

## Task 7: CreateGoal use case (C49) + controller

**Files:**
- Create: `packages/api/typescript/src/analytics/usecases/CreateGoal.ts` — extends
  `Handler<typeof CreateGoalInputSchema, typeof CreateGoalOutputSchema>` per
  `auth/usecases/RegisterUser.ts`. Input: `{ userId, storeId?, type, frequency, targetAmount,
  startDate, endDate? }`. Validates `targetAmount.amountCents > 0`, `endDate? > startDate`.
  Wraps `withTransaction(tx, async tx => { Goal.create(...); goalRepository.save(goal, tx);
  domainEventRepository.save(new GoalCreatedEvent({...}), tx); return { goalId: goal.id.value } })`.
- Create: `packages/api/typescript/src/analytics/controllers/CreateGoal.ts` —
  POST `/analytics/goals`. Mirror `auth/controllers/GetSession.ts` shape (`.example([...])` on
  every schema; `handle(request)` returns `{ status: HttpStatusCode.CREATED, data }`).
  `userId` resolved from the session middleware (verify the polyglot session-middleware contract
  — `ctx.user` / `ctx.session` shape) so it is NOT in the HTTP body schema.
- Create: `CreateGoal.test.ts` — integration tests via TestBed: (a) happy path emits
  `GoalCreatedEvent` to outbox + persists Goal; (b) `endDate < startDate` → `INVALID_DATE_RANGE`;
  (c) `targetAmount.amountCents = 0` → `INVALID_TARGET_AMOUNT`; (d) `storeId=null` (multistore)
  is allowed.
- Modify: `analytics/usecases/index.ts` + `controllers/index.ts` to re-export.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /test
**Depends on:** Tasks 3, 4, 5, 6

- [ ] RED → impl → GREEN → commit
      `feat(analytics): C49 CreateGoal use case + controller (P11 Task 7)`.

---

## Task 8: UpdateGoal use case (C50) + controller

**Files:**
- Create: `packages/api/typescript/src/analytics/usecases/UpdateGoal.ts` — Input: `{ userId,
  goalId, targetAmount?, endDate? }`. Loads Goal via `findById`; throws `GOAL_NOT_FOUND` if
  absent. Authorization check: `goal.userId === input.userId` else throw `STORE_NOT_ACCESSIBLE`
  (or whatever the polyglot's standard auth-mismatch error is — verify). Calls
  `changeTargetAmount` / `changeEndDate` per provided fields. Persists Goal + GoalUpdatedEvent
  in transaction.
- Create: `packages/api/typescript/src/analytics/controllers/UpdateGoal.ts` —
  PATCH `/analytics/goals/:goalId`. Returns 204.
- Create: `UpdateGoal.test.ts` — (a) updates targetAmount; (b) updates endDate (including to
  `null`); (c) absent goal → `GOAL_NOT_FOUND`; (d) invalid date range → `INVALID_DATE_RANGE`;
  (e) cross-user goal → `STORE_NOT_ACCESSIBLE`.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /test
**Depends on:** Task 7

- [ ] RED → impl → GREEN → commit
      `feat(analytics): C50 UpdateGoal use case + controller (P11 Task 8)`.

---

## Task 9: DeleteGoal use case (C51) + controller

**Files:**
- Create: `packages/api/typescript/src/analytics/usecases/DeleteGoal.ts` — Input: `{ userId,
  goalId }`. Loads Goal; throws `GOAL_NOT_FOUND` if absent. Authorization on `goal.userId`.
  Calls `goal.disable()`. Persists Goal + GoalDeletedEvent in transaction.
- Create: `packages/api/typescript/src/analytics/controllers/DeleteGoal.ts` —
  DELETE `/analytics/goals/:goalId`. Returns 204.
- Create: `DeleteGoal.test.ts` — (a) soft-disables (`isActive=false`); (b) absent goal →
  `GOAL_NOT_FOUND`; (c) emits `GoalDeletedEvent`; (d) cross-user → `STORE_NOT_ACCESSIBLE`.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /test
**Depends on:** Task 7

- [ ] RED → impl → GREEN → commit
      `feat(analytics): C51 DeleteGoal use case + controller (P11 Task 9)`.

---

## Task 10: DuplicateLastGoal use case (C52) + controller

**Files:**
- Create: `packages/api/typescript/src/analytics/usecases/DuplicateLastGoal.ts` — Input: `{
  userId, storeId?: string | null }`. Calls
  `GoalRepository.findMostRecentByUserAndStore(userId, storeId)`. If null → throw
  `NO_PREVIOUS_GOAL_FOUND`. If `previous.endDate == null` → throw `GOAL_HAS_NO_END_DATE`. Copies
  `type`, `frequency`, `targetAmount` from previous. Computes `newStartDate = previous.endDate +
  1 day`; `windowLengthMs = previous.endDate - previous.startDate`; `newEndDate = newStartDate +
  windowLengthMs`. Calls `Goal.create({...})` + persists; emits `GoalCreatedEvent`.
- Create: `packages/api/typescript/src/analytics/controllers/DuplicateLastGoal.ts` —
  POST `/analytics/goals/duplicate-last`. Returns 201 with `{ goalId }`.
- Create: `DuplicateLastGoal.test.ts` — (a) duplicates with correct date shift; (b) no previous
  → `NO_PREVIOUS_GOAL_FOUND`; (c) previous with null endDate → `GOAL_HAS_NO_END_DATE`;
  (d) multistore (`storeId=null`) lookup picks the most recent multistore goal of the user.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /test
**Depends on:** Task 9

- [ ] RED → impl → GREEN → commit
      `feat(analytics): C52 DuplicateLastGoal use case + controller (P11 Task 10)`.
- [ ] After this commit, the Task 6 contract test should PASS — verify.

---

## Task 11: FxRateService (analytics application service)

**Files:**
- Create: `packages/api/typescript/src/analytics/services/FxRateService.ts` —
  `@injectable() class FxRateService` with:
  - `convert(from: MonetaryByCurrency, to: CurrencyCode, asOfDate: string): Promise<MonetaryAmount>`
  - `convertAmount(amount: MonetaryAmount, to: CurrencyCode, asOfDate: string): Promise<MonetaryAmount>`
    (single-amount convenience; identity short-circuit when `amount.currency === to`)
  Reads `finance.fx_rates` table directly via injected `DrizzleClient` and the existing
  `fx_rates_pair_start_date_idx` (per `packages/contracts/db/schema/finance.ts`). For each
  required `(fromCurrency, toCurrency)` pair, runs the canonical seek
  `WHERE from_currency = ? AND to_currency = ? AND start_date <= ? ORDER BY start_date DESC LIMIT 1`.
  Throws `BaseError<FinanceInfrastructureErrors>('FX_PROVIDER_UNAVAILABLE')` (declared in P9 —
  if not yet present at /build time, declare a local fallback
  `AnalyticsInfrastructureErrors = 'FX_RATE_UNAVAILABLE'` and add a TODO to switch to the P9
  code once P9-FINANCE lands).
- Create: `FxRateService.test.ts` via TestBed integration: (a) identity `BRL → BRL`
  short-circuit (no DB hit); (b) `BRL → USD` picks most recent rate ≤ asOfDate;
  (c) no row before asOfDate → throws FX-unavailable error; (d) multi-currency
  `MonetaryByCurrency = { BRL: X, USD: Y, EUR: Z }` converted to USD sums correctly;
  (e) negative `MonetaryByCurrency` value (refund) converts with sign preserved.
- Modify: `analytics/services/index.ts` re-export.
- Modify: `analytics/registry.ts` — bind `FxRateService` in all 3 modes.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** Task 1, contracts/db `finance.fx_rates` (shipped)

- [ ] RED → impl → GREEN → commit
      `feat(analytics): FxRateService — date-effective FX conversion for MonetaryByCurrency (P11 Task 11)`.

---

## Task 12: Shared query helpers — paidOrderFilter, dateBucket, storeIdsGuard, resolveReportingCurrency

**Files:**
- Create: `packages/api/typescript/src/analytics/queries/_helpers/orderFilters.ts` —
  `paidOrderFilter(forcePaidOrders: boolean | undefined, statusCol: PgColumn): SQL` returning a
  Drizzle predicate. Per architectural decision 5: when true → `IN ('PAID','PARTIALLY_PAID',
  'AUTHORIZED')`; when false/undef → `!= 'VOIDED'`.
- Create: `_helpers/dateBucket.ts` — `bucketStartFor(d: Date, frequency: AnalyticsFrequency,
  timezone: string): Date` + `bucketEndFor(start, frequency): Date`. Supports HOURLY / DAILY /
  WEEKLY (week starts Monday) / MONTHLY / YEARLY. For DB-side bucketing, expose a sibling
  `bucketSql(col, frequency, timezone): SQL` that uses `date_trunc` with proper tz cast.
- Create: `_helpers/storeIdsGuard.ts` — `assertStoreAccess(userId, storeIds, db): Promise<void>`
  — joins `tenancy.store_memberships` to ensure the user is a member of every requested store;
  throws `BaseError<AnalyticsApplicationErrors>('STORE_NOT_ACCESSIBLE')` otherwise.
  **Every analytics read calls this first.**
- Create: `_helpers/resolveReportingCurrency.ts` —
  `resolveReportingCurrency(storeIds, db): Promise<CurrencyCode>` — per decision 4, reads the
  `reportingCurrency` column from `tenancy.store_preferences WHERE store_id = storeIds[0]`.
  Throws `STORE_NOT_FOUND` if missing.
- Create: `orderFilters.test.ts`, `dateBucket.test.ts`, `storeIdsGuard.test.ts`,
  `resolveReportingCurrency.test.ts` — table-driven cases.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /test
**Depends on:** P2-TENANCY (`tenancy.store_memberships`, `tenancy.store_preferences`),
P6-SALES (`sales.orders.paymentStatus`)

- [ ] RED → impl → GREEN → commit
      `feat(analytics): shared query helpers — paidOrderFilter, dateBucket, storeIdsGuard, resolveReportingCurrency (P11 Task 12)`.

---

## Task 13: T30 DashboardOverview query + controller

**Files:**
- Create: `packages/api/typescript/src/analytics/queries/GetDashboardOverview.ts` — query use
  case per `/query` SKILL. Inject `DrizzleClient` + `FxRateService`. Input: `{ userId,
  dateRange: { startDate, endDate }, storeIds, storeIntegrationIds?, productIds?,
  forcePaidOrders? }`. Output exactly per spec §7.9 T30 (`reportingCurrency, revenue,
  revenueInReportingCurrency, orderCount, averageOrderValueInReportingCurrency, grossMargin,
  grossMarginInReportingCurrency, grossMarginPercent, marketingSpend,
  marketingSpendInReportingCurrency, roas, refundedRevenueInReportingCurrency,
  comparisonToPreviousPeriod: { revenueChangePercent, orderCountChangePercent,
  marketingSpendChangePercent, roasChangePercent } }`). Implementation:
  1. `assertStoreAccess(userId, storeIds, db)`.
  2. `reportingCurrency = await resolveReportingCurrency(storeIds, db)`.
  3. `Promise.all([revenueQuery, marketingQuery, refundsQuery, cogsQuery, prevRevenueQuery,
     prevOrderCountQuery, prevMarketingQuery])` — all queries are Drizzle JOINs across
     `sales.orders` ⨯ `sales.order_overrides` ⨯ `sales.order_transactions` ⨯
     `catalog.product_costs` ⨯ `marketing.ad_spends` ⨯ `finance.fees_configuration` ⨯
     `finance.taxes`. Import the tables from `@template/contracts/db`.
  4. Build `revenue: MonetaryByCurrency` map; convert to `revenueInReportingCurrency` via
     `FxRateService.convert(revenue, reportingCurrency, dateRange.endDate)`.
  5. `averageOrderValueInReportingCurrency = revenueInReportingCurrency / orderCount`
     (`{ amountCents: 0, currency: reportingCurrency }` when orderCount=0; no div-by-zero).
  6. `grossMargin = revenue − COGS − fees − taxes`; convert.
  7. `marketingSpend` summed across AUTOMATIC + MANUAL `ad_spends`; convert.
  8. `roas = revenueInReportingCurrency / marketingSpendInReportingCurrency` (0 if denom 0).
  9. `comparisonToPreviousPeriod`: same length immediately before `dateRange.startDate`; per
     spec, derive `*ChangePercent = (curr − prev) / prev * 100` (0 when prev is 0).
- Create: `packages/api/typescript/src/analytics/controllers/GetDashboardOverview.ts` —
  GET `/analytics/dashboard-overview`. Query params: `dateRange.startDate`, `dateRange.endDate`,
  `storeIds[]` (repeated param), optional `storeIntegrationIds[]`, `productIds[]`,
  `forcePaidOrders` (`z.coerce.boolean()`). `userId` from session middleware.
- Create: `GetDashboardOverview.test.ts` — (a) single-store happy path with seeded
  orders+overrides+adSpend; (b) multi-tenant scoping — `storeIds=[A,B]` where user only owns A →
  `STORE_NOT_ACCESSIBLE`; (c) `forcePaidOrders=true` excludes UNPAID; (d) previous-period delta
  correct against seeded prior period; (e) empty period returns zeros (no NaN); (f) multi-currency
  — orders in 2 currencies → `revenue` map has both, scalar converted via FxRateService.
- Modify: `analytics/queries/index.ts` + `analytics/controllers/index.ts` to re-export.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /controller, /test
**Depends on:** Tasks 11, 12; P6-SALES, P5-CATALOG, P7-MARKETING, P9-FINANCE, P2-TENANCY

- [ ] RED → impl → GREEN → commit
      `feat(analytics): T30 DashboardOverview query + controller (P11 Task 13)`.

---

## Task 14: T31 Chart query + controller — REVENUE branch

**Files:**
- Create: `packages/api/typescript/src/analytics/queries/GetChart.ts` — single query use case
  with a `switch (input.chartType)` dispatcher returning a discriminated-union output. **This
  task implements the REVENUE branch only**; Tasks 15–18 add the others (sequential — same file).
- Input per spec §7.9 T31 (`chartType, dateRange, frequency, storeIds, storeIntegrationIds?,
  productIds?, forcePaidOrders?, timezoneMode`).
- Output discriminator: when `chartType === 'REVENUE'` → `{ chartType: 'REVENUE',
  reportingCurrency, buckets: ChartSeriesPoint[] }` (`ChartSeriesPoint` per P0 — verify import
  source: TypeSpec emitted under `@template/contracts-typescript/wire` or hand-rolled in this BC's
  `objects/`).
- REVENUE branch logic: bucket orders by `bucketSql(orders.processedAt, frequency,
  timezoneFor(timezoneMode, storeIds))`; per bucket sum `total/profit/productCost/marketingCost/
  fees` per currency → `MonetaryByCurrency`; convert each to `*InReportingCurrency` via
  FxRateService. Timezone: when `UNIFIED`, use UTC (see `# QUESTION: Q4`); when `PER_STORE` with
  >1 store, plan picks each store's `store_preferences.timezone` per row before bucketing.
- Create: `packages/api/typescript/src/analytics/controllers/GetChart.ts` — GET `/analytics/chart`.
  Query params include `chartType` (`z.enum([...ChartType])`), `frequency`
  (`z.enum([...AnalyticsFrequency])`), `timezoneMode` (`z.enum([...TimezoneMode])`).
- Create: `GetChart.test.ts` — REVENUE branch only here: (a) DAILY buckets correct count for
  7-day range; (b) HOURLY for 24h; (c) multi-currency same bucket aggregated correctly.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /controller, /test
**Depends on:** Tasks 11, 12, 13

- [ ] RED → impl → GREEN → commit
      `feat(analytics): T31 Chart — REVENUE branch (P11 Task 14)`.

---

## Task 15: T31 Chart — REVENUE_PER_SHIFT branch

**Files:**
- Modify: `GetChart.ts` to handle `chartType === 'REVENUE_PER_SHIFT'`. Shifts =
  MORNING (06:00–12:00), AFTERNOON (12:00–18:00), EVENING (18:00–24:00),
  OVERNIGHT (00:00–06:00). Output: `(ChartSeriesPoint & { shiftLabel: string })[]` per shift
  per period.
- Modify: `GetChart.test.ts` to add REVENUE_PER_SHIFT cases — assert shift labels + per-shift
  bucket counts.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /test
**Depends on:** Task 14

- [ ] RED → impl → GREEN → commit
      `feat(analytics): T31 Chart — REVENUE_PER_SHIFT branch (P11 Task 15)`.

---

## Task 16: T31 Chart — SALES_PER_WEEKDAY branch

**Files:**
- Modify: `GetChart.ts` to handle `chartType === 'SALES_PER_WEEKDAY'`. Per spec §7.9: bucket =
  `{ dayOfWeek: DayOfWeek, total: MonetaryByCurrency, totalInReportingCurrency: MonetaryAmount,
  orderCount: number }`. Use `EXTRACT(DOW FROM processed_at AT TIME ZONE <tz>)` mapped to
  `DayOfWeek` (0=Sun..6=Sat — confirm enum ordering on the wire contract). Always return all 7
  buckets zero-filled.
- Modify: `GetChart.test.ts` to add SALES_PER_WEEKDAY case — all 7 days returned, multi-currency
  day-0 sums correctly.

**Agent:** backend-developer / **Skills:** /query, /test / **Depends on:** Task 15

- [ ] RED → impl → GREEN → commit
      `feat(analytics): T31 Chart — SALES_PER_WEEKDAY branch (P11 Task 16)`.

---

## Task 17: T31 Chart — SALES_PER_HOUR branch

**Files:**
- Modify: `GetChart.ts` to handle `chartType === 'SALES_PER_HOUR'`. Bucket = `{ hourOfDay: number
  (0..23), total: MonetaryByCurrency, totalInReportingCurrency: MonetaryAmount, orderCount:
  number }`. Always return 24 buckets zero-filled.
- Modify: `GetChart.test.ts` to add SALES_PER_HOUR case — hour 13 sums correctly across
  currencies, all 24 returned.

**Agent:** backend-developer / **Skills:** /query, /test / **Depends on:** Task 16

- [ ] RED → impl → GREEN → commit
      `feat(analytics): T31 Chart — SALES_PER_HOUR branch (P11 Task 17)`.

---

## Task 18: T31 Chart — SALES_PER_REGION branch (closes T31)

**Files:**
- Modify: `GetChart.ts` to handle `chartType === 'SALES_PER_REGION'`. Output: `{ chartType,
  reportingCurrency, regions: RegionBucket[] }`. Read `sales.orders.shippingAddress` jsonb (per
  shipped `sales.ts`) — extract `countryCode`, `provinceCode`, `country`, `province` via
  `jsonb_extract_path_text` to bucket per `(countryCode, stateCode)`. Per `RegionBucket`:
  `{ countryCode, stateCode?, countryName, stateName?, orderCount, revenue: MonetaryByCurrency,
  revenueInReportingCurrency: MonetaryAmount }`.
- Modify: `GetChart.test.ts` — seed orders with addresses in BR-SP, BR-RJ, US-CA; assert 3
  regions, names from address payload.

**Agent:** backend-developer / **Skills:** /query, /test / **Depends on:** Task 17

- [ ] RED → impl → GREEN → commit
      `feat(analytics): T31 Chart — SALES_PER_REGION closes T31 (P11 Task 18)`.

---

## Task 19: T32 ProductPerformanceReport query + controller

**Files:**
- Create: `packages/api/typescript/src/analytics/queries/GetProductPerformanceReport.ts` —
  paginated. Input per spec §7.9 T32 (`dateRange, storeIds, storeIntegrationIds?, productIds?,
  forcePaidOrders?, sortBy ∈ {'revenue','profit','unitsSold','margin'}, sortOrder, page,
  limit`). Output: `{ total, reportingCurrency, items: [{ productId, productTitle, unitsSold,
  revenue, revenueInReportingCurrency, cogs, cogsInReportingCurrency, attributedAdSpend,
  attributedAdSpendInReportingCurrency, profit, profitInReportingCurrency, marginPercent }] }`.
- Joins: `sales.orders` ⨯ `sales.order_lines` ⨯ `catalog.products` ⨯ `catalog.product_costs`
  (for COGS, resolve `options[]` matched by `(currency, country?, startDate, endDate?)` effective
  on `order.processedAt`, then resolve `items[].variantsHash`) ⨯ `marketing.ad_spends` ⨯
  `marketing.campaign_product_bindings` (for `attributedAdSpend` — split AdSpend equally across
  bound productIds; see `# QUESTION: Q5`).
- When `product_costs` has no matching option: `cogs = 0` + add a TODO comment; do NOT throw.
- For pagination/sort utilities: if `@template/core-typescript` exposes
  `z.paginatedQuery`/`z.paginatedResponse`, use them; otherwise hand-roll with plain Zod
  (`page: z.coerce.number().int().min(1).default(1)`, `limit: z.coerce.number().int().min(1)
  .max(200).default(50)`).
- Create: controller GET `/analytics/product-performance`.
- Create: test — (a) `sortBy=revenue DESC` ordering; (b) pagination `total` + items count;
  (c) `attributedAdSpend` split across products; (d) `marginPercent = 0` when `revenue=0`
  (no NaN).

**Agent:** backend-developer / **Skills:** /query, /controller, /test / **Depends on:** Task 12,
P5-CATALOG, P6-SALES, P7-MARKETING, P9-FINANCE

- [ ] RED → impl → GREEN → commit
      `feat(analytics): T32 ProductPerformanceReport query + controller (P11 Task 19)`.

---

## Task 20: T33 ProfitMarginReport query + controller

**Files:**
- Create: `packages/api/typescript/src/analytics/queries/GetProfitMarginReport.ts` — input per
  spec §7.9 T33 (`dateRange, storeIds, forcePaidOrders?`). Output exactly per spec
  (`reportingCurrency, revenue, revenueInReportingCurrency, deductions: { productCost,
  shippingCost, paymentFees, taxes, marketingSpend, operationalCosts, warrantyReserve },
  deductionsInReportingCurrency: { productCost, shippingCost, paymentFees, taxes, marketingSpend,
  operationalCosts, warrantyReserve }, profitInReportingCurrency, marginPercent`).
- Composition:
  - `productCost` from `catalog.product_costs`
  - `shippingCost` from `finance.fees_configuration.shippingFees` jsonb (per shipped
    `finance.ts` — sub-fees are jsonb arrays on the parent row, not child tables)
  - `paymentFees` from `finance.fees_configuration.gatewayFees` jsonb matched on
    `(paymentGateway, paymentMethod)` + per-transaction `sales.order_transactions.fees[]`
  - `taxes` from `finance.taxes` effective on `order.processedAt`
  - `marketingSpend` from `marketing.ad_spends`
  - `operationalCosts` from `finance.operational_costs` within `dateRange`
  - `warrantyReserve` from `finance.warranty_reserves`
- `profitInReportingCurrency = revenueInReportingCurrency − sum(deductions converted)`;
  `marginPercent = profit / revenue * 100` (0 when revenue 0).
- Create: controller GET `/analytics/profit-margin`.
- Create: test — (a) end-to-end with seeded all 7 deductions; (b) `marginPercent = 0` when
  `revenue=0`; (c) multi-currency conversion.

**Agent:** backend-developer / **Skills:** /query, /controller, /test / **Depends on:** Tasks 12, 19,
P9-FINANCE (all sub-tables shipped under `finance.ts`)

- [ ] RED → impl → GREEN → commit
      `feat(analytics): T33 ProfitMarginReport query + controller (P11 Task 20)`.

---

## Task 21: T34 GoalsList query + controller

**Files:**
- Create: `packages/api/typescript/src/analytics/queries/ListGoals.ts` — input `{ userId,
  active?, storeIds }`, output per spec §7.9 T34 (`items: [{ goalId, storeId,
  storeIntegrationId?, type, targetAmount, targetAmountInReportingCurrency, startDate, endDate,
  progressInReportingCurrency, progressPercent, achieved, createdAt, disabledAt? }]`).
  **Schema-shape adaptation:** the shipped `bkdashGoals` has no `storeIntegrationId` or
  `disabledAt` columns — emit `storeIntegrationId: undefined` / `disabledAt: undefined` in this
  iteration (or omit the keys; align with how the SDK consumer expects optionals). Map
  `disabled = !isActive`; if you must populate `disabledAt`, use `updatedAt` when `!isActive`.
  Document the deviation in a code comment.
- Reads `goals.goals` directly via Drizzle through `bkdashGoals` import (this is the one
  analytics-owned table; allowed because it's the BC's own table, mirrors the auth-ctx pattern of
  reading its own table from a BFF query). For each Goal: compute
  `progressInReportingCurrency` by summing realized revenue (`type==='REVENUE'`) or profit
  (`type==='PROFIT'`) within `[startDate, endDate]` for the goal's scope, converted to the
  reporting currency. `progressPercent = progress / targetAmount * 100`. `achieved = progress
  >= targetAmount`.
- Create: controller GET `/analytics/goals`. Query param `active?` (`z.coerce.boolean()`),
  `storeIds[]`.
- Create: test — (a) `active=true` filter (`isActive=true`); (b) progress computed from seeded
  orders; (c) `achieved` flag flips at target; (d) multistore goal (`storeId=null`) sums across
  `storeIds`.

**Agent:** backend-developer / **Skills:** /query, /controller, /test / **Depends on:** Tasks 4, 11, 12

- [ ] RED → impl → GREEN → commit
      `feat(analytics): T34 GoalsList query + controller (P11 Task 21)`.

---

## Task 22: T35 AdminUserLookup query + controller (admin-secret gated)

**Files:**
- Create: `packages/api/typescript/src/analytics/middlewares/AdminSecretMiddleware.ts` —
  `@injectable() class extends Middleware`. Reads `x-admin-secret` request header, compares to
  `Config.ADMIN_SECRET`, throws `BaseError<AnalyticsInterfaceErrors>('ADMIN_SECRET_INVALID')` on
  mismatch. Mirror an existing polyglot middleware (look at `auth/middlewares/AuthActorMiddleware.ts`)
  for the exact shape — what `execute(request)` returns, how headers are read.
- Modify: polyglot `Config` (verify path — likely `packages/api/typescript/core/src/utils/Config.ts`
  or `packages/api/typescript/src/shared/Config.ts`) — add `ADMIN_SECRET: string` env var.
- Modify: `.env.example` (root) — add `ADMIN_SECRET=`.
- Modify: `analytics/middlewares/index.ts` to export `AdminSecretMiddleware`.
- Create: `packages/api/typescript/src/analytics/queries/AdminUserLookup.ts` — input `{ email }`,
  output per §7.9 T35 — joins `auth.users` + `tenancy.store_memberships` +
  `billing.subscriptions` + `billing.subscription_events` (to derive `isActive`). `isActive`
  derivation: latest event of type `PAYMENT_SUCCEEDED` or `SUBSCRIPTION_REACTIVATED` after last
  `SUBSCRIPTION_CANCELLED` AND `expirationDate > now`.
- Create: `packages/api/typescript/src/analytics/controllers/AdminUserLookup.ts` —
  GET `/analytics/admin/user-lookup?email=...`. `middlewares: [AdminSecretMiddleware]`;
  `skipMiddlewares: [...]` for any default auth middleware (verify whether polyglot has
  ambient auth middleware that auto-attaches to all controllers — if not, no skip needed).
- Create: test — (a) valid secret + existing email → user; (b) invalid secret →
  `ADMIN_SECRET_INVALID` (401); (c) unknown email → `USER_NOT_FOUND` (404); (d) `isActive`
  derived correctly across event-stream variations.

**Agent:** backend-developer / **Skills:** /middleware, /query, /controller, /test
/ **Depends on:** Task 12, P1-IDENTITY, P2-TENANCY, P3-BILLING

- [ ] RED → impl → GREEN → commit
      `feat(analytics): T35 AdminUserLookup + AdminSecretMiddleware (P11 Task 22)`.

---

## Task 23: T36 AdminStoreSnapshot query + controller (admin-secret gated)

**Files:**
- Create: `packages/api/typescript/src/analytics/queries/AdminStoreSnapshot.ts` — input `{
  storeId }`, output per §7.9 T36. Joins `tenancy.stores`, `tenancy.store_preferences`,
  `tenancy.store_integrations` (with `valid`/`active`/`lastSyncAt` columns), `sales.orders`
  (last 30 days), `marketing.ad_spends` (last 30 days), `catalog.products`. Throws
  `STORE_NOT_FOUND` if storeId absent.
- Create: controller GET `/analytics/admin/store-snapshot?storeId=...` with
  `AdminSecretMiddleware`.
- Create: test — (a) returns snapshot for seeded store; (b) invalid secret → 401;
  (c) unknown storeId → 404; (d) last-30-days windowing correct (orders older than 30d excluded).

**Agent:** backend-developer / **Skills:** /query, /controller, /test / **Depends on:** Tasks 11, 12, 22

- [ ] RED → impl → GREEN → commit
      `feat(analytics): T36 AdminStoreSnapshot (admin-gated) (P11 Task 23)`.

---

## Task 24: Cross-context external handlers — cache-invalidation stubs

**Files:**
- Create: `packages/api/typescript/src/analytics/handlers/AnalyticsCacheInvalidationHandler.ts` —
  one handler class per consumed event family. Mirror the polyglot handler shape used by
  `auth/handlers/` or `notifications/handlers/` (look for `EventHandler` base or `Handler` —
  whichever polyglot uses). Each subscriber body:
```typescript
// TODO(P11.cache): When the read-cache layer lands, invalidate keys keyed on
// (storeId, dateRange, ...). For now this is a no-op stub registered so the
// integration-event wiring exists. See spec §BC9 — "No materialized read models
// are in scope for this iteration".
this.logger.debug('analytics cache invalidation skipped (no cache layer yet)', { event: event.name })
```
- Wire subscriptions in `analytics/handlers/external.ts` for the events per spec §BC9:
  - From Sales: `OrderUpdated`, `OrderOverridden`
  - From Catalog: `ProductCostCreated`, `ProductCostUpdated`, `ProductCostDeleted`
  - From Marketing: `AdSpendRecorded`, `CampaignProductBindingCreated`,
    `CampaignProductBindingRemoved`
  - From Finance: `TaxesUpdated`, `FeesConfigurationUpdated`, `OperationalCostRecorded/Updated/
    Deleted/StatusToggled`, `WarrantyReserveCreated/Updated/Deleted`, `FxRateCaptured`
  - From Tracking: `PixelEventRecorded`
  - From Integration: `StoreIntegrationDataWipeRequested`
  - From Tenancy: `StoreDisabled`
- Per MEMORY note (`givenEvent` is for cross-process boundaries): `AnalyticsCacheInvalidationHandler.test.ts`
  instantiates each event class with a valid payload and calls `handler.handle(event)`
  directly — does NOT seed `shared.events`. Assert no throw + logger called.
- **Graceful degradation:** if an event class is not yet declared at /build time (because the
  upstream sub-plan hasn't landed), subscribe only to the declared ones and leave
  `// TODO(P11.handler-wiring): subscribe to <EventName> once <PX> lands` for the rest. Do NOT
  fail the build on missing events.

**Agent:** backend-developer / **Skills:** /handler, /test / **Depends on:** Task 1; P4–P9 having
published their event classes (best effort)

- [ ] RED → impl → GREEN → commit
      `feat(analytics): external event handlers — cache-invalidation stubs (P11 Task 24)`.

---

## Task 25: SDK regen + frontend types contract verification

**Files:**
- Run: the polyglot OpenAPI emit + SDK regen scripts (verify exact names — likely
  `bun emit-openapi` + `bun sdk` or `bun run sdk:generate`; mirror what
  `packages/api/typescript/package.json` exposes).
- Verify: the generated SDK includes new hooks for every new endpoint:
  - `useCreateGoal`, `useUpdateGoal`, `useDeleteGoal`, `useDuplicateLastGoal`
  - `useGetDashboardOverview`, `useGetChart`, `useGetProductPerformanceReport`,
    `useGetProfitMarginReport`, `useListGoals`
  - `useAdminUserLookup`, `useAdminStoreSnapshot`
- Verify: every new schema (CreateGoalInputSchema, ChartOutputSchema discriminated union, etc.)
  is exported from the SDK package.
- Commit the regenerated SDK output.

**Agent:** backend-developer / **Skills:** /sdk / **Depends on:** Tasks 7–23

- [ ] Run `bun sdk` (or the polyglot equivalent). Inspect diff. Commit
      `feat(sdk): regen for P11 Analytics endpoints (P11 Task 25)`.

---

## Task 26: Flow test — Goal lifecycle + DashboardOverview read-after-write

**Files:**
- Create: `packages/api/typescript/tests/flows/analytics-goal-lifecycle.test.ts` (verify the
  polyglot flow-test home — if it's `packages/api/typescript/tests/flows/` or
  `packages/api/typescript/src/tests/flows/`, mirror existing). Process-level test:
  1. Seed `givenStore` (or whatever helper exists) + user.
  2. Seed 3 orders via `givenOrder` with `processedAt` inside a fixed dateRange.
  3. Call `CreateGoal` via TestBed pipe.
  4. Call `GetDashboardOverview` — assert revenue includes seeded orders.
  5. Call `UpdateGoal` raising the target. Call `ListGoals` — assert `progressPercent`
     reflects the new target.
  6. Call `DeleteGoal`. Call `ListGoals` with `active=false` — assert goal returned with
     `isActive=false`.

**Agent:** backend-developer / **Skills:** /test / **Depends on:** all prior P11 tasks

- [ ] Write test → run → green → commit
      `test(analytics): goal lifecycle + dashboard read-after-write flow (P11 Task 26)`.

---

## Task 27: Final Validation + AC mapping

**Files:**
- Modify: `.plans/2026-05-21-bk-dash-port.progress.md` — append a P11 section enumerating
  every spec §3 / §7.9 AC mapped to its test file path.

**Agent:** backend-developer / **Skills:** none — verification only / **Depends on:** Tasks 1–26

- [ ] **Step 1: Run full quality gates from CLAUDE.md "Quality Gates":**
```bash
bun lint && bun tsc && bun run test
bun x nx affected -t tsc lint test build --base=dev
```
All must be 0 errors / 0 failing.

- [ ] **Step 2: AC mapping** — verify each row below has a test file path. Fail the validation
      if any cell is empty.

| Spec ref | AC | Test path |
|---|---|---|
| §BC9 / §7.9 C49 | CreateGoal validates targetAmount > 0, endDate > startDate, emits GoalCreated | `packages/api/typescript/src/analytics/usecases/CreateGoal.test.ts` |
| §BC9 / §7.9 C50 | UpdateGoal partial-update, throws GOAL_LOCKED if started + type/startDate change attempt | `packages/api/typescript/src/analytics/usecases/UpdateGoal.test.ts` + `entities/Goal.test.ts` |
| §BC9 / §7.9 C51 | DeleteGoal soft-disables (isActive=false), emits GoalDeleted | `packages/api/typescript/src/analytics/usecases/DeleteGoal.test.ts` |
| §BC9 / §7.9 C52 | DuplicateLastGoal shifts startDate to previous.endDate+1, throws NO_PREVIOUS_GOAL_FOUND / GOAL_HAS_NO_END_DATE | `packages/api/typescript/src/analytics/usecases/DuplicateLastGoal.test.ts` |
| §7.9 T30 | DashboardOverview multi-tenant + per-currency aggregation + FX conversion + previous-period delta | `packages/api/typescript/src/analytics/queries/GetDashboardOverview.test.ts` |
| §7.9 T31 REVENUE | Chart REVENUE branch buckets by frequency + multi-currency | `GetChart.test.ts` (REVENUE describe) |
| §7.9 T31 REVENUE_PER_SHIFT | Chart REVENUE_PER_SHIFT shifts MORNING/AFTERNOON/EVENING/OVERNIGHT | `GetChart.test.ts` (REVENUE_PER_SHIFT describe) |
| §7.9 T31 SALES_PER_WEEKDAY | Chart SALES_PER_WEEKDAY always 7 buckets, zero-filled | `GetChart.test.ts` (SALES_PER_WEEKDAY describe) |
| §7.9 T31 SALES_PER_HOUR | Chart SALES_PER_HOUR always 24 buckets | `GetChart.test.ts` (SALES_PER_HOUR describe) |
| §7.9 T31 SALES_PER_REGION | Chart SALES_PER_REGION buckets per (countryCode, stateCode) | `GetChart.test.ts` (SALES_PER_REGION describe) |
| §7.9 T32 | ProductPerformanceReport paginated, sortable, attributedAdSpend split, multi-currency | `GetProductPerformanceReport.test.ts` |
| §7.9 T33 | ProfitMarginReport — all 7 deduction families, no NaN when revenue=0 | `GetProfitMarginReport.test.ts` |
| §7.9 T34 | GoalsList — `active` filter, progress + achieved flags | `ListGoals.test.ts` |
| §7.9 T35 | AdminUserLookup admin-gated, derives isActive from event stream | `AdminUserLookup.test.ts` |
| §7.9 T36 | AdminStoreSnapshot admin-gated, last-30-days summaries | `AdminStoreSnapshot.test.ts` |
| §BC9 events | Analytics consumes events from Sales/Catalog/Marketing/Finance/Tracking/Integration/Tenancy | `AnalyticsCacheInvalidationHandler.test.ts` |
| Multi-tenant scoping | Every read enforces `assertStoreAccess(userId, storeIds)` | `_helpers/storeIdsGuard.test.ts` + assertion in every read test |
| FX conversion | MonetaryByCurrency converted via date-effective `finance.fx_rates` | `FxRateService.test.ts` + assertion in T30/T31/T32/T33 tests |
| Reporting-currency resolution | First store's `reportingCurrency` wins on multistore | `_helpers/resolveReportingCurrency.test.ts` |
| `forcePaidOrders` | Same predicate across all reads | `_helpers/orderFilters.test.ts` + assertion in T30 test |

- [ ] **Step 3:** if every row above has a green test, commit
      `chore(plan): P11-ANALYTICS final validation — all ACs covered (P11 Task 27)`.

---

## Dependency footer

**Strictly required upstream contracts/db tables (these must exist before /build reaches the
relevant task):**
1. **Wire enums** (already shipped iter 41): `GoalType`, `AnalyticsFrequency`, `ChartType`,
   `TimezoneMode`, `CurrencyCode`, `SortOrder`, `DayOfWeek`, `PaymentStatus`, `PaymentGateway`,
   `PaymentMethod`, `FxRateSource`, `Role`, `PlanTier`, `PlanPeriod`,
   `SubscriptionEventType`, `OperationalCostCategory`, `OperationalCostPaymentStatus`,
   `OperationalCostRecurrency`, `TaxType`, `TaxDeductionType`, `ShippingCostType`,
   `CheckoutPlatform`, `OrderTransactionFeeType`. **No redefinition in this BC.**
2. **Wire object types** (shipped or shippable iter 41): `MonetaryAmount`, `MonetaryByCurrency`,
   `DateRange`, `PaginationInput`, `ChartSeriesPoint`, `RegionBucket`, `FxRate`. If any are
   missing on the wire side at /build time, hand-roll inside `analytics/objects/` as a TODO and
   raise a follow-up to promote to `packages/contracts/wire/`.
3. **Contracts DB schema** (shipped iter 42): `bkdash_analytics.ts` (`bkdashGoals`),
   `auth.ts` (`users`), `tenancy.ts` (`stores`, `store_integrations`, `store_memberships`,
   `store_preferences`), `billing.ts` (`subscriptions`, `subscription_events`),
   `catalog.ts` (`products`, `product_variants`, `product_costs`),
   `sales.ts` (`orders`, `order_overrides`, `order_lines`, `order_transactions`),
   `marketing.ts` (`ad_spends`, `campaign_product_bindings`),
   `finance.ts` (`taxes`, `fees_configuration`, `operational_costs`, `warranty_reserves`,
   `fx_rates`).

**Strictly required event classes (published by upstream BCs — read at Task 24 wiring time):**
- `OrderUpdated`, `OrderOverridden` (P6-SALES)
- `ProductCostCreated/Updated/Deleted` (P5-CATALOG)
- `AdSpendRecorded`, `CampaignProductBindingCreated/Removed` (P7-MARKETING)
- `TaxesUpdated`, `FeesConfigurationUpdated`, `OperationalCostRecorded/Updated/Deleted/
  StatusToggled`, `WarrantyReserveCreated/Updated/Deleted`, `FxRateCaptured` (P9-FINANCE)
- `PixelEventRecorded` (P8-TRACKING)
- `StoreIntegrationDataWipeRequested` (P4-INTEGRATION)
- `StoreDisabled` (P2-TENANCY)

If any of the above is not yet declared when /build reaches Task 24, subscribe only to the
events whose classes exist and leave a `# TODO(P11.handler-wiring): subscribe to <EventName>
once <PX> lands` for the rest. Do not fail the build on missing events.

---

## Notes

- Tasks 1–6 are the **Contract Lock** phase. Tasks 7–10 land Goal CRUD. Tasks 11–12 build
  shared infra. Tasks 13–23 land every read. Task 24 wires cross-context handlers (stubs).
  Tasks 25–27 close out.
- **Parallelism within P11:** after Task 12 lands, Tasks 13/19/20/21/22/23 are pairwise
  file-disjoint and can run in parallel agents. Tasks 14→15→16→17→18 are sequential (same
  `GetChart.ts` file).
- Per CLAUDE.md "Resist scope creep" — do NOT implement caching. Handlers are stubs by
  design (decision 7).
- The graph-CLI may still be broken in this monorepo per master plan caveat 2 — do NOT run
  `bun scripts/graph/cli/index.ts validate-plan` unless polyglot fixed it; rely on the
  sibling-lookup convention notes embedded in each Task.
- **Polyglot layout reminder:** every file path in this plan is rooted at
  `packages/api/typescript/src/analytics/` — never `packages/api/src/analytics/`. The TS BC
  home moved when the branch rebased onto polyglot.

---

## Open questions

# QUESTION: Q1 — FxRateService home: `analytics/services/FxRateService.ts` (this plan's
decision) or `finance/services/FxRateService.ts` (alternative)? Decision picked the consumer
side to avoid expanding the finance public surface. If a reviewer wants it in finance, move it
before Task 11 lands and update all consumer imports.

# QUESTION: Q2 — Multistore `reportingCurrency` resolution rule: this plan picks **first store
in `storeIds[0]`** (deterministic). Spec §7.9 does not specify. Alternatives: (a) the calling
user's preference (cleaner but adds an Identity dependency for every read); (b) explicit
`reportingCurrency?` input on every read (more flexible, more validation). Picked the simplest
deterministic option that ships.

# QUESTION: Q3 — Cache-invalidation handlers are stubs because no cache layer exists. Spec §BC9
explicitly says "No materialized read models are in scope for this iteration" — but it still
lists the integration events Analytics consumes. Confirm with reviewer: ship stubs (this plan),
defer wiring entirely until a cache PR lands, or treat as out-of-scope and remove from this
sub-plan?

# QUESTION: Q4 — T31 `timezoneMode = PER_STORE | UNIFIED`: when `PER_STORE` with
`storeIds.length > 1`, each order's bucket is computed in its own store's timezone before
bucketing, which means buckets aren't strictly aligned across stores. When `UNIFIED`, plan uses
UTC. Confirm the unified-timezone source (UTC vs user pref vs `storeIds[0].timezone`).

# QUESTION: Q5 — T32 `attributedAdSpend` split rule when a campaign binds N products: this
plan splits equally (`adSpend / N`). Spec doesn't specify the weighting. Alternatives: weight by
units sold, by revenue, or by a stored `weight` on `campaign_product_bindings`. Equal split
ships the simplest correct behavior; revisit when product specifies.

# RESOLVED (iter 43.6c) — Goal aggregate is now spec-aligned via migrations 0015 (ADD
`store_integration_id` + `disabled_at`; tighten `store_id` + `end_date` to NOT NULL) and
0016 (DROP `user_id`, `frequency`, `is_active`, `progress_fraction`). Task 3 (entity), Task 4
(repository — `findMostRecentByStore` replaces `findMostRecentByUserAndStore`), and the §8
divergence note all reflect the spec shape. **Ripple update PENDING** in the rest of the
plan body — sections 7/9/10 (errors glossary still lists `GOAL_HAS_NO_END_DATE`), Tasks 5–14
(use cases + queries + SDK + tests still reference `userId` / `frequency` / `isActive`).
/build agents must use the iter-43.6c-aligned Drizzle facts (lines 69-83) + §8 + Task 3 +
Task 4 as the source of truth and update each subsequent Task to match before implementing.
