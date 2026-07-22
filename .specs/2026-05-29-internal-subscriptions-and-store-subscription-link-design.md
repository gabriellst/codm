# Internal Subscriptions & Store→Subscription Link — Design Spec

**Date:** 2026-05-29
**Status:** Approved
**Bounded Context:** cross-context: billing, tenancy, contracts
**Kind:** feature
**Story Points:** 13 — two BCs end-to-end + a contracts enum change, two migrations, two read-model reshapes (one per BC), a new middleware, and cross-BC query ports in both directions. Splittable (see § Decomposition) but the user chose one combined spec.

## Context

Subscriptions live in the **billing** BC. `Subscription` (`packages/api/typescript/src/billing/entities/Subscription.ts`) is a thin aggregate keyed on a deterministic id `Id.fromSeed('billing','subscription', platform, externalSubscriptionId)`. It carries `userId, platform (BillingPlatform), externalSubscriptionId, tier (PlanTier), period (PlanPeriod), currentPeriodStart, currentPeriodEnd, isActive`. Today it is created **only** by external billing webhooks: `HandleBillingWebhookController` → `BillingWebhookReceivedHandler` → `KiwifyWebhookMapper` → `ExternalSubscriptionUpdatedEvent{transition}` → `ExternalSubscriptionUpdatedHandler` (which calls `Subscription.create` on the `CREATED` branch, saving the aggregate + raising `SubscriptionCreatedEvent` atomically). `SubscriptionQuotaUpdatedPublisher` (`packages/api/typescript/src/billing/handlers/SubscriptionQuotaUpdatedPublisher.ts`) listens to `SubscriptionCreatedEvent` and publishes the `subscription.quota_updated` wire event. `BillingPlatform` (`packages/contracts/wire/enums/billing-platform.tsp`) is currently `{ KIWIFY, OTHER }`. Per-tier store caps live in `PLAN_QUOTAS` (`packages/api/typescript/core/src/services/PlanQuotas/PlanQuotas.ts`, `STORE_AMOUNT` only: BASIC 1, INTERMEDIATE 3, ADVANCED 10, UNLIMITED ∞).

Stores live in the **tenancy** BC. `Store` (`packages/api/typescript/src/tenancy/entities/Store.ts`) holds profile + preference fields and **no subscription reference**. `CreateStore` (`packages/api/typescript/src/tenancy/usecases/CreateStore.ts`) gates on `PlanQuotaService.ensureStoreQuotaAvailable(userId)` (`packages/api/typescript/src/tenancy/services/PlanQuotaService.ts`), which calls `SubscriptionQueryService.getActiveSubscription(userId)` (`packages/api/typescript/src/tenancy/services/SubscriptionQueryService.ts`, returns a **single** active sub via `BillingSubscriptionQueryService` `LIMIT 1`) and counts the user's stores with `StoreRepository.countActiveStoresByUserId`. So the link between a store and a subscription is **implicit and user-level** today: one active sub per user, quota = total stores.

