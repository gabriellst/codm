# BK Dash — Shared Inventory (Phase 0)

> This is the **do-once shared layer** the 14 `/app` screens compose on top of. Everything here is built (or promoted) **before** any screen, so every screen consumes one canonical citizen instead of re-deriving it. Anchor: money on the wire is always `SignedMoney = { amountCents: number, currency: CurrencyCode }`; metric atoms are `NumberMetric = { value: number, deltaPct: number|null }` and `MoneyMetric = { value: SignedMoney, deltaPct: number|null }` (`packages/api/typescript/src/shared/schemas/Metric.ts`); breakdowns are always enum-keyed `segmentedMoney(Enum)/segmentedNumber(Enum) = { total, segments: enumRecord(Enum, Metric) }`. Controllers return **data, never presentation** — frontend derives href/label/color/icon/tooltip/formatted-strings from enums + i18n. All enums come from `@template/contracts-typescript/wire/enums` (TypeSpec-sourced) — UPPER_CASE canonical names (`META`, `GOOGLE_ADS`, `TIKTOK`, `TABOOLA`; `PaymentStatus`, `DisputeStatus`, `OperationalCostFlow`, `OperationalCostRecurrency`, `CostKind`, etc.), never the PT/legacy sketch names.

## 1. Reuse (already built) — consume as-is

These live in `packages/app/react/src/components/` (and `…/components/ui/`). Do **not** redefine.

| Component | Path | Consumers (screens) |
|---|---|---|
| `Header` (+ `NotificationsPopover`, `UserProfile`, `NotificationItem`) | `@/components/Header` | ALL 14 (`/app` shell). Owns store/period/currency context, `GetUserInfo` + `ListNotifications` |
| `Navbar` (+ stores dropdown, `useSidebarStore`) | `@/components/Navbar` | ALL 14 (`/app` shell) |
| `StatCard` | `@/components/StatCard` | `/app` (StatCardsSection), candidate base for orders/products KPI cells |
| `DataTable` (+ `DataTableContent/Body/Search/Pagination/Loading/Empty`) | `@/components/DataTable` | `/app/orders`, `/app/products/costs`, `/app/products/costs/$productId`, `/app/products/kits`, `/app/finance/costs` |
| `DataError` | `@/components/DataError` | every data section's error state |
| `RouteError` | `@/components/RouteError` | every route `errorComponent` |
| `AuthFooter` | `@/components/AuthFooter` | shell footer |
| `ui/*` primitives | `@/components/ui/*` | everywhere. Already present: `alert-dialog`, `availability`, `avatar`, `badge`, `breadcrumb`, `button`, `calendar`, `card`, `checkbox`, `collapsible`, `combobox`, `confirm-dialog`, `date-picker`, `dialog`, `dropdown-menu`, `empty`, `field`, `gradient-icon(-badge)`, `info-hint`, `input(-group)`, `label`, `metric-delta`, `pagination`, `popover`, `progress`, `radio-group`, `select`, `separator`, `sheet`, `skeleton`, `sonner`(toast), `spinner`, `surfaces`, `switch`, `table`, `tabs`, `textarea`, `toggle(-group)`, `tooltip` |
| Connected-stories framework | `@/storybook` (`connected`, `withConnected`, `mockQuery`, `mockMutation`, `mockMutationError`, `errorQuery`, `loadingQuery`, `mockSession`) | every Section story (MSW + memory router + `givenStores`); leaves get args-driven stories |

**Already-built dashboard pieces** (in `routes/(app)/dashboard/-components/`, count toward §`/app` remaining work, NOT new): `PixelFunnelSection` (wired into route), `FunnelStageColumn`, `FunnelSummaryStat`, `AdditionalCostsSection` (built, **not yet wired**) with `AdditionalCostRow`, `DiscountCostsToggle`, `CostTooltips` + `AdditionalCostsSection.stories.tsx`; `-stores/useDashboardStore.ts`; `funnel.ts` derivation + test.

