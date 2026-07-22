# Plan — Refactor of Mocked BFF Controllers (post-grill)

**Date:** 2026-06-02 · **Branch:** `feat/bk-dash-polyglot` · Supersedes the mock build in commits `418e6944` + `915696c1`.

Grilled via `grill-with-docs`. Reference backend: `/Users/work/Desktop/Projetos/bk-company/bk-dash-backend`.

## Framing (Q1, confirmed)
The existing **real** controllers already embody the conventions the corrections ask for (`ctx`, real enums, `paginatedQuery`/`paginatedResponse`, discriminated `GetChart`, typed order patch, auth middlewares). So this is two moves:
1. **DELETE** every mock that duplicates an existing real controller, plus the explicitly-unnecessary ones.
2. **KEEP + REWRITE** only the genuinely-new BFF reads/commands (no existing equivalent), conformed to the universal conventions below.

## Resolved decisions
- **Q2** — Delete `ChangePassword` + `DeleteAccount` (better-auth owns; not modeled).
- **Q3** — Evolve real `UpdateOrderOverride` to batch: input `body: { orderIds: z.array(z.uuid()), patch: OrderOverrideFieldsSchema }`, usecase applies the patch to every id. Delete all 8 `PatchOrder*` + `BatchUpdateOrders`.
- **Q4** — Ad-account mutations: one batch `PatchAdAccounts({ adAccountIds: z.array(z.uuid()), active: z.boolean() })` (replaces `SetAllAdAccountsStatus` + `ToggleAdAccount`); keep single `RenameAdProfile`. Both live in **marketing**.
- **Q5** — Kept mocks get the **real auth middlewares** (`AuthAccountMiddleware` + `RequireStoreMember`) so `ctx.membership.storeId` is real and the contract matches the real controllers.
- **Warranty** — `{ percentage: z.number().min(0).max(1), startDate, period: z.enum(WarrantyPeriod) }`; effective `endDate` derived (`startDate + period`), not stored.
- **Ad-account tree (item 20)** — mirror the reference's 5-level tree as one `GetCampaignsTree` in marketing: `Platform → AccountInfo → BusinessAccount → AdAccount → Campaign`, each node `{ id, name, isActive }` keyed by id; query `search?` + `treeLevel?: z.enum(AdTreeLevel)` {PLATFORM, ACCOUNT_INFO, BUSINESS_ACCOUNT, AD_ACCOUNT, CAMPAIGN}. Replaces `ListProductAdProfiles` + `ListProductAdCampaigns`.
- **Term: Chart not Graph** — the single discriminated analytics time-series read is `GetChart` (`ChartType` enum). "Graph"/"IncomeGraph"/"SalesBy*" are retired.

## New contract (wire) enums — TypeSpec + regen TS/Go
1. `WarrantyPeriod { DAYS_30:"30", DAYS_45:"45", DAYS_60:"60", DAYS_90:"90", DAYS_180:"180", DAYS_240:"240", DAYS_360:"360" }`
2. `Language { PT_BR:"pt-BR", EN_US:"en-US" }`
3. `Country { BR, US, CA, MX, CO, GB, DE, FR, IT, AU, JP, CN, IN }` (ISO-3166 alpha-2)
4. `Timezone` — curated IANA subset (~18): `America/Sao_Paulo, America/New_York, America/Chicago, America/Denver, America/Los_Angeles, America/Mexico_City, America/Bogota, America/Toronto, Europe/London, Europe/Berlin, Europe/Paris, Europe/Rome, Europe/Madrid, Australia/Sydney, Asia/Tokyo, Asia/Shanghai, Asia/Kolkata, Asia/Dubai, UTC`
5. `ProductCostListFilter { SOLD_WITHOUT_COST }` (array-typed query filter; item 19)
6. `AdTreeLevel { PLATFORM, ACCOUNT_INFO, BUSINESS_ACCOUNT, AD_ACCOUNT, CAMPAIGN }`

