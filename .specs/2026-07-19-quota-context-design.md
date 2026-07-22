# Quota — generic Tier-2 bounded context (extraction from medscall) — design

> **Date:** 2026-07-19 · **Status:** Draft
> **Program item:** L-10 (quota half of the billing+quota pair) —
> `.plans/2026-07-11-ecosystem-sync-up.md` → `## Delta review — REESCRITO 2026-07-18`.
> **Extraction pin:** `medscall@f04e8a0f1a9fb05acce9b5d259dff02867add2c5` (merge of PR #85
> `feat/billing-idempotency`; working tree clean). Every file cited below is read at that pin.
> **Port doctrine:** this context is *ported faithfully* from medscall's `packages/api/src/quota/`,
> adapting layout (`packages/api/src/*` → `packages/api/typescript/src/*`; medscall `@shared/types|services`
> framework surface → template `@template/core-typescript`) and stripping medscall's product specifics
> to a generic, product-plug kernel. **Not re-implemented from scratch.**
> **Pairs with:** the billing spec (same program item L-10). billing↔quota is a **bidirectional
> accepted** coupling — the two specs are born as a coupled pair; **neither is portable without the
> other**. This document is the *quota* half.

---

## Context

The template (v1.9) has **no quota-enforcement mechanism**. What exists is
`core/src/services/PlanQuotas/PlanQuotas.ts` — a *static code table* (`PLAN_QUOTAS: Record<PlanTier,
Record<PlanFeature, PlanQuota>>` with `hasQuotaAvailable`/`hasFeature` lookups). It answers "what is
the cap?" but there is **no runtime gate** that blocks an action at the cap, **no usage counter**,
**no way to grandfather-and-lock excess resources on downgrade**, **no operator override ledger**,
and **no effective-entitlement read** that folds plan policy + overrides together. Subscription state
lives in `tenancy/Store` (`ChangeStoreSubscription`); there is no `billing` context in `src/` yet
(the billing pgSchema exists at `packages/contracts/db/schema/billing.ts`, read by tenancy's
`SubscriptionQueryService`).

medscall solved all of this with a dedicated, product-agnostic `quota` bounded context. On
2026-07-17 (medscall spec `2026-07-06-portable-billing-context.md` → `## Amendments`, commits
`a3a2766a`/`8cd69fef`) the override ledger (`QuotaOverride` + `QuotaOverrideRepository`), the
effective-entitlement read (`QuotaEntitlement`), and the `ApplyQuotaOverride` vertical were **moved
out of billing into quota**, cementing quota as the *enforcement mechanism* and billing as the
*entitlement authority*. This program (L-10) lifts that whole context into the template as a generic
Tier-2 context.

### The kernel is generic; the keys are the product plug

medscall's quota kernel names **no specific quota dimension**. The dimension vocabulary
(`QuotaKey`), the per-key **counters** (`QuotaCounter` impls), and the per-key **governors**
(`ResourceGovernor` impls) are all owned by *product* contexts (medscall: `unit` owns
`UNITS`/`COLLABORATORS`, `agent` owns `AGENT_MESSAGES`), and are wired into the kernel **only at the
shared merge root** — the one composition root that legitimately knows every context. The kernel
itself carries `Record<QuotaKey, …>` and dispatches by key without ever naming one. That is exactly
what makes it a *generic Tier-2 context*: the template ships the kernel, the ledger, and the ports;
a downstream product ships the keys, counters, and governors.

### Dependencies (must land first)

- **L-1 — IdempotencyGuard** (`shared.idempotency_keys` table + `IdempotencyGuard.claim/release` +
  `IdempotencyScope` enum). `ApplyQuotaOverride` claims `IdempotencyScope.QUOTA_OVERRIDE` before
  writing. **Trap:** reuse the dormant `shared.idempotency_keys` table (v1.9 already has it —
  `packages/contracts/db/schema/infrastructure.ts`); do not invent a quota-local dedup store.
- **L-0.5 — CommandQueue (merged)** kernel package. Not directly consumed by quota's happy path, but
  it is the pre-req that unblocks the shared transactional/kernel surface these ports lean on
  (`withTransaction`, `saveWithOptimisticLock`, `DomainEventRepository`).
