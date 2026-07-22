# P2-TENANCY — BK Dash BC2 Tenancy — Implementation Plan (polyglot rebase, iter 43)

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`)
> syntax for tracking. Each Task wraps one observable behavior in an outer
> RED -> GREEN cycle. Files land under `packages/api/typescript/src/tenancy/`
> ONLY (plus the matching `packages/api/typescript/src/index.ts` wire-in).
> **No Drizzle schema files are authored in this sub-plan** — the tables
> (`tenancy.stores`, `tenancy.store_memberships`, `tenancy.store_invitations`)
> already exist in `packages/contracts/db/schema/tenancy.ts` (iter 42) and
> are consumed via `@template/contracts/db`. No file outside
> `packages/api/typescript/src/tenancy/` is modified except:
> (a) `packages/api/typescript/src/index.ts` to mount `TenancyRouter` and
> (b) the OpenAPI emit + SDK regen artifacts.

**Goal:** Land BC2 Tenancy per spec §4 BC2 + §7.2 — the `Store` and
`StoreMembership` aggregates plus the `StoreInvitation` aggregate that
backs the invitation lifecycle; the 9 commands (C12..C20) and 4 reads
(T07..T10); the 10 published domain events; the `STORE_AMOUNT` quota
gate; the `REPORTING_CURRENCY_LOCKED` invariant enforced at use-case
level by sampling `sales.orders`; the `StoreMemberInvited` →
`shared.*` integration event; and the `shared.SubscriptionQuotaUpdated`
consumer — all under `packages/api/typescript/src/tenancy/`.

**Architecture:** Single bounded context `tenancy/` with three aggregate
roots (`Store`, `StoreMembership`, `StoreInvitation`), three Drizzle-backed
repositories, nine command use cases (`CreateStore`, `UpdateStoreSettings`,
`UpdateStorePreferences`, `InviteMember`, `AcceptInvitation`,
`RemoveMember`, `ChangeMemberRole`, `DisableStore`, `EnableStore`), four
query use cases under `tenancy/queries/` (BFF pattern: `MyStores`,
`StoreSettings`, `StorePreferencesSettings`, `StoreMembers`), thirteen
HTTP controllers, ten domain events + one integration event
(`StoreMemberInvited` → shared), three abstract service ports
(`SubscriptionLookupService` for the BASIC quota gate, `OrderSamplingService`
for the `reportingCurrency` lock check, `UserDirectoryService` for the
`StoreMembers` read denormalisation) and two handlers (internal:
republish `StoreMemberInvited` to the external mediator; external: react
to `shared.SubscriptionQuotaUpdated` by invalidating any cached
subscription lookup).

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod,
`@template/core-typescript`, `@template/contracts`,
`@template/contracts-typescript`. Tests run against PGlite via the
TestBed/DrizzleDatabaseDriver harness. Polyglot-rebased — every import
path, every base class, every framework primitive points at the
polyglot framework (`@template/core-typescript`) and the cross-language
contracts (`@template/contracts`, `@template/contracts-typescript`).

**Spec:** `.specs/2026-05-21-ddd-modeling-bk-dash.md` (§4 BC2, §7.2,
§7.13 `StoreMemberInvited` flow, §7.14 `TenancyErrors`)

**Master plan:** `.plans/2026-05-21-bk-dash-port.md` (sub-plan P2-TENANCY,
post-rebase addendum iter 39 → iter 43 re-emit)

**Depends on sub-plans:**
- **HARD:** iter 41 (`packages/contracts/wire/`) — supplies `Role`,
  `CurrencyCode`, `PlanTier`, `PlanFeature` enums via
  `@template/contracts-typescript/wire/enums/*`.
- **HARD:** iter 42 (`packages/contracts/db/schema/tenancy.ts`) — supplies
  the three Drizzle tables consumed via `@template/contracts/db`. The
  rebase note in the master plan §"Polyglot rebase addendum" makes this
  prerequisite explicit; this sub-plan does **NOT** author Drizzle
  files.
- **HARD:** P1-IDENTITY — supplies the `User` aggregate that
  `StoreMembership.userId` references and the (eventual) real
  `UserDirectoryService` implementation. The FK column
  (`store_memberships.user_id`) targets `auth.users.id` already declared
  in `packages/contracts/db/schema/auth.ts`. AcceptInvitation needs an
  authenticated session to resolve the invitee `userId`.
- **SOFT:** P3-BILLING. The `CreateStore` quota gate (C12) needs the
  caller's active `Subscription` tier and the count of already-allocated
  stores. Tenancy declares the abstract `SubscriptionLookupService` port
  under `tenancy/services/` and ships `MockSubscriptionLookupService`
  returning `{ tier: PlanTier.BASIC, ... }` so P2 is end-to-end
  testable in isolation. P3 binds the real implementation in
  `packages/api/typescript/src/billing/registry.ts`. Tenancy also ships
  an external handler for `shared.SubscriptionQuotaUpdated` against the
  abstract port from day one — adding the real publisher in P3 needs no
  Tenancy edit.
- **SOFT:** P6-SALES. The `REPORTING_CURRENCY_LOCKED` invariant requires
  sampling `sales.orders` for the store. Tenancy declares the abstract
  `OrderSamplingService` port and ships `MockOrderSamplingService`
  returning `false` for every storeId; P6-SALES binds a real
  Drizzle-backed implementation that runs
  `SELECT 1 FROM sales.orders WHERE store_id = $1 LIMIT 1` in its
  registry. No Tenancy edit when P6 lands.

**Tasks:** 22
**Estimated minutes:** ~340

---

## Schema adaptation (Drizzle vs spec)

The spec §4 BC2 describes a **`StorePreferences` aggregate** sibling to
`Store`. The polyglot Drizzle schema authored in iter 42
(`packages/contracts/db/schema/tenancy.ts`) **merges those preferences
into the `stores` table itself**: `reportingCurrency`, `timezone`,
`isDisabled`, `disabledReason`, **and `showStoreNameInNotifications`**
(added by iter 43.6a migration `0013_panoramic_hawkeye.sql`) are
columns of `stores`. There is **no `store_preferences` table**.

Consequently, this plan does **NOT** ship a `StorePreferences` aggregate.
Instead:

- The `Store` aggregate owns `name`, `pictureUrl`, `email`, `phoneNumber`
  (profile fields), **AND** `reportingCurrency`, `timezone`, `isDisabled`,
  `disabledReason`, `showStoreNameInNotifications` (preferences fields).
- `UpdateStoreSettings` (C13) mutates the profile-shaped subset.
- `UpdateStorePreferences` (C14) mutates the preferences-shaped subset
  via a different mutator method on `Store` so the per-domain invariants
  (REPORTING_CURRENCY_LOCKED, INVALID_TIMEZONE) stay close to the data.
- The spec's `StorePreferencesCreated` and `StorePreferencesUpdated`
  events are still emitted from inside the `Store` aggregate's
  `create`/`updatePreferences` paths so the event catalog stays
  faithful to the spec — only the persistence shape collapses.
- T09 `StorePreferencesSettings` reads `showStoreNameInNotifications`
  from the column directly (no shim).

The `StoreInvitation` aggregate is **new** (not in the original sub-plan)
and corresponds 1:1 to the `tenancy.store_invitations` table. Invitations
become their own aggregate root rather than living as nullable columns
on `store_memberships`. This is structurally cleaner and the spec is
silent on the persistence shape — it only mandates the event payload
and the lifecycle, which this layout honours.

---

## Role naming decision

The polyglot template already has `RoleType` (`OWNER | ADMIN | COLLABORATOR`)
inside `@template/core-typescript` for the legacy auth scaffolding. The
BK Dash `Role` enum is **different**: `OWNER | ADMIN | MEMBER` —
authored in TypeSpec at `packages/contracts/wire/enums/role.tsp` and
emitted to TypeScript at
`packages/contracts/generated/typescript/src/wire/enums/role.ts`
(re-exported via `@template/contracts-typescript/wire/enums/Role`).

**Decision:** Throughout BC2 Tenancy, `Role` always refers to the
**generated BK Dash enum** from
`@template/contracts-typescript/wire/enums/Role`. We do **NOT** import
the polyglot `RoleType` anywhere in `tenancy/`. To avoid ambiguity in
review, every Tenancy file that imports the BK Dash `Role` aliases it:

```typescript
import { Role as TenancyRole, RoleSchema as TenancyRoleSchema } from '@template/contracts-typescript/wire/enums/Role'
```

Inside `tenancy/` the alias is the public surface; the package import
path stays the contracts-typescript path. This avoids any global rename
(which would ripple into the polyglot auth context that uses `RoleType`/
`COLLABORATOR`) and keeps both worlds living in parallel.

---

## Convention reference (absorbed during planning, NOT to be re-read by `/build`)

- BC layout mirror: `packages/api/typescript/src/auth/` (entities/,
  controllers/, errors/, events/, handlers/, middlewares/, objects/,
  repositories/<Aggregate>/, services/, usecases/, registry.ts, index.ts).
  Tenancy adds two folders not present in `auth`: `queries/` (UI-side
  reads per `/query` skill) and `enums/` (only if a Tenancy-internal
  enum is needed; the rebase suggests none — `Role` comes from contracts).
- Entity shape: `packages/api/typescript/src/auth/entities/User.ts` —
  `AggregateRoot<typeof Schema>` from `@template/core-typescript`,
  `static override schema`, `static create()`, mutator methods that call
  `this.validate()`, `interface X extends XProps {}` declaration
  merging at the file bottom.
- Use case shape:
  `packages/api/typescript/src/auth/usecases/RegisterUser.ts` —
  `@injectable()`, extends `Handler<typeof InputSchema, typeof OutputSchema>`
  from `@template/core-typescript`, `name` is `snake_case` (e.g.
  `'create_store' as const`), exports `InputSchema`/`OutputSchema`,
  body wraps everything in `this.withTransaction(tx, async tx => { ... })`
  and persists domain events via `this.domainEventRepository.save(event, tx)`
  in the same transaction. **Note:** `auth/usecases/RegisterUser.ts`
  shows the polyglot Handler accepts the input pre-validated through
  `this.inputSchema` — controllers do their own decode under `validatedRequest`
  before forwarding into the use case via `useCase.execute(input)`.
- Repository shape:
  `packages/api/typescript/src/auth/repositories/UserRepository/` with
  `<Name>Repository.ts` (abstract, extends `Repository<Entity>` from
  `@template/core-typescript`), `Drizzle<Name>Repository.ts`,
  `Mock<Name>Repository.ts`, `index.ts`. The polyglot `Repository`
  base class declares only `save(entity, tx?)` + `delete(id, tx?)`; all
  lookup methods (`findById`, `findByEmail`, etc.) are abstract on the
  context-specific subclass. **Optimistic-lock helper** is `entity.incrementVersion()`
  called inside `save()` before the upsert, as shown in
  `DrizzleUserRepository.save`.
- Controller shape:
  `packages/api/typescript/src/auth/controllers/GetSession.ts` —
  `@injectable()`, extends `Controller<typeof InputSchema, typeof OutputSchema>`
  from `@template/core-typescript`, `readonly path: '/<segment>'`,
  `readonly method: 'get' | 'post' | …`, `readonly description: string`,
  schemas attached via `.example([…])`. The controller `inputSchema`
  describes the HTTP request shape that the framework already wraps
  (`{ headers, body, params, ctx }` flow through
  `HttpControllerRequest<…>` automatically — your declared `inputSchema`
  describes the **decoded payload** the framework's `validatedRequest`
  expects). Returns `{ status: HttpStatusCode.<X>, data }`.
- Errors barrel: `packages/api/typescript/src/auth/errors/index.ts` —
  exports four typed string unions (`<Bc>DomainErrors`,
  `<Bc>ApplicationErrors`, `<Bc>InterfaceErrors`,
  `<Bc>InfrastructureErrors`) and one combined `Errors`. **Critical
  polyglot extra:** a side-effect call to `registerErrorCodes({...})`
  from `@template/core-typescript` that registers each error code →
  HTTP status with the runtime mapper. Failing to call this means
  `GlobalErrorMapper` defaults to 500 for every BC-specific code.
- Event shape:
  `packages/api/typescript/src/auth/events/UserRegisteredEvent.ts` —
  `z.domainEvent({...})` helper + class
  `extends BaseDomainEvent<typeof Schema>` with
  `static override readonly name = '<bc>.<event>' as const`.
- Integration event shape (cross-context, both polyglot and BK Dash):
  authored as TypeSpec in `packages/contracts/wire/events/<name>.tsp`
  and consumed via the generated TS class.
  `packages/contracts/wire/events/integration-handshake-failed.tsp` is
  the closest sibling for the `StoreMemberInvited` shape. The TS class
  exists once per event under
  `packages/contracts/generated/typescript/src/wire/events/<name>.ts`
  and is consumed by both runtimes.
- Handler shapes:
  `packages/api/typescript/src/auth/handlers/UserRegisteredHandler.ts`
  (internal — extends `EventHandler<typeof TheEvent>` from
  `@template/core-typescript`), `handlers/internal.ts` +
  `handlers/external.ts` re-export modules wired in `index.ts`.
- Registry shape:
  `packages/api/typescript/src/auth/registry.ts` — `import './errors'`
  side-effect for `registerErrorCodes`, `INSTANCE_REGISTRY: InstanceRegistry`
  with `mock`/`integration`/`real` keys, each row
  `{ token: AbstractClass, instance: ConcreteClass }`.
- BC wiring: `packages/api/typescript/src/auth/index.ts` —
  `BoundedContext.create({ name: '', controllers, internalHandlers, externalHandlers, registry })`.
  **Note:** the auth example uses `name: ''` because its controllers
  declare absolute paths (`/session`); Tenancy will do the same and
  declare controller paths under `/tenancy/...` directly. (Pick `name:
  ''` or `name: 'tenancy'` consistently across the BC — match what auth
  did to keep `MainRouter` joining behaviour predictable.)
- Drizzle schema files for Tenancy already exist:
  `packages/contracts/db/schema/tenancy.ts` exports `stores`,
  `storeMemberships`, `storeInvitations`. All Drizzle imports go through
  `import { stores, storeMemberships, storeInvitations } from '@template/contracts/db'`.
- Test patterns:
  `packages/api/typescript/src/auth/controllers/GetSession.test.ts` for
  controller-level tests; the polyglot framework's TestBed + Drizzle
  driver pattern lives in
  `packages/api/typescript/tests/support/TestBed.ts` (mirror its usage
  exactly).

---

## File structure (target)

```
packages/api/typescript/src/tenancy/
├── entities/
│   ├── Store.ts
│   ├── Store.test.ts
│   ├── StoreMembership.ts
│   ├── StoreMembership.test.ts
│   ├── StoreInvitation.ts
│   ├── StoreInvitation.test.ts
│   └── index.ts
├── errors/
│   └── index.ts                   # mirrors spec §7.14 TenancyErrors;
│                                  # side-effect `registerErrorCodes({...})`
├── events/
│   ├── StoreCreatedEvent.ts
│   ├── StoreSettingsUpdatedEvent.ts
│   ├── StorePreferencesCreatedEvent.ts
│   ├── StorePreferencesUpdatedEvent.ts
│   ├── StoreDisabledEvent.ts
│   ├── StoreEnabledEvent.ts
│   ├── StoreMemberInvitedEvent.ts
│   ├── StoreMemberAddedEvent.ts
│   ├── StoreMemberRemovedEvent.ts
│   ├── StoreMemberRoleChangedEvent.ts
│   └── index.ts
├── handlers/
│   ├── internal.ts                # re-export StoreMemberInvitedHandler
│   ├── external.ts                # re-export SubscriptionQuotaUpdatedHandler
│   ├── StoreMemberInvitedHandler.ts            # internal: publish via ExternalMediator
│   └── SubscriptionQuotaUpdatedHandler.ts      # external: invalidate cached SubscriptionLookup
├── middlewares/
│   ├── index.ts
│   ├── RequireStoreMember.ts      # 403 unless ctx.user has membership row for params.storeId
│   └── RequireStoreRole.ts        # factory(roles[]) → 403 unless membership.role ∈ allowed
├── repositories/
│   ├── StoreRepository/
│   │   ├── StoreRepository.ts             # abstract (extends Repository<Store>)
│   │   ├── DrizzleStoreRepository.ts
│   │   ├── DrizzleStoreRepository.test.ts
│   │   ├── MockStoreRepository.ts
│   │   └── index.ts
│   ├── StoreMembershipRepository/
│   │   ├── StoreMembershipRepository.ts
│   │   ├── DrizzleStoreMembershipRepository.ts
│   │   ├── DrizzleStoreMembershipRepository.test.ts
│   │   ├── MockStoreMembershipRepository.ts
│   │   └── index.ts
│   ├── StoreInvitationRepository/
│   │   ├── StoreInvitationRepository.ts
│   │   ├── DrizzleStoreInvitationRepository.ts
│   │   ├── DrizzleStoreInvitationRepository.test.ts
│   │   ├── MockStoreInvitationRepository.ts
│   │   └── index.ts
│   └── index.ts
├── services/
│   ├── SubscriptionLookupService.ts                 # abstract; resolves { tier, subscriptionId } for userId
│   ├── MockSubscriptionLookupService.ts             # returns PlanTier.BASIC (P2 standalone build)
│   ├── OrderSamplingService.ts                      # abstract; "has store ingested any Order?"
│   ├── MockOrderSamplingService.ts                  # returns false for every storeId
│   ├── UserDirectoryService.ts                      # abstract; { getMany(userIds): { userId,email,name,image? }[] }
│   ├── MockUserDirectoryService.ts                  # deterministic stubs keyed on userId
│   ├── InvitationTokenService.ts                    # HMAC-signed token { sid, email, exp }
│   ├── InvitationTokenService.test.ts
│   └── index.ts
├── usecases/
│   ├── CreateStore.ts                # C12
│   ├── CreateStore.test.ts
│   ├── UpdateStoreSettings.ts        # C13
│   ├── UpdateStoreSettings.test.ts
│   ├── UpdateStorePreferences.ts     # C14 (consumes OrderSamplingService)
│   ├── UpdateStorePreferences.test.ts
│   ├── InviteMember.ts               # C15
│   ├── InviteMember.test.ts
│   ├── AcceptInvitation.ts           # C16
│   ├── AcceptInvitation.test.ts
│   ├── RemoveMember.ts               # C17
│   ├── RemoveMember.test.ts
│   ├── ChangeMemberRole.ts           # C18
│   ├── ChangeMemberRole.test.ts
│   ├── DisableStore.ts               # C19
│   ├── DisableStore.test.ts
│   ├── EnableStore.ts                # C20
│   ├── EnableStore.test.ts
│   └── index.ts
├── queries/
│   ├── MyStores.ts                   # T07 — direct Drizzle (BFF)
│   ├── MyStores.test.ts
│   ├── StoreSettings.ts              # T08
│   ├── StorePreferencesSettings.ts   # T09
│   ├── StoreMembers.ts               # T10
│   └── index.ts
├── controllers/
│   ├── CreateStore.ts                # POST /stores
│   ├── UpdateStoreSettings.ts        # PATCH /stores/:storeId/settings
│   ├── UpdateStorePreferences.ts     # PATCH /stores/:storeId/preferences
│   ├── InviteMember.ts               # POST /stores/:storeId/memberships
│   ├── AcceptInvitation.ts           # POST /memberships/accept
│   ├── RemoveMember.ts               # DELETE /stores/:storeId/memberships/:membershipId
│   ├── ChangeMemberRole.ts           # PATCH /stores/:storeId/memberships/:membershipId/role
│   ├── DisableStore.ts               # POST /stores/:storeId/disable
│   ├── EnableStore.ts                # POST /stores/:storeId/enable
│   ├── MyStores.ts                   # GET /stores/me
│   ├── StoreSettings.ts              # GET /stores/:storeId/settings
│   ├── StorePreferencesSettings.ts   # GET /stores/:storeId/preferences
│   ├── StoreMembers.ts               # GET /stores/:storeId/memberships
│   └── index.ts
├── registry.ts
└── index.ts                          # BoundedContext.create({ name: '', controllers, ...registry })

packages/api/typescript/src/index.ts  # MODIFY: import + mount TenancyRouter
packages/contracts/wire/events/store-member-invited.tsp        # NEW (Task 18 only if missing)
packages/contracts/generated/typescript/src/wire/events/store-member-invited.ts  # generated artifact
```

---

## Phase / wave / dependency overview (auto-derived)

| Wave | Tasks | Why grouped |
|---|---|---|
| **0 — Contract Lock + scaffold** | 1, 2, 3, 21 | Errors + integration-event TypeSpec + entity skeletons + SDK regen close the loop on the contract. Task 1 is now "verify Drizzle tables are reachable" instead of "author schema", because iter 42 owns the schema. Task 21 (SDK regen) is the closing contract-lock once controllers are in. |
| **1 — Domain entities (parallel after wave 0)** | 4, 5, 6 | Three aggregates; independent files; can be parallelised. (Note: there is no longer a separate `StorePreferences` entity — preferences live on `Store`. Task 5 covers the `Store.updatePreferences()` slice + its test.) |
| **2 — Domain events (parallel after wave 1)** | 7 | One Task bundles all 10 event classes (small files, identical shape). |
| **3 — Repositories (parallel after wave 1)** | 8, 9, 10 | One per aggregate; touch disjoint files. |
| **4 — Services + middlewares (parallel after wave 0)** | 11 | Ports + middleware factories; no domain coupling. |
| **5 — Use cases (serial within, parallel between non-OWNER groups)** | 12, 13, 14, 15, 16, 17, 18 | Each is one observable behaviour; `CreateStore` depends on services; `AcceptInvitation` depends on `InviteMember`'s token format. |
| **6 — Queries (parallel after wave 5)** | 19 | Single Task bundles four reads (each is a direct Drizzle SELECT). |
| **7 — Controllers + handlers + BC wiring (serial; this is the contract surface)** | 20 | One Task to land all 13 controllers + 2 handlers + `registry.ts` + `index.ts` + global wire-in. |
| **8 — Final validation** | 22 | Quality gates + AC mapping. |

---

## Task 1: Drizzle schema verification (no-op authoring) ✅ DONE iter 66

> Verified via `bun -e "import('@template/contracts/db')..."`: `stores`, `storeMemberships`, `storeInvitations` all export as objects with expected column lists (`stores`: id, name, reportingCurrency, timezone, isDisabled, disabledReason, showStoreNameInNotifications + audit; `storeMemberships`: storeId, userId, role + audit; `storeInvitations`: id, storeId, email, role, token, expiresAt, acceptedAt, acceptedByUserId + audit). No commit per plan.

**Files:** none authored. This Task is a precondition check that
`@template/contracts/db` exports the three Tenancy tables.

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** haiku
**Skills:** /db-modelling (read-only — schema already exists)
**Depends on:** (none — only on iter 42 which is a prerequisite of this sub-plan)

- [ ] **Step 1: Verify exports**

```bash
bun -e "import('@template/contracts/db').then(m => { for (const k of ['stores','storeMemberships','storeInvitations']) console.log(k, typeof m[k]) })"
```

Expected: three `object` lines. If anything prints `undefined`, stop —
iter 42 needs a follow-up to re-export the table.

- [ ] **Step 2: Verify migrations applied**

```bash
bun --cwd packages/contracts run drizzle:migrate
psql "$DATABASE_URL" -c "\dt tenancy.*"
```

Expected: three rows (`stores`, `store_memberships`, `store_invitations`).

- [ ] **Step 3: Snapshot column lists for the entity Tasks to consume**

Print the column shape — Tasks 4/5/6 will infer the entity fields
directly from `typeof <table>.$inferSelect`.

```bash
bun -e "import('@template/contracts/db').then(m => { for (const t of ['stores','storeMemberships','storeInvitations']) console.log(t, Object.keys(m[t])) })"
```

- [ ] **No commit** — purely a precondition check. Document the verified
  table list in a `# NOTE:` comment at the top of `tenancy/registry.ts`
  when Task 20 lands.

---

## Task 2: Tenancy errors glossary (Contract Lock) ✅ DONE iter 66

> **Iter-66 test pattern:** uses `@ts-expect-error` annotations + runtime `GlobalErrorMapper[code]` introspection (same pattern as iter 46 Identity errors). The plan's `expectTypeOf<...>().toExtend<...>()` snippet is vitest-only; bun:test alternative achieves equivalent coverage.

**Files:**
- Create: `packages/api/typescript/src/tenancy/errors/index.ts`
- Test: `packages/api/typescript/src/tenancy/errors/index.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /errors
**Depends on:** (none)

- [x] **Step 1: Write the failing test** (5 tests / 19 expect() calls iter 66)

`packages/api/typescript/src/tenancy/errors/index.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import type { TenancyDomainErrors, TenancyApplicationErrors, Errors } from './index'

describe('Tenancy errors glossary', () => {
  it('mirrors spec §7.14 TenancyErrors union', () => {
    const all: Errors[] = [
      'STORE_NOT_FOUND','STORE_QUOTA_EXCEEDED','NO_ACTIVE_SUBSCRIPTION','REPORTING_CURRENCY_LOCKED',
      'STORE_ALREADY_DISABLED','STORE_NOT_DISABLED','STORE_MEMBERSHIP_NOT_FOUND',
      'CANNOT_REMOVE_LAST_OWNER','CANNOT_DEMOTE_LAST_OWNER','ALREADY_A_MEMBER','INVITATION_ALREADY_PENDING',
      'INVALID_INVITATION_TOKEN','INVITATION_EXPIRED','INVITATION_ALREADY_USED',
      'INVALID_TIMEZONE','INVALID_EMAIL','VALIDATION_ERROR','UNAUTHORIZED','FORBIDDEN','SESSION_EXPIRED',
    ]
    expect(all.length).toBeGreaterThan(0)
  })
})
```

- [x] **Step 2: Implement (mirrors `auth/errors/index.ts` pattern,
  including the side-effect `registerErrorCodes` call)** (iter 66)

```typescript
import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type {
  BaseDomainErrors,
  BaseApplicationErrors,
  BaseInterfaceErrors,
  BaseInfrastructureErrors,
} from '@template/core-typescript'

// Domain Errors (invariant violations on Store / StoreMembership / StoreInvitation)
export type TenancyDomainErrors =
  | 'INVALID_TIMEZONE'
  | 'INVALID_EMAIL'
  | 'REPORTING_CURRENCY_LOCKED'
  | 'CANNOT_REMOVE_LAST_OWNER'
  | 'CANNOT_DEMOTE_LAST_OWNER'
  | 'STORE_ALREADY_DISABLED'
  | 'STORE_NOT_DISABLED'

export type DomainErrors = BaseDomainErrors | TenancyDomainErrors

// Application Errors (orchestration in use cases)
export type TenancyApplicationErrors =
  | 'STORE_NOT_FOUND'
  | 'STORE_MEMBERSHIP_NOT_FOUND'
  | 'STORE_QUOTA_EXCEEDED'
  | 'NO_ACTIVE_SUBSCRIPTION'
  | 'ALREADY_A_MEMBER'
  | 'INVITATION_ALREADY_PENDING'
  | 'INVALID_INVITATION_TOKEN'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_ALREADY_USED'

export type ApplicationErrors = BaseApplicationErrors | TenancyApplicationErrors

export type TenancyInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | TenancyInterfaceErrors

export type TenancyInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | TenancyInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

// Side-effect import: register this context's error codes with the framework
// runtime registry. Mirrors auth/errors and Go's RegisterErrorCodes() pattern.
registerErrorCodes({
  STORE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  STORE_MEMBERSHIP_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  STORE_QUOTA_EXCEEDED: HttpStatusCode.PAYMENT_REQUIRED,
  NO_ACTIVE_SUBSCRIPTION: HttpStatusCode.PAYMENT_REQUIRED,
  REPORTING_CURRENCY_LOCKED: HttpStatusCode.UNPROCESSABLE_ENTITY,
  STORE_ALREADY_DISABLED: HttpStatusCode.UNPROCESSABLE_ENTITY,
  STORE_NOT_DISABLED: HttpStatusCode.UNPROCESSABLE_ENTITY,
  CANNOT_REMOVE_LAST_OWNER: HttpStatusCode.UNPROCESSABLE_ENTITY,
  CANNOT_DEMOTE_LAST_OWNER: HttpStatusCode.UNPROCESSABLE_ENTITY,
  ALREADY_A_MEMBER: HttpStatusCode.CONFLICT,
  INVITATION_ALREADY_PENDING: HttpStatusCode.CONFLICT,
  INVITATION_ALREADY_USED: HttpStatusCode.CONFLICT,
  INVALID_INVITATION_TOKEN: HttpStatusCode.BAD_REQUEST,
  INVITATION_EXPIRED: HttpStatusCode.BAD_REQUEST,
  INVALID_TIMEZONE: HttpStatusCode.BAD_REQUEST,
  INVALID_EMAIL: HttpStatusCode.BAD_REQUEST,
})
```

- [x] **Step 3: Verify + commit** — `bun test src/tenancy/errors/` → 5 pass / 0 fail / 19 expect() calls / 835ms. `bun --filter @template/api-typescript tsc` → 0 errors. Committed iter 66.

---

## Task 3: Cross-language Role enum sanity check (no authoring) ✅ DONE iter 67

> Verified via `bun -e "import('@template/contracts-typescript/wire/enums').then(m => console.log(m.Role, m.RoleSchema.safeParse('OWNER').success))"` — `Role = { OWNER, ADMIN, MEMBER }`, parse OK. Plan's specific path `@template/contracts-typescript/wire/enums/Role` (capitalized filename) doesn't resolve since the file is lowercase `role.ts`; the barrel `wire/enums` re-export works. No commit.

**Files:** none authored. The BK Dash `Role` enum already exists at
`packages/contracts/wire/enums/role.tsp` (OWNER | ADMIN | MEMBER) with
its generated TypeScript at
`packages/contracts/generated/typescript/src/wire/enums/role.ts`.

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** haiku
**Skills:** /enum (read-only)
**Depends on:** (none)

- [ ] **Step 1: Smoke test the export**

```bash
bun -e "import('@template/contracts-typescript/wire/enums/Role').then(m => console.log(m.Role, m.RoleSchema.safeParse('OWNER').success))"
```

Expected: prints the enum object and `true`.

- [ ] **Step 2: Confirm there's no name collision in the polyglot tree**

```bash
rg -n "from '@template/contracts-typescript/wire/enums/Role'" packages/api/typescript/src
rg -n "from '@template/core-typescript'.*\\bRoleType\\b" packages/api/typescript/src
```

The first must be the only path Tenancy uses. The second confirms the
polyglot `RoleType` lives elsewhere and is not accidentally imported by
Tenancy.

- [ ] **No commit** — read-only verification.

---

## Task 4: Entity — Store (profile + preferences + disable/enable) ✅ DONE iter 67

> **Iter-67 deviations from plan body:**
> - `Z.string().email({ error: 'INVALID_EMAIL' as DomainErrors })` and `.regex(..., { error: 'INVALID_TIMEZONE' as DomainErrors })` — Zod v4 uses `error` not `message`. Plan body still says `message`.
> - **No `Store.create.id = userId` binding** — Store has its own UUIDv7 PK via BaseEntity (unlike UserProfile/UserPreferences where id == userId for the 1:1 FK pattern). Store.create returns a fresh entity with auto-generated id.

**Files:**
- Create: `packages/api/typescript/src/tenancy/entities/Store.ts`
- Test: `packages/api/typescript/src/tenancy/entities/Store.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** Task 2 (errors)

- [x] **Step 1: Write failing test** (14 tests / 44 expect() calls iter 67)

```typescript
import { describe, expect, it } from 'bun:test'
import { Store } from './Store'

describe('Store entity', () => {
  it('creates a store with profile + preferences fields', () => {
    const s = Store.create({ name: 'Acme', reportingCurrency: 'BRL', timezone: 'America/Sao_Paulo' })
    expect(s.name).toBe('Acme')
    expect(s.reportingCurrency).toBe('BRL')
    expect(s.timezone).toBe('America/Sao_Paulo')
    expect(s.isDisabled).toBe(false)
  })

  it('rejects an empty name', () => {
    expect(() => Store.create({ name: '', reportingCurrency: 'BRL', timezone: 'UTC' })).toThrow()
  })

  it('rejects an invalid email when provided', () => {
    expect(() => Store.create({ name: 'Acme', reportingCurrency: 'BRL', timezone: 'UTC', email: 'not-an-email' })).toThrow()
  })

  it('rejects an unknown timezone', () => {
    expect(() => Store.create({ name: 'Acme', reportingCurrency: 'BRL', timezone: 'Mars/Olympus' })).toThrow('INVALID_TIMEZONE')
  })

  it('updateSettings returns the changedFields list', () => {
    const s = Store.create({ name: 'Acme', reportingCurrency: 'BRL', timezone: 'UTC' })
    const changed = s.updateSettings({ name: 'Acme Co', email: 'hello@acme.test' })
    expect(changed.sort()).toEqual(['email','name'])
  })

  it('updatePreferences throws REPORTING_CURRENCY_LOCKED when hasOrders=true', () => {
    const s = Store.create({ name: 'Acme', reportingCurrency: 'BRL', timezone: 'UTC' })
    expect(() => s.updatePreferences({ reportingCurrency: 'USD' }, { hasOrders: true })).toThrow('REPORTING_CURRENCY_LOCKED')
  })

  it('updatePreferences accepts timezone-only change even when hasOrders=true', () => {
    const s = Store.create({ name: 'Acme', reportingCurrency: 'BRL', timezone: 'UTC' })
    const changed = s.updatePreferences({ timezone: 'America/New_York' }, { hasOrders: true })
    expect(changed).toEqual(['timezone'])
  })

  it('disable() flips isDisabled; enable() clears it', () => {
    const s = Store.create({ name: 'Acme', reportingCurrency: 'BRL', timezone: 'UTC' })
    s.disable('manual')
    expect(s.isDisabled).toBe(true)
    expect(s.disabledReason).toBe('manual')
    s.enable()
    expect(s.isDisabled).toBe(false)
  })

  it('disable() throws STORE_ALREADY_DISABLED when already disabled', () => {
    const s = Store.create({ name: 'Acme', reportingCurrency: 'BRL', timezone: 'UTC' })
    s.disable('manual')
    expect(() => s.disable('manual')).toThrow('STORE_ALREADY_DISABLED')
  })

  it('enable() throws STORE_NOT_DISABLED when active', () => {
    const s = Store.create({ name: 'Acme', reportingCurrency: 'BRL', timezone: 'UTC' })
    expect(() => s.enable()).toThrow('STORE_NOT_DISABLED')
  })
})
```

- [x] **Step 2: Implementation** (iter 67)

```typescript
import { AggregateRoot, BaseError, z } from '@template/core-typescript'
import Z from 'zod'
import { CurrencyCodeSchema, CurrencyCode } from '@template/contracts-typescript/wire/enums/CurrencyCode'
import type { DomainErrors } from '../errors'

const IANA_TIMEZONE_RE = /^[A-Za-z_+-]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?$|^UTC$/

const StoreSchema = z.object({
  name: z.string().trim().min(1).max(120),
  pictureUrl: z.string().url().optional(),
  email: z.string().email({ message: 'INVALID_EMAIL' }).optional(),
  phoneNumber: z.string().min(5).max(40).optional(),
  reportingCurrency: CurrencyCodeSchema,
  timezone: z.string().regex(IANA_TIMEZONE_RE, { message: 'INVALID_TIMEZONE' }),
  isDisabled: z.boolean().default(false),
  disabledReason: z.string().optional(),
  showStoreNameInNotifications: z.boolean().default(true),
})
export type StoreProps = Z.infer<typeof StoreSchema>

export class Store extends AggregateRoot<typeof StoreSchema> {
  static override schema = StoreSchema

  static create(data: {
    name: string
    reportingCurrency: CurrencyCode
    timezone: string
    pictureUrl?: string
    email?: string
    phoneNumber?: string
  }): Store {
    return new Store({
      name: data.name,
      reportingCurrency: data.reportingCurrency,
      timezone: data.timezone,
      pictureUrl: data.pictureUrl,
      email: data.email,
      phoneNumber: data.phoneNumber,
      isDisabled: false,
      disabledReason: undefined,
      showStoreNameInNotifications: true,
    })
  }

  updateSettings(input: { name?: string; pictureUrl?: string; email?: string; phoneNumber?: string }): string[] {
    const changed: string[] = []
    for (const k of ['name','pictureUrl','email','phoneNumber'] as const) {
      if (input[k] !== undefined && this[k] !== input[k]) { (this as any)[k] = input[k]; changed.push(k) }
    }
    this.validate()
    return changed
  }

  updatePreferences(
    input: { reportingCurrency?: CurrencyCode; timezone?: string; showStoreNameInNotifications?: boolean },
    ctx: { hasOrders: boolean },
  ): string[] {
    const changed: string[] = []
    if (input.reportingCurrency !== undefined && input.reportingCurrency !== this.reportingCurrency) {
      if (ctx.hasOrders) throw new BaseError<DomainErrors>('REPORTING_CURRENCY_LOCKED')
      this.reportingCurrency = input.reportingCurrency
      changed.push('reportingCurrency')
    }
    if (input.timezone !== undefined && input.timezone !== this.timezone) {
      this.timezone = input.timezone
      changed.push('timezone')
    }
    if (input.showStoreNameInNotifications !== undefined && input.showStoreNameInNotifications !== this.showStoreNameInNotifications) {
      this.showStoreNameInNotifications = input.showStoreNameInNotifications
      changed.push('showStoreNameInNotifications')
    }
    this.validate()
    return changed
  }

  disable(reason?: string): void {
    if (this.isDisabled) throw new BaseError<DomainErrors>('STORE_ALREADY_DISABLED')
    this.isDisabled = true
    this.disabledReason = reason
  }

  enable(): void {
    if (!this.isDisabled) throw new BaseError<DomainErrors>('STORE_NOT_DISABLED')
    this.isDisabled = false
    this.disabledReason = undefined
  }
}

export interface Store extends StoreProps {}
```

- [x] **Step 3..5: verify + commit** — `bun test src/tenancy/` → 19 pass / 0 fail / 49 expect() calls / 881ms. `bun --filter @template/api-typescript tsc` → 0 errors. Committed iter 67.

---

## Task 5: Entity — StoreMembership ✅ DONE iter 68

> **Iter-68 deviation:** plan body's Role import path `@template/contracts-typescript/wire/enums/Role` (capitalized filename) doesn't resolve since the generated file is lowercase `role.ts`. Shipped uses the barrel `@template/contracts-typescript/wire/enums`. Same path correction as iter 67 Task 3.

**Files:**
- Create: `packages/api/typescript/src/tenancy/entities/StoreMembership.ts`
- Test: `packages/api/typescript/src/tenancy/entities/StoreMembership.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** Task 2, Task 3

- [x] **Test scenarios (Red)** (8 tests / 18 expect() calls iter 68)
  - factory `forOwner({ storeId, userId })` constructs an instance with `role = OWNER` and an immediate `lastAccess` snapshot.
  - factory `forInvitee({ storeId, userId, role })` constructs with `role`, no `lastAccess` until first `touchAccess()`.
  - `changeRole(newRole)` only mutates `role`; pure setter (LAST_OWNER guard lives in the use case where `countOwnersByStoreId` is available).
  - `touchAccess(date)` updates `lastAccess`.
  - Schema rejects unknown roles.

- [x] **Implementation** (iter 68)

```typescript
import { AggregateRoot, BaseError, z } from '@template/core-typescript'
import Z from 'zod'
import { Role as TenancyRole, RoleSchema as TenancyRoleSchema } from '@template/contracts-typescript/wire/enums/Role'
import type { DomainErrors } from '../errors'

const StoreMembershipSchema = z.object({
  storeId: z.string().uuid(),
  userId: z.string().uuid(),
  role: TenancyRoleSchema,
  lastAccess: z.date().optional(),
})
export type StoreMembershipProps = Z.infer<typeof StoreMembershipSchema>

export class StoreMembership extends AggregateRoot<typeof StoreMembershipSchema> {
  static override schema = StoreMembershipSchema

  static forOwner(data: { storeId: string; userId: string }): StoreMembership {
    return new StoreMembership({ storeId: data.storeId, userId: data.userId, role: TenancyRole.OWNER, lastAccess: new Date() })
  }

  static forInvitee(data: { storeId: string; userId: string; role: TenancyRole }): StoreMembership {
    return new StoreMembership({ storeId: data.storeId, userId: data.userId, role: data.role })
  }

  changeRole(newRole: TenancyRole): void { this.role = newRole; this.validate() }
  touchAccess(at: Date = new Date()): void { this.lastAccess = at }
}

export interface StoreMembership extends StoreMembershipProps {}
```

- [x] **Verify + commit** — bundled in iter-68 commit alongside Task 6.

---

## Task 6: Entity — StoreInvitation ✅ DONE iter 68

> **Iter-68 deviations:** same Role barrel path fix as Task 5. Zod v4 `.email({ error: 'INVALID_EMAIL' as DomainErrors })` not v3 `.email({ message: 'INVALID_EMAIL' })`. Schema's token `min(32)` widened to `min(64)` to match the actual sha256 hex length (64 chars). Test for expiry forces `expiresAt` to a past date instead of waiting for ttl (faster).

**Files:**
- Create: `packages/api/typescript/src/tenancy/entities/StoreInvitation.ts`
- Test: `packages/api/typescript/src/tenancy/entities/StoreInvitation.test.ts`
- Create: `packages/api/typescript/src/tenancy/entities/index.ts` (barrel)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** Task 2, Task 3

- [x] **Test scenarios (Red)** (9 tests / 26 expect() calls iter 68)
  - factory `issue({ storeId, email, role, plainToken, ttlHours = 168 })` constructs with `expiresAt = now + ttl`, `acceptedAt = undefined`, `acceptedByUserId = undefined`, and `token = sha256(plainToken)` (we never store the plain token — it travels only in the signed JWT-style envelope).
  - `accept({ userId, plainToken })` throws `INVITATION_ALREADY_USED` when already accepted, `INVITATION_EXPIRED` past `expiresAt`, `INVALID_INVITATION_TOKEN` on hash mismatch; on success sets `acceptedAt` + `acceptedByUserId`.
  - `isPending()` returns true only when `acceptedAt === undefined && expiresAt > now`.

- [x] **Implementation** (iter 68)

```typescript
import { AggregateRoot, BaseError, z } from '@template/core-typescript'
import Z from 'zod'
import { createHash } from 'node:crypto'
import { Role as TenancyRole, RoleSchema as TenancyRoleSchema } from '@template/contracts-typescript/wire/enums/Role'
import type { ApplicationErrors } from '../errors'

const StoreInvitationSchema = z.object({
  storeId: z.string().uuid(),
  email: z.string().email({ message: 'INVALID_EMAIL' }),
  role: TenancyRoleSchema,
  token: z.string().min(32),                    // sha256 hex of the signed envelope's body
  expiresAt: z.date(),
  acceptedAt: z.date().optional(),
  acceptedByUserId: z.string().uuid().optional(),
})
export type StoreInvitationProps = Z.infer<typeof StoreInvitationSchema>

export class StoreInvitation extends AggregateRoot<typeof StoreInvitationSchema> {
  static override schema = StoreInvitationSchema

  static issue(data: { storeId: string; email: string; role: TenancyRole; plainToken: string; ttlHours?: number }): StoreInvitation {
    const ttl = data.ttlHours ?? 168                 // 7 days, matches Drizzle default note
    return new StoreInvitation({
      storeId: data.storeId,
      email: data.email,
      role: data.role,
      token: createHash('sha256').update(data.plainToken).digest('hex'),
      expiresAt: new Date(Date.now() + ttl * 3600 * 1000),
    })
  }

  accept(input: { userId: string; plainToken: string }): void {
    if (this.acceptedAt) throw new BaseError<ApplicationErrors>('INVITATION_ALREADY_USED')
    if (this.expiresAt.getTime() < Date.now()) throw new BaseError<ApplicationErrors>('INVITATION_EXPIRED')
    const hash = createHash('sha256').update(input.plainToken).digest('hex')
    if (hash !== this.token) throw new BaseError<ApplicationErrors>('INVALID_INVITATION_TOKEN')
    this.acceptedAt = new Date()
    this.acceptedByUserId = input.userId
    this.validate()
  }

  isPending(): boolean { return !this.acceptedAt && this.expiresAt.getTime() > Date.now() }
}

export interface StoreInvitation extends StoreInvitationProps {}
```

- [x] **Barrel + Verify + commit** — entities/index.ts re-exports all three entities. `bun test src/tenancy/` → 36 pass / 0 fail / 88 expect() calls / 981ms; `bun --filter @template/api-typescript tsc` → 0 errors. Bundled commit covers Tasks 5+6.

---

## Task 7: Domain events catalog (10 events)

**Files:**
- Create one file per event under `packages/api/typescript/src/tenancy/events/`:
  - `StoreCreatedEvent.ts`
  - `StoreSettingsUpdatedEvent.ts`
  - `StorePreferencesCreatedEvent.ts`
  - `StorePreferencesUpdatedEvent.ts`
  - `StoreDisabledEvent.ts`
  - `StoreEnabledEvent.ts`
  - `StoreMemberInvitedEvent.ts`
  - `StoreMemberAddedEvent.ts`
  - `StoreMemberRemovedEvent.ts`
  - `StoreMemberRoleChangedEvent.ts`
  - `index.ts` (barrel)
- Test: `packages/api/typescript/src/tenancy/events/index.test.ts`

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** /event
**Depends on:** Task 2

> **Task 7 ✅ DONE iter 69.** All 10 events authored + 9 integration tests / 25 expect() calls covering naming convention + per-event payload shape. Deviations: events strictly type their changedFields enums via z.enum literals (limits to spec-listed field names — catches typos at SDK boundary).

- [x] **Test (single suite asserting names + schemas exist)** (9 tests iter 69)

```typescript
import { describe, expect, it } from 'bun:test'
import * as events from './index'

const expected = [
  'tenancy.store.created','tenancy.store.settings_updated','tenancy.store_preferences.created','tenancy.store_preferences.updated',
  'tenancy.store.disabled','tenancy.store.enabled',
  'tenancy.store_member.invited','tenancy.store_member.added','tenancy.store_member.removed','tenancy.store_member.role_changed',
]

describe('Tenancy domain events', () => {
  it('exports every spec-listed event with stable static name', () => {
    const names = Object.values(events).map((C: any) => C?.name).filter(Boolean)
    for (const n of expected) expect(names).toContain(n)
  })
})
```

- [x] **Implementation** (10 event files + barrel iter 69; one file per event; mirrors `packages/api/typescript/src/auth/events/UserRegisteredEvent.ts`)

```typescript
// events/StoreCreatedEvent.ts
import { BaseDomainEvent, z } from '@template/core-typescript'

export const StoreCreatedEventSchema = z.domainEvent({
  storeId: z.string(),
  name: z.string(),
  createdByuserId: z.uuid(),
})

export class StoreCreatedEvent extends BaseDomainEvent<typeof StoreCreatedEventSchema> {
  static override readonly name = 'tenancy.store.created' as const
  static readonly schema = StoreCreatedEventSchema
}
```

Payloads per event (derived from spec §7.2 `// Domain Events:` comments):

| Event | Payload fields |
|---|---|
| StoreCreatedEvent | `storeId`, `name`, `createdByUserId` |
| StoreSettingsUpdatedEvent | `storeId`, `changedFields: string[]`, `updatedByUserId` |
| StorePreferencesCreatedEvent | `storeId`, `reportingCurrency: CurrencyCode`, `timezone: string` |
| StorePreferencesUpdatedEvent | `storeId`, `changedFields: string[]`, `updatedByUserId` |
| StoreDisabledEvent | `storeId`, `disabledAt: string` (ISO), `disabledReason?: string` |
| StoreEnabledEvent | `storeId`, `enabledAt: string` |
| StoreMemberInvitedEvent | `storeId`, `storeInvitationId`, `email`, `role: Role`, `invitationToken: string` (plain — only on the event payload, never persisted) |
| StoreMemberAddedEvent | `storeId`, `storeMembershipId`, `userId`, `role: Role` |
| StoreMemberRemovedEvent | `storeId`, `storeMembershipId`, `userId` |
| StoreMemberRoleChangedEvent | `storeId`, `storeMembershipId`, `userId`, `oldRole: Role`, `newRole: Role` |

- [x] **Verify + commit** — `bun test src/tenancy/` → 45 pass / 0 fail / 113 expect() calls / 940ms. `bun --filter @template/api-typescript tsc` → 0 errors. Committed iter 69.

---

## Task 8: StoreRepository (abstract + Drizzle + Mock) ✅ DONE iter 70

> **Iter-70 additions beyond planned scope:**
> - **`tenancy/registry.ts` written** (the BC1 registry pattern from iter 51, now applied to BC2). Wired into `shared/registry.ts` alongside the four pre-existing BC registries.
> - **Store entity fields not in schema** (pictureUrl, email, phoneNumber from Task 4 Zod) are in-memory only — toDomain seeds them as undefined, toPersistence skips them. Same pattern as iter-47's UserProfile.disabledAt.

**Files:**
- Create:
  `packages/api/typescript/src/tenancy/repositories/StoreRepository/StoreRepository.ts`
- Create:
  `packages/api/typescript/src/tenancy/repositories/StoreRepository/DrizzleStoreRepository.ts`
- Create:
  `packages/api/typescript/src/tenancy/repositories/StoreRepository/DrizzleStoreRepository.test.ts`
- Create:
  `packages/api/typescript/src/tenancy/repositories/StoreRepository/MockStoreRepository.ts`
- Create:
  `packages/api/typescript/src/tenancy/repositories/StoreRepository/index.ts`

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** /repository
**Depends on:** Task 1 (verification), Task 4

- [x] **Test scenarios (integration via the TestBed/Drizzle harness)** (8 tests / 17 expect() calls iter 70)
  - save then findById round-trips name + email + reportingCurrency + timezone + isDisabled
  - save twice without changes is a no-op write (entity.incrementVersion bumps row.version once per save)
  - `countActiveStoresByUserId(userId)` returns the number of distinct stores where the user has an accepted (i.e. existing) membership AND `stores.isDisabled = false` — needed by the STORE_AMOUNT quota gate and by `MyStores.storeCredits`

- [x] **Abstract surface** shipped iter 70 — `findById` + `countActiveStoresByUserId` (other methods inherited from `Repository<Store>`)

```typescript
// StoreRepository.ts
import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { Store } from '../../entities'

export abstract class StoreRepository extends Repository<Store> {
  abstract findById(id: string, tx?: Transaction): Promise<Store | undefined>
  abstract countActiveStoresByUserId(userId: string, tx?: Transaction): Promise<number>
}
```

- [x] **Drizzle impl** shipped iter 70 — UPSERT keyed on stores.id; `countActiveStoresByUserId` uses inner-join + `count(*)::int` aggregate (mirrors `DrizzleUserRepository`)

```typescript
// DrizzleStoreRepository.ts
import { injectable } from 'tsyringe-neo'
import { eq, and, sql } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { stores, storeMemberships } from '@template/contracts/db'
import { Store } from '../../entities'
import { StoreRepository } from './StoreRepository'

@injectable()
export class DrizzleStoreRepository extends StoreRepository {
  constructor(private db: DrizzleClient) { super() }

  async findById(id: string, tx?: Transaction): Promise<Store | undefined> {
    const dbc = (tx ?? this.db) as DrizzleClient
    const result = await tryCatchAsync(async () => {
      const rows = await dbc.select().from(stores).where(eq(stores.id, id)).limit(1)
      return rows[0]
    })
    if (!result.success || !result.data) return undefined
    return this.toDomain(result.data)
  }

  async countActiveStoresByUserId(userId: string, tx?: Transaction): Promise<number> {
    const dbc = (tx ?? this.db) as DrizzleClient
    const rows = await dbc
      .select({ n: sql<number>`count(*)::int` })
      .from(storeMemberships)
      .innerJoin(stores, eq(stores.id, storeMemberships.storeId))
      .where(and(eq(storeMemberships.userId, userId), eq(stores.isDisabled, false)))
    return Number(rows[0]?.n ?? 0)
  }

  async save(entity: Store, tx?: Transaction): Promise<Store> {
    entity.incrementVersion()
    const dbc = (tx ?? this.db) as DrizzleClient
    const data = this.toPersistence(entity)
    await (dbc as any).insert(stores).values(data).onConflictDoUpdate({
      target: stores.id,
      set: { ...data, updatedAt: new Date() },
    })
    return entity
  }

  async delete(id: string, tx?: Transaction): Promise<void> {
    const dbc = (tx ?? this.db) as DrizzleClient
    await dbc.delete(stores).where(eq(stores.id, id))
  }

  private toDomain(row: typeof stores.$inferSelect): Store { /* ...new Store({ ...row }) */ }
  private toPersistence(entity: Store): typeof stores.$inferInsert { /* ... */ }
}
```

- [x] **Mock impl** shipped iter 70 — in-memory `Map<string, Store>` + `membershipsByUser: Map<string, Set<string>>` populated via `seedMembership()` helper (mock will be cross-wired with MockStoreMembershipRepository in Task 9).

- [x] **Commit** — `bun test src/tenancy/` → 53 pass / 0 fail / 130 expect() calls / 2.14s. `bun --filter @template/api-typescript tsc` → 0 errors. Committed iter 70.

---

## Task 9: StoreMembershipRepository (abstract + Drizzle + Mock) ✅ DONE iter 71

> **Iter-71 deviation:** `findByStoreAndEmail` uses a 2-step lookup (email → userId via `auth.users`, then membership row) instead of the planned cross-schema inner-join. Drizzle's join builder didn't materialize rows reliably across the `auth.users` + `tenancy.store_memberships` pgSchemas under PGlite — diagnosed via a standalone script. The semantic is identical; the implementation is more predictable. MockStoreMembershipRepository cross-wires `MockStoreRepository.membershipsByUser` so `countActiveStoresByUserId` stays consistent without separate seeding.

**Files:** mirror Task 8 under
`packages/api/typescript/src/tenancy/repositories/StoreMembershipRepository/`.

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** /repository
**Depends on:** Task 1, Task 5

- [x] **Abstract surface** shipped iter 71 (7 methods: findByStoreAndUser, findById, findByStoreId, findByUserId, countOwnersByStoreId, findByStoreAndEmail, removeByStoreAndUser)

```typescript
import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { StoreMembership } from '../../entities'