Reuse existing wire where applicable: `ProductCostType` for kit cardinality (item 13 — drop inline `KitTypeSchema`), `CurrencyCode`, `OperationalCostFlow`, `OperationalCostRecurrency`, `MarketingPlatform`, `PaymentStatus`, `PaymentMethod`, `GatewayFeeKind`, `DisputeStatus`, `SortOrder`.

## Universal conventions (every kept/rewritten controller — items 3/4/7/12/22/23)
- Controller input: `ctx: { user:{id}, membership:{storeId:uuid} }` (item 22) + `query: z.paginatedQuery({ ...filters, sortOrder: z.enum(SortOrder) })` (7, 12) + `params`/`body` as needed. Dates `z.stringToDate()`; ids `z.array(z.uuid())` (4b, 23). Multi-select filters `z.stringToArray(z.enum(Enum))` (19).
- Usecase input: dates `z.date()`; ids `z.array(z.uuid())`; every closed set `z.enum(Enum)` — **never** `z.string()` for an enumerable (4a), **never** `z.enum(['literal',...])` or `z.nativeEnum` (3, 13). List outputs `z.paginatedResponse(ItemSchema)` (7).
- Middlewares: `[AuthAccountMiddleware, RequireStoreMember]` (Q5).

## DELETE — duplicates of existing real controllers + unnecessary
| Our mock | Reason |
|---|---|
| analytics `CreateGoalBff/UpdateGoalBff/DeleteGoalBff` | = real `CreateGoal/UpdateGoal/DeleteGoal` |
| analytics `GetFunnel` | = real `GetPixelFunnel` (item 9) |
| analytics `GetIncomeGraph/GetSalesByDayOfWeek/GetSalesByHour/GetSalesByDayPeriod/GetSalesByRegion` | = real `GetChart` (item 6) |
| analytics `GetSingleStoreDashboard/GetMultiStoreDashboard` | = real `GetDashboardOverview` (item 17) |
| sales `ListOrders` | = real `GetOrdersList` |
| sales 8× `PatchOrder*` + `BatchUpdateOrders` | → batch `UpdateOrderOverride` (item 11) |
| catalog `ListProducts` | = real `GetProductsList` |
| catalog `ListProductCosts` | = real `GetProductCostsList` |
| catalog `CreateProductCostBff/UpdateProductCostBff/DeleteProductCostBff` | = real `CreateProductCost/UpdateProductCost/DeleteProductCost` |
| catalog `ImportProductCostCsv` | = real `BulkImportProductCostsFromCsv` |
| catalog `ExportProductCostCsv` | item 21 unnecessary |
| catalog `ListProductFilters` | item 18 unnecessary |
| catalog `ListProductAdProfiles/ListProductAdCampaigns` | → marketing `GetCampaignsTree` (item 20) |
| catalog `AddProductCost` | = real `CreateProductCost` |
| finance `ListOperationalCostsBff` | = real `GetOperationalCostsList` |
| finance `CreateOperationalCostBff/UpdateOperationalCostBff/DeleteOperationalCostBff` | = real `CreateOperationalCost/UpdateOperationalCost/DeleteOperationalCost` |
| finance `UpdateTaxesBff` | = real `UpdateTaxes` |
| finance `GetTaxFeeConfig/UpdateCheckoutFees/UpdateGatewayFees/UpdateShippingFees` | ≈ real `GetFeesConfigurationSettings`/`UpdateFeesConfiguration` (+`GetTaxesSettings`) — see BORDERLINE |
| integration `ListIntegrationsBff` | = real `GetIntegrationsList` |
| integration `ConnectIntegrationBff/DisconnectIntegrationBff` | = real `ConnectIntegration/DisconnectIntegration` |
| integration `ReintegrateIntegration` | = real `TriggerReintegration` |
| integration `SetAllAdAccountsStatus/ToggleAdAccount` | → marketing batch `PatchAdAccounts` (item 16) |
| marketing `CreateManualAd` | = real `RecordManualAdSpend` |
| identity `UpdateProfileBff` | = real `UpdateProfile` |
| identity `UpdatePreferences` | = real `UpdateUserPreferences` |
| identity `ChangePassword/DeleteAccount` | better-auth owns (Q2) |
| tracking `GetPixelScript` | = real `GetPixelScriptSnippet` |