- **billing spec (L-10 sibling)** — quota's `DrizzleQuotaEntitlement` reads billing's `PlanRegistry`
  + `SubscriptionAccessDeriver`; quota's `RequestDowngrade` drives billing's `ChangePlan`; quota's
  `GovernResourcesOnSubscriptionChangedHandler` reacts to billing's `SubscriptionChangedEvent`. These
  three edges cannot compile until billing exists. The two specs are built together.

---

## Problem

There is no runtime quota machinery in the template, so a product built on it cannot:

1. **Block an action at a hard limit** ("you're on FREE, you already have 1 store") — `PlanQuotas` is
   a passive table, nothing calls it as a gate at command time.
2. **Meter and bill overage** — no notion of a *metered* key that never blocks but is priced at
   period close.
3. **Grandfather + lock excess on downgrade** — when a plan tightens, existing resources over the new
   cap must be kept-but-locked (read-only), never deleted, with the owner choosing which to keep.
   Nothing does this.
4. **Grant an operator override** that actually loosens enforcement — raising an owner's effective
   limit, idempotently, auditable, independent of whether a subscription exists.
5. **Read one effective entitlement** that folds plan policy + running override delta + metered-ness
   into a single `Record<QuotaKey, {limit, metered}>` the gate and enforcer both consume.

Every one of these already exists, tested, in medscall's `quota` context. The problem is a faithful,
*genericized* port — not a redesign.

---

## Goal

Land a **generic, product-agnostic `quota` bounded context** in
`packages/api/typescript/src/quota/`, ported from `medscall@f04e8a0f`, comprising:

