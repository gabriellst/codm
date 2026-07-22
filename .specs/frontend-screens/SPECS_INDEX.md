# BK Dash — Índice de Specs de Tela (`/app`)

Specs geradas a partir dos snapshots HTML em cada `*/htmls/`, usando a skill
**ui-composition** (seção `## UI Composition`) + um **Controller Contract** que consome o
vocabulário compartilhado em **[`_schema-fundamentals.md`](./_schema-fundamentals.md)**.

> **Leia primeiro [`_schema-fundamentals.md`](./_schema-fundamentals.md).** Define os átomos
> (`MetricSchema`, `Money`), enums (`CostKind`, `MarketingPlatform`, `PixelEventType`, …), a
> estrutura composeable `Segmented<Enum>` e as regras: _controllers retornam dados, não
> apresentação_; _um controller por preocupação_; _records tipados por enum/ID, não "rows"_.

## Telas

| Rota | Tela | SPEC | Sections | Components | Leaves | Dialogs | Forms |
|------|------|------|---------:|----------:|-------:|--------:|------:|
| `/app` | Dashboard | [SPEC](./SPEC.md) | 11 | 8 | 11 | 6 | 3 |
| `/app/orders` | Pedidos | [SPEC](./orders/SPEC.md) | 1 | 10 | 1 | 4 | 0 |
| `/app/products` | Produtos | [SPEC](./products/SPEC.md) | 2 | 3 | 2 | 2 | 2 |
| `/app/products/costs` | Custos de Produto (lista) | [SPEC](./products/costs/SPEC.md) | 3 | 6 | 2 | 2 | 1 |
| `/app/products/costs/$productId` | Custo de Produto (variantes) | [SPEC](./products/costs/$productId/SPEC.md) | 4 | 0 | 4 | 3 | 2 |
| `/app/products/kits` | Kits de Produtos | [SPEC](./products/kits/SPEC.md) | 2 | 2 | 2 | 2 | 1 |
| `/app/finance/costs` | Custos Operacionais | [SPEC](./finance/costs/SPEC.md) | 2 | 6 | 2 | 1 | 1 |
| `/app/marketing/traffic` | Tráfego / Anúncios | [SPEC](./marketing/traffic/SPEC.md) | 2 | 1 | 2 | 1 | 1 |
| `/app/marketing/accounts/$platform` | Marketing por Plataforma | [SPEC](./marketing/accounts/$platform/SPEC.md) | 2 | 4 | 3 | 1 | 0 |
| `/app/settings/integrations` | Integrações | [SPEC](./settings/integrations/SPEC.md) | 2 | 3 | 2 | 1 | 1 |
| `/app/settings/account` | Minha Conta | [SPEC](./settings/account/SPEC.md) | 4 | 6 | 0 | 2 | 3 |
| `/app/settings/taxesAndFees` | Impostos e Taxas | [SPEC](./settings/taxesAndFees/SPEC.md) | 4 | 4 | 0 | 0 | 4 |
| `/app/suggestions` | Sugestões | [SPEC](./suggestions/SPEC.md) | 2 | 3 | 2 | 0 | 0 |
| `/app/tools/calculator` | Calculadora | [SPEC](./tools/calculator/SPEC.md) | 1 | 5 | 2 | 0 | 1 |

## Registro Consolidado de Controllers

Todos os contratos consomem os schemas de `_schema-fundamentals.md` (Metric/Money/enums/Segmented).

### Já existentes (`api/src/ui/controllers/`) — reutilizar, **não** redefinir

| Controller | Path | Telas que consomem |
|-----------|------|--------------------|
| `GetDashboard` | GET `/ui/dashboard` | `/app` — **dividir** em `GetSingleStoreDashboard` (sessão) + `GetMultiStoreDashboard` (todas as lojas) |
| `ListOrders` | GET `/ui/orders` | `/app/orders` |
| `GetUserInfo` | GET `/ui/user-info` | quase todas (Header) |
| `ListNotifications` | GET `/ui/notifications` | quase todas (Header) |
| `ListenEvents` | SSE | `/app/orders`, `/app/marketing/traffic` |

### Dashboard decomposto (feedback #3, #4, #6)

O antigo god-query foi quebrado em controllers focados:

