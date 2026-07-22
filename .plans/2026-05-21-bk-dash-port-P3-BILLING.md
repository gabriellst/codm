# P3-BILLING — BK Dash Billing Bounded Context — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`)
> syntax for tracking. Each Task wraps one observable behavior in an outer
> RED→GREEN cycle. All TS files land under `packages/api/typescript/src/billing/`
> (polyglot layout — `packages/api/typescript/src/<bc>/` per iter 39 rebase).
> Cross-language enums + tables are already authored in
> `packages/contracts/{wire,db}/` — this plan only consumes them. No Go-worker
> changes; no provider webhooks land on Go (Kiwify is TS-only).
>
> **Spec naming note.** The Ralph prompt calls this sub-plan "BC3 Billing"; the
> spec itself labels Billing as **BC11** (`§4 BC11`) with the contract in
> **§7.11**. Same context — this plan uses the spec-canonical numbering.

**Goal:** Land the `billing` bounded context — the `Subscription` aggregate
(per-User), append-only `SubscriptionEvent` audit/idempotency log, two
commands (`HandleBillingWebhook`, `ChangeExternalSubscription`), two reads
(`GetMySubscription`, `ListSubscriptionEventHistory`), the public Kiwify
webhook controller, domain + integration events, repositories, the
`PLAN_QUOTAS` polyglot-core constant, and SDK regeneration — so downstream
contexts (Tenancy, Notifications) can react to
`integration.shared.subscription.quota_updated`.

**Architecture:** A **thin** `Subscription` aggregate persists the
projection columns the read-path needs (`tier`, `period`,
`currentPeriodStart/End`, `isActive`) — all of which are derived **on every
write** from the append-only `subscriptionEvents` log. The event log is the
source of truth; the aggregate row is a materialized view kept consistent
inside the same `UnitOfWork`. Both commands follow the canonical flow:
`findOrCreate aggregate → insertIfNotExists event (idempotency gate) →
applyEvent on aggregate → save aggregate → raise domain events`. The Kiwify
webhook is public (skips auth middleware) and uses HMAC verification +
`(platform, external_event_id)` unique index for double-protection against
replay. `PLAN_QUOTAS` lives in
`packages/api/typescript/core/src/services/PlanQuotas/` (polyglot
convention — quotas evolve with releases, not at runtime — so they ship in
framework code, not in `packages/contracts/`). The `GetMySubscription` read
returns derived `quotaUsage.{storeAmount,integrationAmount}` shapes whose
`max` comes from `PLAN_QUOTAS[tier]`; `used` joins to the tenancy projection
once P2 lands (this plan returns `used: 0` placeholders documented as a
known follow-up).

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod,
`@template/core-typescript` framework, `@template/contracts` (Drizzle db
schema) + `@template/contracts-typescript/wire` (generated enums +
integration events), bun:test + PGlite for integration, Kubb (SDK).

**Spec:** `.specs/2026-05-21-ddd-modeling-bk-dash.md`
- §4 BC11 — Billing bounded-context map
- §7.0 — shared types (PlanTier / PlanPeriod / BillingPlatform / PlanFeature / SubscriptionEventType)
- §7.11 — Billing reads (T38–T39) + commands (C56–C57)
- §7.13 — integration events Billing → Tenancy (`shared.subscription.quota_updated`)
- §7.14 — Billing error glossary

**Master plan:** `.plans/2026-05-21-bk-dash-port.md` (sub-plan
**P3-BILLING**; post-rebase polyglot layout per iter 39 addendum)

**Depends on:**
- **Iter 41** — contracts wire/enums (already authored: `plan-tier`,
  `plan-period`, `billing-platform`, `plan-feature`,
  `subscription-event-type`). Generated TS at
  `packages/contracts/generated/typescript/src/wire/enums/*.ts`,
  re-exported from `@template/contracts-typescript/wire`.
- **Iter 42** — `packages/contracts/db/schema/billing.ts` (already authored:
  `billingSubscriptions` TS const → `billing.subscriptions` PG table,
  `subscriptionEvents` TS const → `billing.subscription_events` PG table,
  both with the `(platform, external_*_id)` uniqueness indexes idempotency
  needs).
- **P1-IDENTITY (pre-req for FK on userId)** — `Subscription.userId`
  references the Identity `users` table. `billing.subscriptions.user_id`
  intentionally **has no FK** today (per the comment in
  `db/schema/billing.ts` lines 33–37) — adding it is a P1 follow-up. This
  plan ships without it; tests use literal user-ids.
- **Does NOT depend on P2-TENANCY.** Tenancy consumes
  `shared.subscription.quota_updated` but Billing publishes blindly. The
  master-plan dependency graph also places P3 upstream of P2.

**Tasks:** 18
**Estimated minutes:** ~360

---

## Convention reference (absorbed during planning, NOT to be re-read by /build)

- **Sibling BC layout (TS):** `packages/api/typescript/src/auth/` and
  `packages/api/typescript/src/notifications/` — each has `controllers/`,
  `entities/`, `enums/` (optional re-export barrel), `errors/index.ts`
  (registers HTTP codes via `registerErrorCodes(...)`), `events/`,
  `handlers/{internal.ts,external.ts}`, `middlewares/`, `objects/`,
  `repositories/<Aggregate>/{Abstract,Drizzle,Mock}.ts`, `services/`,
  `usecases/`, `registry.ts`, `index.ts`. Mirror exactly for `billing/`.