- **Kernel** — `QuotaGate` (tell-don't-ask assertion), `QuotaUsageSource` port +
  `DefaultQuotaUsageSource` composer, `QuotaCounter` abstract (+ batch `countMany`),
  `ResourceGovernor` abstract (+ batch lock/unlock), `ResourceGovernorRegistry` +
  `DefaultResourceGovernorRegistry`, `ResourceLimitEnforcer`.
- **Override ledger** — `QuotaOverride` aggregate (append-only ledger entry), `QuotaOverrideRepository`
  (atomic `applyIfNew`/`currentDelta`/`currentDeltaMany`), `quota.quota_overrides` table
  (`UNIQUE(idem_key)`), `ApplyQuotaOverride` use case + controller + `QuotaOverrideAppliedEvent`.
- **Entitlement port** — `QuotaEntitlement` abstract + `DrizzleQuotaEntitlement` (reads billing
  authority) + seedable `MockQuotaEntitlement`.
- **Downgrade selection** — `PendingSelectionRepository` (+ `quota.pending_selections` table),
  `RequestDowngrade` use case + controller.
- **Enforcement trigger** — `GovernResourcesOnSubscriptionChangedHandler` (external handler on
  `SubscriptionChangedEvent`).
- **Product plug points shipped EMPTY** — `QuotaKey` as a documented placeholder; the merge-root
  `QuotaUsageSource`/`ResourceGovernorRegistry` counter/governor maps ship as `{}`.

Registered as `CONTEXTS.quota` in `packages/api/typescript/src/shared/contexts.ts`, resolving in
isolation (smoke test green) with **zero product keys wired**.

---

## Decisions

> Anti-invention rule: every decision below is a property of the source at `medscall@f04e8a0f`, or a
> genericization mandate stated in the Delta review. No new behavior is invented.

### D-1 — The kernel names no quota key; keys are a product plug shipped empty

`QuotaGate`, `QuotaUsageSource`, `QuotaCounter`, `ResourceGovernor`, `ResourceGovernorRegistry`,
`ResourceLimitEnforcer` all carry `Record<QuotaKey, …>` / `key: QuotaKey` and **never name a
specific key** (verified: `QuotaGate.ts`, `DefaultQuotaUsageSource.ts`,
`DefaultResourceGovernorRegistry.ts`). The template ships this kernel verbatim.

**`QuotaKey` (`placeholder-vazio`).** In medscall it is a shared cross-boundary enum
(`shared/enums/QuotaKey.ts`: `UNITS`/`COLLABORATORS`/`AGENT_MESSAGES`) referenced by billing's
catalog, the gate, and the counters. Per Phase-0 Contract-Lock convention, in the template it belongs
in **contracts** (`packages/contracts` TypeSpec → `@template/contracts-typescript/wire/enums`) as a
frozen cross-boundary enum, but **ships as a documented placeholder** — a product replaces/extends
its members. Implementation note for `/build`: an empty TS enum makes `z.enum(QuotaKey)` and
`Record<QuotaKey, …>` degenerate to `{}` — ship **one documented placeholder member** (e.g. a
commented example key) so `QuotaKeySchema` is constructible, and mark it clearly as
"replace me per product." This is the single genericization judgement call in the port; flag it in
the plan for user confirmation.

**Merge-root maps ship empty.** medscall's `shared/registry.ts` overrides `QuotaUsageSource` and
`ResourceGovernorRegistry` at the composition root with the *real* per-key maps
(`{ [UNITS]: UnitCounter, [COLLABORATORS]: SeatCounter, [AGENT_MESSAGES]: AgentMessageCounter }`,
`{ [UNITS]: UnitGovernor, [COLLABORATORS]: SeatGovernor }`). The **generic template does not ship
that override at all** — the merge root (`packages/api/typescript/src/shared/registry.ts`) leaves the
context's own empty defaults in place. A downstream product adds the override wiring its own
counters/governors. Document this as the extension seam.

### D-2 — Context registry binds EMPTY placeholders so the context resolves standalone

Port `quota/registry.ts` verbatim (adapting DI shape to the template's `INSTANCE_REGISTRY`
`mock`/`integration`/`real` triple). The two placeholder bindings are load-bearing:

```
placeholderUsageSource      = { token: QuotaUsageSource,           useFactory: () => new DefaultQuotaUsageSource({}) }
placeholderGovernorRegistry = { token: ResourceGovernorRegistry,  useFactory: () => new DefaultResourceGovernorRegistry({}) }
```

Empty counters → `usage()` always resolves `0` (a key with no counter can't be over-used). Empty
governors → `keys()` is `[]`, so the enforcer's `for (key of governors.keys())` loop is a no-op. This
is what lets the context's own container/smoke test resolve **without any product context present** —
the whole point of a generic Tier-2 context.

### D-3 — `QuotaGate`: generic tell-don't-ask, hard-limit blocks / metered never blocks

Port `QuotaGate.assertCanPerform(ownerId, key, tx?)` verbatim: read the effective entitlement for the
key; if the key is absent, `metered`, or `limit === null` (unlimited) → return (never block); else
read `usage()` and throw `QUOTA_LIMIT_EXCEEDED` (key in error detail) when `used >= limit`. Metered
keys are billed at period close, never gated. (`QuotaGate.ts` + `QuotaGate.test.ts`.)

### D-4 — Override ledger: honest AggregateRoot, atomic-ops repo, dual-layer idempotency

- **`QuotaOverride`** is a **ledger entry** (append-only, summed on read) — an `AggregateRoot` with
  **no invented invariants** and no state-transition methods (deliberately mirrors the store it
  replaced). Props: `ownerId`, `meter: QuotaKey`, `delta: int` (signed), `idemKey`. `id` is the usual
  technical identity; `idemKey` is the business dedup identity. (`entities/QuotaOverride.ts`.)
- **`QuotaOverrideRepository`** has **no `Repository<T>` base** — same posture as a
  ProjectionRepository (atomic ops, never a `find→mutate→save` store). Three methods: `applyIfNew`
  (insert, idempotent via `onConflictDoNothing({ target: idemKey })`), `currentDelta(ownerId, meter)`
  (`coalesce(sum(delta),0)::int`), `currentDeltaMany(ownerIds, meter)` (one `GROUP BY`, **contract:
  every requested owner present, 0 when none**). (`repositories/QuotaOverrideRepository/*`.)
- **Idempotency is dual-layer:** `ApplyQuotaOverride` first `IdempotencyGuard.claim(QUOTA_OVERRIDE,
  key)`; the repo's `UNIQUE(idem_key)` is the belt-and-braces second layer (idempotent even
  independent of the claim). A replayed key applies the delta **once** and saves the audit event
  **once**. (`usecases/ApplyQuotaOverride.ts` + `.test.ts`.)

### D-5 — `ApplyQuotaOverride` is operator-gated (X-Operator-Key), no subscription guard

The controller is **operator-only**, gated on a platform credential `X-Operator-Key` with a
**constant-time compare** that **fails closed** when the secret is unset. It is *deliberately not*
session-gated: an owner-session gate would let any owner self-grant unlimited quota by setting
`body.ownerId` to their own id. The `quota` context registers **zero default middlewares**, so there
is nothing to skip — the operator credential is the sole auth. (`controllers/ApplyQuotaOverride.ts`.)
The use case does **no subscription-existence check** — an override is not a subscription-lifecycle
invariant, so it applies even for an owner with no subscription (dropped by explicit medscall user
decision, 2026-07-17). With no off-transaction external call, `claim → write override → save audit`
runs in **one** transaction. Config: add `OPERATOR_API_KEY` to the env schema.

### D-6 — Entitlement port: billing is authority, quota is mechanism (bidirectional coupling)

- **`QuotaEntitlement`** (abstract) returns `Entitlement = Record<QuotaKey, {limit: number|null;
  metered: boolean}>` — the owner's **effective** per-key policy limit raised by the running override
  delta. The single read `QuotaGate`/`ResourceLimitEnforcer` consume.
- **`DrizzleQuotaEntitlement`** derives the effective plan via billing's `SubscriptionAccessDeriver`,
  then for each key from billing's `PlanRegistry`: `metered = policy.overage !== undefined`; for
  metered keys adds `overrides.currentDelta(ownerId, key)` to `policy.limit` (null stays null).
  **This is the bidirectional edge** — `@quota` importing `@billing/objects` (`PlanRegistry`) and
  `@billing/services/SubscriptionAccessDeriver`. Accepted; billing remains the entitlement authority.
- **`MockQuotaEntitlement`** is **seedable** (`seed(ownerId, entitlement)`) so *other* contexts' tests
  wire it in without standing up a subscription+invoice+override chain; unseeded owners get a floor.
  **Genericize:** medscall's floor is the product-specific `FREE_FLOOR`
  (`UNITS:1`/`COLLABORATORS:1`/`AGENT_MESSAGES:50`). In the template ship an **empty floor** (`{}` —
  no product keys) or a documented one-key placeholder; do not port medscall's product tiers.

### D-7 — `ResourceLimitEnforcer` + `PendingSelectionRepository`: grandfather-and-lock, never delete

Port the enforcer verbatim (`ResourceLimitEnforcer.ts`): for each governed key, list resources
(oldest-first), reconcile the owner's kept-selection with reality, top up from oldest-first to fill
`limit`, then apply **batch** lock/unlock diffs; unlimited (`limit === null`) → unlock everything.
Clears the pending selection at the end. `PendingSelection` is a generic per-`QuotaKey` "keep" map
(`Partial<Record<QuotaKey, string[]>>`) persisted to `quota.pending_selections`
(PK `(ownerId, quotaKey)`, `keptIds jsonb`). This mechanism is **generic** (any governed key), which
is why medscall moved the table out of `unit` into `quota`. (`services/ResourceLimitEnforcer.ts` +
`.test.ts`, `repositories/PendingSelectionRepository/*`.)

### D-8 — `RequestDowngrade`: paid→paid only, validate-then-write, one transaction

Port `RequestDowngrade` (`usecases/RequestDowngrade.ts` + controller): reject →FREE targets
(`!PlanRegistry.isPaid` → `DOWNGRADE_SELECTION_INVALID`; →FREE routes through cancellation instead).
Validate every key's kept-selection against `owned` (governor list, owner's own seat excluded) and the
target plan's limit; only after all keys pass, drive billing's `ChangePlan` (which **schedules**, does
not flip now) **and** persist the keep-selection — same transaction, so a rejected selection leaves
neither a schedule nor a stored selection. The controller is **session-gated**
(`AuthorizationService.assertCanOperate`), path `/subscription/downgrade`. This use case drives
billing (`@quota` → `@billing/usecases/ChangePlan`) — the second bidirectional edge.