## 2. Promote-to-shared — citizens appearing in ≥2 screens (Phase-0 build list)

Consolidated aggressively: every "recommended apps strip" collapses to ONE; every period/date-range picker to ONE; every currency+amount editor to ONE; every enum-toggle filter to ONE.

| Name | Kind | Target path | Consumers | Data (props vs owns-query) | Notes |
|---|---|---|---|---|---|
| `RecommendedAppsSection` | component | `@/components/RecommendedAppsSection/` | `/app`, `/app/products`, `/app/products/costs`, `/app/products/costs/$productId`, `/app/products/kits`, `/app/finance/costs`, `/app/marketing/traffic`, `/app/marketing/accounts/$platform`, `/app/settings/integrations`, `/app/suggestions` (10 screens) | **owns-query** `useListRecommendedApps` | The single biggest dedup. Owns skeleton(4 cards)/empty/error, expand toggle (`isExpanded` local), advertise banner. |
| `RecommendedAppCard` | leaf | `@/components/RecommendedAppsSection/RecommendedAppCard.tsx` | child of the section ↑ (all 10) | props: `{ id, name, logoUrl, rating, ratingCount, description, installUrl }` | External `<a target=_blank href=installUrl>`. Rating formatted client-side. |
| `PeriodPicker` / `DateRangePicker` | component | `@/components/DateRangePicker/` | Header (all), `/app/orders` (OrderDateRangePicker), `/app/marketing/traffic` (PeriodPicker), `/app/products/costs` (cost date range) | props `{ value, onChange(period,startDate?,endDate?) }`, URL-bound by caller | Merge OrderDateRangePicker + PeriodPicker into ONE. `calendar` mode=range + period presets (today/yesterday/7d/30d/custom). |
| `MoneyAmountEditorDialog` (was `EditCurrencyPopover`) | dialog | `@/components/Dialogs/MoneyAmountEditorDialog/` | `/app/orders` (revenue/shipping/fees/taxes — ×4), likely products/marketing financial edits | props `{ field, label, value: SignedMoney }` → field-specific PATCH | Generic currency(USD/BRL `select`)+amount(`amountCents`) editor parameterized by label/field. |
| `EnumToggleFilter` (was `StatusFilter`) | component | `@/components/EnumToggleFilter/` | `/app/orders` (PaymentStatus), reusable for any list status/category filter | props `{ values: Enum[], selected, onChange }`, URL-bound | `toggle-group` of enum members; labels via i18n. |
| `MetricDisplay` (Money + Number) | primitive | `@/components/ui/metric-display.tsx` | `/app`, `/app/orders`, `/app/products`, `/app/products/costs`, `/app/products/kits`, `/app/marketing/*` | props `{ metric: MoneyMetric|NumberMetric, kind }` | Currency-aware `R$ 12.345,67` / pct / count rendering + delta arrow (composes existing `metric-delta`). Extracts the money/number formatting every KPI cell re-derives. Pairs with existing `metric-delta.tsx`. |
| `Chart` | primitive | `@/components/ui/chart.tsx` | `/app` (RevenueChartCanvas stacked-bar/line, CostDistribution donut, FunnelStep bars) | props-driven (series data) | **Lib choice deferred** (Recharts vs visx) — see §5 OQ. One primitive serves bar/line/donut; tooltip slot. |
| `WizardShell` + step store pattern | component + store | `@/components/Wizard/` + `useWizardStore` factory | `/app/products` (MarketingCostWizardForm), `/app/products/kits` (CreateKitWizardDialog) | step index/type in a Zustand store (route-local instances) | Multi-step drawer skeleton + footer nav (Voltar/Continuar/Concluir) + optional `StepIndicator`. Promote only if both screens land; else keep route-local. |
| `CredentialsCollapsible` | component | `@/components/CredentialsCollapsible/` (defer) | `/app/settings/integrations` now; future checkout/shipping/tax credential screens | props `{ credentials[] }`, local `copiedFieldId` | mask + copy-to-clipboard. Build route-local now, promote when 2nd consumer materializes. |
| `BulkActionBar` | component | `@/components/BulkActionBar/` | `/app/orders` (OrderBatchActionsBar), `/app/products/costs` (BulkActionBar), `/app/finance/costs` (toolbar bulk delete), `/app/products/kits` (delete) | props `{ selectedCount, actions }` | Sticky selected-count bar + action buttons + clear. Dynamic count label client-side. |
| `AvatarUploader` | component | `@/components/AvatarUploader/` | `/app/settings/account` only today; flagged reusable (store/team/seller profiles) | owns local `previewUrl`; props `{ value, onUpload, onRemove, fallbackInitials }` | Promote per spec author's reuse intent; single consumer now → optional, low priority. |