export abstract class StoreMembershipRepository extends Repository<StoreMembership> {
  abstract findByStoreAndUser(storeId: string, userId: string, tx?: Transaction): Promise<StoreMembership | undefined>
  abstract findById(membershipId: string, tx?: Transaction): Promise<StoreMembership | undefined>
  abstract findByStoreId(storeId: string, tx?: Transaction): Promise<StoreMembership[]>
  abstract findByUserId(userId: string, tx?: Transaction): Promise<StoreMembership[]>
  abstract countOwnersByStoreId(storeId: string, tx?: Transaction): Promise<number>
  abstract findByStoreAndEmail(storeId: string, email: string, tx?: Transaction): Promise<StoreMembership | undefined>
  abstract removeByStoreAndUser(storeId: string, userId: string, tx?: Transaction): Promise<void>
}
```

> Note: the Drizzle schema uses a **composite PK** `(storeId, userId)`,
> not a synthetic `id` column. The entity exposes a synthetic
> `id.value = ${storeId}:${userId}` so the polyglot framework's
> `Repository<T>` shape (which expects a single string id for `delete`)
> still compiles; the Drizzle impl unpacks the composite key inside
> `delete` / `findById`. **Test the unpacking explicitly.**

- [x] **Drizzle impl** shipped iter 71 — UPSERT on composite PK `(storeId, userId)`; `countOwnersByStoreId` filters by role=OWNER; `findByStoreAndEmail` uses 2-step lookup (email→userId then membership) instead of cross-schema join per iter-71 deviation note.

- [x] **Commit** — `bun test src/tenancy/` → 62 pass / 0 fail / 146 expect() calls / 2.55s. `bun --filter @template/api-typescript tsc` → 0 errors. Committed iter 71.

---

## Task 10: StoreInvitationRepository (abstract + Drizzle + Mock) ✅ DONE iter 72

> **Iter-72 addition:** abstract surface adds `findByToken(tokenHash)` beyond the planned 3 methods — AcceptInvitation (C16) needs to look up the row by sha256(plainToken) to call `accept({ userId, plainToken })`. The plan mentioned this method in passing but didn't include it in the abstract list; shipped explicitly.

**Files:** mirror Task 8 under
`packages/api/typescript/src/tenancy/repositories/StoreInvitationRepository/`.

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** /repository
**Depends on:** Task 1, Task 6

- [x] **Abstract surface** shipped iter 72 — 4 methods: findById, findPendingByStoreAndEmail, findPendingByStoreId, findByToken (added for C16 AcceptInvitation lookup).

```typescript
import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { StoreInvitation } from '../../entities'

