# bk-dash Crucial-Gaps Closure — Roadmap Design Spec (Master)

**Date:** 2026-06-01
**Status:** Draft
**Bounded Context:** cross-context: analytics, finance, marketing, integration, tracking (go/sync), sales, catalog, billing, auth, notifications + Go sync infra
**Kind:** epic (roadmap — decomposes into 10 child specs)
**Story Points:** 21 — program epic spanning 9 bounded contexts + Go cron infra; **decomposed** into 10 child specs (W1–W10, ≈81 pts total). This master is the index/contract; each child gets its own `/plan`.

## Context

The polyglot port of the bk-dash e-commerce platform (`feat/bk-dash-polyglot`) reached strong structural completeness — all 11 bounded contexts scaffolded, Go sync pipelines for Shopify/NuvemShop/Meta/TikTok/Google production-ready, the DDD event architecture (outbox, mediator, domain + integration events) sound. A 99-agent capability gap analysis (`.plans/2026-05-22-bk-dash-known-gaps.md` predecessor; full report archived at job-tmp `GAP-ANALYSIS.md`) compared the live refactor against the real product (`bk-dash-backend/backend-old` legacy NestJS + `backend` Bun reference) and found the port is **~58% shippable**: the skeleton is right, but several core merchant-value capabilities are stubbed to `0`, never wired, or silently dropping data.

The gaps were adversarially verified against the live code and two were spot-checked by hand: `analytics/usecases/GetProfitMarginReport.ts:107-115` hardcodes every deduction bucket to `0`, and `integration/services/CredentialsExchanger/CredentialsExchangerFactory.ts:26` is literally `this.exchangers = {}`. The Finance BC repos that should feed the P&L (`finance/entities/{Taxes,FeesConfiguration,OperationalCost,WarrantyReserve,FxRate}.ts`) are Drizzle-backed but never joined by analytics; `finance/index.ts:5` has `internalHandlers = {}` with no `finance/handlers/` dir; `analytics/usecases/GetChart.ts:52` returns `{ series: [] }` for every non-REVENUE chart; `billing/controllers/` has no `ChangeExternalSubscription`; `auth/middlewares/RequireStoreMember.ts` checks membership but not subscription status.

This master spec frames the closure program and decomposes it into 10 independently-plannable workstreams. It exists because the combined scope (≈21+ pts across 9 BCs) exceeds the project's single-spec threshold; per the brainstorm/`/plan` discipline, a flat spec here would be unusable by `/plan`.

## Problem

The refactor cannot ship as a product in its current state. Three clusters each independently block merchant value, plus a tail of correctness bugs that silently corrupt the numbers merchants trust:

1. **The P&L engine returns zeros.** Profit, margin, ROAS, per-product performance, and 4 of 5 chart types are hardcoded `0`/empty — the platform's core differentiator is non-functional.
2. **Nothing refreshes on a schedule.** No cron infra in either backend; dashboards only update on manual trigger or first activation, and Meta/TikTok OAuth tokens will silently expire.
3. **Data silently corrupts.** Pixel funnels lose attribution (no clientId stitching/dedup), expired PIX/boleto orders never cancel (inflating pending revenue), `PRODUCT_VARIANTS` backfill fails on every activation, ad-spend never reaches the dashboard, and several read-models query columns that moved.

## Goal

Bring the port from ~58% to shippable by closing the verified crucial gaps and the highest-value correctness bugs: a real P&L (true cost/tax/fees/operational/warranty/FX/product-cost deductions), scheduled sync that keeps data fresh and tokens alive, correct pixel/order/payment data, working marketing ROI, and the missing admin/billing controls — **without** expanding platform coverage beyond Shopify + NuvemShop or building notification email transport.

## Decisions

1. **Decompose into 10 child specs (W1–W10).** Each is independently plannable and gets its own `.specs/2026-06-01-w<N>-<slug>-design.md` → `/plan` → `/build`. This master is the contract + dependency graph; it is not itself implemented.
2. **The recurring scheduler lives in Go** (`packages/api/go`), registered as an `fx.Lifecycle` hook, guarded by a Redis distributed lock for multi-instance safety. TS does not get a parallel `setInterval` scheduler; any TS-side periodic work (e.g. FX capture) is triggered by the Go cron calling the existing TS endpoint via the `Client` SDK singleton, or moved Go-side. (W2 owns this; W4/W8/W10 register jobs into it.)
3. **Analytics reads Finance/Catalog/Marketing data through new cross-BC `XQueryService` ports** (direct Drizzle reads), per the `feedback_query_service_naming_and_zod` convention — **not** by subscribing to integration events. W5's Finance integration events exist for *other* (Go/future) consumers and are kept architecturally separate from the analytics read path.
4. **`FeesConfiguration` typed child value objects** (`GatewayFee`, `CheckoutFee`, `ShippingFee`, replacing the current `z.unknown()` stubs) are a **prerequisite inside W1** — `feesAmountCents` cannot be computed from untyped blobs.
5. **Marketing token-expiry and Meta deauthorization are signalled by a new `StoreIntegrationStatus` enum** (`ACTIVE` / `TOKEN_EXPIRED` / `DISCONNECTED`), **not** by resurrecting the removed `valid` boolean. One status field drives both the renewal cron and the deauth webhook. (W4 owns the enum + migration.)
6. **FCM push delivery is IN scope** (W10): a real `FirebasePushDeliveryService` wired into `SendNotification` + `OrderUpdatedNotifyHandler` with the per-store `orderPushPerStore` opt-in. **Email transport stays a stub** (`ConsoleMailSender`) — explicitly out.
7. **Platform coverage stays Shopify + NuvemShop only.** No CartPanda/Yampi/Kiwify/etc. connectors, credential exchangers, or webhook mappers. The disputes/chargebacks pipeline is dropped (no payment gateways are being connected, so it is moot).
8. **Each child spec honors the project's layer-boundary rules at authoring time:** `z.instance(Id)` only on entity/VO schemas; events/use-cases/controllers/query-DTOs keep `z.uuid()`/`z.string()`; `z.enum(Enum)` for closed sets; controller `InputSchema` keys only `body`/`query`/`params`/`ctx`; shared VOs in `shared/objects`.