### D-9 — `GovernResourcesOnSubscriptionChangedHandler`: one-line enforcement trigger

Port the external handler (`handlers/GovernResourcesOnSubscriptionChangedHandler.ts`): subscribe to
the thin cross-context `SubscriptionChangedEvent` (carries only `ownerId`) and call
`enforcer.enforce(event.payload.ownerId)` — the enforcer re-queries the owner's current entitlement
itself, so the handler stays a one-line trigger. This is what makes a downgrade actually apply the
over-quota locks. `SubscriptionChangedEvent` is billing's shared event (dependency on the billing
spec). Exported from `handlers/external.ts`; `handlers/internal.ts` is empty.

### D-10 — Tables live in a NEW `quota` pgSchema in contracts (NOT the billing schema)

Add `packages/contracts/db/schema/quota.ts` with `export const quotaSchema = pgSchema('quota')` and
the two tables, barrel-exported from `schema/index.ts`:

- `quota_overrides` — `id text PK`, `owner_id text`, `meter text $type<QuotaKey>`, `delta integer`,
  `idem_key text UNIQUE`, `created_at timestamptz default now()`.
- `pending_selections` — `owner_id text`, `quota_key text`, `kept_ids jsonb default []`,
  `created_at`, PK `(owner_id, quota_key)`.