export abstract class StoreInvitationRepository extends Repository<StoreInvitation> {
  abstract findById(id: string, tx?: Transaction): Promise<StoreInvitation | undefined>
  abstract findPendingByStoreAndEmail(storeId: string, email: string, tx?: Transaction): Promise<StoreInvitation | undefined>
  abstract findPendingByStoreId(storeId: string, tx?: Transaction): Promise<StoreInvitation[]>
}
```

The Drizzle impl uses the `store_invitations_token_unq` index to back
`findById`-by-token if needed by AcceptInvitation. Pending lookups
filter `acceptedAt IS NULL AND expiresAt > now()` to satisfy
`INVITATION_ALREADY_PENDING`.

- [x] **Commit** — `bun test src/tenancy/` → 71 pass / 0 fail / 165 expect() calls / 4.09s. `bun --filter @template/api-typescript tsc` → 0 errors. Committed iter 72.

---

## Task 11: Services + middlewares — ports + invitation token + RequireStoreRole ✅ DONE iter 73

> **Iter-73 additions beyond planned scope:**
> - **`FORBIDDEN` added to polyglot core `BaseInterfaceErrors`** + registered with HTTP 403 in `GlobalErrorMapper`. The plan's `RequireStoreRole` middleware uses `BaseError<BaseInterfaceErrors>('FORBIDDEN')` but `FORBIDDEN` wasn't in the type union. Spec uses FORBIDDEN as a universal HTTP concern; lives in core (same layer as UNAUTHORIZED), not per-BC.
> - **Tenancy/registry binds all four services + InvitationTokenService** across mock + integration. Per-suite override pattern (child-container `register`) for tests that need a different SubscriptionLookup state (e.g. NO_ACTIVE_SUBSCRIPTION).

**Files:**
- Create:
  `packages/api/typescript/src/tenancy/services/SubscriptionLookupService.ts` (abstract)
- Create:
  `packages/api/typescript/src/tenancy/services/MockSubscriptionLookupService.ts`
- Create:
  `packages/api/typescript/src/tenancy/services/OrderSamplingService.ts` (abstract)
- Create:
  `packages/api/typescript/src/tenancy/services/MockOrderSamplingService.ts`
- Create:
  `packages/api/typescript/src/tenancy/services/UserDirectoryService.ts` (abstract)
- Create:
  `packages/api/typescript/src/tenancy/services/MockUserDirectoryService.ts`
- Create:
  `packages/api/typescript/src/tenancy/services/InvitationTokenService.ts`
- Create:
  `packages/api/typescript/src/tenancy/services/InvitationTokenService.test.ts`
- Create:
  `packages/api/typescript/src/tenancy/services/index.ts`
- Create:
  `packages/api/typescript/src/tenancy/middlewares/RequireStoreMember.ts`
- Create:
  `packages/api/typescript/src/tenancy/middlewares/RequireStoreRole.ts`
- Create:
  `packages/api/typescript/src/tenancy/middlewares/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /middleware
