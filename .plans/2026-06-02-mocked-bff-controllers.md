# Plan — Mocked BFF Controllers for `.specs/frontend-screens`

**Date:** 2026-06-02
**Branch:** `feat/bk-dash-polyglot`
**Goal:** Stand up every endpoint the 14 frontend-screen specs need as **mocked full-vertical slices** (Controller + Schema + faker-backed query/command usecase), so `bun sdk` emits the real typed hooks and the frontend can build every screen now. Only the usecase *body* gets swapped when the real query lands.

## Decisions (locked with user 2026-06-02)

1. **Mock depth — Full slice + faker.** Real `Controller` + Zod `OutputSchema` + a `Handler`-based usecase that returns deterministic faker/fixture data conforming to `OutputSchema`. Commands return static success payloads. No DB, no repos.
2. **Placement — Distribute into existing contexts.** Each mocked controller is a new file under the matching existing bounded context (`analytics`, `sales`, `catalog`, `finance`, `marketing`, `integration`, `identity`, `notifications`, `tracking`). No new `ui`/`bkdash` context.
3. **Scope — Queries + commands, all 14 screens.** ~33 queries + ~42 commands.
4. **Naming — Build fresh under spec names.** Create controllers exactly as the specs name them (`ListOrders`, `GetSingleStoreDashboard`, `CreateGoal`, …) even where a same-purpose controller already exists (`GetOrdersList`, analytics `CreateGoal`, …). Duplicates are accepted and reconciled in a later pass.
5. **Paths — `/<context>/<endpoint>`.** Drop the spec's `/ui/bkdash/*` prefix. Each controller's `path` = `/<owning-context>/<kebab-resource>` (e.g. `ListOrders` in sales → `/sales/orders`; `GetSingleStoreDashboard` → `/analytics/single-store-dashboard`; `ListRecommendedApps` → `/ui/recommended-apps`). Use the context prefix to avoid colliding with the existing un-prefixed paths (`/orders`, `/goals`, …).
6. **Orphans → new `ui` context.** Controllers with no natural domain home (`ListRecommendedApps`, `GetBanners`, `GetAppDownload` — curated showcase / sponsored promo / app QR) go in a **new `ui` bounded context**. `GetStoreInfo` → `tenancy` (stores), `GetUserInfo` → `identity`, `ListNotifications` → `notifications` (these have natural homes).
7. **Multipart commands** mocked as accept-and-echo (fake `pictureUrl`, `{ imported: n }`, tiny static CSV).
8. **Faker** — add `@faker-js/faker` (dev/runtime dep on the api package); use a fixed seed for deterministic output.

## Established pattern (verified in `analytics`)

- `src/<ctx>/controllers/<Name>Controller.ts` — `class extends Controller<In, Out>` with `path`/`method`/`description`/`inputSchema`/`outputSchema`, injects its usecase, returns `{ status, data }`. Controller `inputSchema` keys are only `body`/`query`/`params`/`ctx`.
- `src/<ctx>/usecases/<Name>.ts` — `class extends Handler<In, Out>`, `readonly name`, `inputSchema`, `outputSchema`, `protected async handle()`. For mocks: build and return the fixture; **ignore inputs** except where they shape the fixture (e.g. echo back ids, page size).
- `src/<ctx>/controllers/index.ts` and `usecases/index.ts` — barrel re-exports. **← per-context shared file; the only concurrency collision point.**
- `src/<ctx>/index.ts` — `BoundedContext.create({ controllers, … })` auto-registers everything exported from the controllers barrel. No registry edit needed for repo-less mocks.
- Schema atoms: reuse `@template/contracts-typescript/wire/enums` (CurrencyCode, PaymentStatus, MarketingPlatform, PaymentMethod, …) and `@shared/objects` / `@shared/schemas` (`SignedMonetaryAmountSchema`, `MonetaryByCurrencySchema`).

---

## Phase 0 — Contract Lock + Shared (SERIAL, single agent, ~blocks everything)

Nothing in Phase 1 can start until this is frozen. One agent, committed before fan-out.

### 0a. Shared UI schema vocabulary (`_schema-fundamentals.md` → real Zod)
Translate `.specs/frontend-screens/_schema-fundamentals.md` into shared modules:

- **New enums** (the rest already exist in contracts — reuse, do **not** redefine): `CostKind`, `OperationalCostFlow`, `CostFrequency`, `AdAttribution`, `GatewayFeeKind`, `DayPeriod`, `DayOfWeek` (if absent), `TimeFrequency` (if absent), `ChargebackStatus`, `GoalType` (if absent). Place in `src/shared/enums/` (mirror existing enum style) — confirm each against contracts first to avoid duplicates.
- **New schemas** in `src/shared/schemas/ui/` (new folder): `MetricSchema`, `CurrencyMetricSchema`, `CurrencyAmount`, `segmented()` helper + `CostBreakdownSchema`/`AdsByPlatformSchema`/`AdsByTypeSchema`/`GatewayFeeSchema`/`ChargebackByStatusSchema`, `FeesBreakdownSchema`, `AdsBreakdownSchema`, `ChargebackBreakdownSchema`, `TaxesBreakdownSchema`, `ProductCostBreakdownSchema`, `KpisSchema`, `PerStoreKpisSchema`, `ConsolidatedKpisSchema`, `OperationalCostItemSchema`/`OperationalCostsSchema`, `ProfileAlertSchema` (+ members), `IncomeGraphBucketSchema`/`IncomeGraphSchema` + `SalesBy*` records, `RecommendedAppSchema`/`ListRecommendedAppsOutputSchema`.
- Reuse `MonetaryAmountSchema` ≈ existing `SignedMonetaryAmountSchema`/`MonetaryByCurrency`; align rather than duplicate.
- Barrel-export from `src/shared/schemas/index.ts` and `src/shared/enums/index.ts`.
- **Freeze.** These are immutable once Phase 1 starts (treat like Contract Lock in CLAUDE.md's porting workflow).

### 0b. Faker mock helper
- Add `@faker-js/faker` to `packages/api/typescript/package.json`.
- `src/shared/testing/mock.ts` — thin wrappers over faker with a **fixed seed** (`faker.seed(1)`) for deterministic output (stable SDK/frontend snapshots): `mockMoney`, `mockMetric`, `mockSeries(n, fn)`, `mockId`, etc.

### 0c. New `ui` bounded context (for orphan controllers)
Create `src/ui/` with the standard layout (`controllers/`, `usecases/`, `index.ts` via `BoundedContext.create`, `controllers/index.ts` + `usecases/index.ts` barrels, minimal `registry.ts` if required). Register its router in `src/index.ts`. Use the `bounded-context` skill. Holds:
- `ListRecommendedApps` — `GET /ui/recommended-apps` (consumed by ~6 screens)
- `GetBanners` — `GET /ui/banners` (sponsored promo)
- `GetAppDownload` — `GET /ui/app-download` (app QR / store badges)

### 0d. Cross-screen shared controllers in natural contexts (build once, before fan-out)
- `GetUserInfo` → **identity** — `GET /identity/user-info`
- `ListNotifications` → **notifications** — `GET /notifications/user-notifications`

> Phase 0 ends with: shared schemas/enums committed, faker + mock-helper, the `ui` context created with its 3 controllers, and `GetUserInfo`/`ListNotifications` wired. `bun tsc` green on touched files. **Freeze shared schemas.**

---

## Phase 1 — Per-context mock slices (PARALLEL, one agent per context)

**One agent owns one bounded context end-to-end** (its controllers + usecases + both barrels). This guarantees no two agents edit the same `controllers/index.ts`. Each agent: writes files → updates its two barrels → `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` over its slice. **No agent runs `bun sdk`** (Phase 2, single writer).

### Agent A — `analytics` (Dashboard cluster) — largest
Queries: `GetSingleStoreDashboard`, `GetMultiStoreDashboard`, `GetCurrentGoal`, `GetFunnel`, `GetIncomeGraph`, `GetSalesByDayOfWeek`, `GetSalesByHour`, `GetSalesByDayPeriod`, `GetSalesByRegion`, `GetProductRanking`, `GetActiveWarranty`.
Commands: `CreateGoal`, `UpdateGoal`, `DeleteGoal`, `UpsertWarranty`.
Paths `/analytics/<kebab>`. Spec: `.specs/frontend-screens/SPEC.md`.
(`GetStoreInfo` → tenancy/Agent I; `GetBanners`/`GetAppDownload` → ui/Phase 0c.)

### Agent B — `sales` (Orders)
Query: `ListOrders` (output uses `PaymentStatus`, per-order revenue/costs/fees/taxes/profit).
Commands: `PatchOrderStatus`, `PatchOrderPaymentMethod`, `PatchOrderRevenue`, `PatchOrderShipping`, `PatchOrderFees`, `PatchOrderTaxes`, `PatchOrderProductCost`, `BatchUpdateOrders`. Spec: `orders/SPEC.md`.

### Agent C — `catalog` (Products + Product Costs + Kits) — largest
Products: `ListProducts`, `ListProductFilters`, `ListProductAdProfiles`, `ListProductAdCampaigns`, `GetProductCostHistory`; cmds `AddProductCost`, `AddMarketingCost`.
Product costs (list): `ListProductCosts`, `ListCostCountries`; cmds `CreateProductCost`, `DeleteProductCost`, `ImportProductCostCsv`, `ExportProductCostCsv`.
Product costs ($productId): `ListProductVariantCosts`, `GetVariantCostHistory`; cmds `UpdateProductCost`, `ImportProductCostShopify`.
Kits: `ListKits`, `ListProductsForKit`; cmds `CreateKit`, `UpdateKit`, `DeleteKits`.
Specs: `products/SPEC.md`, `products/costs/SPEC.md`, `products/costs/$productId/SPEC.md`, `products/kits/SPEC.md`.

### Agent D — `finance` (Operational costs + Taxes & Fees)
Queries: `ListOperationalCosts`, `GetOperationalCost`, `GetTaxFeeConfig`.
Commands: `CreateOperationalCost`, `UpdateOperationalCost`, `DeleteOperationalCost`, `UpdateCheckoutFees`, `UpdateGatewayFees`, `UpdateShippingFees`, `UpdateTaxes`.
Specs: `finance/costs/SPEC.md`, `settings/taxesAndFees/SPEC.md`.

### Agent E — `marketing` (Traffic + Platform profiles)
Queries: `GetTrafficSources`, `ListMarketingProfiles`.
Command: `CreateManualAd`.
Specs: `marketing/traffic/SPEC.md`, `marketing/accounts/$platform/SPEC.md`.

### Agent F — `integration` (Integrations + ad-profile mgmt)
Query: `ListIntegrations`.
Commands: `ConnectIntegration`, `ReintegrateIntegration`, `DisconnectIntegration`, `RenameAdProfile`, `SetAllAdAccountsStatus`, `ToggleAdAccount`.
Specs: `settings/integrations/SPEC.md`, `marketing/accounts/$platform/SPEC.md` (integration cmds).

### Agent G — `identity` (Account) — `GetUserInfo` already wired in Phase 0d
Query: `GetMyAccount`.
Commands: `UpdateProfile`, `UpdatePreferences`, `UploadAvatar`, `ChangePassword`, `DeleteAccount`.
Spec: `settings/account/SPEC.md`.

### Agent H — `tracking` (Pixel)
Query: `GetPixelScript` (`GET /tracking/pixel-script` → `{ scriptCode }`). Spec: dashboard `SPEC.md` (PixelInstallDrawer).

### Agent I — `tenancy` (Store identity)
Query: `GetStoreInfo` (`GET /tenancy/store-info` → store identity, multi-store, currency, `updatedAt`, alerts). Spec: dashboard `SPEC.md` (StoreInfoController, #3).

> `ListNotifications` (notifications), `GetUserInfo` (identity), and the `ui` context's 3 controllers are all done in Phase 0 — no separate Phase-1 agent.
> Suggestions + tools/calculator: **no controllers** (client-side; consume shared `ListRecommendedApps` only).

---

## Phase 2 — Integration & Verification (SERIAL, single agent)

1. `bun sdk` — regenerate the SDK (single writer; generators rewrite tracked files — never run during Phase 1, never across a `git stash`).
2. `bun tsc` — whole-repo type-check (api + app). Backend authoritative: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`.
3. `bun lint`.
4. `bun run test` from `packages/api/typescript` (bunfig reflect-metadata preload). Add at least a smoke test per context that resolves each controller and asserts its output parses against `OutputSchema`.
5. Confirm SDK emitted a hook per new controller (`@template/monorepo-sdk/app`) — spot-check a few (`useListOrders`, `useGetSingleStoreDashboard`).
6. `bun review` over the diff; resolve violations before declaring done.

## Parallelism & hygiene rules (encoded for the agent team)

- **One agent = one context.** Never two agents in the same context's `controllers/index.ts` / `usecases/index.ts`.
- **`bun sdk` is single-writer** → Phase 2 only.
- **Phase 0 freezes shared schemas** before any Phase-1 agent starts; Phase-1 agents import, never edit, shared schemas. If a screen needs a shape the fundamentals lack, the agent flags it — it is **not** allowed to mutate the frozen shared module mid-fan-out.
- Stage specific files (never `git add -A`). Commit Phase 0 before fan-out; commit each context slice; commit Phase 2 regen separately.
- Confirm `bun tsc` + tests green at HEAD before starting (Step 0 of CLAUDE.md porting workflow).

## File-count estimate

| Phase | Controllers | Usecases | Files |
|---|---:|---:|---:|
| 0 (shared schemas/enums/mock + 3 ctrls) | 3 | 3 | ~12 |
| 1 (A–H) | ~72 | ~72 | ~144 |
| **Total** | **~75** | **~75** | **~156** |

## Open items — all resolved (2026-06-02)

1. ✅ Orphan controllers (`ListRecommendedApps`/`GetBanners`/`GetAppDownload`) → new `ui` context.
2. ✅ Paths → `/<context>/<endpoint>` (drop `/ui/bkdash/*`).
3. ✅ Accept spec-named-mock duplication next to existing real controllers; reconcile later.
4. ✅ Multipart commands → accept-and-echo mocks.
5. ✅ Add `@faker-js/faker`, fixed seed.