The shape we want already shipped once, in the old `bk-dash-backend` (NestJS+Prisma, active impl in `backend-old/`): `User 1—* Subscription 1—* IntegrationSet` (an IntegrationSet is today's Store), with `IntegrationSet.subscriptionId` FK, per-tier slot caps, store creation auto-picking the user's best-tier sub with a free slot, an internal "grant" path that activates without payment, and a `change-subscription` endpoint that reassigns an orphaned store. Prior-session analysis is captured in memory `project_internal_subscriptions_design`.

## Problem

1. **No way to grant access without a purchase.** Every subscription must arrive via a billing webhook. Comp accounts, partnerships, staff, and trials cannot be provisioned.
2. **Expiration is modelled but access is really `isActive`.** `currentPeriodStart/End` add a date window that the access path doesn't need (access flips on paid/cancel/overdue/pause webhooks), and they actively block the no-purchase grant: `BillingSubscriptionQueryService` treats a null `currentPeriodEnd` as "not active", so a grant with no period window would be invisible to the quota gate.
3. **One-subscription-per-user is wrong.** A user can legitimately hold several subscriptions (e.g. a paid Kiwify sub plus an internal grant, or multiple grants). The read path (`getActiveSubscription`, `GetMySubscription` via `findByUserId`) collapses them to one.
4. **A store is not bound to a specific subscription.** When a store's subscription ends (cancelled/overdue) there is no way to move that store onto another active subscription the user holds — the old `change-subscription` capability is missing — and quota is counted user-wide rather than against the subscription actually paying for the store.

## Goal

An operator can grant a subscription to any user without a payment, scoped by a secret key. A user can hold multiple subscriptions at once; each new store is automatically bound to the best subscription that still has a free slot; quota is enforced per subscription; and when a store's subscription becomes inactive the user can move that store onto another active subscription they own. Access is governed purely by whether a subscription is active — no expiry dates to reason about.

## Decisions

1. **Add `BillingPlatform.INTERNAL`** to `packages/contracts/wire/enums/billing-platform.tsp`, regenerate bindings (`bun sdk`). It joins `KIWIFY, OTHER`.
2. **`GrantInternalSubscription` use case** in billing, input `{ userId, tier }`. It builds `Subscription.create({ userId, platform: INTERNAL, externalSubscriptionId: 'internal:<uuid>', tier })` (uuid via `Id.value()`, UUIDv7 — see memory `id_fromseed_unified`), saves the aggregate **and raises the existing `SubscriptionCreatedEvent` in one transaction** — identical to the webhook `CREATED` branch, so `SubscriptionQuotaUpdatedPublisher` fires unchanged.
3. **Each grant creates a new subscription row** ("bucket"). The random `internal:<uuid>` external id makes `computeId` unique per call, so repeated grants add independent tier-capped slot buckets rather than mutating one. No idempotency key.
4. **The grant is guarded by a new `InternalSecretKeyMiddleware`** (not a role). It compares request header `x-internal-secret` against env `BILLING_INTERNAL_SECRET` (mirrors the existing `KIWIFY_WEBHOOK_SECRET` env convention); mismatch/absent → `INVALID_SECRET_KEY` (HTTP 401). The grant controller skips `AuthAccountMiddleware` and applies this middleware instead.
5. **Remove expiration.** Drop `currentPeriodStart` and `currentPeriodEnd` from the `Subscription` entity schema, the window math in `create/markPaid/markRenewed/changeExternal`, and the `billing.subscriptions` table (migration). Access is the `isActive` boolean only, flipped by the existing paid/cancel/overdue/pause methods.
6. **Keep `period` as nullable informational.** `Subscription.period` becomes `PlanPeriod | null` (it no longer drives a window). The Kiwify mapper still sets it; internal grants leave it null.
7. **Multiple subscriptions per user.** `SubscriptionQueryService.getActiveSubscription(userId)` becomes `getActiveSubscriptions(userId): ActiveSubscription[]`. `ActiveSubscriptionSchema` drops `expirationDate`, keeping `{ subscriptionId, tier }`. `BillingSubscriptionQueryService` returns all rows where `isActive = true` (no `LIMIT 1`, no period-end null-skip). `SubscriptionRepository` gains `findActiveByUserId(userId): Subscription[]`.
8. **Store→subscription link.** Add nullable `subscription_id` to `tenancy.stores` (`packages/contracts/db/schema/tenancy.ts`) and `subscriptionId: string | null` to the `Store` entity, plus `Store.changeSubscription(subscriptionId)`. The column is **nullable with no backfill** (pre-release branch); the app invariant is that `CreateStore` always sets it for new stores.
9. **`CreateStore` auto-picks.** `PlanQuotaService` changes from a void gate to `resolveSubscriptionForNewStore(userId): { subscriptionId }`: it reads `getActiveSubscriptions(userId)`, for each counts stores via `StoreRepository.countStoresBySubscriptionId`, picks the **highest-tier subscription that still has a free slot** (`count < PLAN_QUOTAS[tier].STORE_AMOUNT`); throws `NO_ACTIVE_SUBSCRIPTION` when none active, `STORE_QUOTA_EXCEEDED` when active but all full. `CreateStore` passes the resolved `subscriptionId` into `Store.create`.
10. **Per-subscription quota.** Quota is counted against the specific subscription a store is (or would be) bound to — `countStoresBySubscriptionId` vs that subscription's tier cap — not the user-wide store total. `countActiveStoresByUserId` is retired from the quota path.
11. **`GetMySubscription` → `GetMySubscriptions`** (list). Each item `{ id, platform, tier, period, isActive, storeAmount: { used, max } }`; `expirationDate` and date-derived `isCancelled` are removed. Per-bucket `used` is the real store count, read via a **new billing-defined `StoreSlotQueryService` port** (`countStoresBySubscriptions(ids): Record<id, number>`) implemented in tenancy — the mirror of how billing implements tenancy's `SubscriptionQueryService`. `max` comes from `PLAN_QUOTAS`.
12. **`ChangeStoreSubscription`** — authenticated **user** use case (not admin), input `{ storeId, targetSubscriptionId, userId }`. Validations: the store exists and the user owns it (OWNER membership); the store's **current** subscription is **inactive** (`STORE_SUBSCRIPTION_STILL_ACTIVE` otherwise — old-backend parity); the target subscription exists, is active, belongs to the same user (`SUBSCRIPTION_NOT_FOUND` / `SUBSCRIPTION_NOT_OWNED`), and has a free slot (`TARGET_SUBSCRIPTION_FULL`). On success it calls `store.changeSubscription(targetSubscriptionId)`, saves, and raises a **new tenancy domain event `StoreSubscriptionChangedEvent`** `{ storeId, fromSubscriptionId, toSubscriptionId, changedByUserId }` — domain-only, no wire/integration event.

## User Stories

- **Story 1 (operator grant):** As an operator with the internal secret key, I want to grant a subscription to a user without a payment, so that staff/partners/trial users get access. — Covers AC-1..4.
  - Given a valid `x-internal-secret` and a `userId` + `tier`, when I POST the grant, then a new active `INTERNAL` subscription row is created for that user and `SubscriptionCreatedEvent` is raised.
  - Given the same `userId` + `tier` a second time, when I POST again, then a **second** independent subscription bucket is created (not an update).
  - Given a missing/incorrect secret header, when I POST, then I get `INVALID_SECRET_KEY` (401) and nothing is written.

- **Story 2 (auto-linked store):** As a user creating a store, I want it bound to my best available subscription automatically, so that I don't pick a plan manually. — Covers AC-5..7.
  - Given I hold an ADVANCED sub with a free slot and a BASIC sub, when I create a store, then it links to the ADVANCED subscription.
  - Given all my active subscriptions are at their store cap, when I create a store, then I get `STORE_QUOTA_EXCEEDED`.
  - Given I have no active subscription, when I create a store, then I get `NO_ACTIVE_SUBSCRIPTION`.

- **Story 3 (reassign orphaned store):** As a user whose store's subscription was cancelled, I want to move that store onto another active subscription I own, so that it regains access. — Covers AC-8..10.
  - Given a store whose current subscription is inactive and a target active subscription of mine with a free slot, when I change the store's subscription, then the store's `subscriptionId` is the target and `StoreSubscriptionChangedEvent` is raised.
  - Given the store's current subscription is still active, when I try to change it, then I get `STORE_SUBSCRIPTION_STILL_ACTIVE`.
  - Given the target subscription is full / not mine / inactive, when I try to change it, then I get `TARGET_SUBSCRIPTION_FULL` / `SUBSCRIPTION_NOT_OWNED` / `SUBSCRIPTION_NOT_FOUND` respectively.

- **Story 4 (view subscriptions):** As a user, I want to see all my subscriptions with per-bucket store usage, so that I know where my slots are. — Covers AC-11..12.
  - Given I hold two active subscriptions, when I read my subscriptions, then I get a list with each one's `tier` and `storeAmount.used/max`.

## Acceptance Criteria

- [ ] AC-1: `BillingPlatform` exposes `INTERNAL` across the TypeSpec source and regenerated TS bindings/SDK.
- [ ] AC-2: A successful grant creates a `billing.subscriptions` row with `platform = INTERNAL`, `externalSubscriptionId` matching `internal:<uuid>`, the requested `tier`, `period = null`, and `isActive = true`, and persists a `SubscriptionCreatedEvent` in the same transaction.
- [ ] AC-3: Two grants for the same `userId`+`tier` produce two distinct subscription rows (two buckets).
- [ ] AC-4: A grant request without a valid `x-internal-secret` header fails with `INVALID_SECRET_KEY` (401) and writes nothing.
- [ ] AC-5: `billing.subscriptions` has no `current_period_start`/`current_period_end` columns, the `Subscription` entity has no such fields, and the access path relies on `isActive` only.
- [ ] AC-6: `getActiveSubscriptions(userId)` returns every active subscription for the user (≥1), each as `{ subscriptionId, tier }` with no `expirationDate`.
- [ ] AC-7: `CreateStore` links the new store to the highest-tier active subscription that has a free slot, recorded in `stores.subscription_id`; with all active subs full it throws `STORE_QUOTA_EXCEEDED`; with none active it throws `NO_ACTIVE_SUBSCRIPTION`.
- [ ] AC-8: Quota for store creation is counted per subscription (`countStoresBySubscriptionId` vs that sub's `PLAN_QUOTAS[tier].STORE_AMOUNT`), not by user-wide store total.
- [ ] AC-9: `ChangeStoreSubscription` reassigns a store to `targetSubscriptionId` and raises `StoreSubscriptionChangedEvent{ storeId, fromSubscriptionId, toSubscriptionId, changedByUserId }` only when the store's current subscription is inactive and the target is active, owned by the user, and has a free slot.
- [ ] AC-10: `ChangeStoreSubscription` rejects with `STORE_SUBSCRIPTION_STILL_ACTIVE`, `SUBSCRIPTION_NOT_FOUND`, `SUBSCRIPTION_NOT_OWNED`, or `TARGET_SUBSCRIPTION_FULL` for the respective invalid conditions, writing nothing.
- [ ] AC-11: `GetMySubscriptions` returns a list; each item carries `{ id, platform, tier, period, isActive, storeAmount: { used, max } }` with `used` equal to the real count of stores bound to that subscription and `max` from `PLAN_QUOTAS`.
- [ ] AC-12: `GetMySubscriptions` returns an empty list (not a synthesized free-tier row) when the user has no subscription.
- [ ] AC-13: Existing billing webhook flows (Kiwify order_approved / renewed / cancelled / overdue) still create/update subscriptions correctly with the period-window fields removed (`period` still recorded, dates gone).

## Decomposition (reference for /plan)

Although shipped as one spec, the work is a clean dependency chain and `/plan` may wave it into two phases:

- **Phase A — Billing (contracts + billing BC):** AC-1..6, AC-11..13. `INTERNAL` enum; drop expiry; `period` nullable; `GrantInternalSubscription` + `InternalSecretKeyMiddleware` + env; `getActiveSubscriptions` plural + `ActiveSubscriptionSchema` change + repo `findActiveByUserId`; `GetMySubscriptions`. During Phase A, tenancy's gate adapts minimally to the plural API (pick highest active tier; still user-level counting) so the build stays green.
- **Phase B — Tenancy (depends on A):** AC-7..10. `stores.subscription_id` + `Store.subscriptionId` + `Store.changeSubscription`; `PlanQuotaService.resolveSubscriptionForNewStore` (per-sub auto-pick); `StoreRepository.countStoresBySubscriptionId`; `ChangeStoreSubscription` + controller + `StoreSubscriptionChangedEvent`; `StoreSlotQueryService` port (billing) + tenancy impl wiring `GetMySubscriptions.used`.

## Risks & Migration

- **Two schema migrations.** (a) `billing.subscriptions` drops `current_period_start`/`current_period_end`. (b) `tenancy.stores` adds nullable `subscription_id`. No backfill (pre-release branch on `feat/bk-dash-polyglot`); existing dev stores keep `subscription_id = null` and would fail the access gate until re-seeded or reassigned — acceptable pre-release.
- **`getActiveSubscription` → plural is a breaking port change.** Every caller (tenancy `PlanQuotaService`, any test/mocks `MockSubscriptionQueryService`) must move to the list shape in the same change to keep `tsc` green.
- **`SubscriptionQuotaUpdatedEvent` wire payload** stays `{ userId, tier }` with a no-op tenancy consumer (no cache exists — see memory `no_speculative_cache_layer`). Not reshaped here even though quota is now per-subscription; revisit only if a cache lands.

## Open Questions

None outstanding — the four design forks (period fate, grant multiplicity, my-sub read shape, switch target) were resolved during brainstorm.