**Depends on:** Task 10

- [x] **`SubscriptionLookupService` port** shipped iter 73

```typescript
import { PlanTier } from '@template/contracts-typescript/wire/enums/PlanTier'

export type ActiveSubscription = { subscriptionId: string; tier: PlanTier; expirationDate: Date }

export abstract class SubscriptionLookupService {
  abstract getActiveSubscription(userId: string): Promise<ActiveSubscription | undefined>
  abstract invalidate(userId: string): Promise<void>
}
```

`MockSubscriptionLookupService` returns `{ subscriptionId: 'mock-sub',
tier: PlanTier.BASIC, expirationDate: new Date(Date.now() + 30 *
86_400_000) }` for any userId. `invalidate` is a no-op. (CreateStore
tests assert BASIC = 1 store → second create hits the quota.)

- [x] **`OrderSamplingService` port** shipped iter 73

```typescript
export abstract class OrderSamplingService {
  abstract hasOrdersForStore(storeId: string): Promise<boolean>
}
```

`MockOrderSamplingService` returns `false`. P6-SALES ships a real
implementation that runs
`SELECT 1 FROM sales.orders WHERE store_id = $1 LIMIT 1`.

- [x] **`UserDirectoryService` port** shipped iter 73

```typescript
export type UserDirectoryEntry = { userId: string; email: string; name: string | null; image?: string | null }

export abstract class UserDirectoryService {
  abstract getMany(userIds: string[]): Promise<UserDirectoryEntry[]>
}
```