## 3. Shared queries/controllers

### 3a. Existing controllers (REUSE, never redefine)

| Controller | Path | Method | Notes |
|---|---|---|---|
| `GetDashboard` | `GET /dashboard` | GET | **Single controller**, discriminated-union output (SINGLE/MULTI × GLOBAL/NATIONAL) keyed by `mode`/`tenancyScope`. The screen-map's `GetSingleStoreDashboard`/`GetMultiStoreDashboard` split is NOT implemented — it's ONE endpoint. Output already defines `StatSchema`, `StatNationalSchema`, `PerStoreStatSchema`, `ConsolidatedStatSchema`, `AdditionalCostSchema` (+National/Consolidated) in `src/ui/schemas/dashboard.ts`. |
| `GetUserInfo` | `GET /user-info` | GET | Header. `{ user, current, stores[], alerts[] }` — **alerts ride here** (no separate GetAlerts). |
| `ListRecommendedApps` | `GET /recommended-apps` | GET | `{ items: RecommendedApp[], advertiseUrl }`. The one shared apps query (10 screens). |
| `GetStoreVisualization` / `SetStoreVisualization` | `GET/POST /…` | GET/POST | store viz mode |
| `ListQuickProductRanking` | `GET /…` | GET | quick ranking |
| `ListPromotionalBanners` | `GET /…` | GET | `/app` SponsorBannerCarousel |
| `GetAppQrCode` | `GET /…` | GET | `/app` AppDownloadSection |
| `ListNotifications` | — | GET | **Referenced but NOT implemented** — treat as NEW (Wave 1) if Header needs it; mock until then. |

### 3b. NEW controllers per screen (mirror `GetDashboard`: frozen Zod in/out + faker body seeded from request via `shared/testing/mock.ts` — `mockId/mockMetric/mockMoneyMetric/mockMoney/mockSeries/pick`)