| Controller | Path | Responsabilidade |
|-----------|------|------------------|
| `GetStoreInfo` | GET `/ui/bkdash/store-info` | Identidade da loja, multi-loja, moeda, `updatedAt`, alerts (StoreInfoController, #3) |
| `GetSingleStoreDashboard` | GET `/ui/bkdash/dashboard` | KPIs + custos da **loja da sessão** (mono-moeda) — refina o `GetDashboard` atual |
| `GetMultiStoreDashboard` | GET `/ui/bkdash/dashboard/multi-store` | Agregado de **todas as lojas integradas e ativas** (multi-moeda) + `perStore` |
| `GetCurrentGoal` | GET `/ui/bkdash/goals/current` | Meta de faturamento (#3) |
| `GetFunnel` | GET `/ui/bkdash/funnel` | Funil por `PixelEventType` (#4) |
| `GetIncomeGraph` | GET `/ui/bkdash/dashboard/graphs/income` | Gráfico receita/lucro por `TimeFrequency`; cada bucket carrega composição de custo (espelha backend) (#4) |
| `GetSalesByDayOfWeek` / `GetSalesByHour` / `GetSalesByDayPeriod` / `GetSalesByRegion` | GET `/ui/bkdash/dashboard/graphs/{recorte}` | Recortes do ChartTypeSelector (mesmos buckets) (#4) |
| `GetProductRanking` | GET `/ui/bkdash/products/ranking` | Ranking de produtos |
| `GetBanners` | GET `/ui/bkdash/banners` | Banners patrocinados (#6) |
| `GetAppDownload` | GET `/ui/bkdash/app-download` | QR do app BK Dash (redireciona por User-Agent) + badges iOS/Android |
| `ListRecommendedApps` | GET `/ui/bkdash/recommended-apps` | Apps recomendados (#6, compartilhado) |
| `GetActiveWarranty` | GET `/ui/bkdash/warranty` | Pré-preenche WarrantyDrawer |
| `GetPixelScript` | GET `/ui/bkdash/pixel/script` | Script do PixelInstallDrawer |

### Demais queries por tela

| Controller | Path | Tela |
|-----------|------|------|
| `ListProducts` / `ListProductFilters` / `ListProductAdProfiles` / `ListProductAdCampaigns` / `GetProductCostHistory` | `/ui/bkdash/products…` | `/app/products` |
| `ListProductCosts` | GET `/ui/bkdash/product-costs` | `/app/products/costs` |
| `ListProductVariantCosts` / `GetVariantCostHistory` | `/ui/bkdash/product-costs/{productId}…` | `/app/products/costs/$productId` |
| `ListKits` / `ListProductsForKit` | `/ui/bkdash/kits…` | `/app/products/kits` |
| `ListOperationalCosts` / `GetOperationalCost` | `/ui/bkdash/operational-costs…` | `/app/finance/costs` |
| `GetTrafficSources` | GET `/ui/bkdash/marketing/traffic/sources` | `/app/marketing/traffic` |
| `ListMarketingProfiles` | GET `/ui/bkdash/marketing-platforms/$platform/profiles` | `/app/marketing/.../$platform` |
| `ListIntegrations` | GET `/ui/bkdash/integrations` | `/app/settings/integrations` |
| `GetMyAccount` | GET `/ui/bkdash/account` | `/app/settings/account` |
| `GetTaxFeeConfig` | GET `/ui/bkdash/tax-fee-config` | `/app/settings/taxesAndFees` |

### Commands por domínio

- **Goals** (`/app`): `CreateGoal` · `UpdateGoal` · `DeleteGoal` — payloads com `GoalType`/`Currency`/`Money`
- **Warranty** (`/app`): `UpsertWarranty`
- **Operational costs** (`/app/finance/costs`, acionado também pelo dashboard): `CreateOperationalCost` · `UpdateOperationalCost` · `DeleteOperationalCost` — payload com `OperationalCostFlow`/`CostFrequency`/`Money`
- **Orders** (`/app/orders`): `PatchOrderStatus` · `PatchOrderPaymentMethod` · `PatchOrderRevenue` · `PatchOrderShipping` · `PatchOrderFees` · `PatchOrderTaxes` · `PatchOrderProductCost` · `BatchUpdateOrders` — cada Patch* tipado (sem campo dinâmico, #7); valores `{ value: Money, currency: Currency }`
- **Products** (`/app/products`): `AddProductCost` · `AddMarketingCost`
- **Product costs** (`products/costs` + `$productId`): `CreateProductCost` · `UpdateProductCost` · `DeleteProductCost` · `ImportProductCostCsv` · `ExportProductCostCsv` · `ImportProductCostShopify`
- **Kits** (`/app/products/kits`): `CreateKit` · `UpdateKit` · `DeleteKits`
- **Manual ads** (`/app/marketing/traffic`): `CreateManualAd`
- **Integrations** (compartilhado): `ConnectIntegration` · `ReintegrateIntegration` · `DisconnectIntegration` · `RenameAdProfile` · `SetAllAdAccountsStatus` · `ToggleAdAccount`
- **Account** (`/app/settings/account`): `UpdateProfile` · `UpdatePreferences` · `UploadAvatar` · `ChangePassword` · `DeleteAccount`
- **Tax/Fee** (`/app/settings/taxesAndFees`): `UpdateCheckoutFees` · `UpdateGatewayFees` · `UpdateShippingFees` · `UpdateTaxes`

## Decisões cross-tela

### Resolvidas pelos fundamentals

- ✅ **Enums de custo** — `CostKind` definido e usado em `CostBreakdownSchema`/`Segmented` (#9).
- ✅ **`ads.byPlatform`** — `Record<MarketingPlatform, Metric>`; **imposto separado** de `byType` (#5).
- ✅ **Breakdowns** — `gateway.{variable,fixed}` via `GatewayFeeSchema`; chargeback por `ChargebackStatus` (#2).
- ✅ **`perStore`** — `Record<StoreIntegrationId, KpisSchema>`; cada loja tem os mesmos KPIs (#2).
- ✅ **Custos adicionais** — cada tipo (chargeback/refund/taxes/operational) é **propriedade própria** em `DashboardDetailsSchema` (sem wrapper `AdditionalCostsSchema`), sem "rows"/`editable` (#7).
- ✅ **Métricas de anúncio** — `cpa`/`roi`/`roas` em `AdsBreakdownSchema`; `orders`/`averageTicket`/`unitsSold`/custos-por-categoria em `KpisSchema`.
- ✅ **QR do app** — `GetAppDownload.qrRedirectUrl` redireciona por User-Agent (iOS/Android).
- ✅ **Campos de apresentação** — `href`/`ordersHref`/`tooltip`/`label`/`color`/`icon` removidos; derivados no frontend (#1, #8).
- ✅ **`AddOperationalCost` vs `CreateOperationalCost`** — unificado em `CreateOperationalCost` (dono: `finance/costs`).
- ✅ **Dinheiro multi-moeda** — `CurrencyAmount` (= `CurrencyObj`/`TotalByCurrency` do backend) para agregados; `Money` para entradas mono-moeda.
- ✅ **Dashboard single vs multi-store** — `GetSingleStoreDashboard` (loja da sessão) e `GetMultiStoreDashboard` (todas as lojas ativas/integradas, agregado multi-moeda + `perStore`).
- ✅ **Contrato dos gráficos** — espelha o `GetIncomeGraph` existente do backend; cada bucket carrega a composição de custo (`revenue`/`profit`/`marketingCost`/`productCost`/`fees`/`taxes`). Enums `TimeFrequency`/`DayOfWeek`/`DayPeriod` adicionados.

### Em aberto

1. **`ListRecommendedApps` único** — proposto por 6 telas; manter **um** controller com parâmetro de
   contexto/categoria (path canônico: `GET /ui/bkdash/recommended-apps?context=…`).
2. **Commands de integração** — consolidar `Connect/Reintegrate/Disconnect` entre `settings/integrations`
   e `marketing/$platform` em um módulo único.
3. **Primitivo de gráfico (UI)** — o contrato de DADOS está resolvido (BFF espelha `GetIncomeGraph` do
   backend + recortes; `GetFunnel` por `PixelEventType`). Resta escolher a lib do primitive `Chart`
   (Recharts vs visx) antes do `/primitive`.
4. **Enums** — `MarketingPlatform` e `Currency` espelham o backend (Currency é ISO amplo: ARS/AUD/BRL/CAD/EUR/GBP/USD/…); confirmar membros finais de `MarketingPlatform`/`GoalType`. `ChartType` removido (substituído por `TimeFrequency` + recortes dedicados).

## ⚠️ Qualidade dos snapshots de origem (recapturar)

Specs parcialmente **inferidos** porque o HTML capturado não corresponde à tela:

- **`settings/account`** — DOM capturado é o **Dashboard**. Recapturar.
- **`settings/taxesAndFees`** (`_gateway`/`_shipping`/`_taxes`) — capturados em rotas erradas.
- **`tools/calculator`** — corpo é a tela "Taxas e Tarifas". Recapturar.

As outras 11 telas estão fundamentadas nos snapshots reais.

---
_Vocabulário de schemas: [`_schema-fundamentals.md`](./_schema-fundamentals.md). Cada `SPEC.md` cita os `.html` de referência por estado._