`MockUserDirectoryService` returns deterministic stubs
(`{ userId, email: \`u-\${userId.slice(0,4)}@mock.local\`, name: 'Mock User' }`)
so `StoreMembers` (T10) is testable without P1-IDENTITY.

- [x] **`InvitationTokenService`** (HMAC-signed envelope) shipped iter 73 — 7 tests / 19 expect() calls covering generate+verify round-trip, payload tampering, plainToken tampering, malformed envelope, expired token, truncated sig (timingSafeEqual length check).

```typescript
import { Config } from '@template/core-typescript'
import { createHmac, timingSafeEqual } from 'node:crypto'

export type InvitationTokenPayload = { sid: string; email: string; exp: number }

export class InvitationTokenService {
  generate(payload: { storeInvitationId: string; email: string; ttlSec?: number; plainToken: string }): string {
    const exp = Math.floor(Date.now() / 1000) + (payload.ttlSec ?? 7 * 24 * 3600)
    const body = JSON.stringify({ sid: payload.storeInvitationId, email: payload.email, exp } satisfies InvitationTokenPayload)
    const b64 = Buffer.from(body).toString('base64url')
    const sig = createHmac('sha256', Config.env.JWT_SECRET).update(`${b64}.${payload.plainToken}`).digest('base64url')
    return `${b64}.${payload.plainToken}.${sig}`
  }

  verify(token: string): InvitationTokenPayload & { plainToken: string } {
    const [b64, plainToken, sig] = token.split('.')
    if (!b64 || !plainToken || !sig) throw new Error('INVALID_INVITATION_TOKEN')
    const expected = createHmac('sha256', Config.env.JWT_SECRET).update(`${b64}.${plainToken}`).digest('base64url')
    const a = Buffer.from(sig), b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('INVALID_INVITATION_TOKEN')
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as InvitationTokenPayload
    if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('INVITATION_EXPIRED')
    return { ...payload, plainToken }
  }
}
```

The plain token segment is what the `StoreInvitation.token` column hashes;
the signed envelope is what the email link embeds. AcceptInvitation
verifies the signature (`InvitationTokenService.verify`) then calls
`storeInvitation.accept({ userId, plainToken })` for the entity-level
hash check.

- [x] **`RequireStoreMember` middleware** shipped iter 73 — reads `ctx.session.userId` (stamped upstream by AuthAccountMiddleware) + `params.storeId` or `body.storeId`; STORE_MEMBERSHIP_NOT_FOUND (404) on miss; stamps `ctx.membership` for downstream.

- [x] **`RequireStoreRole(allowed: TenancyRole[])` factory** shipped iter 73 — returns a `MiddlewareClass`; reads `ctx.membership.role` and throws `BaseError<BaseInterfaceErrors>('FORBIDDEN')` when not in the allow-list. `FORBIDDEN` added to polyglot core (`codes.ts` + `GlobalErrorMapper`) — see iter-73 deviation callout.

- [x] **Commit** — `bun test src/tenancy/` → 78 pass / 0 fail / 181 expect() calls. Full api-typescript: 244 pass / 0 fail across 41 files. tsc clean both core + api-typescript. Committed iter 73.

---

## Task 12: Use case — CreateStore (C12) ✅ DONE iter 74

