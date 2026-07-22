# ChangeExternalSubscription Controller + Active-Subscription Enforcement — Design Spec (W6)

**Date:** 2026-06-01
**Status:** Draft
**Bounded Context:** cross-context: billing, auth (tenancy read path)
**Kind:** feature
**Story Points:** 5 — three artifacts (new controller, new middleware, migration/tombstone) + cross-context query-service method addition; fits within 5-pt tier without a new projection
**Part of:** .specs/2026-06-01-bk-dash-crucial-gaps-closure-roadmap-design.md (master roadmap)
**Depends on:** none (Wave 0)

---

## Context

The billing bounded context at `/packages/api/typescript/src/billing/` has a complete, tested use case for admin-driven plan swaps — `ChangeExternalSubscription` at `/packages/api/typescript/src/billing/usecases/ChangeExternalSubscription.ts` — but no HTTP surface for it. The billing controllers barrel at `/packages/api/typescript/src/billing/controllers/index.ts` exports exactly four controllers: `HandleBillingWebhook`, `GetMySubscriptions`, `ListSubscriptionEventHistory`, and `GrantInternalSubscription`. `ChangeExternalSubscription` is absent. The precedent for admin-only billing operations is `GrantInternalSubscriptionController` at `/packages/api/typescript/src/billing/controllers/GrantInternalSubscription.ts`, which gates its `POST /billing/internal/subscriptions` path with `InternalSecretKeyMiddleware` (the `x-internal-secret` header, `BILLING_INTERNAL_SECRET` env var) and drops `AuthAccountMiddleware` via `skipMiddlewares`. That is the pattern W6 follows.

Access control at the store level lives in `/packages/api/typescript/src/auth/middlewares/RequireStoreMember.ts`: it parses `ctx.session.storeId`, calls `StoreMembershipRepository.findByStoreAndUser`, and stamps `request.ctx.membership`. It performs no subscription or billing check. A lapsed subscription (where `billing.subscriptions.is_active = false`) grants full API access, which means a merchant who has cancelled or whose payment failed continues to use the platform until an admin manually deactivates their store — there is no automated gate.

The `billing.subscription_events` table is defined in `/packages/contracts/db/schema/billing.ts` (four indexes: `platformExternalEventIdUnq`, `subscriptionIdx`, `platformExternalSubscriptionIdx`, `occurredAtIdx`) and was the intended append-only audit log for inbound webhooks. However `/packages/api/typescript/src/billing/usecases/ListSubscriptionEventHistory.ts` documents that the table was removed from use in "iter 100" in favor of the framework's `shared.events` table. Nothing in the codebase reads or writes `billing.subscription_events` today — it is a dead table consuming schema weight and migration history.

---

## Problem

1. **Admins cannot swap plans without DB access.** `ChangeExternalSubscription` is implemented and tested but has no HTTP controller; there is no way to call it without direct database manipulation.

2. **Lapsed stores have unchecked API access.** `RequireStoreMember` verifies store membership but not subscription status. A store whose subscription is inactive (`is_active = false`) passes the middleware, meaning cancelled/overdue merchants retain full API access.

3. **`BILLING_PERIOD_MISMATCH` is registered but never thrown.** The error code exists in `/packages/api/typescript/src/billing/errors/index.ts` as a `BillingDomainErrors` type with a 409 HTTP status, but the cross-user external-id collision check was dropped before shipping (audit notes at `.claude/audit/_chunks/chunk-011.md` confirm a "speculative try/catch rewrapping to BILLING_PERIOD_MISMATCH" was removed). The controller is the correct place to wire this guard.

4. **`billing.subscription_events` is an orphaned dead table.** It occupies schema weight and misleads future maintainers about the audit architecture.

---

## Goal

After this workstream: (a) operators can swap a user's subscription identity via a secured HTTP endpoint without DB access; (b) stores with an inactive subscription receive a 403 on store-scoped endpoints via a composable `RequireActiveSubscription` middleware; (c) the cross-user external-id collision in the plan-swap path raises `BILLING_PERIOD_MISMATCH`; (d) the orphaned `billing.subscription_events` table is tombstoned with a migration that drops it and a `@deprecated` annotation on the schema definition.

---

## Decisions