| Controller | Path | Method | Screen(s) | Output shape (real vocab) |
|---|---|---|---|---|
| `GetCurrentGoal` | `GET /goals/current` | GET | `/app` | `{ goal: { id, type: GoalType, currency: CurrencyCode, target: SignedMoney, startDate, endDate } \| null }` |
| `GetFunnel` | `GET /funnel` | GET | `/app` | `{ hasPixel: bool, base: number, steps: enumRecord(PixelEventType, { count: number, rate: number }) }` |
| `GetIncomeGraph` | `GET /dashboard/graphs/income` | GET | `/app` | `{ data: [{ timestamp, revenue, profit, marketingCost, productCost, fees, taxes: SignedMoney, currency: CurrencyCode }] }`; params `startDate,endDate,frequency: TimeFrequency,products[]` |
| `GetSalesByDayOfWeek` | `GET /dashboard/graphs/weekday` | GET | `/app` | `enumRecord(DayOfWeek, IncomeBucket)` |
| `GetSalesByHour` | `GET /dashboard/graphs/hour` | GET | `/app` | `Record<'0'..'23', IncomeBucket>` |
| `GetSalesByDayPeriod` | `GET /dashboard/graphs/period` | GET | `/app` | `enumRecord(DayPeriod, IncomeBucket)` |
| `GetSalesByRegion` | `GET /dashboard/graphs/region` | GET | `/app` | `Record<region, { state, country, total: SignedMoney, count: number }>` |
| `GetProductRanking` | `GET /products/ranking` | GET | `/app` | paginated `[{ productId, name, imageUrl, revenue: NumberMetric }]` |
| `GetActiveWarranty` | `GET /warranty` | GET | `/app` | `{ warranty: { id, percentage, startDate, periodDays } \| null }` |
| `GetPixelScript` | `GET /pixel/script` | GET | `/app` | `{ installed: bool, script: string, steps: string[] }` |
| `ListOrders` | `GET /orders` | GET | `/app/orders` | **Referenced as existing but NOT implemented → NEW.** paginated `OrderSchema[]`: `{ id, code, date, currency, products[], paymentMethod: PaymentMethod, status: PaymentStatus, revenue/productCost/shipping/fees/taxes: SignedMoney, profit: SignedMoney (read-only) }`. Params add `paymentMethod`, `startDate`, `endDate`. |
| `ListProducts` | `GET /products` | GET | `/app/products` | paginated `{ id, name, imageUrl, metrics: { revenue,sales,conversionRate: NumberMetric; netProfit,marketingCost,fees,taxes,cpa: MoneyMetric; productCost: { product, shipping: MoneyMetric } } }` |
| `ListProductFilters` | `GET /products/filters` | GET | `/app/products` | `{ costFilters: ('marketingCost'\|'productCost')[], products: {id,name}[] }` |
| `ListProductAdProfiles` | `GET /products/ad-profiles` | GET | `/app/products` | paginated `{ id, name, platform: MarketingPlatform }` |
| `ListProductAdCampaigns` | `GET /products/ad-campaigns` | GET | `/app/products` | paginated `{ id, name, profileId, platform: MarketingPlatform, spend: SignedMoney, status }` |
| `GetProductCostHistory` | `GET /products/{productId}/cost-history` | GET | `/app/products`, `/app/products/costs/$productId` | `{ productId, product:{name,imageUrl}, currency: CurrencyCode, entries: [{ id, date, cost, shipping: SignedMoney }] }` |
| `ListProductCosts` | `GET /product-costs` | GET | `/app/products/costs` | paginated `{ productId, name, thumbnailUrl, variants:{total,withCost}, sales: NumberMetric, cost:{ currency, min, max: SignedMoney\|null }, lastCostRegisteredAt }` |
| `ListCostCountries` | `GET /product-costs/countries` | GET | `/app/products/costs` | `{ countries: CostCountry[] }` (`global\|US\|CA\|AU`) |
| `ListProductVariantCosts` | `GET /product-costs/{productId}` | GET | `/app/products/costs/$productId` | paginated `{ product:{id,title,imageUrl}, variant:{ id, name, latestCost: { id, cost, shipping: SignedMoney, currency, startDate, endDate }\|null } }` |
| `GetVariantCostHistory` | `GET /product-costs/{productId}/variants/{variantId}` | GET | `/app/products/costs/$productId` | `{ variant:{id,name}, entries:[{ id, cost, shipping: SignedMoney, currency, startDate, endDate }] }` |
| `ListKits` | `GET /kits` | GET | `/app/products/kits` | paginated `{ id, name, imageUrl, type:single\|multiple, productsCount, currentCost: MoneyMetric, createdAt }` |
| `ListProductsForKit` | `GET /kits/products` | GET | `/app/products/kits` | paginated `{ id, name, sku, imageUrl, currentCost: SignedMoney }` |
| `ListOperationalCosts` | `GET /operational-costs` | GET | `/app/finance/costs` | `{ items:[{ id, name, flow: OperationalCostFlow, frequency: OperationalCostRecurrency, amount: SignedMoney, startDate, endDate\|null }], total: NumberMetric, pageNumber, pageSize, pageCount, hasMore }` |
| `GetOperationalCost` | `GET /operational-costs/:id` | GET | `/app/finance/costs` | `{ cost: OperationalCostItem }` (edit prefill) |
| `GetTrafficSources` | `GET /marketing/traffic/sources` | GET | `/app/marketing/traffic` | `{ total: TrafficMetrics, byPlatform: enumRecord(MarketingPlatform, { accountId, accountName, connected: bool, metrics: TrafficMetrics }) }`; `TrafficMetrics = { spend,cpa,purchases,roas,conversionValue: NumberMetric }` |
| `ListMarketingProfiles` | `GET /marketing-platforms/$platform/profiles` | GET | `/app/marketing/accounts/$platform` | paginated `{ platform: MarketingPlatform, currency, summary:{ profilesCount,accountsCount,activeAccountsCount, totalSpend: MoneyMetric }, item: MarketingProfile{ id,name,avatarUrl,status: MarketingProfileStatus, accountsCount, activeAccountsCount, spend: MoneyMetric, adAccounts:[{ id,name, spend: MoneyMetric, active }] } }` |
| `ListIntegrations` | `GET /integrations` | GET | `/app/settings/integrations` | `{ items:[{ id, platform, type, name, logoUrl, status, connectionMode, summary:{domain?,gateway?}, credentials:[{ id, kind, value (masked if secret), secret }] }] }`; params `category`,`search` |
| `GetMyAccount` | `GET /account` | GET | `/app/settings/account` | `{ profile:{ userId,name,email,phone?,company?,pictureUrl? }, preferences:{ language: Language, currency: CurrencyCode, timezone, emailNotifications }, security:{ hasPassword, lastPasswordChangeAt?, twoFactorEnabled } }` |
| `GetTaxFeeConfig` | `GET /tax-fee-config` | GET | `/app/settings/taxesAndFees` | `{ checkout:{ platform: CheckoutPlatform, plan, feePercent }, gateway:{ platform: PaymentGateway, paymentMethod: PaymentMethod, fee: record(GatewayFeeKind, number) }, shipping:{ averageShippingFee: SignedMoney, currency: CurrencyCode }, taxes:{ taxType: TaxType, taxPercent, marketingTaxes }, updatedAt: nullable }` |