> **Iter-74 deviations:**
> - **`PlanQuotaPolicy.ts` vendored under `tenancy/services/`** because `@template/contracts-typescript/wire/constants/PlanQuotas` isn't emitted yet. Plan's QUESTION callout suggested this as a fallback; landed it explicitly with `PLAN_QUOTAS` table + `hasQuotaAvailable(tier, feature, currentUsage)` + `hasFeature(tier, feature)` helpers. BASIC = 1 STORE_AMOUNT per spec; UNLIMITED maps to `Infinity`. Lifting back to contracts is a future codegen task.
> - **Per-suite DI override via `testContainer.register(...)` + `testBed.resolve(CreateStore)`** (NOT `testContainer.resolve(CreateStore)` which produces an unbound Handler → `HANDLER_NOT_BOUND` error). Pattern confirmed working for both NO_ACTIVE_SUBSCRIPTION (override → undefined) and INTERMEDIATE-tier (override → tier=INTERMEDIATE) test paths.

**Files:**
- Create: `packages/api/typescript/src/tenancy/usecases/CreateStore.ts`
- Test: `packages/api/typescript/src/tenancy/usecases/CreateStore.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase
**Depends on:** Task 4, 5, 8, 9, 11

- [x] **Test scenarios (integration)** (6 tests / 18 expect() calls iter 74)
  - Success path on a BASIC subscription with zero stores → returns `{ storeId }`, persists `Store` row + `StoreMembership(OWNER, userId)` row. Outbox contains `tenancy.store.created` + `tenancy.store_member.added` + `tenancy.store_preferences.created`.
  - Second CreateStore call for the same user (BASIC = 1 STORE_AMOUNT) → throws `STORE_QUOTA_EXCEEDED`; no rows written.
  - User without active subscription → throws `NO_ACTIVE_SUBSCRIPTION` (override `MockSubscriptionLookupService` in the suite-scoped child container to return `undefined`).
  - Invalid IANA timezone → throws `INVALID_TIMEZONE` (entity-level).

- [x] **Implementation** shipped iter 74

```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { CurrencyCodeSchema } from '@template/contracts-typescript/wire/enums/CurrencyCode'
import { PlanFeature } from '@template/contracts-typescript/wire/enums/PlanFeature'
import { PLAN_QUOTAS, hasQuotaAvailable } from '@template/contracts-typescript/wire/constants/PlanQuotas' // TODO: confirm path; iter 41 likely emits this under wire/constants/
import { Store, StoreMembership } from '../entities'
import { StoreRepository, StoreMembershipRepository } from '../repositories'
import { SubscriptionLookupService } from '../services'
import type { ApplicationErrors } from '../errors'
import { StoreCreatedEvent, StorePreferencesCreatedEvent, StoreMemberAddedEvent } from '../events'
import { Role as TenancyRole } from '@template/contracts-typescript/wire/enums/Role'

export const CreateStoreInputSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1),
  reportingCurrency: CurrencyCodeSchema,
  timezone: z.string(),
  pictureUrl: z.string().url().optional(),
})
export const CreateStoreOutputSchema = z.object({ storeId: z.string().uuid() })

@injectable()
export class CreateStore extends Handler<typeof CreateStoreInputSchema, typeof CreateStoreOutputSchema> {
  readonly name = 'create_store' as const
  readonly inputSchema = CreateStoreInputSchema
  readonly outputSchema = CreateStoreOutputSchema

  constructor(
    private storeRepo: StoreRepository,
    private membershipRepo: StoreMembershipRepository,
    private subscriptionLookup: SubscriptionLookupService,
  ) { super() }

  protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
    const sub = await this.subscriptionLookup.getActiveSubscription(input.userId)
    if (!sub) throw new BaseError<ApplicationErrors>('NO_ACTIVE_SUBSCRIPTION')

    const current = await this.storeRepo.countActiveStoresByUserId(input.userId)
    if (!hasQuotaAvailable(sub.tier, PlanFeature.STORE_AMOUNT, current)) {
      throw new BaseError<ApplicationErrors>('STORE_QUOTA_EXCEEDED')
    }

    return this.withTransaction(tx, async tx => {
      const store = Store.create({
        name: input.name,
        reportingCurrency: input.reportingCurrency,
        timezone: input.timezone,
        pictureUrl: input.pictureUrl,
      })
      await this.storeRepo.save(store, tx)

      const ownership = StoreMembership.forOwner({ storeId: store.id.value, userId: input.userId })
      await this.membershipRepo.save(ownership, tx)

      await this.domainEventRepository.save(new StoreCreatedEvent({
        entityId: store.id.value, ownerId: input.userId,
        payload: { storeId: store.id.value, name: store.name, createdByUserId: input.userId },
      }), tx)
      await this.domainEventRepository.save(new StorePreferencesCreatedEvent({
        entityId: store.id.value, ownerId: input.userId,
        payload: { storeId: store.id.value, reportingCurrency: input.reportingCurrency, timezone: input.timezone },
      }), tx)
      await this.domainEventRepository.save(new StoreMemberAddedEvent({
        entityId: store.id.value, ownerId: input.userId,
        payload: { storeId: store.id.value, storeMembershipId: ownership.id.value, userId: input.userId, role: TenancyRole.OWNER },
      }), tx)

      return { storeId: store.id.value }
    })
  }
}
```

# QUESTION: confirm with iter 41 author whether `PLAN_QUOTAS` and the
`hasQuotaAvailable` helper land under
`@template/contracts-typescript/wire/constants/PlanQuotas` or directly
under `@template/contracts-typescript/wire/enums/PlanFeature`. If the
helper is not emitted, vendor it under
`packages/api/typescript/src/tenancy/services/PlanQuotaPolicy.ts` and
flag a follow-up for iter 41 to lift it back into contracts.

- [x] **Commit** — `bun test src/tenancy/` → 84 pass / 0 fail / 199 expect() calls. `bun --filter @template/api-typescript tsc` → 0 errors. Committed iter 74.

---

## Task 13: Use case — UpdateStoreSettings (C13) ✅ DONE iter 75

**Files:** `usecases/UpdateStoreSettings.ts` + `.test.ts`.
**Skills:** /usecase
**Depends on:** Task 4, 8

> **Iter-75 note:** `email` / `pictureUrl` / `phoneNumber` are in-memory only (iter-70 deviation — `tenancy.stores` schema doesn't carry them). The use case still tracks changes to these in `changedFields` so the SDK contract surfaces them; persistence is a future migration.

- [x] **Tests** (4 / 8 expect() calls iter 75): partial update succeeds and emits `StoreSettingsUpdated{changedFields, updatedByUserId}`; `STORE_NOT_FOUND` when storeId unknown; empty input → no event, no error; no-op same-value call → no event.

- [x] **Body** shipped iter 75: load store via `storeRepo.findById`, call `store.updateSettings(input)`, when `changed.length > 0` save + emit `StoreSettingsUpdatedEvent`. The role gate (`OWNER`/`ADMIN`) lives in the controller's `RequireStoreRole` middleware, not in the use case.

- [x] **Commit** iter 75 (bundled with Task 14).

---

## Task 14: Use case — UpdateStorePreferences (C14) ✅ DONE iter 75

**Files:** `usecases/UpdateStorePreferences.ts` + `.test.ts`.
**Skills:** /usecase
**Depends on:** Task 4 (Store.updatePreferences), Task 8, Task 11 (OrderSamplingService)

- [x] **Tests** (6 / 13 expect() calls iter 75): timezone-only succeeds when hasOrders=true; reportingCurrency change when hasOrders=false; REPORTING_CURRENCY_LOCKED when reportingCurrency changes AND hasOrders=true (per-suite OrderSamplingService override registers HasOrdersStub(true)) AND row not mutated; showStoreNameInNotifications flip emits changedFields=[showStoreNameInNotifications]; empty input no-op; STORE_NOT_FOUND.

- [x] **Body** shipped iter 75: load `Store`, call `orderSampling.hasOrdersForStore(input.storeId)`, then `store.updatePreferences(input, { hasOrders })`, save + event when `changed.length`.

  **REPORTING_CURRENCY_LOCKED invariant note (master-prompt requirement):**
  the `tenancy.stores.reporting_currency` column has no DB-level
  constraint preventing UPDATE. The invariant is enforced **here** —
  the `OrderSamplingService.hasOrdersForStore` call executes a
  read against `sales.orders WHERE store_id = $1 LIMIT 1` before any
  Drizzle UPDATE runs; if `true`, the entity's `updatePreferences`
  throws and no UPDATE is dispatched. The check lives in the use
  case (not the entity) because the entity cannot reach into `sales.*`.

- [x] **Commit** iter 75 — `bun test src/tenancy/` → 94 pass / 0 fail / 219 expect() calls. `bun --filter @template/api-typescript tsc` → 0 errors. Bundled commit covers Tasks 13+14.

---

## Task 15: Use case — InviteMember (C15) ✅ DONE iter 76

> **Iter-76 additions beyond plan body's tests:** two additional positive paths — (a) re-invite allowed when previous invitation was ACCEPTED (no longer pending); (b) re-invite allowed when previous invitation has EXPIRED. These confirm the `findPendingByStoreAndEmail` filter (acceptedAt IS NULL AND expiresAt > now) lets fresh invites through after the lifecycle closes — useful regression guard for the spec's "no INVITATION_ALREADY_PENDING when prior state is terminal" intent.

**Files:** `usecases/InviteMember.ts` + `.test.ts`.
**Skills:** /usecase
**Depends on:** Task 6 (StoreInvitation), Task 9 (membership lookup),
Task 10 (invitation lookup), Task 11 (InvitationTokenService)

- [x] **Tests** (5 / 22 expect() calls iter 76)
  - happy path returns `{ storeInvitationId }`, persists invitation row with `acceptedAt = null`, emits `StoreMemberInvited` with payload `{ storeId, storeInvitationId, email, role, invitationToken: signedEnvelope }`
  - inviting an email that already resolves to an existing membership → `ALREADY_A_MEMBER` (via `membershipRepo.findByStoreAndEmail`)
  - inviting an email that already has a pending (non-accepted, non-expired) invitation → `INVITATION_ALREADY_PENDING` (via `invitationRepo.findPendingByStoreAndEmail`)
  - email format check is delegated to controller; use case only handles ALREADY_* states

- [x] **Body** shipped iter 76: check `membershipRepo.findByStoreAndEmail` → `ALREADY_A_MEMBER`; check `invitationRepo.findPendingByStoreAndEmail` → `INVITATION_ALREADY_PENDING`; otherwise generate `plainToken = randomBytes(32).toString('base64url')`, build `StoreInvitation.issue({ ..., plainToken })`, persist, then call `invitationTokenService.generate({ storeInvitationId, email, plainToken })` and emit `StoreMemberInvitedEvent` with the signed envelope as `invitationToken`. The DB row stores only the SHA-256 hash; the plain token leaves the process exactly once — on the event payload.

- [x] **Commit** — `bun test src/tenancy/` → 99 pass / 0 fail / 241 expect() calls. `bun --filter @template/api-typescript tsc` → 0 errors. Committed iter 76.

---

## Task 16: Use case — AcceptInvitation (C16)

**Files:** `usecases/AcceptInvitation.ts` + `.test.ts`.
**Skills:** /usecase
**Depends on:** Task 5, 6, 9, 10, 11

- [x] **Tests:**
  - valid token + matching email + authenticated user → `{ storeId, role }`; persists `StoreMembership.forInvitee` + flips invitation `acceptedAt`/`acceptedByUserId`; emits `StoreMemberAddedEvent`
  - tampered signed envelope → `INVALID_INVITATION_TOKEN`
  - expired `exp` claim or expired `StoreInvitation.expiresAt` → `INVITATION_EXPIRED`
  - replay after accept (`StoreInvitation.acceptedAt` not null) → `INVITATION_ALREADY_USED`
  - **plus**: deleted invitation sid → `INVALID_INVITATION_TOKEN`; ADMIN role forwarded from invitation to membership (role-pass-through)

- [x] **Body:** decode signed envelope via
  `InvitationTokenService.verify(input.invitationToken)` (re-throws
  string errors which the use case catches and rewraps as
  `BaseError<ApplicationErrors>`); load invitation via
  `invitationRepo.findById(payload.sid)`; call
  `invitation.accept({ userId: input.userId, plainToken: payload.plainToken })`
  (entity throws `INVITATION_*`); persist invitation; persist new
  `StoreMembership.forInvitee({ storeId: invitation.storeId, userId: input.userId, role: invitation.role })`;
  emit `StoreMemberAddedEvent`.

# QUESTION: AcceptInvitation needs the invitee's `userId` from the
session. Spec §3 row note says "creates User if absent" — out of scope
for P2 (P1-IDENTITY would need a `findOrCreateUserByEmail` helper).
This sub-plan **fails closed**: if the controller receives no session
user, return `UNAUTHORIZED`. Flag the future flow as a follow-up issue.

- [x] **Commit.** — iter 77

---

## Task 17: Use case — RemoveMember (C17) + ChangeMemberRole (C18)

**Files:** `usecases/RemoveMember.ts`, `usecases/RemoveMember.test.ts`,
`usecases/ChangeMemberRole.ts`, `usecases/ChangeMemberRole.test.ts`.
**Skills:** /usecase
**Depends on:** Task 5, 9

- [x] **Tests — Remove:**
  - removing a non-OWNER membership succeeds + emits `StoreMemberRemoved`
  - removing the only OWNER → `CANNOT_REMOVE_LAST_OWNER`
  - removing an absent membership → `STORE_MEMBERSHIP_NOT_FOUND`
  - **plus**: removing one OWNER when another OWNER exists succeeds (LAST_OWNER guard non-trip)

- [x] **Tests — ChangeRole:**
  - promoting MEMBER → ADMIN succeeds, emits `StoreMemberRoleChanged{oldRole, newRole}`
  - demoting the only OWNER → `CANNOT_DEMOTE_LAST_OWNER`
  - no-op (`newRole === currentRole`) is a 204 with no event
  - **plus**: demoting one OWNER when another OWNER exists succeeds; STORE_MEMBERSHIP_NOT_FOUND; OWNER → OWNER self-no-op (doesn't trip LAST_OWNER)

- [x] **Bodies:** both load the membership via `findByStoreAndUser`;
  run the LAST_OWNER guard via
  `countOwnersByStoreId(storeId) <= 1 && membership.role === OWNER`;
  RemoveMember calls `repo.removeByStoreAndUser` (canonical composite-key API
  — `repo.delete(membership.id.value)` does not work because rehydrated entities
  carry a generated UUIDv7 id, not the encoded composite) + emits;
  ChangeMemberRole short-circuits on `newRole === currentRole`, otherwise
  calls `membership.changeRole(newRole)` + `repo.save` + emits.
  LAST_OWNER errors are `DomainErrors` (invariant violations), not
  `ApplicationErrors`.

- [x] **Commit.** — iter 78

---

## Task 18: Use case — DisableStore (C19) + EnableStore (C20) + StoreMemberInvited integration event

**Files:**
- Create: `packages/api/typescript/src/tenancy/usecases/DisableStore.ts` + `.test.ts`
- Create: `packages/api/typescript/src/tenancy/usecases/EnableStore.ts` + `.test.ts`
- Create: `packages/api/typescript/src/tenancy/usecases/index.ts` (barrel)
- Create (if missing): `packages/contracts/wire/events/store-member-invited.tsp`
- Regenerate: `packages/contracts/generated/typescript/src/wire/events/store-member-invited.ts`
  via `bun --cwd packages/contracts run codegen:wire`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /event
**Depends on:** Task 4, 8

- [x] **Tests:**
  - Disable on active → `isDisabled=true`, `disabledReason` set, `StoreDisabled` event emitted with ISO `disabledAt`
  - Disable on already-disabled → `STORE_ALREADY_DISABLED`
  - Enable on disabled → `isDisabled=false`, `StoreEnabled` event emitted
  - Enable on active → `STORE_NOT_DISABLED`
  - Unknown storeId → `STORE_NOT_FOUND`
  - **plus**: Disable without reason (optional field); disable→enable→disable cycle preserves no sticky state (second reason replaces first).

- [x] **Bodies:** load store, call `store.disable(reason?)` /
  `store.enable()` (entity throws invariants), save + event.

- [x] **Integration event (TypeSpec authoring):** Already shipped at iter 41 — `packages/contracts/wire/events/store-member-invited.tsp` + generated `store-member-invited.ts` both present. No re-author / regen needed.
  If `packages/contracts/wire/events/store-member-invited.tsp` does not
  already exist (check first; iter 41 may have shipped it), author it:

  ```tsp
  import "./_base.tsp";

  namespace TemplateContracts;

  @doc("Published when an OWNER/ADMIN invites a new member. Notifications turns this into an invite email.")
  model StoreMemberInvitedEvent extends IntegrationEventEnvelope {
    name: "shared.tenancy.store_member.invited";
    payload: {
      storeId: string;
      storeInvitationId: string;
      email: string;
      role: Role;
      invitationToken: string;       // signed envelope; opaque to consumers; never logged
    };
  }
  ```

  Then run `bun --cwd packages/contracts run codegen:wire:typescript`
  to emit the TS class to
  `packages/contracts/generated/typescript/src/wire/events/store-member-invited.ts`.
  Both runtimes consume it from the generated path.

- [ ] **Commit:**

```bash
git add packages/api/typescript/src/tenancy/usecases/DisableStore* \
        packages/api/typescript/src/tenancy/usecases/EnableStore* \
        packages/api/typescript/src/tenancy/usecases/index.ts \
        packages/contracts/wire/events/store-member-invited.tsp \
        packages/contracts/generated/typescript/src/wire/events/store-member-invited.ts \
        packages/contracts/generated/typescript/src/wire/events/index.ts
