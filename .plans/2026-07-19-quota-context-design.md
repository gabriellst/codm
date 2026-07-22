# Quota — generic Tier-2 bounded context (extraction from medscall) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax for tracking.
> Each Task wraps one observable behavior in an outer RED→GREEN cycle (vertical slicing). This is a
> **faithful port** from `medscall@f04e8a0f1a9fb05acce9b5d259dff02867add2c5` (`packages/api/src/quota/`),
> not a re-implementation. For every file, **open the medscall source at that pin, mirror its shape**,
> and adapt only: layout (`packages/api/src/*` → `packages/api/typescript/src/*`), framework surface
> (`@shared/types|services` → `@template/core-typescript`), schema binding
> (`@shared/db/drizzle/schema/quota` → `@template/contracts-typescript`), and genericization
> (strip medscall's product keys `UNITS`/`COLLABORATORS`/`AGENT_MESSAGES` → empty placeholder).

**Goal:** Land a generic, product-agnostic `quota` bounded context in `packages/api/typescript/src/quota/` (kernel gate + ports/governors, override ledger, entitlement port, downgrade selection, enforcement trigger) that resolves standalone with **zero product keys wired**.

**Architecture:** The kernel (`QuotaGate`, `QuotaUsageSource`, `QuotaCounter`, `ResourceGovernor`, `ResourceGovernorRegistry`, `ResourceLimitEnforcer`) names **no** quota key — it carries `Record<QuotaKey, …>` and dispatches by key. Keys, counters, and governors are a **product plug** shipped empty; a downstream product wires them at the shared merge root. billing↔quota is a **bidirectional accepted coupling**: quota's entitlement read consumes billing's `PlanRegistry`/`SubscriptionAccessDeriver`, and quota's downgrade drives billing's `ChangePlan`. The override ledger is append-only (`applyIfNew` + sum-on-read), dual-layer idempotent (L-1 `IdempotencyGuard.claim` + a `UNIQUE(idem_key)` belt).

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod, TypeSpec contracts, `@template/core-typescript`.

**Spec:** .specs/2026-07-19-quota-context-design.md
**Tasks:** 13
**Estimated minutes:** 620

---

## Prerequisites / cross-spec dependencies (READ FIRST — R-1)

quota **cannot compile in isolation**. Land these before (or alongside) this plan:

- **L-1 — IdempotencyGuard** (`shared.idempotency_keys` reuse + `IdempotencyGuard.claim/release` +
  `IdempotencyScope` enum). Consumed by T7 (`ApplyQuotaOverride`). **Trap:** reuse the dormant
  `packages/contracts/db/schema/infrastructure.ts` `idempotency_keys` table — do NOT invent a
  quota-local dedup store.
- **L-0.5 — CommandQueue (merged kernel)** — provides `withTransaction` / `saveWithOptimisticLock` /
  `DomainEventRepository` that the ports lean on. Confirmed merged.
- **billing spec (L-10 sibling)** — supplies `PlanRegistry`, `SubscriptionAccessDeriver`,
  `ChangePlan`, `SubscriptionChangedEvent`. **The three bidirectional edges (T6, T9, T10) cannot
  typecheck until billing exists.** Build the two L-10 specs together. If billing is NOT co-built,
  stub those three edges behind a thin local interface and DEFER their tests — call it out, never
  silently drop (R-1).
- **L-13 — context-boundary rail** — `packages/api/typescript/tests/architecture/context-boundary.test.ts`
  is not yet present (only `probe-discipline.test.ts` + `README.md` exist). T12 adds the billing↔quota
  exception; if L-13 has not landed when quota builds, add the exception file at L-13 time and note it.
- **T-10 — event envelope dialect** (`entityId`/`occurredAt` TypeSpec dialect) — `QuotaOverrideAppliedEvent`
  (T7) pins its shape on this. Confirm T-10 landed before freezing the event.

## Open question for user confirmation (R-3, D-1)

**Where does `QuotaKey` live, and what member ships?** Recommendation (this plan's default):
`QuotaKey` is a **frozen cross-boundary TypeSpec enum in `packages/contracts`** (Phase-0 convention),
shipped with **one documented placeholder member** (e.g. `EXAMPLE_KEY = 'example_key'` commented
"replace me per product") so `z.enum(QuotaKey)` and `Record<QuotaKey, …>` don't degenerate to `{}`
and break at construction. The alternative (mirror medscall exactly in `src/shared/enums/QuotaKey.ts`)
keeps it out of the wire contract. **Confirm the contracts placement + the single placeholder member
before running T2.** This is the sole genericization judgement call in the port.

## Domain Mapping

> New artifacts only (all net-new; barrels/wiring/tests/migrations omitted — they are covered inside
> the owning Task and are not first-class Domain Mapping rows). Context `quota` unless noted.

| # | Action | Skill | Name | Context | Story / Decision / AC |
|---|--------|-------|------|---------|------------------------|
| 1 | create | /service | QuotaGate | quota | D-3 / AC-3 |
| 2 | create | /service | QuotaUsageSource | quota | D-1 / AC-1 |
| 3 | create | /service | DefaultQuotaUsageSource | quota | D-2 / AC-1 |
| 4 | create | /service | QuotaCounter | quota | D-1 |
| 5 | create | /service | ResourceGovernor | quota | D-1 / D-7 |
| 6 | create | /service | ResourceGovernorRegistry | quota | D-1 / AC-1 |
| 7 | create | /service | DefaultResourceGovernorRegistry | quota | D-2 / AC-1 |
| 8 | create | /service | ResourceLimitEnforcer | quota | D-7 / AC-10 |
| 9 | create | /service | QuotaEntitlement | quota | D-6 / AC-9 |
| 10 | create | /service | DrizzleQuotaEntitlement | quota | D-6 / AC-9 |
| 11 | create | /service | MockQuotaEntitlement | quota | D-6 / AC-9 |
| 12 | create | /entity | QuotaOverride | quota | D-4 / AC-4 |
| 13 | create | /repository | QuotaOverrideRepository | quota | D-4 / AC-4, AC-5, AC-8 |
| 14 | create | /repository | PendingSelectionRepository | quota | D-7 / AC-10 |
| 15 | create | /usecase | ApplyQuotaOverride | quota | D-4, D-5 / AC-4, AC-5, AC-7 |
| 16 | create | /usecase | RequestDowngrade | quota | D-8 / AC-11 |
| 17 | create | /controller | ApplyQuotaOverride | quota | D-5 / AC-7 |
| 18 | create | /controller | RequestDowngrade | quota | D-8 / AC-11 |
| 19 | create | /event | QuotaOverrideAppliedEvent | quota | D-11 / AC-6 |
| 20 | create | /handler | GovernResourcesOnSubscriptionChangedHandler | quota | D-9 / AC-12 |

## Task graph (waves)

- **Phase 0 — Contract Lock:** T1 (quota pgSchema+migration), T2 (`QuotaKey` enum + `IdempotencyScope.QUOTA_OVERRIDE`). No deps — freeze first.
- **Phase 1 — behavior slices:** T3 (errors+env), T4 (kernel ports + Gate), T5 (override ledger), T6 (entitlement port), T7 (ApplyQuotaOverride vertical), T8 (enforcer + pending-selection), T9 (RequestDowngrade vertical), T10 (governance handler).
- **Phase 2 — integration/QA:** T11 (context wiring + smoke), T12 (merge-root seam + L-13 exception), T13 (Contract Lock — SDK regen).

```
T1 ─┐            T3 ─────────────┐
T2 ─┼─► T4 ─► T5 ─► T6 ─► T8 ─► T9 ─► T10 ─┐
    │    └──────► T7 ──────────────────────┼─► T11 ─► T12
    └────────────────────────────────────┘        └─► T13
```

---

## Task T1: Freeze the `quota` pgSchema + migration

**Files to write:**
- Create: `packages/contracts/db/schema/quota.ts`
- Modify: `packages/contracts/db/schema/index.ts` — add `export * from './quota'`
- Create: migration SQL under `packages/contracts/db/migrations/` (generated by `bun migrate:create`)

**Files to read:**
- `packages/contracts/db/schema/billing.ts` — column/style conventions to mirror
- `packages/contracts/db/schema/infrastructure.ts` — `idempotency_keys` (do not touch; reference only)
- medscall@f04e8a0f `packages/api/src/shared/db/drizzle/schema/quota.ts` — the source shape

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /db-modelling, /migrate
**Depends on:** (none)

### Step T1.1 — Author the `quota` pgSchema (D-10)

`packages/contracts/db/schema/quota.ts` — COMPLETE final file. New `quota` pgSchema (NOT folded into
billing). `meter`/`quota_key` are the `QuotaKey` enum stringified (`text`, typed via `$type<QuotaKey>()`):

```typescript
// packages/contracts/db/schema/quota.ts
import { pgSchema, text, integer, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import type { QuotaKey } from '../../wire/enums/QuotaKey' // adjust to the frozen T2 binding path

export const quotaSchema = pgSchema('quota')

/** Append-only override ledger. Summed on read; UNIQUE(idem_key) is the belt-and-braces dedup. */
export const quotaOverrides = quotaSchema.table('quota_overrides', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  meter: text('meter').$type<QuotaKey>().notNull(),
  delta: integer('delta').notNull(),
  idemKey: text('idem_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

/** Generic per-QuotaKey "keep" selection for grandfather-and-lock. PK (owner_id, quota_key). */
export const pendingSelections = quotaSchema.table(
  'pending_selections',
  {
    ownerId: text('owner_id').notNull(),
    quotaKey: text('quota_key').$type<QuotaKey>().notNull(),
    keptIds: jsonb('kept_ids').$type<string[]>().default([]).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  t => [primaryKey({ columns: [t.ownerId, t.quotaKey] })],
)
```

### Step T1.2 — Barrel the new module

Modify `packages/contracts/db/schema/index.ts`: append `export * from './quota'` after the existing
BC exports.

### Step T1.3 — Generate the migration

```bash
bun migrate:create
```

Expected: a new SQL migration creating schema `quota` + tables `quota_overrides` (with
`UNIQUE(idem_key)`) and `pending_selections` (composite PK). Inspect it; do not hand-edit beyond
formatting.

### Step T1.4 — Verify contracts type-check

```bash
cd packages/contracts && bun x tsc --noEmit
```
Expected: 0 errors (the `QuotaKey` import resolves once T2 lands — if T2 is not yet done, use a local
`type QuotaKey = string` placeholder and swap to the wire import in T2).

### Step T1.5 — Commit

```bash
git add packages/contracts/db/schema/quota.ts packages/contracts/db/schema/index.ts packages/contracts/db/migrations/
git commit -m "feat(contracts): quota pgSchema — overrides ledger + pending selections (Task T1)"
```

---

## Task T2: Freeze `QuotaKey` placeholder enum + `IdempotencyScope.QUOTA_OVERRIDE`

**Files to write:**
- Create: `QuotaKey` TypeSpec enum in `packages/contracts` (source `.tsp`) + regen wire binding under `packages/contracts/generated/typescript/**` / `packages/contracts/wire/enums/QuotaKey.ts`
- Modify: `IdempotencyScope` enum (L-1 surface) — add member `QUOTA_OVERRIDE`

**Files to read:**
- medscall@f04e8a0f `packages/api/src/shared/enums/QuotaKey.ts` — the source (do NOT port its `UNITS`/`COLLABORATORS`/`AGENT_MESSAGES` members)
- medscall@f04e8a0f `packages/api/src/shared/enums/IdempotencyScope.ts` — member style
- one existing contracts TypeSpec enum (e.g. a billing/tenancy enum) for the emit idiom

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /sdk
**Depends on:** (none)

> **User confirmation gate (R-3):** before writing, confirm with the user that `QuotaKey` lives in
> contracts and ships exactly **one** documented placeholder member. Do not proceed on the empty-enum
> path — an empty enum makes `z.enum(QuotaKey)`/`Record<QuotaKey,…>` degenerate to `{}`.

### Step T2.1 — Author the frozen `QuotaKey` TypeSpec enum (D-1)

Add a cross-boundary `QuotaKey` enum to the contracts TypeSpec with a **single placeholder member**,
clearly annotated. Genericization mandate: NO medscall product keys.

```
// contracts TypeSpec (illustrative — match the repo's existing enum emit idiom)
/** Product-plug quota dimension. Ships ONE placeholder — a downstream product replaces/extends. */
enum QuotaKey {
  /** REPLACE ME PER PRODUCT — example only, keeps z.enum(QuotaKey) constructible. */
  ExampleKey: "example_key",
}
```

### Step T2.2 — Add `IdempotencyScope.QUOTA_OVERRIDE` (D-11)

Add member `QUOTA_OVERRIDE` to the shared `IdempotencyScope` enum (the L-1 surface). If L-1 has not
landed, create the enum with this member and flag the L-1 dependency in the commit body.

### Step T2.3 — Regenerate contracts bindings

```bash
bun emit-openapi && bun sdk
```
(or the contracts-only codegen if it exists) — materialize the `QuotaKey` wire binding + Zod schema so
`@template/contracts-typescript` exports `QuotaKey` / `QuotaKeySchema`.

### Step T2.4 — Verify + commit

```bash
cd packages/contracts && bun x tsc --noEmit
git add packages/contracts/
git commit -m "feat(contracts): QuotaKey placeholder enum + IdempotencyScope.QUOTA_OVERRIDE (Task T2)"
```

---

## Task T3: Quota errors + `OPERATOR_API_KEY` env

**Files to write:**
- Create: `packages/api/typescript/src/quota/errors/index.ts`
- Modify: `packages/api/typescript/core/src/utils/GlobalErrorMapper.ts` — register 3 codes → HTTP status
- Modify: locale JSON (i18n keys for the 3 codes) — the app's error-translation catalog
- Modify: `packages/api/typescript/core/src/utils/Config.ts` — add `OPERATOR_API_KEY` to the env schema (Zod, optional string; the constant-time compare in T7 fails closed when unset)

**Files to read:**
- medscall@f04e8a0f `packages/api/src/quota/errors/index.ts`
- medscall@f04e8a0f `packages/api/src/quota/…` error usages (`QUOTA_LIMIT_EXCEEDED`, `RESOURCE_LOCKED_BY_PLAN`, `DOWNGRADE_SELECTION_INVALID`)
- `packages/api/typescript/core/src/utils/GlobalErrorMapper.ts` — existing entry style
- `packages/api/typescript/core/src/utils/Config.ts` — env schema shape

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /errors
**Depends on:** (none)

### Step T3.1 — Author quota errors (D-11)

`packages/api/typescript/src/quota/errors/index.ts` — COMPLETE final file. Two DomainErrors +
one ApplicationError, exported as the context's error union (mirror medscall's error-declaration idiom):

```typescript
// packages/api/typescript/src/quota/errors/index.ts
// QUOTA_LIMIT_EXCEEDED — DomainError raised by QuotaGate at a hard cap.
// RESOURCE_LOCKED_BY_PLAN — DomainError raised by the shared authorization guard when a
//   grandfather-locked resource/actor is used (owned here so billing need not import quota to raise it).
// DOWNGRADE_SELECTION_INVALID — ApplicationError raised by RequestDowngrade.
export type QuotaDomainErrors = 'QUOTA_LIMIT_EXCEEDED' | 'RESOURCE_LOCKED_BY_PLAN'
export type QuotaApplicationErrors = 'DOWNGRADE_SELECTION_INVALID'
// ...match the template's BaseError<...> declaration convention observed in a sibling errors/index.ts.
```

### Step T3.2 — Register codes in the GlobalErrorMapper

Modify `packages/api/typescript/core/src/utils/GlobalErrorMapper.ts`: add three entries with the same
status choices medscall uses — `QUOTA_LIMIT_EXCEEDED` and `RESOURCE_LOCKED_BY_PLAN` →
`HttpStatusCode.FORBIDDEN` (or medscall's exact status), `DOWNGRADE_SELECTION_INVALID` →
`HttpStatusCode.UNPROCESSABLE_ENTITY`. Add matching i18n keys to the locale catalog.

### Step T3.3 — Add `OPERATOR_API_KEY` to the env schema (D-5)

Modify `packages/api/typescript/core/src/utils/Config.ts`: add `OPERATOR_API_KEY: z.string().optional()`
(mirror medscall's `Config.env.OPERATOR_API_KEY`). The controller in T7 reads it; unset ⇒ compare fails
closed.

### Step T3.4 — Type-check + commit

```bash
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit
git add packages/api/typescript/src/quota/errors/ packages/api/typescript/core/src/utils/GlobalErrorMapper.ts packages/api/typescript/core/src/utils/Config.ts
git commit -m "feat(quota): domain/application errors + OPERATOR_API_KEY env (Task T3)"
```

---

## Task T4: Kernel ports + `QuotaGate` (hard-limit blocks, metered never blocks)

**Files to write:**
- Create: `packages/api/typescript/src/quota/services/QuotaEntitlement/QuotaEntitlement.ts` (abstract — returns `Entitlement = Record<QuotaKey, {limit: number|null; metered: boolean}>`)
- Create: `packages/api/typescript/src/quota/services/QuotaEntitlement/index.ts`
- Create: `packages/api/typescript/src/quota/services/QuotaUsageSource.ts` (abstract port)
- Create: `packages/api/typescript/src/quota/services/DefaultQuotaUsageSource.ts` (composer over `Record<QuotaKey, QuotaCounter>`)
- Create: `packages/api/typescript/src/quota/services/QuotaCounter.ts` (abstract + `countMany` batch default)
- Create: `packages/api/typescript/src/quota/services/ResourceGovernor.ts` (abstract + `lockMany`/`unlockMany`)
- Create: `packages/api/typescript/src/quota/services/ResourceGovernorRegistry.ts` (abstract)
- Create: `packages/api/typescript/src/quota/services/DefaultResourceGovernorRegistry.ts` (composer over `Record<QuotaKey, ResourceGovernor>`)
- Create: `packages/api/typescript/src/quota/services/QuotaGate.ts`
- Test: `packages/api/typescript/src/quota/services/QuotaGate.test.ts`

**Files to read:**
- medscall@f04e8a0f `packages/api/src/quota/services/{QuotaGate,QuotaUsageSource,DefaultQuotaUsageSource,QuotaCounter,ResourceGovernor,ResourceGovernorRegistry,DefaultResourceGovernorRegistry,QuotaEntitlement/QuotaEntitlement}.ts` — port verbatim
- medscall@f04e8a0f `packages/api/src/quota/services/QuotaGate.test.ts` — uses a `FixedQuotaUsageSource` double
- `packages/api/typescript/src/tenancy/services/` — a template service for the `@template/core-typescript` DI idiom

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T2, T3
**Consumes (frozen):** `QuotaKey` (+ `QuotaKeySchema`) from `@template/contracts-typescript`; `QUOTA_LIMIT_EXCEEDED` from `@quota/errors`.
**Scope fence:** DONE elsewhere — `QuotaKey` (T2), `QUOTA_LIMIT_EXCEEDED` (T3). OUT — `DrizzleQuotaEntitlement`/`MockQuotaEntitlement` impls (T6 owns them; this Task ships only the `QuotaEntitlement` **abstract**), `ResourceLimitEnforcer` (T8). Do not name any concrete quota key.
**Gate:** `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` clean AND `cd packages/api/typescript && bun test src/quota/services/QuotaGate.test.ts` green.

### Step T4.1 — Scaffold the kernel services

```bash
bun cli service quota QuotaEntitlement
bun cli service quota QuotaUsageSource
bun cli service quota DefaultQuotaUsageSource
bun cli service quota QuotaCounter
bun cli service quota ResourceGovernor
bun cli service quota ResourceGovernorRegistry
bun cli service quota DefaultResourceGovernorRegistry
bun cli service quota QuotaGate
```

### Step T4.2 — Write the failing `QuotaGate` test (AC-3)

`QuotaGate.test.ts` — port medscall's test. Instantiate `QuotaGate` with a `FixedQuotaUsageSource`
double and a seeded entitlement. Assert three behaviors:
- hard-limit key with `used >= limit` → throws `QUOTA_LIMIT_EXCEEDED` (key present in error detail).
- hard-limit key with `used < limit` → resolves.
- metered key (`metered: true`) far over its limit → resolves (never blocks).

Run `cd packages/api/typescript && bun test src/quota/services/QuotaGate.test.ts` → FAIL (module not found).

### Step T4.3 — Port the abstracts + composers (proposed files, over the scaffold)

Write each abstract/composer to match the medscall source, adapting imports to `@template/core-typescript`.
Key shapes (port verbatim, keep `Record<QuotaKey,…>` generic — **never name a key**):
- `QuotaEntitlement` (abstract): `entitlementFor(ownerId, tx?): Promise<Record<QuotaKey, {limit: number|null; metered: boolean}>>`.
- `QuotaCounter` (abstract): `count(ownerId, tx?): Promise<number>` + `countMany(ownerIds, tx?)` batch default.
- `DefaultQuotaUsageSource`: constructed from `Record<QuotaKey, QuotaCounter>`; `usage(ownerId, key, tx?)` → the key's counter or **`0`** when the key has no counter.
- `ResourceGovernor` (abstract): `list(ownerId, tx?)`, `lockMany(ids, tx?)`, `unlockMany(ids, tx?)`.
- `ResourceGovernorRegistry` (abstract) + `DefaultResourceGovernorRegistry` from `Record<QuotaKey, ResourceGovernor>`; `keys()` → `[]` when empty, `get(key)`.

### Step T4.4 — Port `QuotaGate` (D-3, proposed file over the scaffold)

`QuotaGate.assertCanPerform(ownerId, key, tx?)` — read the effective entitlement for `key`; if the key
is absent, `metered`, or `limit === null` → return (never block); else read `usage()` and throw
`QUOTA_LIMIT_EXCEEDED` (key in detail) when `used >= limit`.

### Step T4.5 — Verify green + commit

```bash
cd packages/api/typescript && bun test src/quota/services/QuotaGate.test.ts   # PASS
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit        # 0 errors
git add packages/api/typescript/src/quota/services/
git commit -m "feat(quota): kernel ports + QuotaGate (Task T4)"
```

---

## Task T5: Override ledger — `QuotaOverride` entity + atomic-ops repository

**Files to write:**
- Create: `packages/api/typescript/src/quota/entities/QuotaOverride.ts`
- Create: `packages/api/typescript/src/quota/entities/index.ts`
- Create: `packages/api/typescript/src/quota/repositories/QuotaOverrideRepository/QuotaOverrideRepository.ts` (abstract — the ops surface)
- Create: `packages/api/typescript/src/quota/repositories/QuotaOverrideRepository/DrizzleQuotaOverrideRepository.ts`
- Create: `packages/api/typescript/src/quota/repositories/QuotaOverrideRepository/MockQuotaOverrideRepository.ts`
- Create: `packages/api/typescript/src/quota/repositories/QuotaOverrideRepository/index.ts`
- Test: `packages/api/typescript/src/quota/repositories/QuotaOverrideRepository/DrizzleQuotaOverrideRepository.test.ts`

**Files to read:**
- medscall@f04e8a0f `packages/api/src/quota/entities/QuotaOverride.ts` + `repositories/QuotaOverrideRepository/*`
- medscall@f04e8a0f `packages/api/src/quota/repositories/QuotaOverrideRepository/DrizzleQuotaOverrideRepository.test.ts`
- a template ProjectionRepository (atomic-ops, no `Repository<T>` base) for the Drizzle `onConflictDoNothing` idiom

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /repository, /test
**Depends on:** T1, T2, T4
**Consumes (frozen):** `quotaOverrides` table binding from `@template/contracts-typescript`; `QuotaKey` from `@template/contracts-typescript`.
**Scope fence:** DONE elsewhere — `quota_overrides` table (T1), `QuotaKey` (T2). OUT — the `ApplyQuotaOverride` use case + audit event (T7 owns them). This Task ships ledger persistence ONLY; no `IdempotencyGuard`, no controller.
**Gate:** `cd packages/api/typescript && bun test src/quota/repositories/QuotaOverrideRepository` green AND `bun x tsc -p tsconfig.build.json --noEmit` clean.

### Step T5.1 — Scaffold entity + repository

```bash
bun cli entity quota QuotaOverride --aggregate
bun cli repository quota QuotaOverride
```

### Step T5.2 — Write the failing repository test (AC-4, AC-5, AC-8)

`DrizzleQuotaOverrideRepository.test.ts` — port medscall's suite:
- `applyIfNew` inserts once; a replay with the **same** `idemKey` is a no-op (`onConflictDoNothing`).
- `currentDelta(ownerId, meter)` returns `coalesce(sum(delta),0)::int`; two **different** keys accumulate.
- `currentDeltaMany(ownerIds, meter)` returns **every** requested owner (0 when none) — one `GROUP BY`.

Run → FAIL.

### Step T5.3 — Port `QuotaOverride` entity (D-4, proposed file)

Ledger entry `AggregateRoot` — **no invented invariants**, no state-transition methods. Props:
`ownerId`, `meter: QuotaKey`, `delta: int` (signed), `idemKey`. `id` = technical identity; `idemKey`
= business dedup identity. Zod schema is `z.instance(Id)` on the entity schema; `meter` uses
`z.enum(QuotaKey)`.

### Step T5.4 — Port the repository (D-4, proposed files)

**No `Repository<T>` base** (ProjectionRepository posture). Three methods only: `applyIfNew(override, tx?)`
(`INSERT … onConflictDoNothing({ target: idemKey })`), `currentDelta(ownerId, meter, tx?)`,
`currentDeltaMany(ownerIds, meter, tx?)`. Mirror medscall's SQL. `MockQuotaOverrideRepository` = an
in-memory twin honoring the same contracts (used by other contexts' tests).

### Step T5.5 — Verify green + commit

```bash
cd packages/api/typescript && bun test src/quota/repositories/QuotaOverrideRepository   # PASS
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit                  # 0 errors
git add packages/api/typescript/src/quota/entities/ packages/api/typescript/src/quota/repositories/QuotaOverrideRepository/
git commit -m "feat(quota): QuotaOverride ledger entity + atomic-ops repository (Task T5)"
```

---

## Task T6: Entitlement port — billing is authority (bidirectional edge)

**Files to write:**
- Create: `packages/api/typescript/src/quota/services/QuotaEntitlement/DrizzleQuotaEntitlement.ts`
- Create: `packages/api/typescript/src/quota/services/QuotaEntitlement/MockQuotaEntitlement.ts` (seedable)
- Test: `packages/api/typescript/src/quota/services/QuotaEntitlement/DrizzleQuotaEntitlement.test.ts`

**Files to read:**
- medscall@f04e8a0f `packages/api/src/quota/services/QuotaEntitlement/{DrizzleQuotaEntitlement,MockQuotaEntitlement}.ts` (+ test)
- billing spec artifacts: `PlanRegistry`, `SubscriptionAccessDeriver` (the consumed authority)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T4, T5
**Consumes (frozen):** `QuotaEntitlement` abstract (T4); `QuotaOverrideRepository.currentDelta` (T5); billing `PlanRegistry` + `SubscriptionAccessDeriver` (`@billing/objects`, `@billing/services/SubscriptionAccessDeriver`); `QuotaKey`.
**Scope fence:** DONE elsewhere — `QuotaEntitlement` abstract (T4), override repo (T5). OUT — the gate/enforcer that consume this (T4/T8). **billing edge (R-1):** if the billing spec is NOT co-built, stub `PlanRegistry`/`SubscriptionAccessDeriver` behind a thin local interface and DEFER `DrizzleQuotaEntitlement.test.ts`; ship `MockQuotaEntitlement` + its seed test now.
**Gate:** `cd packages/api/typescript && bun test src/quota/services/QuotaEntitlement` green (or the mock-only subset when billing is deferred) AND `bun x tsc -p tsconfig.build.json --noEmit` clean.

### Step T6.1 — Scaffold the two impls

```bash
bun cli service quota DrizzleQuotaEntitlement
bun cli service quota MockQuotaEntitlement
```

### Step T6.2 — Write the failing test (AC-9)

Port medscall's test, replacing product-tier fixtures (R-2) with a seeded `MockQuotaEntitlement` +
an in-test governor/counter double. Assert per key `{limit, metered}`:
- metered key (`policy.overage !== undefined`) → `limit = policy.limit + overrides.currentDelta` (null stays null).
- non-metered key → ignores overrides.
- `MockQuotaEntitlement.seed(ownerId, entitlement)` overrides the return; **unseeded owners get the generic floor** (see T6.4).

Run → FAIL.

### Step T6.3 — Port `DrizzleQuotaEntitlement` (D-6, proposed file)

Derive the effective plan via billing's `SubscriptionAccessDeriver`; for each key from billing's
`PlanRegistry` set `metered = policy.overage !== undefined`; for metered keys add
`overrides.currentDelta(ownerId, key)` to `policy.limit` (null stays null). This is the accepted
`@quota → @billing` import edge.

### Step T6.4 — Port `MockQuotaEntitlement` — GENERICIZE the floor (D-6)

Seedable via `seed(ownerId, entitlement)`. **Genericization mandate:** do NOT port medscall's product
floor (`UNITS:1`/`COLLABORATORS:1`/`AGENT_MESSAGES:50`). Ship an **empty floor** (`{}`) or a documented
one-key placeholder for unseeded owners.

### Step T6.5 — Verify green + commit

```bash
cd packages/api/typescript && bun test src/quota/services/QuotaEntitlement
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit
git add packages/api/typescript/src/quota/services/QuotaEntitlement/
git commit -m "feat(quota): entitlement port — DrizzleQuotaEntitlement (billing) + seedable Mock (Task T6)"
```

---

## Task T7: `ApplyQuotaOverride` vertical — operator-gated, dual-layer idempotent

**Files to write:**
- Create: `packages/api/typescript/src/quota/usecases/ApplyQuotaOverride.ts`
- Create: `packages/api/typescript/src/quota/usecases/index.ts`
- Create: `packages/api/typescript/src/quota/controllers/ApplyQuotaOverride.ts`
- Create: `packages/api/typescript/src/quota/controllers/index.ts`
- Create: `packages/api/typescript/src/quota/events/QuotaOverrideAppliedEvent.ts`
- Create: `packages/api/typescript/src/quota/events/index.ts`
- Test: `packages/api/typescript/src/quota/usecases/ApplyQuotaOverride.test.ts`

**Files to read:**
- medscall@f04e8a0f `packages/api/src/quota/usecases/ApplyQuotaOverride.ts` (+ test), `controllers/ApplyQuotaOverride.ts`, `events/QuotaOverrideAppliedEvent.ts`
- L-1 `IdempotencyGuard` (`claim`/`release`) + `IdempotencyScope`
- a template controller with a constant-time header compare (if any) for the `X-Operator-Key` idiom

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /event, /test
**Depends on:** T3, T5, T2
**Consumes (frozen):** `QuotaOverrideRepository.applyIfNew`/`currentDelta` (T5); `IdempotencyGuard.claim` + `IdempotencyScope.QUOTA_OVERRIDE` (L-1/T2); `Config.env.OPERATOR_API_KEY` (T3); `QuotaOverride` (T5); `QuotaKey` (T2). Event name `quota.override.applied`.
**Scope fence:** DONE elsewhere — override repo (T5), env (T3), idempotency scope (T2). OUT — no subscription-existence check (D-5); no default middleware (the operator key is the sole gate). One transaction: `claim → write override → save audit`.
**Gate:** `cd packages/api/typescript && bun test src/quota/usecases/ApplyQuotaOverride.test.ts` green AND `bun x tsc -p tsconfig.build.json --noEmit` clean.

### Step T7.1 — Scaffold the vertical

```bash
bun cli usecase quota ApplyQuotaOverride
bun cli controller quota ApplyQuotaOverride --method post
bun cli event quota QuotaOverrideApplied
```

### Step T7.2 — Write the failing use-case test (AC-4, AC-5, AC-6)

Port medscall's suite:
- one call writes the delta (readable via `currentDelta`); applies **even for an owner with no subscription** (D-5).
- two calls, **same** `idempotencyKey` → delta applied **once**, audit event saved **once**.
- two **different** keys → accumulate.
- a `QuotaOverrideAppliedEvent` audit row persists with `entityId === ownerId`, `ownerId`, payload `{ownerId, meter, delta, idempotencyKey}`.

Run → FAIL.

### Step T7.3 — Port `QuotaOverrideAppliedEvent` (D-11, T-10 envelope)

`quota.override.applied` domain event on the TypeSpec envelope dialect (`entityId`/`occurredAt`),
payload `{ownerId, meter: QuotaKey, delta, idempotencyKey}`. Confirm T-10 landed before pinning.

### Step T7.4 — Port `ApplyQuotaOverride` use case (D-4, D-5, proposed file)

Dual-layer idempotency: `IdempotencyGuard.claim(IdempotencyScope.QUOTA_OVERRIDE, key)` first, then
`repo.applyIfNew(QuotaOverride.create({...}))` (its `UNIQUE(idem_key)` is the second layer), then save
the audit event — all in **one** `UnitOfWork` transaction. No subscription guard.

### Step T7.5 — Port the operator-gated controller (D-5, proposed file)

`POST /overrides` (context-relative; full path `/quota/overrides`). Operator-only: constant-time
compare of `X-Operator-Key` against `Config.env.OPERATOR_API_KEY`, **failing closed when the secret is
unset**. **Zero default middlewares** on the quota context — the operator credential is the sole auth
(session-gating would let an owner self-grant via `body.ownerId`). InputSchema keys only
`body`/`headers`/`ctx` as the template controller shape allows.

### Step T7.6 — Write the failing controller auth test (AC-7)

Assert: missing/incorrect `X-Operator-Key` → `401 UNAUTHORIZED`; unset `OPERATOR_API_KEY` → also fails
closed; correct key → 200 + delta applied. (Colocated controller test or extend the use-case suite per
the template's controller-test convention.)

### Step T7.7 — Verify green + commit

```bash
cd packages/api/typescript && bun test src/quota/usecases/ApplyQuotaOverride.test.ts
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit
git add packages/api/typescript/src/quota/usecases/ packages/api/typescript/src/quota/controllers/ packages/api/typescript/src/quota/events/
git commit -m "feat(quota): ApplyQuotaOverride — operator-gated, dual-layer idempotent (Task T7)"
```

---

## Task T8: `ResourceLimitEnforcer` + `PendingSelectionRepository` — grandfather-and-lock

**Files to write:**
- Create: `packages/api/typescript/src/quota/services/ResourceLimitEnforcer.ts`
- Create: `packages/api/typescript/src/quota/repositories/PendingSelectionRepository/PendingSelectionRepository.ts` (abstract)
- Create: `packages/api/typescript/src/quota/repositories/PendingSelectionRepository/DrizzlePendingSelectionRepository.ts`
- Create: `packages/api/typescript/src/quota/repositories/PendingSelectionRepository/MockPendingSelectionRepository.ts`
- Create: `packages/api/typescript/src/quota/repositories/PendingSelectionRepository/index.ts`
- Test: `packages/api/typescript/src/quota/services/ResourceLimitEnforcer.test.ts`
- Test: `packages/api/typescript/src/quota/repositories/PendingSelectionRepository/DrizzlePendingSelectionRepository.test.ts`

**Files to read:**
- medscall@f04e8a0f `packages/api/src/quota/services/ResourceLimitEnforcer.ts` (+ test), `repositories/PendingSelectionRepository/*`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /repository, /test
**Depends on:** T1, T4, T6
**Consumes (frozen):** `ResourceGovernorRegistry` + `QuotaEntitlement` (T4); `pendingSelections` table binding (T1); `QuotaKey`.
**Scope fence:** DONE elsewhere — governor/entitlement abstracts (T4), pending-selections table (T1). OUT — `RequestDowngrade` (T9 writes the selection this reads) and the subscription-changed trigger (T10). **R-2:** the enforcer test uses an in-test `FakeGovernor`/`FakeCounter` double (same idiom as `QuotaGate.test.ts`'s `FixedQuotaUsageSource`) + seeded `MockQuotaEntitlement` — no product governor exists.
**Gate:** `cd packages/api/typescript && bun test src/quota/services/ResourceLimitEnforcer.test.ts src/quota/repositories/PendingSelectionRepository` green AND `bun x tsc -p tsconfig.build.json --noEmit` clean.

### Step T8.1 — Scaffold enforcer + repository

```bash
bun cli service quota ResourceLimitEnforcer
bun cli repository quota PendingSelection
```

### Step T8.2 — Write the failing enforcer test (AC-10, R-2 doubles)

With a `FakeGovernor` (list oldest-first, batch lock/unlock) + seeded `MockQuotaEntitlement`, assert:
- locks the excess using the pending selection (keeps chosen).
- defaults to oldest-N when no selection.
- tops up from oldest-first when a kept id no longer exists.
- `limit === null` (unlimited) → unlocks everything.
- clears the pending selection at the end.
- **never deletes.**

Run → FAIL.

### Step T8.3 — Port `PendingSelectionRepository` (D-7, proposed files)

Generic per-`QuotaKey` "keep" map persisted to `quota.pending_selections` (PK `(ownerId, quotaKey)`,
`keptIds jsonb`). Surface: `get(ownerId)`, `set(ownerId, quotaKey, keptIds, tx?)`, `clear(ownerId, tx?)`
(mirror medscall's exact method names). `MockPendingSelectionRepository` = in-memory twin.

### Step T8.4 — Port `ResourceLimitEnforcer` (D-7, proposed file)

`enforce(ownerId, tx?)`: for each governed key (`registry.keys()`), read entitlement limit; list
resources oldest-first; reconcile the owner's kept-selection with reality; top up oldest-first to fill
`limit`; apply **batch** lock/unlock diffs; `limit === null` → unlock everything. Clear the selection
at the end. Empty registry → the loop is a no-op (generic-context guarantee).

### Step T8.5 — Verify green + commit

```bash
cd packages/api/typescript && bun test src/quota/services/ResourceLimitEnforcer.test.ts src/quota/repositories/PendingSelectionRepository
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit
git add packages/api/typescript/src/quota/services/ResourceLimitEnforcer.ts packages/api/typescript/src/quota/repositories/PendingSelectionRepository/
git commit -m "feat(quota): ResourceLimitEnforcer + PendingSelectionRepository — grandfather-and-lock (Task T8)"
```

---

## Task T9: `RequestDowngrade` vertical — paid→paid, validate-then-write, one transaction

**Files to write:**
- Create: `packages/api/typescript/src/quota/usecases/RequestDowngrade.ts`
- Create: `packages/api/typescript/src/quota/controllers/RequestDowngrade.ts`
- Test: `packages/api/typescript/src/quota/usecases/RequestDowngrade.test.ts`

**Files to read:**
- medscall@f04e8a0f `packages/api/src/quota/usecases/RequestDowngrade.ts` (+ test), `controllers/RequestDowngrade.ts`
- billing spec `ChangePlan` use case + `PlanRegistry.isPaid`; template `AuthorizationService.assertCanOperate`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /test
**Depends on:** T6, T8
**Consumes (frozen):** `PendingSelectionRepository.set` (T8); `ResourceGovernorRegistry` list per key (T4/T8); `QuotaEntitlement`/`PlanRegistry` limits (T6); billing `ChangePlan` (`@billing/usecases/ChangePlan`); `PlanRegistry.isPaid`; `AuthorizationService.assertCanOperate`; `DOWNGRADE_SELECTION_INVALID` (T3); `QuotaKey`.
**Scope fence:** DONE elsewhere — pending-selection repo (T8), entitlement (T6), errors (T3). OUT — the enforcement that later applies the locks (T10). **billing edge (R-1):** `ChangePlan` **schedules** (does not flip now); if billing is deferred, stub `ChangePlan` behind a thin local interface and DEFER the schedule assertion, keeping the validation-rejection assertions.
**Gate:** `cd packages/api/typescript && bun test src/quota/usecases/RequestDowngrade.test.ts` green AND `bun x tsc -p tsconfig.build.json --noEmit` clean.

### Step T9.1 — Scaffold the vertical

```bash
bun cli usecase quota RequestDowngrade
bun cli controller quota RequestDowngrade --method post
```

### Step T9.2 — Write the failing test (AC-11)

Port medscall's suite:
- →FREE target (`!PlanRegistry.isPaid`) → `DOWNGRADE_SELECTION_INVALID`, **no** schedule, **no** stored selection.
- invalid keep-selection (a kept id not in `owned`, or over the target limit) → `DOWNGRADE_SELECTION_INVALID`, nothing written.
- valid request → drives `ChangePlan` (scheduled) **and** persists the keep-selection in **one transaction**; returns `{effectiveAtPeriodEnd}`.

Run → FAIL.

### Step T9.3 — Port `RequestDowngrade` use case (D-8, proposed file)

Reject →FREE (route through cancellation instead). Validate every key's kept-selection against `owned`
(governor list, owner's own seat excluded) and the target plan's limit. Only after all keys pass, drive
billing's `ChangePlan` **and** persist the selection — same transaction, so a rejected selection leaves
neither a schedule nor a stored selection.

### Step T9.4 — Port the session-gated controller (D-8, proposed file)

`POST /subscription/downgrade` (full path `/quota/subscription/downgrade`). Session-gated via
`AuthorizationService.assertCanOperate` (contrast T7's operator gate). InputSchema `body` carries target
plan + per-key keep-selection.

### Step T9.5 — Verify green + commit

```bash
cd packages/api/typescript && bun test src/quota/usecases/RequestDowngrade.test.ts
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit
git add packages/api/typescript/src/quota/usecases/RequestDowngrade.ts packages/api/typescript/src/quota/controllers/RequestDowngrade.ts
git commit -m "feat(quota): RequestDowngrade — paid→paid, validate-then-write (Task T9)"
```

---

## Task T10: `GovernResourcesOnSubscriptionChangedHandler` — one-line enforcement trigger

**Files to write:**
- Create: `packages/api/typescript/src/quota/handlers/GovernResourcesOnSubscriptionChangedHandler.ts`
- Create: `packages/api/typescript/src/quota/handlers/external.ts`
- Create: `packages/api/typescript/src/quota/handlers/internal.ts` (empty)
- Test: `packages/api/typescript/src/quota/handlers/GovernResourcesOnSubscriptionChangedHandler.test.ts`

**Files to read:**
- medscall@f04e8a0f `packages/api/src/quota/handlers/{GovernResourcesOnSubscriptionChangedHandler,external,internal}.ts` (+ test)
- billing spec `SubscriptionChangedEvent` (thin cross-context event, carries `ownerId`)
- a template `handlers/external.ts` for the registration idiom

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler, /test
**Depends on:** T8
**Consumes (frozen):** `ResourceLimitEnforcer.enforce` (T8); billing `SubscriptionChangedEvent` (`@billing/events`), payload `{ownerId}`.
**Scope fence:** DONE elsewhere — the enforcer (T8). OUT — enforcer internals (the handler re-queries current entitlement via the enforcer; stays one line). `internal.ts` is empty (external-only). **billing edge (R-1):** if billing is deferred, subscribe to a locally-declared `SubscriptionChangedEvent` shape and DEFER the wiring test.
**Gate:** `cd packages/api/typescript && bun test src/quota/handlers/GovernResourcesOnSubscriptionChangedHandler.test.ts` green AND `bun x tsc -p tsconfig.build.json --noEmit` clean.

### Step T10.1 — Scaffold the handler

```bash
bun cli handler quota GovernResourcesOnSubscriptionChanged
```

### Step T10.2 — Write the failing test (AC-12)

Assert the external handler, on `SubscriptionChangedEvent`, calls `enforcer.enforce(event.payload.ownerId)`
exactly once. Run → FAIL.

### Step T10.3 — Port the handler + registration (D-9, proposed files)

`handle(event)` → `enforcer.enforce(event.payload.ownerId)`. Export it from `handlers/external.ts`
(subscribes to the one event); `handlers/internal.ts` exports nothing (empty). Subscribes to **exactly
one** event (determinism D-3).

### Step T10.4 — Verify green + commit

```bash
cd packages/api/typescript && bun test src/quota/handlers/GovernResourcesOnSubscriptionChangedHandler.test.ts
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit
git add packages/api/typescript/src/quota/handlers/
git commit -m "feat(quota): GovernResourcesOnSubscriptionChanged enforcement trigger (Task T10)"
```

---

## Task T11: Context wiring — standalone resolution + smoke test

**Files to write:**
- Create: `packages/api/typescript/src/quota/index.ts` (`BoundedContext.create({ name: CONTEXTS.quota, … })`)
- Create: `packages/api/typescript/src/quota/registry.ts` (`INSTANCE_REGISTRY` mock/integration/real + empty placeholders)
- Create: `packages/api/typescript/src/quota/enums/index.ts` (empty barrel)
- Create: `packages/api/typescript/src/quota/middlewares/index.ts` (empty — zero middlewares, D-5)
- Modify: `packages/api/typescript/src/shared/contexts.ts` — add `quota` to `CONTEXTS`
- Modify: `packages/api/typescript/src/routers.ts` — import `QuotaRouter`, add to `ROUTERS` (`satisfies Record<ContextModule, Router>`)
- Test: `packages/api/typescript/src/quota/quota.smoke.test.ts`

**Files to read:**
- medscall@f04e8a0f `packages/api/src/quota/{index,registry}.ts`
- `packages/api/typescript/src/tenancy/{index,registry}.ts` — the template `BoundedContext.create` + `INSTANCE_REGISTRY` shape
- `packages/api/typescript/src/shared/contexts.ts`, `packages/api/typescript/src/routers.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context, /test
**Depends on:** T4, T5, T6, T7, T8, T9, T10
**Consumes (frozen):** every quota token — `QuotaGate`, `ResourceLimitEnforcer`, `QuotaEntitlement`, `QuotaUsageSource`, `ResourceGovernorRegistry`, `QuotaOverrideRepository`, `PendingSelectionRepository`; controllers `ApplyQuotaOverride`/`RequestDowngrade`; handler `external.ts`; `CONTEXTS` (`@shared/contexts`); `ContextModule`/`Router` (`@template/core-typescript`). Sibling shape: `packages/api/typescript/src/tenancy/{index,registry}.ts`.
**Scope fence:** DONE elsewhere — all context artifacts (T4–T10). OUT — merge-root seam + L-13 rail (T12), SDK regen (T13). The two placeholder bindings are load-bearing: `DefaultQuotaUsageSource({})` and `DefaultResourceGovernorRegistry({})` (D-2) — empty maps so the context resolves with zero product keys.
**Gate:** `cd packages/api/typescript && bun test src/quota/quota.smoke.test.ts` green AND `bun x tsc -p tsconfig.build.json --noEmit` clean.

### Step T11.1 — Register the context name (AC-2)

Modify `packages/api/typescript/src/shared/contexts.ts`: add `quota: 'quota'` to the `CONTEXTS` object
(gives a `/quota` router prefix + `quota` OpenAPI tag; controllers declare context-relative subpaths
`/overrides`, `/subscription/downgrade`). This makes `ContextModule` include `quota`, which forces the
`routers.ts` `satisfies` check.

### Step T11.2 — Author `registry.ts` with empty placeholders (D-2)

`INSTANCE_REGISTRY` with `mock`/`integration`/`real` keys (adapt medscall's DI triple to the template's
shape — mirror `src/tenancy/registry.ts`). The two load-bearing bindings:

```typescript
// placeholder usage-source — empty counters ⇒ usage() always 0 (a key with no counter can't be over-used)
{ token: QuotaUsageSource, useFactory: () => new DefaultQuotaUsageSource({}) }
// placeholder governor-registry — keys() === [] ⇒ enforcer.enforce loop is a no-op
{ token: ResourceGovernorRegistry, useFactory: () => new DefaultResourceGovernorRegistry({}) }
```

Bind `QuotaEntitlement` → `DrizzleQuotaEntitlement` (real/integration) / `MockQuotaEntitlement` (mock);
`QuotaOverrideRepository`, `PendingSelectionRepository`, `QuotaGate`, `ResourceLimitEnforcer` to their
impls per environment.

### Step T11.3 — Author `index.ts` (AC-2)

```typescript
// packages/api/typescript/src/quota/index.ts — COMPLETE final file
import { BoundedContext } from '@template/core-typescript'
import { CONTEXTS } from '@shared/contexts'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'

const ctx = await BoundedContext.create({
  name: CONTEXTS.quota,
  controllers,
  internalHandlers,
  externalHandlers,
  registry: INSTANCE_REGISTRY,
})

export default ctx.router
```

### Step T11.4 — Wire the router (AC-2)

Modify `packages/api/typescript/src/routers.ts`: `import QuotaRouter from '@quota/index'` and add
`quota: QuotaRouter,` to the `ROUTERS` object (the `satisfies Record<ContextModule, Router>` now requires
it — a compile error until added). Confirm the `@quota/*` path alias exists in the workspace tsconfig;
add it if missing (mirror `@tenancy/*`).

### Step T11.5 — Write the smoke test (AC-1)

`quota.smoke.test.ts` — port medscall's container-resolution proof. Resolve every quota token
(`QuotaGate`, `ResourceLimitEnforcer`, `QuotaEntitlement`, `PendingSelectionRepository`,
`QuotaOverrideRepository`) through the production registration path, **with zero product keys wired**.
Assert each resolves non-null.

### Step T11.6 — Verify green + commit

```bash
cd packages/api/typescript && bun test src/quota/quota.smoke.test.ts
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit
git add packages/api/typescript/src/quota/index.ts packages/api/typescript/src/quota/registry.ts packages/api/typescript/src/quota/enums/ packages/api/typescript/src/quota/middlewares/ packages/api/typescript/src/quota/quota.smoke.test.ts packages/api/typescript/src/shared/contexts.ts packages/api/typescript/src/routers.ts
git commit -m "feat(quota): context wiring + standalone smoke test (Task T11)"
```

---

## Task T12: Merge-root extension seam + L-13 billing↔quota boundary exception

**Files to write:**
- Modify: `packages/api/typescript/src/shared/registry.ts` — document the EMPTY extension seam (NOT wired)
- Modify (or Create if L-13 pending): `packages/api/typescript/tests/architecture/context-boundary.test.ts` — add the billing↔quota `CONTEXT_IMPORT_EXCEPTIONS` entry

**Files to read:**
- medscall@f04e8a0f `packages/api/src/shared/registry.ts` (the real merge-root override — the template ships it EMPTY)
- medscall@f04e8a0f `packages/api/src/quota/context-boundary.test.ts`
- `packages/api/typescript/tests/architecture/README.md` + `probe-discipline.test.ts` — the rail idiom

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context, /review
**Depends on:** T11
**Consumes (frozen):** `CONTEXTS.quota` (T11); the L-13 `CONTEXT_IMPORT_EXCEPTIONS` array + manifest-derived boundary rail; medscall's merge-root override as the reference for what the template deliberately OMITS.
**Scope fence:** DONE elsewhere — context resolves standalone (T11). OUT — actually wiring product counters/governors (that is the downstream product's job; the template ships the seam empty). The seam is a documented comment, not code.
**Gate:** `cd packages/api/typescript && bun test tests/architecture/context-boundary.test.ts` green (the billing↔quota exception recognized) AND `bun x tsc -p tsconfig.build.json --noEmit` clean.

### Step T12.1 — Document the empty merge-root seam (D-1)

Modify `packages/api/typescript/src/shared/registry.ts`: add a comment block marking where a downstream
product overrides `QuotaUsageSource`/`ResourceGovernorRegistry` with its real per-key maps
(`{ [PRODUCT_KEY]: ProductCounter, … }`). **Ship NO override** — the template leaves the quota context's
own empty defaults (T11) in place. This is the single genericization seam.

### Step T12.2 — Declare the L-13 boundary exception (D-12)

Add the **single** billing↔quota entry to `CONTEXT_IMPORT_EXCEPTIONS` in
`tests/architecture/context-boundary.test.ts`, sanctioning exactly three edges: (1) `@billing` imports
`@quota/*`; (2) `DrizzleQuotaEntitlement` reads `PlanRegistry` + `SubscriptionAccessDeriver`;
(3) `RequestDowngrade` drives `ChangePlan`. The quota-side boundary array does **not** list `@billing/`
as forbidden. **If L-13 has not landed**, add this exception at L-13 build time and note the dependency
here (do not fabricate the rail).

### Step T12.3 — Verify green + commit

```bash
cd packages/api/typescript && bun test tests/architecture/context-boundary.test.ts
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit
git add packages/api/typescript/src/shared/registry.ts packages/api/typescript/tests/architecture/context-boundary.test.ts
git commit -m "feat(quota): empty merge-root seam + billing↔quota boundary exception (Task T12)"
```

---

## Task T13: Contract Lock — SDK regen for the two quota controllers

**Files to write:**
- Regen: `packages/api/typescript/src/api/openapi.json`
- Regen: `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T7, T9, T11
**Consumes (frozen):** the two frozen controller contracts — `POST /quota/overrides` (`ApplyQuotaOverride`, operator-key) and `POST /quota/subscription/downgrade` (`RequestDowngrade`, session) — with their Zod input/output schemas.
**Scope fence:** DONE elsewhere — controllers (T7, T9), router wiring (T11). OUT — any controller/schema change (regen only, no hand-edits to generated output). Regen paths are never scaffolded.
**Gate:** `bun sdk` succeeds AND `git diff --stat` shows `openapi.json` + `packages/client/dist/` changed with the two new operations AND `bun tsc` clean across workspaces.

### Step T13.1 — Regenerate OpenAPI + SDK

```bash
bun emit-openapi && bun sdk
```

### Step T13.2 — Verify regen surfaced both endpoints

```bash
git diff --stat packages/client/dist/ packages/api/typescript/src/api/openapi.json
```
Expected: `openapi.json` changed; `packages/client/dist/` gains operations/hooks for
`/quota/overrides` and `/quota/subscription/downgrade`.

### Step T13.3 — Type-check after regen

```bash
bun tsc
```
Expected: 0 errors across all workspaces.

### Step T13.4 — Commit

```bash
git add packages/api/typescript/src/api/openapi.json packages/client/dist/
git commit -m "chore(sdk): regenerate openapi+sdk for quota controllers (Task T13)"
```

---

## Final Validation

Run after all Tasks complete. Each item maps to an AC (and the test that asserts it):

- [ ] **AC-1** — `cd packages/api/typescript && bun test src/quota/quota.smoke.test.ts` resolves every quota DI token with zero product keys wired (T11).
- [ ] **AC-2** — `CONTEXTS.quota` registered; `src/quota/index.ts` composes via `BoundedContext.create({ name: CONTEXTS.quota, … })` with `registry: INSTANCE_REGISTRY`; `routers.ts` `satisfies` check passes (T11).
- [ ] **AC-3** — `bun test src/quota/services/QuotaGate.test.ts`: hard-limit rejects at `used >= limit` (`QUOTA_LIMIT_EXCEEDED`), allows under limit, metered never blocks (T4).
- [ ] **AC-4** — `bun test src/quota/usecases/ApplyQuotaOverride.test.ts` + repo test: delta written to `quota.quota_overrides`, readable via `currentDelta`; applies with no subscription (T5, T7).
- [ ] **AC-5** — same suites: same `idempotencyKey` applies once + saves audit once; different keys accumulate (T7).
- [ ] **AC-6** — `QuotaOverrideAppliedEvent` audit row with `entityId === ownerId`, payload `{ownerId, meter, delta, idempotencyKey}` (T7).
- [ ] **AC-7** — controller test: `POST /quota/overrides` requires `X-Operator-Key` (constant-time, fails closed when `OPERATOR_API_KEY` unset) → `401 UNAUTHORIZED` otherwise; no session/middleware gate (T7).
- [ ] **AC-8** — repo test: `currentDeltaMany` returns every requested owner (0 when none) (T5).
- [ ] **AC-9** — `bun test src/quota/services/QuotaEntitlement`: per-key `{limit, metered}`; metered limit = plan limit + override delta (null stays null); `seed` overrides; unseeded → generic floor (T6).
- [ ] **AC-10** — `bun test src/quota/services/ResourceLimitEnforcer.test.ts`: locks excess via selection, oldest-N default, tops up on missing kept id, unlocks on raised limit, clears selection, never deletes (T8).
- [ ] **AC-11** — `bun test src/quota/usecases/RequestDowngrade.test.ts`: rejects →FREE + invalid selection (`DOWNGRADE_SELECTION_INVALID`, no schedule/selection); valid → `ChangePlan` scheduled + selection persisted in one tx → `{effectiveAtPeriodEnd}` (T9).
- [ ] **AC-12** — `bun test src/quota/handlers/GovernResourcesOnSubscriptionChangedHandler.test.ts`: calls `enforcer.enforce(ownerId)` on `SubscriptionChangedEvent` (T10).
- [ ] **AC-13** — `bun tsc && bun lint && bun run test && bun sdk` green; L-13 `context-boundary` rail passes with the billing↔quota exception (T12, T13).
- [ ] **Graph gates** — `bun scripts/graph/cli/index.ts validate-plan .plans/2026-07-19-quota-context-design.md` exits 0; `parse-plan … | jq '.tasks|length'` equals 13.
- [ ] **Port fidelity** — every file diffed against its `medscall@f04e8a0f` source; only layout/framework/genericization adaptations present; NO product keys (`UNITS`/`COLLABORATORS`/`AGENT_MESSAGES`) leaked; NO product floor in `MockQuotaEntitlement`.