**ONE-controller flags (collapse duplicates across screens):**
- `ListRecommendedApps` — proposed by 10 screens; **already exists**, ONE controller.
- `CreateProductCost` / `UpdateProductCost` / `DeleteProductCost` / `ImportProductCostCsv` / `ImportProductCostShopify` / `ExportProductCostCsv` — shared by `/app/products/costs` and `/app/products/costs/$productId`; ONE command family at `/product-costs`.
- `ConnectIntegration` / `ReintegrateIntegration` / `DisconnectIntegration` — proposed by both `/app/settings/integrations` and `/app/marketing/accounts/$platform`; ONE integration command family. (`/app/settings/integrations` uses the existing `/v1/integration/integrations` family; marketing accounts must reuse it, not redefine.)
- `GetDashboard` — single endpoint, not split.

## 4. Commands inventory (mutations, grouped by domain)

| Domain | Command | Path | Method | Payload (real vocab) |
|---|---|---|---|---|
| **Goal** (`/app`) | `CreateGoal` | `/goals` | POST | `{ type: GoalType, currency: CurrencyCode, target: SignedMoney, startDate, endDate }` |
| | `UpdateGoal` | `/goals/:id` | PATCH | partial of CreateGoal |
| | `DeleteGoal` | `/goals/:id` | DELETE | — (id in path) |
| **Warranty** (`/app`) | `UpsertWarranty` | `/warranty` | POST | `{ percentage, startDate, periodDays }` |
| **Operational cost** (`/app`, `/app/finance/costs`) | `CreateOperationalCost` | `/operational-costs` | POST | `{ name, flow: OperationalCostFlow, frequency: OperationalCostRecurrency, amountCents, currency: CurrencyCode, startDate, endDate?, description, category }` |
| | `UpdateOperationalCost` | `/operational-costs/:id` | PATCH | partial (patch semantics) |
| | `DeleteOperationalCost` | `/operational-costs` | DELETE | `{ ids: string[] }` (batch) |
| **Orders** (`/app/orders`) | `PatchOrderStatus` | `/orders/:id/status` | PATCH | `{ status: PaymentStatus }` |
| | `PatchOrderPaymentMethod` | `/orders/:id/payment-method` | PATCH | `{ paymentMethod: PaymentMethod }` |
| | `PatchOrderRevenue` / `…Shipping` / `…Fees` / `…Taxes` | `/orders/:id/{field}` | PATCH | `{ value: SignedMoney, currency: CurrencyCode }`; profit recalculated server-side |
| | `PatchOrderProductCost` | `/orders/:id/product-cost` | PATCH | `{ items:[{ productName, value: SignedMoney, currency }] }` |
| | `BatchUpdateOrders` | `/orders/batch` | PATCH | `{ ids: string[], status?: PaymentStatus }` |
| **Product cost** (`/app/products`, `…/costs`, `…/costs/$productId`) | `AddProductCost`/`CreateProductCost` | `/products/{id}/cost` · `/product-costs` | POST | `{ productIds[]\|productId, variantId?, country, cost, freight/shipping: SignedMoney, startDate, endDate?, applyToPast/Future/All }` |
| | `UpdateProductCost` | `/product-costs` | PUT | `{ productId, variantId, costId, cost, shipping: SignedMoney, startDate, endDate }` |
| | `DeleteProductCost` | `/product-costs` | DELETE | `{ productIds[]\|productId, variantId?, costId? }` |
| | `ImportProductCostCsv` | `/product-costs/csv` | POST | multipart `{ file, source?: csv\|shopify, productId? }` |
| | `ImportProductCostShopify` | `/product-costs/shopify` | POST | `{ productId? }` |
| | `ExportProductCostCsv` | `/product-costs/csv` | GET | — (template download) |
| **Marketing cost** (`/app/products`) | `AddMarketingCost` | `/products/{id}/marketing-cost` | POST | `{ attribution: AdAttribution, profileIds[], campaignIds[] }` |
| **Kits** (`/app/products/kits`) | `CreateKit` | `/kits` | POST | `{ name, type, cost?, shipping: SignedMoney, items:[{ productId, quantity }] }` |
| | `UpdateKit` | `/kits/:id` | PATCH | partial |
| | `DeleteKits` | `/kits` | DELETE | `{ ids: string[] }` |
| **Marketing traffic** (`/app/marketing/traffic`) | `CreateManualAd` | `/marketing/traffic/manual-ads` | POST | `{ platform: MarketingPlatform, date, value: SignedMoney, description? }` |
| **Marketing accounts** (`/app/marketing/accounts/$platform`) | `RenameAdProfile` | `/integrations/marketing/profile/$id/name` | PATCH | `{ name }` |
| | `SetAllAdAccountsStatus` | `/integrations/marketing/profile/$id/status` | PATCH | `{ active }` |
| | `ToggleAdAccount` | `/integrations/marketing/ad-account/$id` | PATCH | `{ active }` |
| **Integrations** (settings + marketing accounts) | `ConnectIntegration` | `/integration/integrations` | POST | discriminated by `{ connectionMode: ConnectionMode, type, platform, credentials }` (existing) |
| | `ReintegrateIntegration` | `/integration/integrations/{id}/reintegrate` | POST | same shape (existing) |
| | `DisconnectIntegration` | `/integration/integrations/{id}` | DELETE | — (existing) |
| **Tax & fees** (`/app/settings/taxesAndFees`) | `UpdateCheckoutFees` | `/tax-fee-config/checkout` | PUT | `{ platform: CheckoutPlatform, plan, feePercent }` |
| | `UpdateGatewayFees` | `/tax-fee-config/gateway` | PUT | `{ platform: PaymentGateway, paymentMethod: PaymentMethod, fee:{ variable, fixed: SignedMoney } }` |
| | `UpdateShippingFees` | `/tax-fee-config/shipping` | PUT | `{ averageShippingFee: SignedMoney, currency: CurrencyCode }` |
| | `UpdateTaxes` | `/tax-fee-config/taxes` | PUT | `{ taxType: TaxType, taxPercent, marketingTaxes }` |
| **Account** (`/app/settings/account`) | `UpdateProfile` | `/account/profile` | PUT | `{ name, email, phone?, company? }` |
| | `UpdatePreferences` | `/account/preferences` | PUT | `{ language: Language, timezone, emailNotifications }` (currency read-only) |
| | `UploadAvatar` | `/account/avatar` | POST | multipart `{ file }` → `{ pictureUrl }` |
| | `ChangePassword` | `/account/password` | POST | `{ currentPassword, newPassword, confirmPassword }` |
| | `DeleteAccount` | `/account` | DELETE | — (userId from auth) |