**Trap distinction:** the L-10 trap "estender billing pgSchema de contracts (não recriar)" applies to
the **billing** spec — its tables extend the *existing* `packages/contracts/db/schema/billing.ts`.
**quota is a new schema module** — the override ledger + pending-selection tables are quota-owned
end-to-end (entity, repo, use case, table). Do not fold them into the billing schema. (Note medscall's
HEAD keeps both in a `quota` schema module — `shared/db/drizzle/schema/quota.ts` — matching this.)
`quotaKeys` on the tables are the `QuotaKey` enum stringified.

### D-11 — Errors, event, enums

- Domain errors (`errors/index.ts`): `QUOTA_LIMIT_EXCEEDED` (gate), `RESOURCE_LOCKED_BY_PLAN`
  (over-quota lock — thrown by the shared authorization guard when a locked resource/actor is used;
  owned here so billing need not be imported to raise it). Application error:
  `DOWNGRADE_SELECTION_INVALID`. Register codes + HTTP status + i18n key in the `GlobalErrorMapper`.
- `QuotaOverrideAppliedEvent` (`quota.override.applied`) — domain event, audit row, payload
  `{ownerId, meter, delta, idempotencyKey}`. Uses the TypeSpec envelope dialect (`entityId`,
  `occurredAt`) per D4/T-10 of the sync-up program.
- `IdempotencyScope.QUOTA_OVERRIDE` — a member of the shared `IdempotencyScope` enum (L-1).

### D-12 — Coupling is declared once in the architecture rail (L-13)

The billing↔quota bidirectional coupling is the **single** entry in the L-13 rail's
`CONTEXT_IMPORT_EXCEPTIONS` (`tests/architecture/context-boundary.test.ts`, derived from the L-11
`contexts.ts` manifest). It sanctions exactly three edges: (1) `@billing` imports `@quota/*`,
(2) `DrizzleQuotaEntitlement` (quota) reads `PlanRegistry` + `SubscriptionAccessDeriver` (billing),
(3) `RequestDowngrade` (quota) drives `ChangePlan` (billing). The quota-side boundary array does **not**
list `@billing/` as forbidden. If L-13 has not landed when quota builds, add the exception at L-13
time; note the dependency in the plan.

---

## User Stories

- **US-1 — Operator grants a quota override.** As a platform operator, I POST `/quota/overrides` with
  `X-Operator-Key` + `{ownerId, meter, delta, idempotencyKey}` and the owner's effective limit for
  that meter is raised by `delta`, idempotently (a replayed key is a no-op), auditable — even if the
  owner has no subscription.
- **US-2 — System gates a hard-limit action.** As the platform, when an owner at their hard cap
  attempts a capped action, `QuotaGate.assertCanPerform` throws `QUOTA_LIMIT_EXCEEDED`; a metered key
  never blocks.
- **US-3 — Owner requests a downgrade choosing what to keep.** As a tenant owner, I POST
  `/quota/subscription/downgrade` with a target paid plan and a per-key keep-selection; the selection
  is validated against the target limits, the plan change is scheduled, and my choice is stored —
  atomically. An invalid selection is rejected with `DOWNGRADE_SELECTION_INVALID` and changes nothing.