## User Stories

- **Story 1:** As a merchant, I want my dashboard to show real profit and margin (not revenue with zero costs), so that the platform is worth paying for.
  - Given a store with taxes, fees, operational costs, warranty reserves, and product costs configured, when I open the dashboard, then profit = revenue − all five deduction buckets (W1).
- **Story 2:** As a merchant, I want my data to refresh on its own and my Meta/TikTok connections to stay alive, so that I don't have to manually re-sync or reconnect.
  - Given an active integration, when an hour passes, then a scheduled job pulls fresh data without my action (W2); given a Meta token near expiry, when the weekly renewal job runs, then it is refreshed before it dies (W4).
- **Story 3:** As an operator/developer closing the port, I want each gap delivered as its own plannable spec with explicit dependencies, so that the 10 workstreams can be built in waves without serializing through one monster plan.
  - Given this master roadmap, when I run `/plan` on a child spec, then it has self-contained Context/Decisions/ACs and a stated dependency on its prerequisite workstreams.

## Acceptance Criteria

- [ ] AC-1: Eleven spec files exist — this master plus `w1`…`w10` — each with the six enforced sections and a Fibonacci `Story Points` line.
- [ ] AC-2: Every child spec's "Depends on" matches the dependency graph below, and Wave-0 specs declare no intra-program dependency.
- [ ] AC-3: The combined child-spec scope covers every IN-SCOPE item from the gap analysis and **excludes** every OUT-OF-SCOPE item listed in Decision 7 + the program scope-out table; no child spec re-introduces an excluded capability.
- [ ] AC-4: The five cross-cutting Decisions (cron-in-Go, analytics-via-QueryService, fees-VOs-in-W1, StoreIntegrationStatus enum, FCM-in/email-stub) appear as binding Decisions in the child specs they govern.

---

## Decomposition — the 10 workstreams

| # | Slug | BC(s) | Pts | Depends on |
|---|---|---|---:|---|
| **W1** | `analytics-pnl-engine` | analytics ← finance/catalog/marketing | 13 | W5, W9, W2 |
| **W2** | `go-recurring-sync-scheduler` | go/sync (infra) | 8 | — |
| **W3** | `product-variants-pipeline-fix` | go/sync, catalog | 3 | — |
| **W4** | `marketing-oauth-health-and-adaccounts` | marketing, integration, go/sync | 13 | W2 |
| **W5** | `finance-integration-event-handlers` | finance | 5 | — |
| **W6** | `billing-controller-and-subscription-enforcement` | billing, auth | 5 | — |
| **W7** | `pixel-tracking-correctness` | go/sync (tracking) | 8 | — |
| **W8** | `payment-status-invalidation-and-method-detection` | go/sync, finance | 8 | W2 |
| **W9** | `catalog-orders-readmodel-fixes` | catalog, sales | 8 | — |
| **W10** | `fcm-push-delivery` | notifications | 8 | W2 |

**Total ≈ 81 pts.**

### Build waves

- **Wave 0 (no intra-program deps — build in parallel):** W2, W3, W5, W6, W9.
- **Wave 1 (depend on Wave 0):** W1 (needs W5 events on the bus + W9's `FeesConfiguration` VO groundwork, W2's FX trigger), W4 (W2), W7, W8 (W2), W10 (W2).

### Per-workstream scope (one line each — full detail in child specs)