## KEEP + REWRITE (genuinely-new, conform to conventions)
- **ui**: `ListRecommendedApps`, `GetBanners`, `GetAppDownload`
- **catalog**: `ListKits`, `ListProductsForKit`, `CreateKit`, `UpdateKit`, `DeleteKits` (KitType→`ProductCostType`), `GetProductCostHistory`, `GetVariantCostHistory`, `ListProductVariantCosts`, `ImportProductCostShopify`, `ListCostCountries` (→ returns `Country` members)
- **marketing**: `GetTrafficSources`, `GetCampaignsTree` (new, replaces profiles/campaigns), `PatchAdAccounts` (new batch), `RenameAdProfile` (moved from integration), `AddMarketingCost` (moved from catalog — see BORDERLINE vs `BindCampaignToProduct`)
- **identity**: `GetMyAccount` (aggregator over profile+prefs+security; Language/Timezone enums), `UploadAvatar`
- **tenancy**: `GetStoreInfo` (drop `updatedAt` — item 10)
- **analytics**: `GetActiveWarranty` + `UpsertWarranty` (warranty %+period), `GetCurrentGoal`, `GetProductRanking` — see BORDERLINE
- **finance**: `GetOperationalCost` (single get) — see BORDERLINE
- **sales**: evolve real `UpdateOrderOverride` → batch
- **integration→marketing move**: `RenameAdProfile`
- Phase-0 keepers already conformed-ish: `GetUserInfo` (identity), `ListNotifications` (notifications) — see BORDERLINE vs `GetProfileSettings`/`GetNotificationsInbox`

## BORDERLINE — RESOLVED
| Our controller | Closest existing | Decision |
|---|---|---|
| analytics `GetCurrentGoal` | `GetGoals` (list) | **KEEP** (distinct: single active goal) |
| analytics `GetProductRanking` | `GetProductPerformanceReport` (T32) | **KEEP** (distinct: dashboard top-N ranking) |
| `GetActiveWarranty`/`UpsertWarranty` | finance `*WarrantyReserve*` | **KEEP + MOVE to finance** |
| finance `GetTaxFeeConfig` + 3 fee updaters + `UpdateTaxesBff` | `GetFeesConfigurationSettings`/`UpdateFeesConfiguration`/`GetTaxesSettings`/`UpdateTaxes` | **DELETE ours, reuse existing** (4 screen forms → `UpdateFeesConfiguration` sections + `UpdateTaxes`) |
| finance `GetOperationalCost` (single) | `GetOperationalCostsList` only | **KEEP** (no single-get exists) |
| marketing `AddMarketingCost` | `BindCampaignToProduct` (C36) | **DELETE ours, reuse `BindCampaignToProduct`** |
| identity `GetMyAccount` | `GetProfileSettings` + `GetUserPreferencesSettings` | **KEEP** (one aggregated read) |
| identity `GetUserInfo` (header) | `GetProfileSettings` | **KEEP** (lean header blob) |
| notifications `ListNotifications` (header) | `GetNotificationsInbox` | **KEEP** (lean header feed) |
| catalog `ListCostCountries` | — | **KEEP** (returns `Country` members) |

## Execution
1. **Phase R0 (me, serial):** add the 6 wire enums (TypeSpec + regen). Evolve `UpdateOrderOverride` to batch. Delete the confirmed-duplicate files + their barrel exports. Adjust `shared/schemas/ui` if any schema referenced a deleted enum.
2. **Phase R1 (parallel agents, per context):** rewrite each KEEP controller to the universal conventions; build the new consolidated ones (`GetCampaignsTree`, `PatchAdAccounts`); relocate `RenameAdProfile`/`AddMarketingCost` to marketing.
3. **Phase R2 (me, serial):** `bun sdk` regen → repo `tsc` + `bun test` + `bun lint` → `bun review` → commit.

## Open (confirm before R1)
The BORDERLINE table above (≈10 rows). Everything else is locked.