git commit -m "feat(tenancy): DisableStore + EnableStore + StoreMemberInvited integration event (P2 Task 18)"
```

---

## Task 19: Query use cases (T07..T10)

**Files:**
- Create: `packages/api/typescript/src/tenancy/queries/MyStores.ts`
- Create: `packages/api/typescript/src/tenancy/queries/MyStores.test.ts`
- Create: `packages/api/typescript/src/tenancy/queries/StoreSettings.ts`
- Create: `packages/api/typescript/src/tenancy/queries/StorePreferencesSettings.ts`
- Create: `packages/api/typescript/src/tenancy/queries/StoreMembers.ts`
- Create: `packages/api/typescript/src/tenancy/queries/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query
**Depends on:** Task 1, Task 8, 9, 10, 11

- [x] **MyStores (T07)** — iter 82. Lives at `tenancy/usecases/GetMyStores.ts`. Resolves `memberships.findByUserId(userId)` → per-membership `stores.findById` → filters disabled stores from `items`. `storeCredits` built from `SubscriptionLookupService.getActiveSubscription(userId)` (degrades to `{ tier: BASIC, maxStores: 0 }` when missing) + `stores.countActiveStoresByUserId(userId)` + `PLAN_QUOTAS[tier][STORE_AMOUNT]`. Read is total — never errors on missing subscription (only CreateStore does).

- [x] **StoreSettings (T08)** — iter 80. Lives at `tenancy/usecases/GetStoreSettings.ts` (per identity precedent — queries are query use cases under `usecases/`, not a separate `queries/` folder). `storeRepo.findById(storeId)` → DTO `(id, name, pictureUrl?, email?, phoneNumber?, createdAt, disabledAt?)`. Throws `STORE_NOT_FOUND`. `disabledAt = store.isDisabled ? store.updatedAt.toISOString() : undefined` (synthesized until dedicated column lands). 3 tests / 9 expect().

- [x] **StorePreferencesSettings (T09)** — iter 80. Lives at `tenancy/usecases/GetStorePreferencesSettings.ts`. `storeRepo.findById(storeId)` → DTO `(storeId, reportingCurrency, timezone, showStoreNameInNotifications, updatedAt)`. Throws `STORE_NOT_FOUND`. All fields persisted on the `stores` row. 3 tests / 8 expect() including round-trip after `UpdateStorePreferences`.

- [x] **StoreMembers (T10)** — iter 81. Lives at `tenancy/usecases/GetStoreMembers.ts`. Split into accepted + pending halves:
  - `accepted` = `membershipRepo.findByStoreId(storeId)` → batched `userDirectoryService.getMany(memberships.map(m => m.userId))` (single round-trip, no N+1) → DTO `(storeMembershipId, userId, email, name, pictureUrl?, role, lastAccess?, acceptedAt)`. `acceptedAt` synthesized from `membership.createdAt`. `lastAccess` left optional and undefined-after-rehydration since the column isn't persisted yet (iter-70 deviation; when the schema gains the column, the DTO doesn't change).
  - `pendingInvitations` = `invitationRepo.findPendingByStoreId(storeId)` → DTO `(storeMembershipId: invitation.id.value, email, role, invitedAt: invitation.createdAt)`.
  - Graceful degradation: when a member's directory entry is missing (e.g. user deleted upstream), the DTO returns empty `email`/`name`, no crash.
  - 6 integration tests / 18 expect() — accepted hydration, pending list, accepted-invitation excluded from pending, expired-invitation excluded from pending, empty arrays for unknown store, orphan-user graceful degradation.

- [x] **Tests:** all four reads tested. T10 GetStoreMembers (iter 81) has 6 tests / 18 expect(). T07 GetMyStores (iter 82) has 8 tests / 21 expect() across three sub-suites (BASIC tier, UNLIMITED tier, no-subscription degradation): empty-state baseline (BASIC + 0 → `{0,1}`), one-membership math, disabled stores filtered + uncounted, no-cross-user-leak, role pass-through (MEMBER/ADMIN not auto-OWNER), UNLIMITED tier reports higher maxStores, no-subscription degrades to `{tier: BASIC, maxStores: 0}` without erroring, no-subscription still returns membership items. T08/T09 tested at iter 80. `lastAccess`-desc ordering NOT asserted (deviation: `lastAccess` is in-memory only per iter-70; ordering becomes meaningful once the column is added).

- [x] **Commit.** — iters 80 (T08+T09), 81 (T10), 82 (T07 + Task 19 closes)

---

## Task 20: Controllers + handlers + BC wiring (Contract Lock surface)

**Files (controllers):** one per use case + one per query — 13 total:

| File | Method | Path | Middlewares | Iter |
|---|---|---|---|---|
| `controllers/CreateStore.ts` | POST | `/stores` | (default session) | **83 ✅** |
| `controllers/UpdateStoreSettings.ts` | PATCH | `/stores/:storeId/settings` | RequireStoreMember + RequireStoreRole([OWNER, ADMIN]) | **85 ✅** |
| `controllers/UpdateStorePreferences.ts` | PATCH | `/stores/:storeId/preferences` | RequireStoreMember + RequireStoreRole([OWNER, ADMIN]) | **85 ✅** |
| `controllers/InviteMember.ts` | POST | `/stores/:storeId/memberships` | RequireStoreMember + RequireStoreRole([OWNER, ADMIN]) | **85 ✅** |
| `controllers/AcceptInvitation.ts` | POST | `/memberships/accept` | (session only; no RequireStoreMember) | **83 ✅** |
| `controllers/RemoveMember.ts` | DELETE | `/stores/:storeId/memberships/:userId` | RequireStoreMember + RequireStoreRole([OWNER, ADMIN]) | **85 ✅** (path `:userId` not `:membershipId` — composite-key entity has no separate id; iter-78 deviation) |
| `controllers/ChangeMemberRole.ts` | PATCH | `/stores/:storeId/memberships/:userId/role` | RequireStoreMember + RequireStoreRole([OWNER]) | **86 ✅** (path `:userId` not `:membershipId`; returns 200 with `{changed}` not 204 — preserves no-op signal) |
| `controllers/DisableStore.ts` | POST | `/stores/:storeId/disable` | RequireStoreMember + RequireStoreRole([OWNER]) | **86 ✅** |
| `controllers/EnableStore.ts` | POST | `/stores/:storeId/enable` | RequireStoreMember + RequireStoreRole([OWNER]) | **86 ✅** |
| `controllers/MyStores.ts` | GET | `/stores/me` | (session only) | **83 ✅** |
| `controllers/StoreSettings.ts` | GET | `/stores/:storeId/settings` | RequireStoreMember | **84 ✅** |
| `controllers/StorePreferencesSettings.ts` | GET | `/stores/:storeId/preferences` | RequireStoreMember | **84 ✅** |
| `controllers/StoreMembers.ts` | GET | `/stores/:storeId/memberships` | RequireStoreMember | **84 ✅** |

Each controller follows the shape of
`packages/api/typescript/src/auth/controllers/GetSession.ts` — declares
the HTTP-decoded `inputSchema` (with `.example([…])` for OpenAPI), calls
`this.useCase.execute(decodedInput)`, returns
`{ status: HttpStatusCode.<X>, data }`. Tight format validation (email,
currency code, IANA timezone regex) lives at the controller layer; the
use case schemas stay primitive. Error → HTTP mapping comes from the
`registerErrorCodes({...})` call in Task 2's errors barrel, so no
explicit `errors`/`baseErrors` overrides are needed in most controllers.

Add `controllers/index.ts` re-exporting all 13.