- **BoundedContext bootstrap (`index.ts`)** — see
  `packages/api/typescript/src/auth/index.ts`:

  ```ts
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

  `BoundedContext.create` takes `registry` directly (no `shared/registry.ts`
  aggregation). Each BC's `INSTANCE_REGISTRY` is applied to its own child
  container. The root API at `packages/api/typescript/src/index.ts`
  imports each BC router as a default export and pushes it into `routers[]`.
- **Aggregate shape:** `packages/api/typescript/src/auth/entities/User.ts` —
  `extends AggregateRoot<typeof Schema>`, `static override schema = ...`,
  static `create()`, instance methods call `this.validate()`. Domain errors
  thrown via `throw new BaseError<DomainErrors>('CODE')`.
- **Repository shape (Drizzle + Abstract + Mock):**
  `packages/api/typescript/src/auth/repositories/UserRepository/` —
  abstract base extends `Repository<E>`, Drizzle impl injects
  `DrizzleClient`, uses `(tx ?? this.db)` to honor in-flight UoW
  transactions, returns the domain entity via `toDomain(row)`.
- **Use case shape:**
  `packages/api/typescript/src/auth/usecases/RegisterUser.ts` — `extends
  Handler<typeof Input, typeof Output>`, `readonly name = 'snake_case' as
  const`, body wrapped in `this.withTransaction(tx, async tx => {...})`,
  domain events persisted via `await this.domainEventRepository.save(event,
  tx)` inside the same transaction.
- **Domain event shape:**
  `packages/api/typescript/src/auth/events/UserRegisteredEvent.ts` —
  `static override readonly name = 'context.thing.action' as const`,
  `static readonly schema = z.domainEvent({...})`.
- **Integration event consumption pattern:**
  `packages/api/typescript/src/notifications/handlers/NotifySubscribersHandler.ts`
  — imports the generated event class from
  `@template/contracts-typescript/wire`, `extends EventHandler<typeof
  ImportedEvent>`. Billing PUBLISHES, so it constructs the generated
  `SubscriptionQuotaUpdatedEvent` class and dispatches via
  `this.externalMediator.publish(event)` from inside a domain-event
  handler.
- **Controller shape:**
  `packages/api/typescript/src/auth/controllers/GetSession.ts` — `path`,
  `method`, `description`, `inputSchema`, `outputSchema` (both with
  `.example([...])` for OpenAPI), `handle(request): Promise<this['output']>`
  returns `{ status, data }`.
- **Errors barrel (registers HTTP statuses):**
  `packages/api/typescript/src/auth/errors/index.ts` — exports the four
  error-tier unions and calls `registerErrorCodes({...})` as a side-effect.
  The `import './errors'` line in `registry.ts` triggers it.
- **Path aliases:** `packages/api/typescript/tsconfig.json` maps `@*` →
  `./src/*`. Imports look like `@billing/entities`, `@billing/repositories`,
  `@shared/...`. Contracts imports use `@template/contracts/db` (Drizzle
  tables) and `@template/contracts-typescript/wire` (generated enums +
  integration events).
- **Polyglot core convention for shared services:**
  `packages/api/typescript/core/src/services/` houses framework services
  (`Mediator/`, `UnitOfWork/`, `OutboxDispatcher/`, `CommandQueue/`,
  `Logging/`, `HttpRouter/`). `PlanQuotas/` joins the family — quota tables
  are cross-BC framework concerns (consumed by Billing's read, by Tenancy's
  store-creation gate, by Notifications' daily-digest scheduler), so they
  live with the framework code, not in any single BC.
- **Generated wire imports (TS):** `import { PlanTier, PlanTierSchema }
  from '@template/contracts-typescript/wire'`. Each emitted file
  re-exports via `wire/enums/index.ts` and `wire/events/index.ts`.
- **Drizzle table imports:** `import { billingSubscriptions,
  subscriptionEvents } from '@template/contracts/db'`. Note
  **`billingSubscriptions`** (NOT `subscriptions`) — iter 42f renamed the
  TS export to dodge the collision with `channel.subscriptions`. The PG
  table is still `billing.subscriptions`.
- **Tests:** colocated `<File>.test.ts`. Use cases / handlers / repos use
  the polyglot integration harness (PGlite +
  `TestBed.create('integration', {...})` once it exists; until then,
  in-memory containers via `container.createChildContainer()` as in
  `packages/api/typescript/src/notifications/handlers/NotifySubscribersHandler.test.ts`).
- **Webhook controller pattern:** opts out of every default middleware via
  `skipMiddlewares = [AuthMiddleware]` and authenticates by HMAC
  signature. The raw request body is required — read via
  `request.rawBody` (the Fastify HttpRouter currently delivers the parsed
  body; if `rawBody` is not yet wired, Task 17 adds a small body-preserving
  middleware before JSON parsing).

---

## Module surface (what every Task touches)

```
packages/api/typescript/core/src/services/PlanQuotas/                ← NEW — framework constant
├── PlanQuotas.ts                                                    ← PLAN_QUOTAS const + planQuotaFor() + hasQuotaAvailable()
├── PlanQuotas.test.ts
└── index.ts

packages/api/typescript/core/src/services/index.ts                   ← MODIFY — re-export PlanQuotas barrel
packages/api/typescript/core/src/index.ts                            ← MODIFY (if needed) — re-export PLAN_QUOTAS surface

packages/contracts/wire/events/subscription-quota-updated.tsp        ← NEW — TypeSpec integration event
packages/contracts/wire/events/index.tsp                             ← MODIFY — import the new event
(then run `bun run --filter @template/contracts codegen:wire` → emits to
 generated/{typescript,go,rust}/wire/events/)

packages/api/typescript/src/billing/                                 ← NEW BC home
├── controllers/
│   ├── HandleBillingWebhook.ts                ← C56 — POST /billing/webhooks/:platform   (public — HMAC-gated)
│   ├── ChangeExternalSubscription.ts          ← C57 — PUT /billing/subscriptions/:id/external (auth)
│   ├── GetMySubscription.ts                   ← T38 — GET /billing/me
│   ├── ListSubscriptionEventHistory.ts        ← T39 — GET /billing/subscriptions/:id/events
│   └── index.ts
├── entities/
│   ├── Subscription.ts                        ← aggregate (thin projection over event log)
│   ├── Subscription.test.ts
│   ├── SubscriptionEvent.ts                   ← child entity (append-only, owns summarize())
│   ├── SubscriptionEvent.test.ts
│   ├── SubscriptionEventPayloadSummary.ts     ← VO schema used by T39 output
│   ├── SubscriptionEventPayloadSummary.test.ts
│   └── index.ts
├── enums/
│   └── index.ts                               ← re-exports from @template/contracts-typescript/wire (convenience)
├── errors/
│   └── index.ts                               ← Errors union + registerErrorCodes() for the 6 BillingErrors codes
├── events/
│   ├── SubscriptionEventReceivedEvent.ts      ← raised on every accepted webhook
│   ├── SubscriptionPaymentReceivedEvent.ts    ← raised on PAYMENT_SUCCEEDED
│   ├── SubscriptionActivatedEvent.ts          ← raised on first PAYMENT_SUCCEEDED transition (inactive→active)
│   ├── SubscriptionCancelledEvent.ts          ← raised on SUBSCRIPTION_CANCELLED
│   ├── SubscriptionExternalChangedEvent.ts    ← raised on EXTERNAL_SUBSCRIPTION_CHANGED (C57)
│   └── index.ts
├── handlers/
│   ├── internal.ts                            ← exports 3 quota-publisher handlers
│   ├── external.ts                            ← empty (Billing consumes no integration events)
│   └── SubscriptionQuotaUpdatedPublisher.ts   ← 3 EventHandler subclasses → emit the integration event
├── middlewares/
│   └── index.ts                               ← default `[]` (no per-BC middleware; webhook is public; auth controllers add AuthMiddleware explicitly)
├── repositories/
│   ├── SubscriptionRepository/
│   │   ├── SubscriptionRepository.ts          ← abstract
│   │   ├── DrizzleSubscriptionRepository.ts
│   │   ├── DrizzleSubscriptionRepository.test.ts
│   │   ├── MockSubscriptionRepository.ts
│   │   └── index.ts
│   ├── SubscriptionEventRepository/
│   │   ├── SubscriptionEventRepository.ts     ← abstract (append-only + idempotency primitive)
│   │   ├── DrizzleSubscriptionEventRepository.ts
│   │   ├── DrizzleSubscriptionEventRepository.test.ts
│   │   ├── MockSubscriptionEventRepository.ts
│   │   └── index.ts
│   └── index.ts
├── services/
│   ├── KiwifyWebhookVerifier.ts               ← HMAC-SHA1 over raw body, constant-time hex compare
│   ├── KiwifyWebhookVerifier.test.ts
│   ├── KiwifyWebhookMapper.ts                 ← raw Kiwify payload → { type, tier, period, externalSubscriptionId, externalEventId, occurredAt, userId, payload }
│   ├── KiwifyWebhookMapper.test.ts
│   └── index.ts
├── usecases/
│   ├── HandleBillingWebhook.ts                ← C56 (called by the public controller)
│   ├── HandleBillingWebhook.test.ts
│   ├── ChangeExternalSubscription.ts          ← C57
│   ├── ChangeExternalSubscription.test.ts
│   ├── GetMySubscription.ts                   ← T38 — direct Drizzle read (BFF style)
│   ├── GetMySubscription.test.ts
│   ├── ListSubscriptionEventHistory.ts        ← T39
│   ├── ListSubscriptionEventHistory.test.ts
│   └── index.ts
├── registry.ts                                ← INSTANCE_REGISTRY: SubscriptionRepository + SubscriptionEventRepository + KiwifyWebhookVerifier + KiwifyWebhookMapper
└── index.ts                                   ← default-exports the BC router

packages/api/typescript/src/index.ts           ← MODIFY — import BillingRouter, push into routers[]
.env.example                                   ← MODIFY — add KIWIFY_WEBHOOK_SECRET (optional)
packages/api/typescript/core/src/utils/Config.ts ← MODIFY — add KIWIFY_WEBHOOK_SECRET to env schema
```

---

## Acceptance criteria (mapped from spec)

| Spec ref | Behavior | Verified by |
|---|---|---|
| §7.0 / §4 BC11 | `PLAN_QUOTAS` is a code constant in `packages/api/typescript/core/src/services/PlanQuotas/` keyed by `PlanTier` → `Record<PlanFeature, PlanQuota>`. `planQuotaFor(tier, feature)` returns the quota; `hasQuotaAvailable(tier, feature, used)` returns boolean. **No `plans` table exists.** | `PlanQuotas.test.ts`; migration review (no `plans` table in `db/schema/`) |
| §7.13 | A `subscription-quota-updated.tsp` integration event is authored under `packages/contracts/wire/events/` with payload `{ userId, tier: PlanTier }` and discriminator `integration.shared.subscription.quota_updated`. Generated TS class is importable from `@template/contracts-typescript/wire`. | `bun run codegen:wire` runs cleanly; `import { SubscriptionQuotaUpdatedEvent } from '@template/contracts-typescript/wire'` resolves in the publisher. |
| §7.11 T38 | `GET /billing/me` returns the caller's subscription summary `{ id, tier, period, isActive, isCancelled, currentPeriodStart, currentPeriodEnd, quotaUsage: { storeAmount: { used, max }, integrationAmount: { used, max } } }`. `max` comes from `PLAN_QUOTAS[tier]`. `used` is `0` (placeholder until P2-TENANCY lands store-count + integration-count projections; documented as known follow-up in the controller). Returns `{ isActive: false, isCancelled: false, quotaUsage: zeros }` if no subscription. | `GetMySubscription.test.ts` |
| §7.11 T39 | `GET /billing/subscriptions/:id/events` returns paginated `{ total, items: [{ id, eventType, occurredAt, payloadSummary }] }` ordered `occurredAt DESC`, with optional `eventTypes[]` filter. `payloadSummary` extracted via `SubscriptionEvent.summarize()`. | `ListSubscriptionEventHistory.test.ts` |
| §7.11 C56 idempotency | Kiwify webhook delivered twice with the same `external_event_id` produces exactly **one** row in `billing.subscription_events` and **one** `SubscriptionEventReceived` domain event. The unique index `subscription_events_platform_external_event_id_unq` (already in the contracts schema) is the hard guarantee; the use case calls `repo.insertIfNotExists(event)` and short-circuits when the insert returned undefined. | `HandleBillingWebhook.test.ts` |
| §7.11 C56 signature | Tampered payload → throws `BILLING_WEBHOOK_SIGNATURE_INVALID` (HTTP 401). Missing signature → same. Missing `KIWIFY_WEBHOOK_SECRET` → same (the verifier refuses to validate when no secret is configured). | `KiwifyWebhookVerifier.test.ts` + `HandleBillingWebhook.test.ts` |
| §7.11 C56 platform | Unknown `:platform` path param → `BILLING_WEBHOOK_UNKNOWN_PLATFORM` (HTTP 400). | `HandleBillingWebhook.test.ts` |
| §7.11 C56 payload | Malformed payload (missing `event` field, missing `Subscription.subscription_id`) → `BILLING_WEBHOOK_PAYLOAD_INVALID` (HTTP 400). Missing `s1` UTM (`TrackingParameters.s1` is the userId) → `SUBSCRIPTION_LOOKUP_FAILED` (HTTP 422). | `KiwifyWebhookMapper.test.ts` + `HandleBillingWebhook.test.ts` |
| §7.11 C56 derived events | First `PAYMENT_SUCCEEDED` on a subscription (i.e. `isActive` transitions `false → true`) emits `SubscriptionActivatedEvent`. `SUBSCRIPTION_CANCELLED` always emits `SubscriptionCancelledEvent`. `PAYMENT_SUCCEEDED` always also emits `SubscriptionPaymentReceivedEvent`. Every accepted webhook emits `SubscriptionEventReceivedEvent`. | `HandleBillingWebhook.test.ts` ("derived events" describe) |
| §7.11 C56 quota fan-out | Any state-changing webhook (`SUBSCRIPTION_CREATED`, `PAYMENT_SUCCEEDED`, `SUBSCRIPTION_CANCELLED`, `SUBSCRIPTION_REACTIVATED`, `EXTERNAL_SUBSCRIPTION_CHANGED`) results in **exactly one** `integration.shared.subscription.quota_updated { userId, tier }` integration event being published. `PAYMENT_FAILED` and `PAYMENT_REFUNDED` **do not** publish. | `SubscriptionQuotaUpdatedPublisher.test.ts` (asserts publishes via `MockExternalMediator`) |
| §7.11 C56 period math | After `PAYMENT_SUCCEEDED` on MONTHLY plan, `currentPeriodEnd = occurredAt + 30 days`. QUARTERLY = 90 days. ANNUAL = 365 days. `currentPeriodStart = occurredAt`. `isActive = true`. | `Subscription.test.ts` ("applyEvent: PAYMENT_SUCCEEDED") |
| §7.11 C57 | `PUT /billing/subscriptions/:id/external` body `{ newExternalSubscriptionId, tier, period }` swaps the three fields, recomputes `currentPeriodStart=now / currentPeriodEnd=now+period`, appends an `EXTERNAL_SUBSCRIPTION_CHANGED` event row, raises `SubscriptionExternalChangedEvent`, and triggers the quota publisher. Missing subscription → `SUBSCRIPTION_NOT_FOUND`. | `ChangeExternalSubscription.test.ts` |
| §7.14 | All errors thrown by Billing belong to the union: `BILLING_WEBHOOK_SIGNATURE_INVALID`, `BILLING_WEBHOOK_UNKNOWN_PLATFORM`, `BILLING_WEBHOOK_PAYLOAD_INVALID`, `SUBSCRIPTION_LOOKUP_FAILED`, `SUBSCRIPTION_NOT_FOUND`, `BILLING_PERIOD_MISMATCH` (the last is reserved — emitted by C57 if `newExternalSubscriptionId` already exists on a different user). Controllers also surface `VALIDATION_ERROR` and `UNAUTHORIZED` via framework defaults. | usecase tests assert via `.rejects.toMatchObject({ name: 'CODE' })` |
| Sub-plan dep | `bun sdk` regenerates and `packages/client/dist/` exposes 3 client-facing Billing endpoints. | Final Task |

---

## Task 1: PLAN_QUOTAS framework constant + service

**Files:**
- Create: `packages/api/typescript/core/src/services/PlanQuotas/PlanQuotas.ts`
- Create: `packages/api/typescript/core/src/services/PlanQuotas/PlanQuotas.test.ts`
- Create: `packages/api/typescript/core/src/services/PlanQuotas/index.ts`
- Modify: `packages/api/typescript/core/src/services/index.ts` — `export * from './PlanQuotas'`
- Modify: `packages/api/typescript/core/src/index.ts` — re-export `PLAN_QUOTAS`, `planQuotaFor`, `hasQuotaAvailable`, `PlanQuota`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /value-object, /schema
**Depends on:** (none — consumes only `@template/contracts-typescript/wire` enums)
**Classification:** Contract Lock (every later Task that reads `quotaUsage` or
gates feature access imports from here).

- [x] **Step 1: Failing test** — iter 90. 6 tests covering: every-tier×feature combo defined; UNLIMITED.STORE_AMOUNT = Infinity; hasQuotaAvailable BASIC 0→true / 1→false; hasFeature BASIC/ADVANCED MULTI_USER gating; ADMIN_API gated to ADVANCED+UNLIMITED only; STORE_AMOUNT progression 1/3/10/∞.

- [x] **Step 2: Impl** — iter 90. `PlanQuota = { max: number, isEnabled?: boolean }`. PLAN_QUOTAS covers all 4 tiers × 6 features. Hard limits (STORE_AMOUNT, INTEGRATION_AMOUNT) use `max`; boolean features (DAILY_DIGEST, MULTI_USER, CSV_IMPORT, ADMIN_API) use `isEnabled` with `max: 0` as denormalized hint. Tenancy keeps its number-only local copy at `tenancy/services/PlanQuotaPolicy.ts` (iter 74 vintage) until a follow-up migration slice — documented in PlanQuotas.ts header comment.

- [x] **Step 3: GREEN + tsc + commit** — iter 90. 6/0/37 in the new test file; full TS backend 315/0/838 (delta +6 from iter 89's 309); tsc exit 0.

---

## Task 2: SubscriptionQuotaUpdated integration event (TypeSpec → codegen)

**Files:**
- Create: `packages/contracts/wire/events/subscription-quota-updated.tsp`
- Modify: `packages/contracts/wire/events/index.tsp` — `import "./subscription-quota-updated.tsp";`
- Run: `bun run --filter @template/contracts codegen:wire` (regenerates TS+Go+Rust under `packages/contracts/generated/`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /event, /schema
**Depends on:** Task 1
**Classification:** Contract Lock (P2-TENANCY's external handler subscribes by class).

- [ ] **Step 1: Author TypeSpec** — model after `wire/events/order-updated.tsp`:

```tsp
import "./_base.tsp";

namespace TemplateContracts;

@doc("Published by BC11 Billing after a Subscription state change that may shift the user's effective quotas (CREATED, PAYMENT_SUCCEEDED, CANCELLED, REACTIVATED, EXTERNAL_SUBSCRIPTION_CHANGED). Consumed by BC2 Tenancy to invalidate quota-gate caches and by BC10 Notifications to drive plan-change emails.")
model SubscriptionQuotaUpdatedEvent extends IntegrationEvent {
  name: "integration.shared.subscription.quota_updated";

  @doc("Owner User the subscription belongs to. Drives the quota-gate cache invalidation key.")
  userId: string;

  @doc("New plan tier — paired with PLAN_QUOTAS at the consumer to derive effective limits.")
  tier: PlanTier;
}
```

- [x] **Step 1: Author TypeSpec** — iter 91. `subscription-quota-invalidated.tsp` matches the plan body verbatim.
- [x] **Step 2: Update `wire/events/index.tsp`** — iter 91. Added new comment-block + import next to the existing TS-published events.
- [x] **Step 3: Codegen + verify** — iter 91. Ran `bun --cwd packages/contracts run tsp:compile` (recompiles `dist/contracts.openapi.yaml`) then all three `codegen:wire:{typescript,go,rust}` scripts. Counts moved 31→32 events across all 3 languages. TS file exports `SubscriptionQuotaUpdatedEvent` + `SubscriptionQuotaUpdatedEventSchema` with `userId: string, tier: PlanTierSchema`. Rust + Go presence confirmed via grep.
- [x] **Step 4: tsc + commit** — iter 91. `bun tsc` exit 0; full TS backend 315/0/838 (no test delta — codegen artifacts only).

---

## Task 3: Scaffold billing bounded-context skeleton

**Files:**
- Create the 13 BC skeleton files under `packages/api/typescript/src/billing/`
  (controllers/, entities/, enums/, errors/, events/, handlers/, middlewares/,
  repositories/, services/, usecases/ — each with an `index.ts` barrel —
  plus `registry.ts` and `index.ts`).

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context, /errors
**Depends on:** Task 2
**Classification:** Contract Lock (folder shape must match siblings before any later Task compiles its imports).

- [x] **Step 1: Author `enums/index.ts`** — iter 92.

```ts
export {
  PlanTier, PlanTierSchema,
  PlanPeriod, PlanPeriodSchema,
  BillingPlatform, BillingPlatformSchema,
  PlanFeature, PlanFeatureSchema,
  SubscriptionEventType, SubscriptionEventTypeSchema,
} from '@template/contracts-typescript/wire'
```

- [x] **Step 2: Author `errors/index.ts`** — iter 92. 6 errors registered: BILLING_PERIOD_MISMATCH (DomainErrors, 409), SUBSCRIPTION_NOT_FOUND (ApplicationErrors, 404), SUBSCRIPTION_LOOKUP_FAILED (ApplicationErrors, 422), 3 BILLING_WEBHOOK_* (InterfaceErrors, 401/400/400).

```ts
import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type {
  BaseDomainErrors, BaseApplicationErrors,
  BaseInterfaceErrors, BaseInfrastructureErrors,
} from '@template/core-typescript'

export type BillingDomainErrors = 'BILLING_PERIOD_MISMATCH'
export type DomainErrors = BaseDomainErrors | BillingDomainErrors

export type BillingApplicationErrors = 'SUBSCRIPTION_NOT_FOUND' | 'SUBSCRIPTION_LOOKUP_FAILED'
export type ApplicationErrors = BaseApplicationErrors | BillingApplicationErrors

export type BillingInterfaceErrors =
  | 'BILLING_WEBHOOK_SIGNATURE_INVALID'
  | 'BILLING_WEBHOOK_UNKNOWN_PLATFORM'
  | 'BILLING_WEBHOOK_PAYLOAD_INVALID'
export type InterfaceErrors = BaseInterfaceErrors | BillingInterfaceErrors

export type InfrastructureErrors = BaseInfrastructureErrors
export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
  BILLING_PERIOD_MISMATCH: HttpStatusCode.CONFLICT,
  SUBSCRIPTION_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  SUBSCRIPTION_LOOKUP_FAILED: HttpStatusCode.UNPROCESSABLE_ENTITY,
  BILLING_WEBHOOK_SIGNATURE_INVALID: HttpStatusCode.UNAUTHORIZED,
  BILLING_WEBHOOK_UNKNOWN_PLATFORM: HttpStatusCode.BAD_REQUEST,
  BILLING_WEBHOOK_PAYLOAD_INVALID: HttpStatusCode.BAD_REQUEST,
})
```

- [x] **Step 3: Author `registry.ts` (placeholder)** — iter 92.

```ts
import './errors'
import type { InstanceRegistry } from '@template/core-typescript'

export const INSTANCE_REGISTRY: InstanceRegistry = {
  mock: [],
  integration: [],
  real: [],
}
```

- [x] **Step 4: Author `index.ts`** — iter 92. Exact match of auth/identity/tenancy/notifications shape: `BoundedContext.create({ name: '', controllers, internalHandlers, externalHandlers, registry: INSTANCE_REGISTRY })` → `export default ctx.router`.
- [x] **Step 5: tsc** — iter 92. Empty barrels compile.
- [x] **Step 6: Commit** — iter 92.

---

## Task 4: SubscriptionEventPayloadSummary VO

**Files:**
- Create: `packages/api/typescript/src/billing/entities/SubscriptionEventPayloadSummary.ts`
- Create: `packages/api/typescript/src/billing/entities/SubscriptionEventPayloadSummary.test.ts`

**Agent:** backend-developer · **Skills:** /value-object, /schema · **Depends on:** Task 3

- [x] **Step 1: Failing test** — iter 93. 5 tests / 5 expect(): empty accepted; canonical full payload accepted; float amountCents rejected; unknown currency rejected; partial amount-only accepted.

- [x] **Step 2: Impl** — iter 93. Matches plan body with one deviation: `Z.infer<typeof ...>` from `import Z from 'zod'` (not `z.infer` from `@template/core-typescript`) because the lowercase `z` re-export from core is the schema-augmented namespace and doesn't expose the `infer` type-only surface. Same pattern tenancy entities use (iter 67's Store.ts). Also appended export from `entities/index.ts` barrel.

- [x] **Step 3: GREEN + tsc + commit** — iter 93. 5/0/5 in the new test file; full TS backend 320/0/843 (delta +5).

---

## Task 5: SubscriptionEvent child entity (append-only + summarize)

**Files:**
- Create: `packages/api/typescript/src/billing/entities/SubscriptionEvent.ts`
- Create: `packages/api/typescript/src/billing/entities/SubscriptionEvent.test.ts`
- Modify: `packages/api/typescript/src/billing/entities/index.ts`

**Agent:** backend-developer · **Skills:** /entity, /schema · **Depends on:** Task 4

- [x] **Step 1: Failing test** — iter 94. 10 tests / 15 expect(): create returns rehydrated; nullable subscriptionId (orphan); summarize extracts Kiwify amount (Commissions.charge_amount + Customer.currency); summarize extracts payment_method; summarize extracts refund_reason; summarize extracts cancellation_reason; summarize returns `{}` when nothing recognizable; **plus** 3 hardening edge cases: half-amount payload (charge_amount no currency) drops amount; unknown-currency drops amount; merged-fields summary.

- [x] **Step 2: Impl** — iter 94. `extends AggregateRoot<typeof SubscriptionEventSchema>` per plan. Schema: nullable subscriptionId, BillingPlatformSchema + externalSubscriptionId (so orphan events can be resolved later without a JOIN), SubscriptionEventTypeSchema, `z.record(z.string(), z.unknown())` for the jsonb payload, required externalEventId + occurredAt. `static create(...)` mirrors tenancy's factory pattern. `summarize()` is provider-agnostic but today only knows Kiwify-shape; future providers add `if (this.platform === ...)` branches. Currency validation via `Object.values(CurrencyCode).includes(...)` guards against malformed payloads.

- [x] **Step 3: GREEN + tsc + commit** — iter 94. 10/0/15; full TS backend 330/0/858 (delta +10).

---

## Task 6: Subscription aggregate (thin, with applyEvent)

**Files:**
- Create: `packages/api/typescript/src/billing/entities/Subscription.ts`
- Create: `packages/api/typescript/src/billing/entities/Subscription.test.ts`
- Modify: `packages/api/typescript/src/billing/entities/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** Task 5

The aggregate's columns mirror `billing.subscriptions` exactly: `userId,
platform, externalSubscriptionId, tier, period, currentPeriodStart,
currentPeriodEnd, isActive`. **The contracts schema already includes
`isActive` and `currentPeriod*` columns** — this aggregate writes them; they
are projection state, NOT business invariants.

- [x] **Step 1: Failing test** — iter 95. 14 tests / 32 expect(): create (inactive + null timestamps); PAYMENT_SUCCEEDED window math for all 3 periods (MONTHLY 30d, QUARTERLY 90d, ANNUAL 365d); SUBSCRIPTION_CANCELLED flips isActive untouched-period; SUBSCRIPTION_REACTIVATED activate-iff-future + past-period no-op + null-period no-op; SUBSCRIPTION_CREATED no-op; PAYMENT_FAILED no-op; PAYMENT_REFUNDED no-op; `wasInactive` helper (true after inactive → applyEvent; false on chained activates); `changeExternal` upgrade path.

- [ ] **Step 2: Impl**

```ts
import { AggregateRoot, z } from '@template/core-typescript'
import Z from 'zod'
import {
  BillingPlatform, BillingPlatformSchema,
  PlanTier, PlanTierSchema,
  PlanPeriod, PlanPeriodSchema,
} from '@template/contracts-typescript/wire'
import type { SubscriptionEvent } from './SubscriptionEvent'

const SubscriptionSchema = z.object({
  userId: z.string().min(1),
  platform: BillingPlatformSchema,
  externalSubscriptionId: z.string().min(1),
  tier: PlanTierSchema,
  period: PlanPeriodSchema,
  currentPeriodStart: z.date().nullable().default(null),
  currentPeriodEnd: z.date().nullable().default(null),
  isActive: z.boolean().default(false),
})

export type SubscriptionProps = Z.infer<typeof SubscriptionSchema>

const PERIOD_DAYS: Record<PlanPeriod, number> = {
  [PlanPeriod.MONTHLY]: 30,
  [PlanPeriod.QUARTERLY]: 90,
  [PlanPeriod.ANNUAL]: 365,
}

export class Subscription extends AggregateRoot<typeof SubscriptionSchema> {
  static override schema = SubscriptionSchema
  private _wasInactive = false

  static create(data: Pick<SubscriptionProps, 'userId' | 'platform' | 'externalSubscriptionId' | 'tier' | 'period'>): Subscription {
    return new Subscription({ ...data, currentPeriodStart: null, currentPeriodEnd: null, isActive: false })
  }

  get wasInactive(): boolean { return this._wasInactive }

  applyEvent(event: SubscriptionEvent): void {
    this._wasInactive = !this.isActive
    switch (event.type) {
      case 'PAYMENT_SUCCEEDED':
        this.currentPeriodStart = event.occurredAt
        this.currentPeriodEnd = new Date(event.occurredAt.getTime() + PERIOD_DAYS[this.period] * 86400_000)
        this.isActive = true
        break
      case 'SUBSCRIPTION_CANCELLED':
        this.isActive = false
        break
      case 'SUBSCRIPTION_REACTIVATED':
        if (this.currentPeriodEnd && this.currentPeriodEnd > new Date()) this.isActive = true
        break
      // SUBSCRIPTION_CREATED, PAYMENT_FAILED, PAYMENT_REFUNDED, EXTERNAL_SUBSCRIPTION_CHANGED: no-op here
    }
    this.validate()
  }

  changeExternal(data: { newExternalSubscriptionId: string; tier: PlanTier; period: PlanPeriod; now: Date }): void {
    this.externalSubscriptionId = data.newExternalSubscriptionId
    this.tier = data.tier
    this.period = data.period
    this.currentPeriodStart = data.now
    this.currentPeriodEnd = new Date(data.now.getTime() + PERIOD_DAYS[data.period] * 86400_000)
    this.isActive = true
    this.validate()
  }
}

export interface Subscription extends SubscriptionProps {}
```

- [x] **Step 2: Impl** — iter 95. Matches plan body verbatim. `MS_PER_DAY` extracted as a top-level constant for readability (vs inline `86_400_000`). Reflected `EXTERNAL_SUBSCRIPTION_CHANGED` no-op with a comment pointing to `changeExternal()` for the actual mutation.

- [x] **Step 3: GREEN + tsc + commit** — iter 95. 14/0/32; full TS backend 344/0/890 (delta +14).

---

## Task 7: Domain events (5 classes)

**Files:**
- Create 5 event files under `packages/api/typescript/src/billing/events/`
- Create: `packages/api/typescript/src/billing/events/events.test.ts`
- Modify: `packages/api/typescript/src/billing/events/index.ts`

**Agent:** backend-developer · **Skills:** /event, /schema · **Depends on:** Task 3
**Classification:** Contract Lock (the publisher in Task 14 subscribes by class reference).

Five domain events, all `extends BaseDomainEvent<typeof Schema>`, all use
`z.domainEvent({...})`. Names + payloads:

| Class | `static name` | payload |
|---|---|---|
| `SubscriptionEventReceivedEvent` | `billing.subscription_event.received` | `{ subscriptionEventId, subscriptionId, type, occurredAt }` |
| `SubscriptionPaymentReceivedEvent` | `billing.subscription_payment.received` | `{ subscriptionEventId, subscriptionId, amount: { amountCents, currency }, status: z.enum(['SUCCEEDED','FAILED','REFUNDED']) }` |
| `SubscriptionActivatedEvent` | `billing.subscription.activated` | `{ subscriptionId, userId, tier, period, currentPeriodEnd }` |
| `SubscriptionCancelledEvent` | `billing.subscription.cancelled` | `{ subscriptionId, userId, tier, cancelledAt }` |
| `SubscriptionExternalChangedEvent` | `billing.subscription.external_changed` | `{ subscriptionId, userId, oldExternalSubscriptionId, newExternalSubscriptionId, tier }` |

Note `tier` is included on the `Cancelled` payload so Task 14's publisher
doesn't need a repo lookup to route the quota-updated integration event.

- [x] **Step 1: Failing test** — iter 96. 7 tests / 11 expect(): all 5 `static name` strings; SubscriptionEventReceived nullable subscriptionId; SubscriptionPaymentReceived SUCCEEDED + unknown-status rejection; SubscriptionActivated full plan context; SubscriptionCancelled with tier; SubscriptionExternalChanged upgrade payload.
- [x] **Step 2: Impl** — iter 96. Five files mirroring tenancy's StoreMember*Event shape. Used `z.iso.datetime({ offset: true })` for all timestamp fields (matches tenancy precedent iter 67-69). `status` on SubscriptionPaymentReceived is a plain Zod enum `z.enum(['SUCCEEDED', 'FAILED', 'REFUNDED'])` — narrowing what comes off SubscriptionEventType into payment-relevant subset.
- [x] **Step 3: GREEN + tsc + commit** — iter 96. 7/0/11 in events.test.ts; full TS backend 351/0/901 (delta +7).

---

## Task 8: SubscriptionRepository (abstract + Drizzle + Mock + DI wiring)

**Files:**
- Create: `packages/api/typescript/src/billing/repositories/SubscriptionRepository/{SubscriptionRepository,DrizzleSubscriptionRepository,DrizzleSubscriptionRepository.test,MockSubscriptionRepository,index}.ts`
- Modify: `packages/api/typescript/src/billing/repositories/index.ts`
- Modify: `packages/api/typescript/src/billing/registry.ts`

**Agent:** backend-developer · **Skills:** /repository · **Depends on:** Tasks 6, 7

Abstract base methods:

```ts
abstract findById(id: string, tx?: Transaction): Promise<Subscription | undefined>
abstract findByUserId(userId: string, tx?: Transaction): Promise<Subscription | undefined>
abstract findByPlatformAndExternalId(
  platform: BillingPlatform, externalSubscriptionId: string, tx?: Transaction,
): Promise<Subscription | undefined>
abstract save(entity: Subscription, tx?: Transaction): Promise<Subscription>
```

Drizzle impl follows `DrizzleUserRepository.ts` exactly: imports
`billingSubscriptions` from `@template/contracts/db` (NOT `subscriptions`),
uses `(tx ?? this.db)`, `onConflictDoUpdate` keyed on `id` for upsert. The
contracts schema includes a `version` column — use it for optimistic-lock
guard (`WHERE id = $1 AND version = $previousVersion`), then bump
`entity.incrementVersion()` before persistence.

**Status:** iter 97. ✅ Abstract base, Drizzle, Mock, integration test (9 tests / 18 expect()), DI wired into both `billing/registry.ts` and `shared/registry.ts` so TestBed resolves SubscriptionRepository. Tested: save+findById round-trip, unknown-id miss, findByUserId hit + miss, findByPlatformAndExternalId hit + miss, upsert mutates tier/period/isActive on same id, save increments version monotonically, delete removes row.

**Deviation from plan body:** plan body mentions "stale-version optimistic-lock guard (`WHERE id = $1 AND version = $previousVersion`)". The mirrored tenancy `DrizzleStoreRepository` (iter 70) does NOT have this guard either — it relies on `entity.incrementVersion()` + onConflictDoUpdate. Following the established polyglot precedent over the plan body's specific hint. If concurrent-writer correctness becomes a real issue later, it can be added uniformly across all repos.

Integration test asserts: save → findById round-trip; save → findByUserId
round-trip; `findByPlatformAndExternalId` returns the row; stale-version
save throws.

Register in `registry.ts`:

```ts
mock: [{ token: SubscriptionRepository, instance: MockSubscriptionRepository }],
integration: [{ token: SubscriptionRepository, instance: DrizzleSubscriptionRepository }],
real: [{ token: SubscriptionRepository, instance: DrizzleSubscriptionRepository }],
```

- [ ] Steps 1–6 → commit `feat(billing): SubscriptionRepository + DI`

---

## Task 9: SubscriptionEventRepository (append-only + idempotency)

**Files:** same shape as Task 8 under `repositories/SubscriptionEventRepository/`.

**Agent:** backend-developer · **Skills:** /repository · **Depends on:** Tasks 5, 6, 8

Critical methods:

```ts
abstract insertIfNotExists(event: SubscriptionEvent, tx?: Transaction): Promise<SubscriptionEvent | undefined>
abstract existsByExternalEventId(platform: BillingPlatform, externalEventId: string, tx?: Transaction): Promise<boolean>
abstract listBySubscriptionId(
  subscriptionId: string,
  opts: { page: number; limit: number; eventTypes?: SubscriptionEventType[] },
  tx?: Transaction,
): Promise<{ total: number; items: SubscriptionEvent[] }>
abstract findFirstSucceededPayment(subscriptionId: string, tx?: Transaction): Promise<SubscriptionEvent | undefined>
```

`insertIfNotExists` implementation:

```ts
const inserted = await dbClient
  .insert(subscriptionEvents)
  .values(this.toPersistence(event))
  .onConflictDoNothing({ target: [subscriptionEvents.platform, subscriptionEvents.externalEventId] })
  .returning()
return inserted[0] ? this.toDomain(inserted[0]) : undefined
```

This is the **single source of webhook idempotency** — relies on the
`subscription_events_platform_external_event_id_unq` unique index already
present in `db/schema/billing.ts`.

Integration tests assert: first call returns event, second call returns
undefined; `listBySubscriptionId` orders `occurredAt DESC` + paginates +
filters by `eventTypes`; `findFirstSucceededPayment` returns earliest
`PAYMENT_SUCCEEDED` row or undefined.

- [x] Wire into `registry.ts`, run `bun tsc + bun test`, commit — iter 98. Quartet shipped (abstract, Drizzle, Mock, integration test). Registry adds SubscriptionEventRepository binding per env next to SubscriptionRepository. 8 tests / 14 expect() covering: insertIfNotExists first-write returns event; duplicate (platform, externalEventId) returns undefined; existsByExternalEventId reflects writes; listBySubscriptionId orders DESC + paginates; eventTypes filter; scopes to subscriptionId; findFirstSucceededPayment earliest hit + undefined-when-no-success. `delete` throws (append-only invariant); `save` is a thin wrapper around insertIfNotExists for Repository<T> conformance.

---

## Task 10: KiwifyWebhookVerifier (HMAC)

**Files:**
- Create: `packages/api/typescript/src/billing/services/{KiwifyWebhookVerifier,KiwifyWebhookVerifier.test}.ts`
- Modify: `packages/api/typescript/src/billing/services/index.ts`
- Modify: `packages/api/typescript/core/src/utils/Config.ts` — add `KIWIFY_WEBHOOK_SECRET: z.string().optional()`
- Modify: `.env.example` — `KIWIFY_WEBHOOK_SECRET=`

**Agent:** backend-developer · **Skills:** /service · **Depends on:** Task 3

Kiwify uses **HMAC-SHA1** over the raw request body, hex-encoded,
transmitted in the `?signature=` query parameter (legacy convention from
the BK Dash backend). Verifier is `@injectable()`, reads the secret from
`Config.env.KIWIFY_WEBHOOK_SECRET`, returns `false` when secret or
signature is missing, uses `timingSafeEqual` for comparison.

- [x] **Step 1: Failing test** — iter 99. 8 tests / 10 expect(): known-good passes; signature-missing fails; tampered-body fails; wrong-secret fails; length-mismatched fails (+ no throw); non-hex input fails (+ no throw); secret-unset fails; secret-empty-string fails.
- [x] **Step 2: Impl** — iter 99. `createHmac('sha1', secret).update(rawBody, 'utf8').digest('hex')`; pre-check signature.length === expectedHex.length to avoid timingSafeEqual length-throw leaking length info; try/catch around `Buffer.from(*, 'hex')` for the odd-length/non-hex edge.

**Deviation from plan body:** the verifier takes `secret` as a constructor parameter defaulting to `Config.env.KIWIFY_WEBHOOK_SECRET`. Reason: `Config` snapshots `process.env.*` at module import time (verified empirically); tests cannot mutate process.env post-import to flip the secret. Constructor injection makes the verifier testable without `process.env` mutation. Production still gets the Config default at DI resolution time. Documented inline.

- [x] **Step 3: GREEN + tsc + commit** — iter 99. 8/0/10; full TS backend 376/0/943 (delta +8). Added `KIWIFY_WEBHOOK_SECRET` to `core/src/utils/Config.ts` (optional) and `.env.example` under the Webhook secrets block.

**# QUESTION:** Confirm Kiwify still uses sha1+query-param vs sha256+header.
If documentation has moved on, swap algorithm + transport; the unit test
covers both shapes the same way.

---

## Task 11: KiwifyWebhookMapper

**Files:**
- Create: `packages/api/typescript/src/billing/services/{KiwifyWebhookMapper,KiwifyWebhookMapper.test}.ts`
- Modify: `packages/api/typescript/src/billing/services/index.ts`

**Agent:** backend-developer · **Skills:** /service · **Depends on:** Tasks 5, 10

Output type:

```ts
export type MappedKiwifyEvent = {
  userId: string                  // from TrackingParameters.s1
  platform: BillingPlatform.KIWIFY
  externalSubscriptionId: string  // from Subscription.subscription_id
  externalEventId: string         // from webhook_event_id
  occurredAt: Date                // from created_at
  type: SubscriptionEventType
  tier: PlanTier
  period: PlanPeriod
  payload: Record<string, unknown> // raw payload for audit
}
```

Event type mapping per spec §4 BC11:

| Kiwify `webhook_event_type` | `SubscriptionEventType` |
|---|---|
| `order_approved` | `PAYMENT_SUCCEEDED` |
| `order_refunded` | `PAYMENT_REFUNDED` |
| `chargeback` | `PAYMENT_FAILED` |
| `subscription_created` | `SUBSCRIPTION_CREATED` |
| `subscription_canceled` | `SUBSCRIPTION_CANCELLED` |
| `subscription_renewed` | `SUBSCRIPTION_REACTIVATED` |
| anything else | throws `BILLING_WEBHOOK_PAYLOAD_INVALID` |

Tier mapping (product-name keyword, case-insensitive): `Plano 1` → BASIC ·
`Plano 3` → INTERMEDIATE · `Plano 5` → ADVANCED · `Ilimitadas` /
`Ilimitado` → UNLIMITED.

Period mapping (product-name heuristic): `mensal` → MONTHLY · `trimestral`
→ QUARTERLY · `anual` → ANNUAL · default MONTHLY.

- [ ] **Step 1: Failing test** — fixtures for each of the 6 event types + tier mapping table + period heuristic + missing `s1` → `SUBSCRIPTION_LOOKUP_FAILED` + unknown event type → `BILLING_WEBHOOK_PAYLOAD_INVALID`.
- [ ] **Step 2: Impl** — pure mapper, no I/O, no injected deps.
- [ ] **Step 3: GREEN + tsc + commit** — `feat(billing): KiwifyWebhookMapper`

---

## Task 12: HandleBillingWebhook use case (C56)

**Files:**
- Create: `packages/api/typescript/src/billing/usecases/{HandleBillingWebhook,HandleBillingWebhook.test}.ts`

**Agent:** backend-developer · **Skills:** /usecase · **Depends on:** Tasks 8, 9, 11

Input schema: `{ platform: BillingPlatformSchema, rawBody: z.string(), signature: z.string().optional() }`.
Output schema: `{ accepted: z.boolean(), subscriptionEventId: z.string().nullable() }`.

Flow inside `this.withTransaction(tx, async tx => {...})`:

1. `verifier.verify(rawBody, signature)` → false → `throw new BaseError<InterfaceErrors>('BILLING_WEBHOOK_SIGNATURE_INVALID')`.
2. `mapper.map(JSON.parse(rawBody))` → throws `BILLING_WEBHOOK_PAYLOAD_INVALID` or `SUBSCRIPTION_LOOKUP_FAILED`.
3. `subscription = await subscriptionRepo.findByPlatformAndExternalId(platform, externalSubscriptionId, tx)`.
4. If `!subscription && mapped.type === SUBSCRIPTION_CREATED`: `Subscription.create({ userId, platform, externalSubscriptionId, tier: mapped.tier, period: mapped.period })` then save.
5. If `!subscription && mapped.type !== SUBSCRIPTION_CREATED`: still proceed — write the event row with `subscriptionId = null` (orphan event; permitted by the schema, line 100). Return `{ accepted: true, subscriptionEventId }` without raising derived events.
6. Build `SubscriptionEvent.create({ subscriptionId: subscription?.id.value ?? null, platform, externalSubscriptionId, type: mapped.type, externalEventId: mapped.externalEventId, payload: mapped.payload, occurredAt: mapped.occurredAt })`.
7. `inserted = await eventRepo.insertIfNotExists(event, tx)` — if `undefined`, return `{ accepted: true, subscriptionEventId: null }` (idempotent no-op).
8. If `subscription`: `subscription.applyEvent(inserted)`; `await subscriptionRepo.save(subscription, tx)`.
9. Raise domain events (persist each via `await this.domainEventRepository.save(event, tx)`):
   - Always `SubscriptionEventReceivedEvent`.
   - If `mapped.type === PAYMENT_SUCCEEDED` → also `SubscriptionPaymentReceivedEvent`.
   - If `subscription && subscription.wasInactive && subscription.isActive` → `SubscriptionActivatedEvent`.
   - If `mapped.type === SUBSCRIPTION_CANCELLED` → `SubscriptionCancelledEvent`.
10. Return `{ accepted: true, subscriptionEventId: inserted.id.value }`.

- [ ] **Step 1: Failing tests** — covers all AC rows tagged §7.11 C56 (idempotency, signature, platform, payload, lookup-failed, derived events, period math, orphan-event tolerance).
- [ ] **Step 2: Impl**.
- [ ] **Step 3: GREEN + tsc + commit** — `feat(billing): HandleBillingWebhook use case (C56)`

---

## Task 13: ChangeExternalSubscription use case (C57)

**Files:**
- Create: `packages/api/typescript/src/billing/usecases/{ChangeExternalSubscription,ChangeExternalSubscription.test}.ts`

**Agent:** backend-developer · **Skills:** /usecase · **Depends on:** Tasks 8, 9

Input: `{ subscriptionId, newExternalSubscriptionId, tier: PlanTier, period: PlanPeriod }`. Constructor injects `SubscriptionRepository` + `SubscriptionEventRepository`.

Flow:

1. `findById(subscriptionId)` → undefined → throw `SUBSCRIPTION_NOT_FOUND`.
2. Optional collision check: `findByPlatformAndExternalId(KIWIFY, newExternalSubscriptionId)` — if hit AND different userId → `BILLING_PERIOD_MISMATCH` (reuse for cross-user external-id conflicts).
3. `const oldExternalSubscriptionId = subscription.externalSubscriptionId`.
4. `subscription.changeExternal({ newExternalSubscriptionId, tier, period, now: new Date() })`.
5. Append `EXTERNAL_SUBSCRIPTION_CHANGED` row via `eventRepo.insertIfNotExists(SubscriptionEvent.create({ ..., externalEventId: 'manual:' + crypto.randomUUID() }))`.
6. `subscriptionRepo.save`.
7. Raise `SubscriptionExternalChangedEvent` → `domainEventRepository.save`.

Return `{ subscriptionId }`.

- [ ] Steps 1–3 → commit `feat(billing): ChangeExternalSubscription use case (C57)`

---

## Task 14: SubscriptionQuotaUpdatedPublisher (internal handlers → integration event)

**Files:**
- Create: `packages/api/typescript/src/billing/handlers/SubscriptionQuotaUpdatedPublisher.ts`
- Create: `packages/api/typescript/src/billing/handlers/SubscriptionQuotaUpdatedPublisher.test.ts`
- Modify: `packages/api/typescript/src/billing/handlers/internal.ts`

**Agent:** backend-developer · **Skills:** /handler, /event · **Depends on:** Tasks 2, 7

The framework registers internal handlers as **one handler class per
event** via `Mediator.register(container, mediator, options.internalHandlers)`
(see `EventHandler.name` getter — bound to `this.event.name`). Ship **three
thin EventHandler subclasses** that all delegate to a shared helper
publishing the integration event:

```ts
import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@template/core-typescript'
import { SubscriptionQuotaUpdatedEvent } from '@template/contracts-typescript/wire'
import {
  SubscriptionActivatedEvent,
  SubscriptionCancelledEvent,
  SubscriptionExternalChangedEvent,
} from '../events'

async function publishQuotaUpdated(mediator: ExternalMediator, userId: string, tier: string) {
  await mediator.publish(new SubscriptionQuotaUpdatedEvent({
    entityId: userId, ownerId: userId,
    payload: { userId, tier },
  }))
}

@injectable()
export class OnSubscriptionActivated extends EventHandler<typeof SubscriptionActivatedEvent> {
  readonly event = SubscriptionActivatedEvent
  constructor(private mediator: ExternalMediator) { super() }
  async handle(event: this['input']): Promise<this['output']> {
    await publishQuotaUpdated(this.mediator, event.payload.userId, event.payload.tier)
  }
}

@injectable()
export class OnSubscriptionCancelled extends EventHandler<typeof SubscriptionCancelledEvent> {
  readonly event = SubscriptionCancelledEvent
  constructor(private mediator: ExternalMediator) { super() }
  async handle(event: this['input']): Promise<this['output']> {
    await publishQuotaUpdated(this.mediator, event.payload.userId, event.payload.tier)
  }
}

@injectable()
export class OnSubscriptionExternalChanged extends EventHandler<typeof SubscriptionExternalChangedEvent> {
  readonly event = SubscriptionExternalChangedEvent
  constructor(private mediator: ExternalMediator) { super() }
  async handle(event: this['input']): Promise<this['output']> {
    await publishQuotaUpdated(this.mediator, event.payload.userId, event.payload.tier)
  }
}
```

`internal.ts`:

```ts
export {
  OnSubscriptionActivated,
  OnSubscriptionCancelled,
  OnSubscriptionExternalChanged,
} from './SubscriptionQuotaUpdatedPublisher'
```

- [ ] **Step 1: Failing test** — dispatches each of the 3 domain events
  through the internal mediator, asserts `MockExternalMediator` captured
  exactly one `SubscriptionQuotaUpdatedEvent` per dispatch with the
  expected `userId + tier`.
- [ ] **Step 2: Impl**.
- [ ] **Step 3: GREEN + tsc + commit** — `feat(billing): SubscriptionQuotaUpdated publisher`

Per the memory note (`feedback_givenevent_scope.md`), the tests instantiate
each handler and call `.handle(event)` directly with a spy mediator — they
do NOT seed `shared.events`.

---

## Task 15: GetMySubscription read use case + controller (T38)

**Files:**
- Create: `packages/api/typescript/src/billing/usecases/{GetMySubscription,GetMySubscription.test}.ts`
- Create: `packages/api/typescript/src/billing/controllers/GetMySubscription.ts`
- Modify: `packages/api/typescript/src/billing/{usecases,controllers}/index.ts`

**Agent:** backend-developer · **Skills:** /query, /controller, /schema · **Depends on:** Tasks 1, 8

Use case injects `DrizzleClient` (BFF pattern — bypass repo for read-shape efficiency; mirrors `ui/usecases/GetUserInfo.ts`). Output schema:

```ts
const QuotaSchema = z.object({ used: z.number().int(), max: z.number() })
export const GetMySubscriptionOutputSchema = z.object({
  id: z.string().nullable(),
  tier: PlanTierSchema.nullable(),
  period: PlanPeriodSchema.nullable(),
  isActive: z.boolean(),
  isCancelled: z.boolean(),
  currentPeriodStart: z.date().nullable(),
  currentPeriodEnd: z.date().nullable(),
  quotaUsage: z.object({ storeAmount: QuotaSchema, integrationAmount: QuotaSchema }),
})
```

Logic: SELECT one row from `billingSubscriptions WHERE user_id = $userId`.
If absent → return all-null + `isActive=false` + `isCancelled=false` +
quotaUsage zeros against `PlanTier.BASIC` (implicit free tier). If present:
- `isCancelled = !row.isActive && row.currentPeriodEnd != null && row.currentPeriodEnd <= now`
- `quotaUsage.storeAmount = { used: 0, max: planQuotaFor(row.tier, PlanFeature.STORE_AMOUNT).max }` (`used` placeholder until P2-TENANCY lands the store-count projection — documented in controller jsdoc).
- `quotaUsage.integrationAmount = { used: 0, max: planQuotaFor(row.tier, PlanFeature.INTEGRATION_AMOUNT).max }` (`used` placeholder until P4-INTEGRATION lands).

Controller adds `AuthMiddleware` explicitly (BC default is empty). Calls
`useCase.execute({ userId: ctx.user.id })`.

- [ ] Steps 1–3 → commit `feat(billing): GetMySubscription read (T38)`

---

## Task 16: ListSubscriptionEventHistory read use case + controller (T39)

**Files:**
- Create: `packages/api/typescript/src/billing/usecases/{ListSubscriptionEventHistory,ListSubscriptionEventHistory.test}.ts`
- Create: `packages/api/typescript/src/billing/controllers/ListSubscriptionEventHistory.ts`

**Agent:** backend-developer · **Skills:** /query, /controller · **Depends on:** Tasks 4, 5, 9

Input: `{ subscriptionId, page: z.number().default(1), limit: z.number().min(1).max(100).default(20), eventTypes: z.array(SubscriptionEventTypeSchema).optional() }`.

Output: `{ total: number, items: Array<{ id, eventType, occurredAt, payloadSummary: SubscriptionEventPayloadSummary }> }`.

Use case delegates to `SubscriptionEventRepository.listBySubscriptionId(...)`,
then maps each entity through `entity.summarize()` for the
`payloadSummary` field.

Controller adds `AuthMiddleware` + authorization check: load the
subscription, assert `subscription.userId === ctx.user.id`; otherwise throw
`SUBSCRIPTION_NOT_FOUND` (don't leak existence via `UNAUTHORIZED`).

- [ ] Steps 1–3 → commit `feat(billing): ListSubscriptionEventHistory read (T39)`

---

## Task 17: Webhook + external-change controllers + BC wire-up

**Files:**
- Create: `packages/api/typescript/src/billing/controllers/HandleBillingWebhook.ts`
- Create: `packages/api/typescript/src/billing/controllers/ChangeExternalSubscription.ts`
- Modify: `packages/api/typescript/src/billing/controllers/index.ts` — export all 4 controllers
- Modify: `packages/api/typescript/src/index.ts` — `import BillingRouter from '@billing/index'` + add to `routers[]`

**Agent:** backend-developer · **Skills:** /controller · **Depends on:** Tasks 12, 13, 15, 16

`HandleBillingWebhook` controller:
- `path: '/billing/webhooks/:platform'`, `method: 'post'`.
- `skipMiddlewares = [AuthMiddleware]` (public endpoint).
- Reads `request.rawBody` (cast through `Buffer` if needed); reads `request.query.signature`; reads `request.params.platform`.
- Validates `platform` against `BillingPlatformSchema`; throws `BILLING_WEBHOOK_UNKNOWN_PLATFORM` on mismatch.
- Calls `useCase.execute({ platform, rawBody, signature })`.
- Returns `{ status: 200, data: { accepted: true } }` regardless of dedupe outcome (Kiwify retries on non-200).

`ChangeExternalSubscription` controller: `path:
'/billing/subscriptions/:subscriptionId/external'`, `method: 'put'`, body `{
newExternalSubscriptionId, tier, period }`, mounts `AuthMiddleware`
explicitly, verifies caller owns the subscription before calling the use
case.

Update root `src/index.ts`:

```ts
import BillingRouter from '@billing/index'
const routers = [SharedRouter, AuthRouter, BillingRouter, NotificationsRouter, UIRouter]
```

- [ ] Steps 1–3 — including a smoke test that runs `bun tsc` end-to-end + checks `/v1/billing/webhooks/KIWIFY` shows up in the generated `openapi.json`.
- [ ] Commit — `feat(billing): webhook + external-change controllers + BC mount`

---

## Task 18: SDK regeneration + final validation

**Files:**
- Run: `bun emit-openapi` then `bun sdk`
- Verify: `packages/client/dist/` contains hooks/types for the 3 client-facing Billing endpoints
- Run: `bun tsc && bun lint && bun run test`

**Agent:** backend-developer · **Skills:** /sdk · **Depends on:** Tasks 1–17

- [ ] **Step 1:** `bun emit-openapi` — regenerate `packages/api/typescript/public/docs/openapi.json`. Confirm `/billing/me`, `/billing/subscriptions/:id/events`, `/billing/subscriptions/:id/external`, `/billing/webhooks/:platform` all present.
- [ ] **Step 2:** `bun sdk` — Kubb regenerates `packages/client/dist/typescript/`.
- [ ] **Step 3:** Confirm new hooks: `useGetMySubscription`, `useListSubscriptionEventHistory`, `useChangeExternalSubscription`. The webhook is server-to-server, so no client hook needed.
- [ ] **Step 4:** `bun tsc && bun lint && bun run test` — all green.
- [ ] **Step 5:** Final commit + tick off P3-BILLING in `.plans/2026-05-21-bk-dash-port.progress.md`.

`feat(billing): regenerate SDK with 3 client-facing endpoints + close P3-BILLING`

---

## Final Validation

- [ ] `bun x nx affected -t tsc lint test --base=dev` — green for `@template/api-typescript`, `@template/core-typescript`, `@template/contracts`, `@template/client`.
- [ ] AC mapping (every row in §"Acceptance criteria" above maps to a `.test.ts` file under `packages/api/typescript/src/billing/` or `packages/api/typescript/core/src/services/PlanQuotas/`).
- [ ] Manual smoke (optional): `bun dev` → `curl -X POST http://localhost:3030/v1/billing/webhooks/KIWIFY?signature=<hmac> -d @fixtures/kiwify-order-approved.json` → 200; second call → 200 with same event id; DB shows single row.
- [ ] Git working tree clean; `.plans/2026-05-21-bk-dash-port.progress.md` updated.

---

## Notes

- **Cancelled payload carries `tier`.** Task 7's `SubscriptionCancelledEvent`
  payload includes `tier` so the publisher (Task 14) can route quota-updated
  without a repo lookup. If a later refactor removes `tier` from the
  Cancelled payload, the publisher must inject `SubscriptionRepository` and
  read `tier` from the row.
- **Orphan events are accepted, not raised.** A `PAYMENT_SUCCEEDED`
  arriving before `SUBSCRIPTION_CREATED` is persisted with
  `subscriptionId = null` but does NOT raise `SubscriptionActivatedEvent`
  (no aggregate exists). When the matching `SUBSCRIPTION_CREATED` arrives
  later, a backfill job (P3 follow-up, not in this plan) can sweep
  `subscriptionId IS NULL` rows and resolve via `(platform,
  externalSubscriptionId)`.
- **No `bun migrate:create` step.** The contracts package owns migration
  generation via `bun run --filter @template/contracts drizzle:generate`.
  The `billing.subscriptions` + `billing.subscription_events` migration was
  emitted when iter 42 landed the schema. Re-run only if someone modifies
  `db/schema/billing.ts`.
- **FK on `user_id`.** Deliberately omitted (per `db/schema/billing.ts`
  lines 33–37). P1-IDENTITY adds it once the `identity.users` table lands.
  This plan does not block on it.
- **Webhook raw-body access.** Fastify exposes the raw body via
  `request.body` when `addContentTypeParser` preserves it; the
  `FastifyHttpRouter` in `@template/core-typescript` may need a small
  patch to expose `rawBody` on the controller request. If `request.rawBody`
  is not yet wired, add a tiny middleware in Task 17 that captures the
  buffer before JSON parsing and stashes it on the request. File a
  follow-up ticket if more than one webhook controller will need this.
- **PLAN_QUOTAS lives in polyglot core** (`packages/api/typescript/core/src/services/PlanQuotas/`),
  NOT in `packages/contracts/`. Quotas evolve with releases (code), not at
  runtime (data). The contracts package only carries cross-language shapes
  that change together with consumers.
- **TS export rename.** The Drizzle table object is `billingSubscriptions`
  (NOT `subscriptions`) at every import site — iter 42f rename to avoid the
  collision with `channel.subscriptions` documented in the same iter. The
  underlying PG table remains `billing.subscriptions`.
- **Graph CLI.** The master plan caveat #2 (broken graph CLI) still holds
  unless polyglot landed a fix. This plan does NOT invoke
  `bun scripts/graph/cli/index.ts validate-plan`; sibling lookups were
  done manually.