- **W1 — Analytics P&L engine.** Replace hardcoded-`0` deductions in `GetProfitMarginReport`/`GetDashboardOverview`/`GetProductPerformanceReport`; add a cross-BC `FinanceQueryService` (taxes/fees/operational/warranty over a date window) + `OperationalCost.findOverlapping`; typed `FeesConfiguration` child VOs; product-cost line attribution via `ProductCostSolver`; FX conversion (`FxRateService`); fix ad-spend (MANUAL `bucketStart`-NULL filter → `startDate`/`endDate` overlap, and query Go-owned `sync.ad_spends` for AUTOMATIC); implement the 4 missing `GetChart` chart types.
- **W2 — Go recurring-sync scheduler.** `fx.Lifecycle` cron manager + Redis distributed lock + job registry; hourly marketing-metrics + gateway-data triggers for active integrations (batched); a registration surface other workstreams hook into.
- **W3 — PRODUCT_VARIANTS pipeline fix.** Remove the phantom `PRODUCT_VARIANTS` step from `pipelineresolver.Resolve(SALES_CHANNEL)` (variants are handled inline by the PRODUCTS pipeline); make the NuvemShop webhook product mapper fan out variant events like Shopify's.
- **W4 — Marketing OAuth health + ad-accounts + campaign reads.** Weekly FB/TikTok token-renewal cron; `StoreIntegrationStatus` enum + migration; Meta deauthorization webhook (Go mapper + TS handler); `MarketingAdAccount` activate/deactivate use cases + `GetMarketingAccessList`; `ListMarketingCampaigns` over `sync.campaigns`; merged AUTOMATIC+MANUAL ROAS/CPA endpoint; `ReconcileMarketingAccounts` Redis debounce.
- **W5 — Finance integration-event handlers.** `finance/handlers/` with 10 `EventHandler` publishers bridging Finance domain events → `ExternalMediator` (pattern: `billing/handlers/`).
- **W6 — Billing controller + subscription enforcement.** `ChangeExternalSubscriptionController` (internal-secret gated); `SubscriptionQueryService.isActiveForStore` + `RequireActiveSubscription` middleware + `SUBSCRIPTION_EXPIRED` error; drop/tombstone the orphaned `billing.subscription_events` table.
- **W7 — Pixel tracking correctness.** clientId stitching (CHECKOUT_COMPLETED reuses prior session's clientId by cart/checkout token), retroactive funnel backfill (synthetic upstream events with `retroactive=true`), per-event-type Redis dedup TTLs, skip-if-no-pixels guard.
- **W8 — Payment-status invalidation + Shopify payment-method detection.** Scheduled bulk-cancel of expired pending PIX/boleto orders + revert-on-config-change; `bankSlipDays` field in `FeesConfiguration`; `PaymentStatus.CANCELED`; Shopify PIX/boleto/credit-card detection (replace hardcoded `CREDIT_CARD`).
- **W9 — Catalog/orders read-model fixes.** `GetProductsList` tags column (SPEC-10 moved tags to `product_overrides`); `GetOrderDetail` override fields; `GetOrdersList` filters + per-row P&L; ProductCost generic-item `min(1)` fix; `GetProductCostCsv` export; Product/Variant projection consumers for Go `product.updated`/`variant.updated` events.
- **W10 — FCM push delivery.** `FirebasePushDeliveryService` (firebase-admin) bound in real env; wire into `SendNotification` + `OrderUpdatedNotifyHandler` with `orderPushPerStore` opt-in; daily-digest fan-out (cron via W2). Email stays `ConsoleMailSender`.

## Scope — explicitly OUT (do not re-introduce in any child spec)

| Excluded | Reason |
|---|---|
| CartPanda / Yampi connectors, normalizers, webhook mappers | User-directed; Shopify + NuvemShop only for now |
| All non-Shopify/NuvemShop sales-channel & checkout credential exchangers (`CredentialsExchangerFactory` stays `{}`) | User-directed |
| Real email transport / `ResendMailSender` | User-directed; keep `ConsoleMailSender` stub |
| Store-member invitation email + `BkDashOnStoreMemberInvited` handler | Depends on email transport (stubbed) |
| BK Messenger SSE proxy (`externalServices` module) | User-directed |
| `notifiers` outbound-webhook module | User-directed (dead code in source) |
| Revenue-milestone push (`RevenueMilestoneService`) | User-directed |
| Kanban board / Tasks module | User-directed; not in any port plan |
| Disputes / chargebacks sync pipeline (`SyncPipelineDisputes`) | Moot — no payment gateways being connected |
| Hotmart billing webhook | Out of scope; no `BillingPlatform.HOTMART` |

## Open Questions

1. **W1 sequencing:** the full P&L (5 deduction buckets + FX + product-cost attribution + 4 charts) is itself 13 pts. If `/plan` finds it crosses two PRs, split W1 into W1a (cost/tax/fees/operational/warranty + profit/margin) and W1b (FX multi-currency + chart types). Decide at `/plan` time, not here.
2. **W8 dependency on W3:** payment-status invalidation needs orders flowing correctly; if W3's variant fix and order ingest aren't both green, W8's sweep operates on incomplete data. Confirm W3 lands before W8's integration test.

---

_Next step per child spec: `/plan .specs/2026-06-01-w<N>-<slug>-design.md` (Wave 0 first). Build order: W2, W3, W5, W6, W9 → then W1, W4, W7, W8, W10._