1. **`ChangeExternalSubscriptionController` follows the `GrantInternalSubscription` pattern exactly.** Path: `PATCH /billing/internal/subscriptions/:subscriptionId`. Skips `AuthAccountMiddleware`. Uses `InternalSecretKeyMiddleware`. Input schema: `params: { subscriptionId: z.uuid() }`, `body: { newExternalSubscriptionId: z.string().min(1), platform: z.enum(BillingPlatform), tier: z.enum(PlanTier), period: z.enum(PlanPeriod) }`. Returns 200 with `{ subscriptionId: z.uuid() }`. Exported from `/packages/api/typescript/src/billing/controllers/index.ts`. (Traces to brief scope item 1 and the `GrantInternalSubscription` codebase pattern.)

2. **`BILLING_PERIOD_MISMATCH` is wired as a cross-user external-id collision guard inside the controller, before delegating to the use case.** The controller resolves the current subscription by `subscriptionId` (to know its `userId`), then calls `SubscriptionRepository.findByPlatformAndExternalId(platform, newExternalSubscriptionId)`: if the result exists and its `userId` differs from the target subscription's `userId`, it throws `BaseError<BillingDomainErrors>('BILLING_PERIOD_MISMATCH')`. The use case's comment at line 38-40 explicitly documents this guard as deferred; the controller has access to the repository and the `platform` param the use case doesn't receive. (Traces to brief scope item 1 + audit plan at `.plans/2026-05-21-bk-dash-port-P3-BILLING.md:818`.)

3. **`SubscriptionQueryService` gains `isActiveForStore(storeId: string): Promise<{ isActive: boolean; subscriptionId: string | null }>`.** The method is declared on the existing abstract port at `/packages/api/typescript/src/tenancy/services/SubscriptionQueryService.ts`. Return shape is typed via a Zod schema `StoreSubscriptionStatusSchema = z.object({ isActive: z.boolean(), subscriptionId: z.string().nullable() })` in the same file. `BillingSubscriptionQueryService` at `/packages/api/typescript/src/billing/services/BillingSubscriptionQueryService.ts` provides the real implementation (direct Drizzle join on `tenancy.stores → billing.subscriptions` via `store.subscription_id`). `MockSubscriptionQueryService` at `/packages/api/typescript/src/tenancy/services/MockSubscriptionQueryService.ts` returns `{ isActive: true, subscriptionId: null }`. (Traces to brief scope item 2 + `feedback_query_service_naming_and_zod` convention.)

4. **`RequireActiveSubscription` is a new `@singleton()` middleware in `/packages/api/typescript/src/auth/middlewares/RequireActiveSubscription.ts`.** It reads `request.ctx.membership.storeId` (stamped by `RequireStoreMember`), calls `SubscriptionQueryService.isActiveForStore(storeId)`, and throws `BaseError<BillingInterfaceErrors>('SUBSCRIPTION_EXPIRED')` (HTTP 403) when `isActive` is false. It does not replace `RequireStoreMember`; controllers compose them in order: `AuthAccountMiddleware` → `RequireStoreMember` → `RequireActiveSubscription`. Exported from `/packages/api/typescript/src/auth/middlewares/index.ts`. (Traces to brief scope item 2.)

5. **`SUBSCRIPTION_EXPIRED` is added to billing's interface errors.** Added to `BillingInterfaceErrors` type union in `/packages/api/typescript/src/billing/errors/index.ts` and registered via `registerErrorCodes({ SUBSCRIPTION_EXPIRED: HttpStatusCode.FORBIDDEN })`. `RequireActiveSubscription` imports the type from `billing/errors`; the error code string `'SUBSCRIPTION_EXPIRED'` is the cross-context bridge — no import of the billing error module from auth middleware is required beyond the string literal used as the `BaseError` generic. (Traces to brief scope item 2 + project error-layer conventions.)

6. **`billing.subscription_events` is tombstoned via a Drizzle migration that drops the table.** The migration SQL drops `billing.subscription_events` with a comment documenting the iter-100 removal reason. The `subscriptionEvents` export in `/packages/contracts/db/schema/billing.ts` is annotated `/** @deprecated tombstoned — dropped in migration; use shared.events for billing audit. */` and its barrel re-export removed from `/packages/contracts/db/schema/index.ts` (or commented out). (Traces to brief scope item 3.)

7. **Layer-boundary rules applied throughout.** Controller `InputSchema` top-level keys are `params` and `body` only. No `z.instance(Id)` in any controller schema, event, or query DTO — all ids are `z.uuid()` or `z.string()`. `z.enum(BillingPlatform)`, `z.enum(PlanTier)`, `z.enum(PlanPeriod)` used for all closed sets. `SubscriptionQueryService.isActiveForStore` return type uses `z.string().nullable()`, not `z.instance(Id)`. (Traces to master spec Decision 8 + project-wide layer-boundary rules in CLAUDE.md.)

---

## User Stories

**Story 1 — Admin plan swap via HTTP**

