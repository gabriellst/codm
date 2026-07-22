# Plan — Read/BFF Layer Rebuild + Auth-Context Reshape

**Date:** 2026-06-03 · **Branch:** `feat/bk-dash-polyglot` · Status: **READ LAYER CLEARED (removal executed); rebuild still PLAN-ONLY.**

Captures the architecture decided after building + refactoring the mocked BFF controllers (commits `418e6944`, `915696c1`, `b637d550`). The read layer was structurally wrong; rather than rebuild in place, we **removed it wholesale** to rebuild from scratch later, screen-spec-driven, on the reshaped auth context.

> **EXECUTED (this session):** all 51 read controllers + usecases removed across every context — the 43 BFF/screen reads + 8 account/tenancy/billing reads (`GetProfileSettings`, `GetUserPreferencesSettings`, `MyStores`, `StoreMembers`, `StoreSettings`, `StorePreferencesSettings`, `GetMySubscriptions`, `ListSubscriptionEventHistory`). Colocated read tests deleted; shared command tests surgically trimmed (kept all command coverage). The `ui` context was deleted entirely. **KEPT reads (5):** `GetFxRates`, `GetPlatformDescriptors`, `IntegrationOAuthCallback`, `GetPixelScriptSnippet`, `GetSession`. All commands kept. tsc clean repo-wide, 1069 api tests pass, SDK regenerated, app compiles. **The §1 ctx/middleware reshape and §3+ rebuild below remain PLAN-ONLY** — scheduled as future waves.

---

## 1. Linchpin — reshaped auth context (CONFIRMED)

Every rebuilt read/command controller depends on this. Do it **first**, as its own wave, updating all controllers that read `ctx.membership`.

**Middleware move:** `RequireStoreMember` → `src/tenancy/middlewares/RequireStoreMember.ts` (it belongs to tenancy; it already depends on `StoreMembershipRepository`). Update all imports (`@auth/middlewares` → `@tenancy/middlewares`).

**New ctx after `AuthAccountMiddleware` + `RequireStoreMember`:**
```ts
ctx.user       = { id, email, name, emailVerified }              // AuthAccountMiddleware (unchanged)
ctx.session    = { id, userId, expiresAt, storeId }             // storeId = ACTIVE store (nullable)
ctx.membership = { id, userId, role, storeIds: string[] }       // RequireStoreMember (reshaped)
//   - id / role  → the ACTIVE store's membership (matches session.storeId)
//   - storeIds   → ALL stores the user is a member of (repo.findByUserId → map storeId)
//   - storeId is STRIPPED from membership; the active store lives only at ctx.session.storeId
```
`RequireStoreMember` impl: load `session.storeId` + `user.id`; `findByUserId(userId)` → `storeIds`; the membership whose `storeId === session.storeId` provides `id` + `role` (throw `STORE_MEMBERSHIP_NOT_FOUND` if no active store or not a member). Update `RequireStoreMember.test.ts`.

**Convention — controllers stop accepting store/scope ids as query params (item 5).** Remove `storeIds`, `storeIntegrationIds`, `productIds` from every read controller's `query`. Single-store reads index by `ctx.session.storeId`; multi-store reads by `ctx.membership.storeIds`. (`productId` filtering, if a specific screen needs it, returns as an explicit per-screen param later — never a global ctx field.)

## 2. Read-controller conventions (the "right" shape)
Carry forward the conventions already established (ctx + auth middlewares, `z.enum(WireEnum)` everywhere — no `z.string()` for enumerables, no `z.nativeEnum`, no inline literal enums; `paginatedQuery`/`paginatedResponse`; `z.stringToDate`↔`z.date`; `ids: z.array(z.uuid())`; `SortOrder`). **Plus** the new rules:
- **No scope-id query params** (§1).
- **Store-tenancy mode (items 3):** dashboard + chart take a wire enum `StoreScope { SINGLE_STORE, MULTI_STORE }` (NEW contract enum).
  - `SINGLE_STORE` → data for `ctx.session.storeId` only.
  - `MULTI_STORE` → accumulated across `ctx.membership.storeIds` **plus** a per-store breakdown; the "current" store is `session.storeId`, the full set is `membership.storeIds`.
- **Discriminated chart output by chart type (item 4):** `GetChart`'s return is a discriminated union on the chart type; each variant's buckets are keyed by that type's domain — `SALES_PER_WEEKDAY` → `DayOfWeek` buckets, `SALES_PER_HOUR` → hour buckets, `SALES_PER_REGION` → `Country` buckets, `REVENUE`/time-series → date buckets. Not a single flat `{label, points}` shape.

## 3. Analytics cluster — rebuild from spec (items 3, 4, 6, 7)
These are the structurally-wrong ones. Rebuild against `.specs/frontend-screens/SPEC.md` (dashboard) — its Controller Contract is the source of truth.