- **US-4 — System grandfathers-and-locks on the period turn.** As the platform, when a subscription
  change lands (`SubscriptionChangedEvent`), the enforcer keeps the chosen/oldest-N resources active
  and locks the excess read-only per key; an upgrade unlocks up to the new limit; nothing is deleted.
- **US-5 — Product plugs its own keys.** As a downstream product, I define my `QuotaKey` members and
  register counters/governors at the shared merge root; the generic kernel enforces them with no kernel
  change.

---

## Acceptance Criteria

> Derived from the source tests at `medscall@f04e8a0f` (`quota.smoke.test.ts`, `QuotaGate.test.ts`,
> `ApplyQuotaOverride.test.ts`, `ResourceLimitEnforcer.test.ts`, `DrizzleQuotaOverrideRepository.test.ts`,
> `DrizzlePendingSelectionRepository.test.ts`, `GovernResourcesOnSubscriptionChangedHandler.test.ts`).
> Port each test alongside its subject.

**Context wiring**
- **AC-1** The smoke test resolves every quota DI token (`QuotaGate`, `ResourceLimitEnforcer`,
  `QuotaEntitlement`, `PendingSelectionRepository`, `QuotaOverrideRepository`) through the production
  registration path, **with zero product keys wired** (empty placeholders).
- **AC-2** `CONTEXTS.quota` is registered; `packages/api/typescript/src/quota/index.ts` composes via
  `BoundedContext.create({ name: CONTEXTS.quota, … })` with `registry: INSTANCE_REGISTRY`.

**Gate**
- **AC-3** `assertCanPerform` **rejects** a hard-limit key when `used >= limit`
  (`QUOTA_LIMIT_EXCEEDED`), **allows** it under limit, and **never blocks** a metered key even far
  over its limit.

**Override ledger**
- **AC-4** A single `ApplyQuotaOverride` writes the delta to `quota.quota_overrides`, readable back via
  `currentDelta`. Applies even for an owner with no subscription.
- **AC-5** Two calls with the **same** `idempotencyKey` apply the delta **once** and save the audit
  event **once**; two **different** keys **accumulate** (sum).
- **AC-6** A `QuotaOverrideAppliedEvent` audit row is persisted with `entityId === ownerId`,
  `ownerId`, and payload `{ownerId, meter, delta, idempotencyKey}`.
- **AC-7** `POST /quota/overrides` requires a matching `X-Operator-Key` (constant-time compare, fails
  closed when `OPERATOR_API_KEY` unset) → `401 UNAUTHORIZED` otherwise; no session/middleware gate.
- **AC-8** `currentDeltaMany` returns **every** requested owner (0 when no override).

**Entitlement**
- **AC-9** `DrizzleQuotaEntitlement.entitlementFor` returns, per key, `{limit, metered}` where metered
  keys' limit = plan policy limit + running override delta (null stays null); non-metered keys ignore
  overrides. `MockQuotaEntitlement.seed` overrides the return; unseeded owners get the (generic) floor.

**Enforcer / downgrade**
- **AC-10** `enforce` locks the excess using the pending selection (keeping chosen), defaults to
  oldest-N with no selection, tops up when a kept id no longer exists, unlocks up to a raised limit on
  upgrade, clears the selection, and **never deletes**.
- **AC-11** `RequestDowngrade` rejects a →FREE target and an invalid keep-selection
  (`DOWNGRADE_SELECTION_INVALID`) with **no** schedule and **no** stored selection; a valid request
  schedules `ChangePlan` + persists the selection in one transaction and returns
  `{effectiveAtPeriodEnd}`.
- **AC-12** `GovernResourcesOnSubscriptionChangedHandler` calls `enforcer.enforce(ownerId)` on
  `SubscriptionChangedEvent`.

**Gates**
- **AC-13** `bun tsc`, `bun lint`, `bun run test` (quota suite), and `bun sdk` (the two controllers
  surface in the SDK) are green. The L-13 `context-boundary` rail passes with the billing↔quota
  exception declared.

---

## File structure (port map)

