# BK Dash `/app` — Master Build Order (waved)

> ## ⚠️ Ground-truth reconciliation (verified against the actual backend, 2026-06-05)
>
> The spec readers only knew the 8 `ui` controllers, so the Wave-1 list below **over-reports "NEW"**.
> Verified against all 77 backend controllers + the committed SDK hooks, the real state is:
>
> **Already EXIST (GET reads — reuse, do NOT redefine):** `GetDashboard` (`/dashboard`), `GetGoal`=GetCurrentGoal (`/goals/current`), `GetGoalProgress` (`/goals/progress`), `GetPixelFunnel`=GetFunnel (`/funnel`, `tracking`), `GetPixelScriptSnippet`=GetPixelScript (`/pixel-snippet`, `tracking`), `ListQuickProductRanking`=GetProductRanking (`/products/ranking`), `ListPromotionalBanners` (`/promotional-banners`), `GetAppQrCode` (`/app-qr-code`), `ListRecommendedApps` (`/recommended-apps`), `GetStoreVisualization` (`/store-visualization`), `GetUserInfo` (`/user-info`, alerts ride here), `GetFxRates` (`/fx-rates`), `ListPlatformDescriptors` (`/integrations/platforms`).
>
> **Already EXIST (commands — reuse):** Goals Create/Update/Delete/DuplicateLast; `UpsertWarranty` (`POST /finance/warranty`) + warranty-reserves CRUD; OperationalCosts Create/Update/Delete + status-override; ProductCosts Create/Update/Delete + ImportCsv; Kits Create/Update/Delete; `UpdateFees` (`PUT /fees-configuration`) + `UpdateTaxes` (`PUT /taxes-settings`); ManualAdSpend Create/Update/Delete (=CreateManualAd); BindCampaignToProduct/Unbind (=AddMarketingCost binding); UpdateAdAccounts + Reconcile; Integration Connect/Disconnect/Reintegrate/ReintegrateAll/Authorize/OAuthCallback/ExchangeCredentials; `UpdateProfile` (`/me/profile`) + `UpdateUserSettings` (`/me/settings`=UpdatePreferences) + UploadAvatar; `UpdateOrderOverride` (`PATCH /orders/override`, ONE generic order-edit command — per-field Patch* split NOT implemented, reuse the override); Stores/memberships CRUD.
>
> **Genuinely MISSING — the REAL Wave-1 backend work (build mocked, mirror `GetDashboard`, in `ui/`):**
> `GetIncomeGraph`, `GetSalesByDayOfWeek`, `GetSalesByHour`, `GetSalesByDayPeriod`, `GetSalesByRegion`,
> `GetActiveWarranty` (no GET today — drawer prefill), `ListOrders`, `ListProducts`, `ListProductFilters`,
> `ListProductAdProfiles`, `ListProductAdCampaigns`, `GetProductCostHistory`, `ListProductCosts`,
> `ListCostCountries`, `ListProductVariantCosts`, `GetVariantCostHistory`, `ListKits`, `ListProductsForKit`,
> `ListOperationalCosts`, `GetOperationalCost`, `GetTrafficSources`, `ListMarketingProfiles`,
> `ListIntegrations`, `GetMyAccount`, `GetTaxFeeConfig`, `ListNotifications`. (~26 reads.)
> Minor deferred commands: `ImportProductCostShopify`, `ExportProductCostCsv`, typed `PatchOrder*` (override covers it).
>
> The checkboxes in Wave 1 below are scoped to THIS missing set. Everything marked "existing" above is done.