| Current (wrong) | Action |
|---|---|
| `GetDashboardOverviewController` (`/analytics/dashboard-overview`) | **Rebuild + rename** → `GetDashboard` (drop "Overview"). Input: `StoreScope` + date range + `ctx`; NO storeIds/storeIntegrationIds/productIds/frequency/forcePaidOrders. `SINGLE_STORE` returns the session store's KPIs; `MULTI_STORE` returns consolidated + `perStore` breakdown (keyed by `membership.storeIds`). Shape from the dashboard spec (KpisSchema / ConsolidatedKpisSchema family). |
| `GetChartController` (`/analytics/chart`) | **Rebuild.** Drop `storeIds`/`storeIntegrationIds`/`frequency`/`forcePaidOrders` inputs. Keep `chartType` (`ChartType` enum) + date range + `StoreScope` + `ctx`. Output = discriminated union per §2 (type-appropriate buckets). |
| `GetProductPerformanceReportController` | **Rebuild** to spec + conventions (wrong inputs/shape). |
| `GetProfitMarginReportController` | **Review + rebuild** to spec + conventions. |
| `GetProductRankingController`, `GetCurrentGoalController`, `GetGoalsController` | Re-derive from spec; conform to §1/§2 (no scope-id params; ctx-driven). |

`ChartType`/`AnalyticsFrequency` are analytics-local enums today — decide during build whether `AnalyticsFrequency` survives (item 6 calls `frequency` unnecessary on the controller; it may still bucket internally).

## 4. Other read controllers — disposition
Keep for now; conform to §1 (ctx reshape, drop scope-id params) when their screen wave runs. Full screen-driven rebuild is scheduled per `.specs/frontend-screens` screen, reusing the existing real controllers where they already fit.
- **catalog:** GetProductsList, GetProductDetail, GetProductCostsList, GetProductTagsList, GetProductCostHistory, GetVariantCostHistory, ListCostCountries, ListKits, ListProductVariantCosts, ListProductsForKit
- **sales:** GetOrdersList, GetOrderDetail, GetAbandonedCartsList
- **finance:** GetFeesConfigurationSettings, GetTaxesSettings, GetWarrantyReserves, GetOperationalCostsList, GetOperationalCost, GetActiveWarranty, GetFxRates
- **integration:** GetIntegrationsList, GetIntegrationDetail
- **marketing:** GetAdSpendBreakdown, GetCampaignProductBindings, GetCampaignsTree, GetTrafficSources, ListMarketingProfiles
- **notifications:** GetNotificationsInbox, ListNotifications · **tenancy:** GetStoreInfo · **identity:** GetMyAccount, GetUserInfo · **tracking:** GetPixelFunnel · **ui:** ListRecommendedApps, GetBanners, GetAppDownload

### KEEP untouched (pure infra / non-BFF — not part of the rebuild)
`IntegrationOAuthCallback`, `GetPlatformDescriptors`, `GetPixelScriptSnippet`, `GetFxRates`.

### REMOVE (item: "keep all aside from GetOperationalCostOccurrences")
- **`GetOperationalCostOccurrences`** (controller + usecase + finance barrels). **Dependencies to handle together:** the occurrence-materialization test block in `src/finance/usecases/OperationalCost.test.ts` (L186–222) exercises it through the entity's runtime derivation — either re-point that coverage at the entity method directly or drop it; and decide the fate of the paired write `SetOperationalCostStatusOverride` (overriding an occurrence's status is meaningless if occurrences can't be listed). Resolve the occurrence feature as a unit, not a lone delete.

## 5. New contract (wire) enum
- `StoreScope { SINGLE_STORE, MULTI_STORE }` — drives dashboard + chart tenancy mode (item 3).

## 6. Execution waves (when scheduled)
1. **Wave 0 — ctx/middleware reshape** (§1): move `RequireStoreMember` to tenancy, reshape `ctx.membership`, add `StoreScope` enum, drop scope-id params + update EVERY controller (reads AND writes) reading `ctx.membership.storeId` → `ctx.session.storeId`. `tsc` + tests green. (Foundational; everything depends on it.)
2. **Wave 1 — analytics rebuild** (§3): GetDashboard, GetChart (discriminated), reports, goals — from the dashboard spec.
3. **Wave 2 — occurrence-feature removal** (§4): GetOperationalCostOccurrences + its test/command dependencies.
4. **Wave 3+ — per-screen read conformance** (§4): each screen's reads conformed to §1/§2, spec-driven.
5. **Each wave:** `bun sdk` regen → repo `tsc` + `bun test` + `bun lint` → commit.

## 7. Learnings carried in (from this session)
- Source enums from `packages/contracts` (wire), reuse before creating; codegen derives the TS member name from the **value**, so values must be identifier-safe (no leading digits → `DAYS_30`, not `30`).
- `bun lint` is nx-affected: touching a context surfaces that project's pre-existing lint debt — budget for it.
- Distributing spec-named controllers into existing contexts causes class-name collisions; prefer rebuilding into the right shape over `Bff`-suffix duplication.
- Partition parallel agents by **bounded context** (the `controllers/index.ts` barrel is the only per-context shared file) — zero cross-agent conflicts.
- Real controllers already embody the target conventions (`ctx`, paginated, discriminated chart, typed batch override) — mirror them, don't re-derive.

## Open items to resolve before Wave 1
1. Dashboard `MULTI_STORE` exact output shape (consolidated + perStore) — confirm against the dashboard spec's Controller Contract.
2. Fate of `SetOperationalCostStatusOverride` + the occurrence feature (Wave 2).
3. Whether `AnalyticsFrequency` survives as an internal bucketing input on `GetChart`.