> medscall `packages/api/src/quota/*` → template `packages/api/typescript/src/quota/*` unless noted.
> Framework imports adapt: medscall `@shared/types/{BoundedContext,Handler,Controller,BaseError,…}` &
> `@shared/services/{IdempotencyGuard,AuthorizationService}` → template `@template/core-typescript`;
> medscall `@shared/enums`/`@shared/contexts`/`@shared/registry` → template `@shared/*` (src/shared) or
> contracts wire enums as noted; medscall `@shared/db/drizzle/schema/quota` → template
> `@template/contracts-typescript` (the generated binding for `packages/contracts/db/schema/quota.ts`).

| Template path | Source (medscall@f04e8a0f) | Notes |
|---|---|---|
| `src/quota/index.ts` | `quota/index.ts` | `BoundedContext.create` + `INSTANCE_REGISTRY` (template DI shape) |
| `src/quota/registry.ts` | `quota/registry.ts` | **empty placeholder** usage-source + governor-registry |
| `src/quota/services/QuotaGate.ts` (+ test) | same | verbatim |
| `src/quota/services/QuotaUsageSource.ts` | same | port abstract |
| `src/quota/services/DefaultQuotaUsageSource.ts` | same | composer |
| `src/quota/services/QuotaCounter.ts` | same | abstract + `countMany` batch default |
| `src/quota/services/ResourceGovernor.ts` | same | abstract + `lockMany`/`unlockMany` |
| `src/quota/services/ResourceGovernorRegistry.ts` | same | abstract |
| `src/quota/services/DefaultResourceGovernorRegistry.ts` | same | composer |
| `src/quota/services/ResourceLimitEnforcer.ts` (+ test) | same | verbatim (test needs a product governor — see risk R-2) |
| `src/quota/services/QuotaEntitlement/{QuotaEntitlement,DrizzleQuotaEntitlement,MockQuotaEntitlement,index}.ts` (+ test) | same | Drizzle reads billing; Mock floor **genericized** |
| `src/quota/entities/QuotaOverride.ts` (+ index) | same | ledger aggregate, no invented invariants |
| `src/quota/repositories/QuotaOverrideRepository/*` (+ tests) | same | atomic ops, `@template/contracts-typescript` schema import |
| `src/quota/repositories/PendingSelectionRepository/*` (+ tests) | same | generic keep-selection |
| `src/quota/usecases/{ApplyQuotaOverride,RequestDowngrade}.ts` (+ tests, index) | same | `ApplyQuotaOverride` → `IdempotencyGuard`; `RequestDowngrade` → billing `ChangePlan` |
| `src/quota/controllers/{ApplyQuotaOverride,RequestDowngrade}.ts` (+ index) | same | operator-key vs session gate |
| `src/quota/events/QuotaOverrideAppliedEvent.ts` (+ index) | same | TypeSpec envelope dialect |
| `src/quota/errors/index.ts` | same | 3 error codes → `GlobalErrorMapper` |
| `src/quota/handlers/{external,internal}.ts` + `GovernResourcesOnSubscriptionChangedHandler.ts` (+ test) | same | external only |
| `src/quota/enums/index.ts`, `middlewares/index.ts` | same | empty (zero middlewares) |
| `src/quota/quota.smoke.test.ts` | same | container-resolution proof |
| `packages/contracts/db/schema/quota.ts` (+ index barrel) | medscall `shared/db/drizzle/schema/quota.ts` | **new** `quota` pgSchema — 2 tables |
| `packages/contracts` TypeSpec `QuotaKey` enum → `@template/contracts-typescript/wire/enums` | medscall `shared/enums/QuotaKey.ts` | **placeholder** (Phase-0 frozen; empty/one example key) |
| `IdempotencyScope.QUOTA_OVERRIDE` | medscall `shared/enums/IdempotencyScope.ts` | add member (L-1 surface) |
| env schema `OPERATOR_API_KEY` | medscall `Config.env.OPERATOR_API_KEY` | secrets-guard |
| `src/shared/registry.ts` merge-root override | medscall `shared/registry.ts` | **ships empty** (extension seam, not wired) |
| `tests/architecture/context-boundary.test.ts` exception | medscall `quota/context-boundary.test.ts` | billing↔quota exception (L-13) |

---

## Risks / open questions