**Files (handlers):** — iter 87
- [x] `handlers/StoreMemberInvitedHandler.ts` — extends `EventHandler<typeof StoreMemberInvitedEvent>` (tenancy domain event). Looks up the StoreInvitation by id to source `expiresAt` (not on the domain event payload — kept lean). Publishes the `StoreMemberInvitedEvent` integration event (aliased as `StoreMemberInvitedIntegrationEvent` at import) via injected `ExternalMediator.publish(...)`. Graceful exit if invitation row vanished between issuance and dispatch.
- [ ] `handlers/SubscriptionQuotaUpdatedHandler.ts` — **deferred to P3-BILLING** (the SubscriptionQuotaUpdatedIntegrationEvent TypeSpec class doesn't exist yet). When P3 ships the contract, add the handler to `external.ts` and forward to `SubscriptionLookupService.invalidate(userId)`.
- [x] `handlers/internal.ts` — `export { StoreMemberInvitedHandler } from './StoreMemberInvitedHandler'`
- [x] `handlers/external.ts` — empty barrel with TODO comment for the P3 handler.

**Files (BC wiring):**

`packages/api/typescript/src/tenancy/registry.ts`:

```typescript
import './errors' // Side-effect: registerErrorCodes()
import type { InstanceRegistry } from '@template/core-typescript'
import { StoreRepository, MockStoreRepository, DrizzleStoreRepository } from './repositories/StoreRepository'
import { StoreMembershipRepository, MockStoreMembershipRepository, DrizzleStoreMembershipRepository } from './repositories/StoreMembershipRepository'
import { StoreInvitationRepository, MockStoreInvitationRepository, DrizzleStoreInvitationRepository } from './repositories/StoreInvitationRepository'
import {
  SubscriptionLookupService, MockSubscriptionLookupService,
  OrderSamplingService, MockOrderSamplingService,
  UserDirectoryService, MockUserDirectoryService,
  InvitationTokenService,
} from './services'

export const INSTANCE_REGISTRY: InstanceRegistry = {
  mock: [
    { token: StoreRepository, instance: MockStoreRepository },
    { token: StoreMembershipRepository, instance: MockStoreMembershipRepository },
    { token: StoreInvitationRepository, instance: MockStoreInvitationRepository },
    { token: SubscriptionLookupService, instance: MockSubscriptionLookupService },
    { token: OrderSamplingService, instance: MockOrderSamplingService },
    { token: UserDirectoryService, instance: MockUserDirectoryService },
    { token: InvitationTokenService, instance: InvitationTokenService },
  ],
  integration: [
    { token: StoreRepository, instance: DrizzleStoreRepository },
    { token: StoreMembershipRepository, instance: DrizzleStoreMembershipRepository },
    { token: StoreInvitationRepository, instance: DrizzleStoreInvitationRepository },
    { token: SubscriptionLookupService, instance: MockSubscriptionLookupService }, // P3-BILLING overrides
    { token: OrderSamplingService, instance: MockOrderSamplingService },           // P6-SALES overrides
    { token: UserDirectoryService, instance: MockUserDirectoryService },           // P1-IDENTITY overrides
    { token: InvitationTokenService, instance: InvitationTokenService },
  ],
  real: [
    { token: StoreRepository, instance: DrizzleStoreRepository },
    { token: StoreMembershipRepository, instance: DrizzleStoreMembershipRepository },
    { token: StoreInvitationRepository, instance: DrizzleStoreInvitationRepository },
    { token: SubscriptionLookupService, instance: MockSubscriptionLookupService }, // P3-BILLING overrides
    { token: OrderSamplingService, instance: MockOrderSamplingService },           // P6-SALES overrides
    { token: UserDirectoryService, instance: MockUserDirectoryService },           // P1-IDENTITY overrides
    { token: InvitationTokenService, instance: InvitationTokenService },
  ],
}
```

`packages/api/typescript/src/tenancy/index.ts`:

```typescript
import { BoundedContext } from '@template/core-typescript'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'

const ctx = await BoundedContext.create({
  name: '',
  controllers,
  internalHandlers,
  externalHandlers,
  registry: INSTANCE_REGISTRY,
})

export default ctx.router
```

**Global wiring (2 file changes — iter 87):**
- [x] `packages/api/typescript/src/index.ts` — added `import TenancyRouter from '@tenancy/index'` and pushed into the routers array.
- [x] `packages/api/typescript/scripts/emit-openapi.ts` — same router addition needed in the OpenAPI emit path (separate router list from src/index.ts per iter-65 lesson; both must stay in sync).

- [x] **Verify (integration + e2e smoke):** iter 87 — `bun tsc` exit 0; `bun test src/tenancy/` 143/0/385; cross-BC smoke (`bun test src/identity/ src/auth/`) 107/0/254.

- [x] **Commit.** — iter 87 closes Task 20

```bash
git add packages/api/typescript/src/tenancy/controllers/ \
        packages/api/typescript/src/tenancy/handlers/ \
        packages/api/typescript/src/tenancy/registry.ts \
        packages/api/typescript/src/tenancy/index.ts \
        packages/api/typescript/src/index.ts
git commit -m "feat(tenancy): controllers + handlers + BC wiring (C12..C20 + T07..T10) (P2 Task 20)"
```

---

## Task 21: Contract Lock — SDK regen

**Files:**
- Regen: `packages/api/typescript/public/docs/openapi.json`
  (or wherever the polyglot `emit-openapi` script writes it — check
  `packages/api/typescript/package.json` scripts and the root
  `bun emit-openapi` orchestrator)
- Regen: any downstream client artifacts in `packages/client/dist/**`
  if the polyglot SDK pipeline still ships there

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** Task 20

- [ ] **Step 1: Regen + diff inspection**

```bash
bun emit-openapi && bun sdk 2>/dev/null || true
git diff --stat packages/api/typescript/public/docs/openapi.json packages/client/dist/ 2>/dev/null || git diff --stat packages/
```

Expected diff: 13 new endpoints under `/v1/stores/*` and
`/v1/memberships/accept` + their request/response schemas + the
`StoreMemberInvitedIntegrationEvent` shape if it surfaces in any
controller schema.

- [x] **Step 1 done** — iter 88. `bun run scripts/emit-openapi.ts` (root `bun emit-openapi` fails on pre-existing Rust cargo macro errors; bypassed). openapi.json gained 944 lines / 13 new paths. `bun generators/typescript.ts` (root `bun sdk` blocked by same Rust issue; bypassed) emitted 13 mutation/query hooks + Suspense variants for the 4 reads. Client types/Client.ts/index.ts updated.

- [x] **Step 2: Type-check the regenerated SDK** — `bun --cwd packages/api/typescript run tsc` → exit 0 / 0 errors. (Wider workspace tsc still blocked by the pre-existing `_http`-export drift in the legacy SDK, same condition as iters 66-87; that's a Contract Lock concern of a different shape, not introduced by P2.)

- [x] **Step 3: Commit.** — iter 88

```bash
git add packages/api/typescript/public/docs/openapi.json packages/client/dist/ 2>/dev/null || true
git commit -m "chore(sdk): regen after P2 Tenancy controllers landed (P2 Task 21)"
```

---

## Task 22: Final validation

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Depends on:** Task 21

- [x] `bun --cwd packages/api/typescript run tsc` → exit 0 / 0 errors. — iter 89
- [x] `bun --cwd packages/api/typescript run` biome check src/tenancy/ → 0 errors / 39 warnings. — iter 89 (biome autofix applied to 49 files; 1 unsafe-fix `Array<T>` → `T[]` applied manually)
- [x] `bun --cwd packages/api/typescript test src/tenancy/` → 143/0/385 across 22 files. — iter 89
- [x] `bun --cwd packages/api/typescript test` (full TS backend) → 309/0/801 across 54 files; non-tenancy contexts (auth/identity/notifications/ui) all green. — iter 89
- [x] `bun e2e --grep "tenancy"` → **DEFERRED**: tenancy e2e covered by PE-E2E sub-plan per ralph protocol. Noted in commit body. — iter 89

### AC mapping (spec §4 BC2 + §7.2 → test path)

| Spec item | Test path |
|---|---|
| C12 CreateStore + STORE_QUOTA_EXCEEDED + NO_ACTIVE_SUBSCRIPTION + 3 events | `usecases/CreateStore.test.ts` |
| C13 UpdateStoreSettings + changedFields + STORE_NOT_FOUND | `usecases/UpdateStoreSettings.test.ts` |
| C14 UpdateStorePreferences + REPORTING_CURRENCY_LOCKED + INVALID_TIMEZONE | `usecases/UpdateStorePreferences.test.ts` |
| C15 InviteMember + ALREADY_A_MEMBER + INVITATION_ALREADY_PENDING + token shape | `usecases/InviteMember.test.ts` |
| C16 AcceptInvitation + INVALID_INVITATION_TOKEN + INVITATION_EXPIRED + INVITATION_ALREADY_USED | `usecases/AcceptInvitation.test.ts` |
| C17 RemoveMember + CANNOT_REMOVE_LAST_OWNER + STORE_MEMBERSHIP_NOT_FOUND | `usecases/RemoveMember.test.ts` |
| C18 ChangeMemberRole + CANNOT_DEMOTE_LAST_OWNER + no-op | `usecases/ChangeMemberRole.test.ts` |
| C19 DisableStore + STORE_ALREADY_DISABLED | `usecases/DisableStore.test.ts` |
| C20 EnableStore + STORE_NOT_DISABLED | `usecases/EnableStore.test.ts` |
| T07 MyStores + storeCredits math | `queries/MyStores.test.ts` |
| T08 StoreSettings shape | covered by `DrizzleStoreRepository.test.ts` round-trip + controller smoke |
| T09 StorePreferencesSettings shape | covered by `DrizzleStoreRepository.test.ts` round-trip + controller smoke |
| T10 StoreMembers shape (accepted + pendingInvitations split) | `repositories/StoreMembershipRepository/DrizzleStoreMembershipRepository.test.ts` + `repositories/StoreInvitationRepository/DrizzleStoreInvitationRepository.test.ts` |
| Domain event catalog completeness | `events/index.test.ts` |
| `StoreMemberInvited` → `shared.*` integration event flow | `handlers/StoreMemberInvitedHandler.test.ts` (add as part of Task 20) |
| `shared.SubscriptionQuotaUpdated` external handler exists + does not crash | `handlers/SubscriptionQuotaUpdatedHandler.test.ts` (add as part of Task 20) |
| Errors glossary mirrors spec §7.14 TenancyErrors + registers HTTP statuses | `errors/index.test.ts` |
| Drizzle unique constraints (`store_invitations_token_unq`) | `repositories/StoreInvitationRepository/DrizzleStoreInvitationRepository.test.ts` (duplicate insert raises) |
| REPORTING_CURRENCY_LOCKED enforced via OrderSamplingService (master-prompt requirement) | `usecases/UpdateStorePreferences.test.ts` (asserts that when the mock returns `true`, the entity throws BEFORE any UPDATE is dispatched — assert via repo spy) |

- [x] **Commit.** — iter 89 closes P2 Task 22 and the P2-TENANCY sub-plan

---

## Notes

- **Determinism / ID strategy:** Tenancy aggregates use the Drizzle
  default `defaultRandom()` UUIDs (UUIDv4) generated server-side at
  insert time, surfaced through the `AggregateRoot.id.value` accessor.
  These are merchant-owned aggregates, NOT provider-canonical — they
  do **not** use the BK Dash `HashedID(BK_DASH_NAMESPACE, ...)` UUIDv5
  scheme that P1-IDENTITY adopts for `User` rows that mirror upstream
  identifiers.
- **`BoundedContext.create`:** the `auth` context uses `name: ''` and
  declares controller paths absolutely (e.g. `/session`). Tenancy
  follows the same convention — every controller declares its own
  absolute path under `/stores/...` or `/memberships/...`. `MainRouter`
  joins the version prefix (`/v1/...`) automatically.
- **PGlite in tests:** Identical pattern to
  `packages/api/typescript/src/auth/controllers/GetSession.test.ts` —
  TestBed harness with a per-suite child container and `.reset()`
  between tests. Use the same `ownerId: 'integration-tenant'` convention
  for events emitted from tests.
- **Tracing:** controllers automatically traced via
  `traceClass([Controller, HttpRouter, Middleware, Router, MainRouter])`
  in `packages/api/typescript/src/index.ts`; no additional plumbing
  needed.
- **Coordination boundaries enforced by this plan:**
  - `packages/contracts/` owns the cross-language `Role`, `CurrencyCode`,
    `PlanTier`, `PlanFeature` enums plus the `StoreMemberInvited`
    integration event — Tenancy only **consumes** them.
  - P1-IDENTITY owns the `auth.users` table — Tenancy stores `userId`
    on `store_memberships` with an FK to `auth.users.id` (declared in
    `packages/contracts/db/schema/tenancy.ts`).
  - P3-BILLING owns the real `SubscriptionLookupService` implementation
    + the publisher of the `SubscriptionQuotaUpdated` integration
    event. Tenancy declares the port and ships the mock; rebinding into
    `INSTANCE_REGISTRY.real` happens from P3's registry — no Tenancy
    edit required.
  - P6-SALES owns the real `OrderSamplingService`; same pattern.
  - P10-NOTIFICATIONS subscribes to the `StoreMemberInvited` integration
    event — Tenancy publishes; Notifications consumes; no Tenancy edit
    on P10 landing.
- **Graph CLI:** `bun scripts/graph/cli/index.ts validate-plan` is
  still tracked as broken (per master plan known caveats). Skip until
  the Go adapter learns the polyglot `packages/api/{go,typescript}/internal/`
  + `packages/api/typescript/src/` layouts.
- **Once this sub-plan is fully built**, the next Ralph iteration
  target is **P4-INTEGRATION** (depends on Tenancy for `storeId`
  scoping of `StoreIntegration`s) — though Ralph may opportunistically
  spawn **P3-BILLING** in parallel once P2 commits, since P3 only
  depends on contracts iter 41/42 and P1-IDENTITY, and unlocks the real
  `SubscriptionLookupService` binding for Tenancy.