Given an operator with the `BILLING_INTERNAL_SECRET` key, when they send `PATCH /billing/internal/subscriptions/:subscriptionId` with valid `newExternalSubscriptionId`, `platform`, `tier`, and `period` in the body, then the subscription's external identity is updated, `SubscriptionQuotaUpdatedEvent` is published when the tier changes, and the response returns 200 with `{ subscriptionId }`. Covered by AC-1, AC-2.

**Story 2 — Cross-user collision blocked**

Given an operator sending a plan-swap request where `newExternalSubscriptionId` on the given `platform` already belongs to a different user's subscription, when the controller runs the collision check, then the request fails with `BILLING_PERIOD_MISMATCH` (409) before the use case is called. Covered by AC-3.

**Story 3 — Lapsed subscription blocked**

Given a store whose subscription has `is_active = false` (cancelled or overdue), when a store member calls any store-scoped endpoint that composes `RequireActiveSubscription`, then the response is 403 with `SUBSCRIPTION_EXPIRED`. Covered by AC-4, AC-5.

**Story 4 — Active subscription passes through**

Given a store whose subscription is active, when a store member calls the same endpoint, then `RequireActiveSubscription` is a no-op and the request proceeds normally. Covered by AC-5.

---

## Acceptance Criteria

1. `PATCH /billing/internal/subscriptions/:subscriptionId` exists, is guarded exclusively by `InternalSecretKeyMiddleware` (no session), delegates to `ChangeExternalSubscription`, and is exported from `/packages/api/typescript/src/billing/controllers/index.ts`.

2. A request without or with an incorrect `x-internal-secret` header returns `INVALID_SECRET_KEY` (401). A request with a missing required body field returns `VALIDATION_ERROR` (422).

3. A controller-level unit test (direct instantiation, no DI) verifies: when `SubscriptionRepository.findByPlatformAndExternalId` returns a subscription owned by a different `userId`, the controller throws `BILLING_PERIOD_MISMATCH` (409) before the use case executes.

4. `SUBSCRIPTION_EXPIRED` is registered in `/packages/api/typescript/src/billing/errors/index.ts` at HTTP 403 (`FORBIDDEN`). `RequireActiveSubscription` exists at `/packages/api/typescript/src/auth/middlewares/RequireActiveSubscription.ts` and is exported from the auth middlewares barrel.

5. `RequireActiveSubscription` middleware unit tests cover: (a) no-op (passes through) when `isActiveForStore` returns `{ isActive: true }`; (b) throws `SUBSCRIPTION_EXPIRED` when `isActiveForStore` returns `{ isActive: false }`; (c) throws when `ctx.membership` is missing (guards against calling without `RequireStoreMember`).

6. `SubscriptionQueryService.isActiveForStore(storeId)` is declared in `/packages/api/typescript/src/tenancy/services/SubscriptionQueryService.ts`; `BillingSubscriptionQueryService` implements it with a real Drizzle query; `MockSubscriptionQueryService` returns `{ isActive: true, subscriptionId: null }` so all existing tenancy tests pass without change.

7. A Drizzle migration drops `billing.subscription_events`. The `subscriptionEvents` export in `/packages/contracts/db/schema/billing.ts` is annotated `@deprecated` and removed from the schema barrel so no code can accidentally import it as an active table.

---

## Open Questions

1. **Which existing store-scoped controllers adopt `RequireActiveSubscription` first?** The middleware is specified as composable but the spec does not mandate which existing controllers wire it in — this is a `/build` decision. The obvious starting set is all tenancy write-path controllers (`CreateStore` excluded — a store is created during onboarding before a subscription is associated). The builder should confirm and cover in the plan.

2. **`isActiveForStore` when `store.subscriptionId` is null.** Stores created pre-release have `subscriptionId = null` (documented in `Store.ts:24`). The safe default is `{ isActive: false, subscriptionId: null }` — a store without a subscription is blocked. If this would break in-progress onboarding flows (e.g., a user creating their first store before completing the billing step), the builder should confirm and add a dedicated test case.

---

## Out of Scope

- Applying `RequireActiveSubscription` to read-only (GET) endpoints — the brief specifies enforcement on store-scoped endpoints; the exact set is a `/build` concern.
- Automated subscription reactivation on payment success (flows through the existing `HandleBillingWebhook` → `ExternalSubscriptionUpdatedHandler` path, already implemented).
- Any CartPanda, Yampi, Hotmart, or non-Kiwify billing platform webhook or controller.
- Email notifications for subscription expiry.
- Store-member invitation email or any notification transport.