Sequenced so each wave only depends on prior waves. Wave 0 = shared layer (do once). Wave 1 = Contract Lock (freeze every new BFF query's in/out Zod + faker body mirroring `GetDashboard`, regen SDK). Wave 2+ = screens, Dashboard first.

Conventions per item: scaffold with `bun cli` (component/primitive/route/form), then wire SDK identifiers, then `bun tsc` + Storybook story (Sections → connected story via `@/storybook` `withConnected`/`mockQuery`; leaves → args-driven story). Backend queries: `query` skill + `controller` skill mirroring `GetDashboard` (frozen in/out schema + deterministic faker via `shared/testing/mock.ts`), then `bun sdk`.

---

## Wave 0 — Shared components & primitives (from Inventory §2), foundational → complex

- [ ] **`MetricDisplay` primitive** — `@/components/ui/metric-display.tsx`. `bun cli primitive`. Money/Number/percent/count formatting + delta (compose existing `metric-delta`). Args story (all metric kinds + null delta). *Unblocks every KPI cell.*
- [ ] **`Chart` primitive** — `@/components/ui/chart.tsx`. **Decide Recharts vs visx first.** `bun cli primitive`. Bar(stacked)/line/donut variants + tooltip slot. Args stories per variant.
- [ ] **`RecommendedAppCard` leaf** — `@/components/RecommendedAppsSection/RecommendedAppCard.tsx`. `bun cli leaf`. Args story.
- [ ] **`RecommendedAppsSection` component** — `@/components/RecommendedAppsSection/`. `bun cli component`. Owns `useListRecommendedApps`; skeleton(4)/empty/error + expand toggle + advertise banner. Connected story (MSW `mockQuery(ListRecommendedApps)` + loading/empty/error). *Unblocks 10 screens.*
- [ ] **`DateRangePicker` / `PeriodPicker` component** — `@/components/DateRangePicker/`. `bun cli component`. `calendar` mode=range + presets (today/yesterday/7d/30d/custom); `onChange(period,start?,end?)`. Args story. *Merges OrderDateRangePicker + traffic PeriodPicker.*
- [ ] **`EnumToggleFilter` component** — `@/components/EnumToggleFilter/`. `bun cli component`. `toggle-group` over enum members + i18n labels. Args story.
- [ ] **`BulkActionBar` component** — `@/components/BulkActionBar/`. `bun cli component`. Selected-count + actions + clear. Args story. *Used by orders/product-costs/finance/kits.*
- [ ] **`MoneyAmountEditorDialog` dialog** — `@/components/Dialogs/MoneyAmountEditorDialog/`. `bun cli component` + `sheet`/`popover`. currency(USD/BRL)+`amountCents` editor param by `{field,label,value:SignedMoney}`. Story. *Used ×4 on orders.*
- [ ] **`WizardShell` + `useWizardStore` factory** — `@/components/Wizard/`. `bun cli component` + `store`. Step skeleton + footer nav + optional `StepIndicator`. *Build only if both products-marketing-wizard and kits-wizard confirmed; else keep route-local.*
- [ ] **`AvatarUploader` component** (optional/low-pri) — `@/components/AvatarUploader/`. `bun cli component`. local preview + `{value,onUpload,onRemove,fallbackInitials}`.
- [ ] **`CredentialsCollapsible`** — build route-local in `/app/settings/integrations` now; promote to `@/components/` only when 2nd consumer lands.

---

## Wave 1 — Backend mocked BFF queries (Contract Lock), grouped by screen

Each: frozen in/out Zod + faker body seeded from request (mirror `GetDashboard`), register controller, `bun sdk`. Reuse `GetDashboard`, `GetUserInfo`, `ListRecommendedApps`, store-viz, banners, qr-code, quick-ranking (already exist — do NOT redefine).

**Shell / cross-screen**
- [ ] `ListNotifications` (`GET /notifications`) — Header (cited existing but missing).

**Dashboard (`/app`)** — extend existing `GetDashboard`; add:
- [ ] `GetCurrentGoal` (`GET /goals/current`)
- [ ] `GetFunnel` (`GET /funnel`)
- [ ] `GetIncomeGraph` (`GET /dashboard/graphs/income`)
- [ ] `GetSalesByDayOfWeek` (`/dashboard/graphs/weekday`)
- [ ] `GetSalesByHour` (`/dashboard/graphs/hour`)
- [ ] `GetSalesByDayPeriod` (`/dashboard/graphs/period`)
- [ ] `GetSalesByRegion` (`/dashboard/graphs/region`)
- [ ] `GetProductRanking` (`GET /products/ranking`)
- [ ] `GetActiveWarranty` (`GET /warranty`)
- [ ] `GetPixelScript` (`GET /pixel/script`)

**Orders (`/app/orders`)**
- [ ] `ListOrders` (`GET /orders`) — cited existing but missing → build NEW (params incl. `paymentMethod`, `startDate`, `endDate`).

**Products (`/app/products`)**
- [ ] `ListProducts` · `ListProductFilters` · `ListProductAdProfiles` · `ListProductAdCampaigns` · `GetProductCostHistory`

**Product costs (`/app/products/costs`)**
- [ ] `ListProductCosts` · `ListCostCountries`

**Variant costs (`/app/products/costs/$productId`)**
- [ ] `ListProductVariantCosts` · `GetVariantCostHistory` (reuse `GetProductCostHistory` if shape matches)

**Kits (`/app/products/kits`)**
- [ ] `ListKits` · `ListProductsForKit`

**Finance costs (`/app/finance/costs`)**
- [ ] `ListOperationalCosts` · `GetOperationalCost`

**Marketing traffic (`/app/marketing/traffic`)**
- [ ] `GetTrafficSources`

**Marketing accounts (`/app/marketing/accounts/$platform`)**
- [ ] `ListMarketingProfiles`

**Settings**
- [ ] `ListIntegrations` (`GET /integrations`) — integrations
- [ ] `GetMyAccount` (`GET /account`) — account
- [ ] `GetTaxFeeConfig` (`GET /tax-fee-config`) — taxesAndFees

**Commands (Contract Lock for mutations — freeze input schemas; `usecase` + `controller`)**
- [ ] Goal: `CreateGoal`, `UpdateGoal`, `DeleteGoal`
- [ ] Warranty: `UpsertWarranty`
- [ ] Operational cost: `CreateOperationalCost`, `UpdateOperationalCost`, `DeleteOperationalCost`
- [ ] Orders: `PatchOrderStatus`, `PatchOrderPaymentMethod`, `PatchOrderRevenue/Shipping/Fees/Taxes`, `PatchOrderProductCost`, `BatchUpdateOrders`
- [ ] Product cost: `CreateProductCost`, `UpdateProductCost`, `DeleteProductCost`, `ImportProductCostCsv`, `ImportProductCostShopify`, `ExportProductCostCsv`
- [ ] Marketing cost: `AddMarketingCost`
- [ ] Kits: `CreateKit`, `UpdateKit`, `DeleteKits`
- [ ] Traffic: `CreateManualAd`
- [ ] Marketing accounts: `RenameAdProfile`, `SetAllAdAccountsStatus`, `ToggleAdAccount` (+ reuse integration `Connect/Reintegrate/Disconnect`)
- [ ] Tax & fees: `UpdateCheckoutFees`, `UpdateGatewayFees`, `UpdateShippingFees`, `UpdateTaxes`
- [ ] Account: `UpdateProfile`, `UpdatePreferences`, `UploadAvatar`, `ChangePassword`, `DeleteAccount`
- [ ] Integrations: reuse existing `ConnectIntegration`/`ReintegrateIntegration`/`DisconnectIntegration`

→ **`bun sdk` once after the wave; `bun tsc` green.**

---

## Wave 2 — Dashboard (`/app`) — FIRST (shares most, partially built)

Already built (reuse, do not rebuild): `PixelFunnelSection` (wired), `FunnelStageColumn`, `FunnelSummaryStat`, `AdditionalCostsSection` (+`AdditionalCostRow`, `DiscountCostsToggle`, `CostTooltips`, story), `useDashboardStore`, `funnel.ts` derivation.

**Remaining sections (build + connected story):**
- [ ] Wire `AdditionalCostsSection` into route `index.tsx` (built, not wired).
- [ ] `AlertsSection` (data from `GetUserInfo.alerts`) + `AlertBanner` leaf
- [ ] `StatCardsSection` (`GetDashboard` SINGLE/MULTI union) — reuse `StatCard`; leaves `StatCard` variants (Custos/Taxas/Margem tooltips)
- [ ] `OrdersSummarySection` (from `GetDashboard`) + `OrderStatCard` leaf
- [ ] `AdsSection` (from `GetDashboard`) + `AdsMetricCard` leaf (ROI/ROAS tooltips)
- [ ] `CostDistributionSection` (FE-derived from `stat.costs` segmentedMoney(CostKind)) + `CostLegendRow` leaf + `Chart`(donut)
- [ ] `GoalSection` (`GetCurrentGoal`) — empty vs progress variants
- [ ] `RevenueChartSection` (`GetIncomeGraph` + weekday/hour/period/region) + `RevenueChartCanvas`(uses `Chart`), `ChartTypeSelector`, `ChartModeToggle`
- [ ] `RankingSection` (`GetProductRanking`) + `RankingProductRow` leaf
- [ ] `RecommendedAppsSection` — reuse Wave 0 shared
- [ ] `AppDownloadSection` (`GetAppQrCode` existing), `SponsorBannerCarousel` (`ListPromotionalBanners` existing) + `BannerSlide` leaf
- [ ] `ProductCostCard`, `PixelInstallCta` components

**Dialogs/forms:**
- [ ] `CreateGoalDrawer` + `EditGoalDrawer` + `GoalForm` (CreateGoal/UpdateGoal) + `ConfirmDeleteGoalDialog` (reuse `confirm-dialog` + DeleteGoal)
- [ ] `WarrantyDrawer` + `WarrantyForm` (UpsertWarranty)
- [ ] `OperationalCostDrawer` + `OperationalCostForm` (CreateOperationalCost)
- [ ] `PixelInstallDrawer` (`GetPixelScript`, read-only)

---

## Wave 3 — Foundational/simple screens

**`/app/suggestions`** (no commands, mostly client-side)
- [ ] `PricingCalculatorSection` (+`CalculatorInputsPanel`, `ProfitEstimatorPanel`, `ProfitEstimatorRow`, `usePricingCalculator` hook) · `RecommendedAppsSection` (shared) · `AdvertiseBanner`

**`/app/tools/calculator`** (no commands, client-side)
- [ ] `PricingResultsSection`, `CalculatorHeader`, `PricingInputsForm` (Type A), `ProfitEstimatorTable`+`MarkupRow`, `AdsBreakevenTable`+`BreakevenRow`, `usePricingCalculator` (reuse from suggestions). *Re-capture snapshot first.*

**`/app/settings/taxesAndFees`** (deps: `GetTaxFeeConfig`)
- [ ] `TaxFeeTabsNav`, `TabConfigPanel`, `TabCard` leaf; 4 Sections (Checkout/Gateway/Shipping/Taxes) each reading its sub-object; 4 forms (`UpdateCheckoutFees/GatewayFees/ShippingFees/Taxes`). *Re-capture gateway/shipping/taxes snapshots.*

**`/app/settings/account`** (deps: `GetMyAccount`, `GetUserInfo`)
- [ ] `ProfileFormSection`(root query), `AccountHeaderSection`, `PreferencesSection`, `SecuritySection`; `ProfileForm`/`PreferencesForm`/`ChangePasswordForm`; `AvatarUploader` (Wave 0); `ChangePasswordDialog`, `DeleteAccountConfirmDialog`. *Re-capture snapshot.*

---

## Wave 4 — Recommended-apps-strip screens (DataTable lists)

**`/app/finance/costs`** (deps: `ListOperationalCosts`, `GetOperationalCost`)
- [ ] `OperationalCostSection`(DataTable) + `OperationalCostRow` leaf; `CostToolbar`, `OperationalCostTable`, `CostPagination`, `AddCostFab`, `BulkActionBar`(shared); `OperationalCostDrawer` + `OperationalCostForm` (create/edit); `RecommendedAppsSection`(shared).

**`/app/products/costs`** (deps: `ListProductCosts`, `ListCostCountries`)
- [ ] `CostFormSection`(+`CountrySelect`,`CostValueFields`,`ScopeToggleGroup`), `ProductCostTable`(+`ProductCostRow` leaf,`CostToolbar`,`BulkActionBar`,`TablePagination`); `ApplyCostForm`; `AddProductCostDialog`, `ImportCostCsvDialog`; `RecommendedAppsSection`(shared).

**`/app/products/costs/$productId`** (deps: `ListProductVariantCosts`, `GetVariantCostHistory`)
- [ ] `VariantCostFormSection`, `VariantsTableSection`(+`VariantRow`), `VariantCostHistorySection`(+`VariantCostEntryRow`); `VariantCostForm`, `VariantCostEntryForm`; `EditVariantCostDialog`, `ImportCsvDialog`, `DeleteVariantCostsDialog`(confirm-dialog); `RecommendedAppsSection`(shared).

**`/app/products/kits`** (deps: `ListKits`, `ListProductsForKit`)
- [ ] `KitListSection`(DataTable)+`KitRow`; `KitListToolbar`, `KitListPagination`, `BulkActionBar`; `SelectKitTypeDialog`, `CreateKitWizardDialog`(`WizardShell`+`useWizardStore`), `KitWizardForm` (CreateKit/UpdateKit), `DeleteKits`; `RecommendedAppsSection`(shared).

---

## Wave 5 — Complex screens

**`/app/products`** (deps: `ListProducts`, `ListProductFilters`, `ListProductAdProfiles`, `ListProductAdCampaigns`, `GetProductCostHistory`)
- [ ] `ProductListSection`+`ProductRow`(uses `MetricDisplay`); `ProductToolbar`, `ProductFilterMenu`, `ProductPagination`; `ProductCostDrawer`+`ProductCostForm` (AddProductCost); `MarketingCostDrawer`+`MarketingCostWizardForm` (4-step, `WizardShell`+`useMarketingWizardStore`, AddMarketingCost); `RecommendedAppsSection`(shared). *Resolve card-vs-table OQ first.*

**`/app/marketing/traffic`** (deps: `GetTrafficSources`)
- [ ] `TrafficSourcesSection`+`PlatformMetricsCard` leaf; `TrafficToolbar`(`PeriodPicker` shared); `IncluirAdsManualDialog`+`IncluirAdsManualForm` (CreateManualAd); `RecommendedAppsSection`(shared). *Resolve "Gerenciar Contas" OQ.*

**`/app/marketing/accounts/$platform`** (deps: `ListMarketingProfiles`)
- [ ] `ProfilesSection`+`MarketingProfileCard`+`AdAccountRow` leaves; `ProfilesToolbar`, `Pagination`; `ConnectPlatformDialog`; commands `RenameAdProfile`/`SetAllAdAccountsStatus`/`ToggleAdAccount`/`Reintegrate`/`Disconnect`; `RecommendedAppsSection`(shared).

**`/app/settings/integrations`** (deps: `ListIntegrations`; existing integration commands)
- [ ] `IntegrationsListSection`+`IntegrationCard` leaf; `IntegrationCategoryTabs`, `IntegrationSearchBar`, `CredentialsCollapsible`(route-local); `ConnectIntegrationSheet`+`ConnectIntegrationForm` (Connect/Reintegrate/Disconnect); `RecommendedAppsSection`(shared).

**`/app/orders`** (deps: `ListOrders`; order PATCH/batch commands) — most interactive, LAST
- [ ] `OrderTableSection`(DataTable, `useOrderSelectionStore`, `useOrderEditsStore`)+`OrderRow` leaf; `OrderTableHeader`, `StatusFilter`(`EnumToggleFilter` shared), `OrderTableToolbar`, `OrderFilterButton`/`OrderFilterMenu`, `OrderDateRangePicker`(`DateRangePicker` shared), `OrderBatchActionsBar`(`BulkActionBar` shared), `OrderEditsResetButton`; dialogs `EditStatusPopover`, `EditPaymentMethodPopover`, `EditCurrencyPopover`(`MoneyAmountEditorDialog` shared ×4: revenue/shipping/fees/taxes), `EditProductCostPopover`; commands `PatchOrderStatus/PaymentMethod/Revenue/Shipping/Fees/Taxes/ProductCost` + `BatchUpdateOrders`. *Confirm PaymentStatus enum mapping + batch action scope.*

---

### Final gate
- [ ] Cross-screen schema/id/enum audit: `bun review` + `bun tsc` green; no `@template/*` package names; every leaf money value `SignedMoney`, every metric a `NumberMetric`/`MoneyMetric`, every breakdown enum-keyed `segmented*`. Nothing marked done while violations remain.