> `/app/suggestions` and `/app/tools/calculator` issue **no commands** — both are client-side pricing calculators; only `ListRecommendedApps` (suggestions) touches the network.

## 5. Open questions / snapshot caveats

- **Dashboard controller is single, not split.** Screen-map proposes `GetSingleStoreDashboard` + `GetMultiStoreDashboard`; ground truth is ONE `GET /dashboard` with a discriminated-union output (SINGLE/MULTI × GLOBAL/NATIONAL) already defined in `src/ui/schemas/dashboard.ts`. Build against the existing endpoint; do not create the split.
- **Chart primitive lib choice deferred** (Recharts vs visx) — needed by RevenueChartCanvas (stacked-bar/line), CostDistribution donut, FunnelStep bars. Decide in `/primitive` skill before Wave 0 Chart build.
- **`ListOrders` & `ListNotifications` are NOT implemented** despite being cited as "existing." Treat both as NEW (Wave 1) or mock. Header may need `ListNotifications` immediately.
- **PaymentStatus vocab mismatch.** Orders spec lists PT labels (Aprovado/Pendente/Cancelado/Reembolso/Chargeback). Canonical enum is `PENDING, AUTHORIZED, PAID, PARTIALLY_PAID, UNPAID, REFUNDED, PARTIALLY_REFUNDED, VOIDED`. Use the enum; derive PT via i18n. Confirm grouping/rename strategy.
- **MarketingPlatform membership.** Canonical = `META, GOOGLE_ADS, TIKTOK, TABOOLA` (not FACEBOOK/GOOGLE/INSTAGRAM from the legacy `_schema-fundamentals.md` sketch). `AdAttribution` = `AUTO, MANUAL` (uppercase).
- **Corrupted/swapped snapshots** — `app_settings_myAccount.html` (renders Dashboard), `app_tools_calculator.html` (renders Taxas e Tarifas), tax/fee `_gateway/_shipping/_taxes` (wrong content). These specs were inferred from wireframe, not DOM. Re-capture before locking field names/order for: `/app/settings/account`, `/app/tools/calculator`, `/app/settings/taxesAndFees` (gateway/shipping/taxes panels).
- **No HTML refs found in repo** for `/app/marketing/accounts/$platform`, `/app/suggestions` — spec inferred from wireframe + DOM of sibling screens.
- **Alerts have no dedicated query** — `/app` AlertsSection data rides inside `GetUserInfo` (`alerts: ProfileAlert[]`), not a `GetAlerts` controller.
- **Product list anatomy (OQ-1, `/app/products`)** — card grid vs DataTable row unresolved. Affects whether `ProductRow` is a leaf or a column def.
- **Country select multi vs single (`/app/products/costs`)** — markup shows checkboxes, URL param is singular. Assume single until confirmed.
- **"Gerenciar Contas" destination (`/app/marketing/traffic`)** — nav vs dialog/OAuth unresolved; blocks that toolbar button.
- **Category enum for operational costs** — `OperationalCostForm` category `select` values not in spec; check `contracts/wire/enums` for an `OperationalCostCategory` enum or treat as free string.