- **R-1 (dependency ordering).** quota cannot compile without billing's `PlanRegistry`,
  `SubscriptionAccessDeriver`, `ChangePlan`, `SubscriptionChangedEvent`, and without L-1's
  `IdempotencyGuard`/`IdempotencyScope`/`shared.idempotency_keys` and L-13's boundary rail. Build the
  two L-10 specs together; sequence L-1 first. If the billing spec is not co-built, the three
  bidirectional edges (D-6, D-8, D-9) stub out and their tests are deferred — call this out at plan
  time rather than silently dropping them.
- **R-2 (enforcer/entitlement tests need a product governor).** medscall's `ResourceLimitEnforcer.test.ts`
  and `DrizzleQuotaEntitlement.test.ts` lean on `unit`'s `UnitGovernor`/`SeatGovernor` and the
  product tiers. A generic template has no product governor. Options for `/build`: (a) ship a tiny
  in-test `FakeGovernor`/`FakeCounter` (the `QuotaGate.test.ts` already uses a `FixedQuotaUsageSource`
  double — same idiom) and seed `MockQuotaEntitlement`, keeping the enforcer's behavioral ACs; or
  (b) defer the product-coupled enforcer integration test to the downstream product and keep only the
  kernel-level unit assertions in the template. Prefer (a). Decide at plan time.
- **R-3 (`QuotaKey` empty-enum ergonomics).** See D-1 — an empty enum breaks `z.enum`. Ship one
  documented placeholder member; confirm with the user whether `QuotaKey` lives in contracts (Phase-0
  frozen) or as a `src/shared/enums` seam mirroring medscall. Recommendation: contracts, per the
  cross-boundary convention.
- **R-4 (envelope dialect).** `QuotaOverrideAppliedEvent` must use the TypeSpec `entityId`/`occurredAt`
  envelope (program item T-10). Confirm T-10 has landed (or land it) before pinning the event shape.

---

## Story Points

Effort per deliverable (Fibonacci; a point ≈ half a focused day). Ports are cheaper than net-new
because the shape is fixed at `f04e8a0f` — cost is in path/DI adaptation, genericization, and the
dependency wiring, not design.

| # | Deliverable | Pts | Rationale |
|---|---|---:|---|
| 1 | `quota` pgSchema (`quota_overrides` + `pending_selections`) in contracts + migration | 2 | mechanical port; new schema module |
| 2 | `QuotaKey` placeholder enum (contracts, Phase-0) + `IdempotencyScope.QUOTA_OVERRIDE` | 1 | one enum + one member; empty-enum caveat |
| 3 | Kernel services (Gate, UsageSource+Default, Counter, Governor+Registry+Default, Enforcer) + tests | 5 | 8 files verbatim + enforcer test double (R-2) |
| 4 | Override ledger (entity, repo mock+drizzle, atomic ops) + repo tests | 3 | faithful port; `onConflictDoNothing` + sum-on-read |
| 5 | Entitlement port (abstract, Drizzle→billing, seedable Mock) + test | 3 | bidirectional billing edge; genericize floor |
| 6 | `ApplyQuotaOverride` use case + controller (operator-key) + `QuotaOverrideAppliedEvent` + tests | 3 | idempotency dual-layer; constant-time auth; audit |
| 7 | `RequestDowngrade` use case + controller (session) + `PendingSelectionRepository` + tests | 3 | paid→paid guard; billing `ChangePlan` edge; validate-then-write |
| 8 | `GovernResourcesOnSubscriptionChangedHandler` (external) + test | 1 | one-line trigger; billing event edge |
| 9 | Errors + `GlobalErrorMapper` registration + i18n keys | 1 | 3 codes |
| 10 | Context wiring (`index.ts`, `registry.ts` empty placeholders, `CONTEXTS.quota`, smoke test) | 2 | standalone-resolution proof |
| 11 | Merge-root extension seam (empty) + L-13 boundary exception + `OPERATOR_API_KEY` env | 2 | wiring seam + rail + secrets-guard |
| | **Total** | **26** | matches the L-10 quota half of an **(L)** item |

---

## Verification

- `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` — type-check clean.
- `cd packages/api/typescript && bun test src/quota` — quota suite green (ACs above).
- `bun sdk` — `/quota/overrides` + `/quota/subscription/downgrade` surface in the SDK.
- `bun lint` — clean.
- L-13 `tests/architecture/context-boundary.test.ts` — passes with the billing↔quota exception.
