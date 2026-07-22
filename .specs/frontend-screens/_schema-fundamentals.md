# Schema Fundamentals — BK Dash UI Controllers

> Vocabulário **reusável e composeable** que todos os Controller Contracts consomem.
> Specs de tela **não** redefinem estas formas — importam daqui (`@ui/schemas`).
> Sketches em Zod (`z`). Identificadores em inglês.
>
> **Proveniência:** muitos conceitos JÁ EXISTEM no `bk-dash-backend`. A regra é **reusar o que existe**
> e só **criar** o que falta. Cada bloco abaixo marca a origem: `REUSE` (espelha o backend),
> `EXTEND` (formaliza algo que hoje é string/boolean livre) ou `NEW` (conceito de BFF/leitura).

## Princípios

1. **Controllers retornam dados, não apresentação** — sem `href`, `label`, `color`, `icon`, `tooltip`,
   `editable`, nem strings formatadas. O frontend deriva de enums + i18n. (#1/#8)
2. **`Metric` é o átomo de KPI** — `{ value, deltaPct }`. Unidade (R$/%/contagem) não está no schema.
3. **Decomposição = `Segmented<Enum>`** — total + segmentos tipados por enum (`Record<Enum, Metric>`).
4. **Records tipados por enum/ID**, nunca "rows" genéricas com flags.
5. **Um controller por preocupação.**
6. **Reusar enums/schemas do backend** antes de criar. Alinhar nomes e VALORES ao backend (casing inclusive).

## Proveniência — reusar vs criar

| Conceito (fundamentals) | Origem no backend | Onde | Decisão |
|---|---|---|---|
| `MonetaryAmountSchema` | `AmountCurrency` (`t.Object({ amount, currency })`) | `backend/src/shared/types` | **REUSE** |
| `CurrencyAmount` | `CurrencyObj` = `Partial<Record<Currency, number>>` | `backend/src/shared/types`; `packages/nosql` (`TotalByCurrency`) | **REUSE** |
| `Currency` | enum `Currency` (25 ISO) | `packages/sql/schema.prisma` | **REUSE** |
| `MarketingPlatform` | enum `Platform` | `packages/nosql/types/enums.ts` | **REUSE** |
| `PixelEventType` | enum `PixelEventType` | `packages/nosql/schemas/pixelEvent.schema.ts` | **REUSE** |
| `PaymentMethod` | enum `PaymentMethod` | `backend/src/shared/types/prisma.ts` | **REUSE** |
| `PaymentStatus` | enum `PaymentStatus` | `packages/nosql/types/enums.ts` | **REUSE** |
| `ChargebackStatus` | `OrderTransactionType` + `chargebackTransactionMapping` (`open/won/lost`) | `backend/src/modules/orders/types/orderTransaction` | **REUSE** (valores mapeados) |
| `GoalType` | enum `GoalType` (`REVENUE/PROFIT`) | `packages/nosql/schemas/goal.schema.ts` | **REUSE** |
| `TimeFrequency` | enum `TimeFrequency` | `backend/src/shared/types/date.ts` | **REUSE** |
| `DayOfWeek` / `DayPeriod` | tipos do dashboard legado | `backend-old/src/modules/dashboard/types` | **REUSE** (formalizar no BFF) |
| Fees `gateway.{fixed,variable}` | `OrderMetrics.fees.gateway` | `backend/src/modules/orders/types/orderMetrics.ts` | **REUSE** |
| `IncomeGraphBucketSchema` | `IncomeGraphData` | `backend/src/modules/dashboard/types/graphs.ts` | **REUSE** |
| `StoreIntegrationId` / multi-loja | `IntegrationSet` (+ `IntegrationSetHasVirtualStore`), `MultiStoreDTO` | `packages/sql/*.prisma`, `backend/src/modules/users/types` | **REUSE** |
| Warranty | model `Warranty` (`value` %, `startDate`, `endDate`) | `packages/sql/taxesAndFees.prisma` | **REUSE** |
| `AdAttribution` (`auto`/`manual`) | `isManual: boolean` em MarketingExpenses | `packages/nosql/schemas/marketingExpenses.schema.ts` | **EXTEND** (formaliza o boolean) |
| `OperationalCostFlow` (`credit`/`debit`) | sem enum — `category` é string livre | `packages/nosql/schemas/operationalCost.schema.ts` | **NEW** |
| `CostFrequency` | sem enum — `recurrency` é string (legacy `Frequency`) | idem | **EXTEND** |
| `CostKind` | sem enum único — chaves de `OrderMetrics.costs` + fees/taxes/operational | `orderMetrics.ts` | **NEW** (ancorado no OrderMetrics) |
| `MetricSchema` (`value`+`deltaPct`) | backend devolve valor cru, sem delta | — | **NEW** (BFF calcula a variação) |
| `ProfileAlertSchema` (`reconnectProfile`/`syncError`) | campos `valid`/`active`/`lastSyncAt`/`disabledAt` da integração | `packages/sql/marketing.prisma` | **NEW** (derivado dos campos) |
| `RecommendedAppSchema` / `ListRecommendedAppsOutputSchema` | vitrine curada (CMS/estática) — sem equivalente | — | **NEW** (compartilhado por ~6 telas) |

## Enums (alinhados ao backend)

```ts
// REUSE — enum Currency do backend (ISO 4217, 25 valores)
export const Currency = z.enum([
  'ARS','AUD','BRL','CAD','CHF','CLP','COP','CZK','DKK','EUR','GBP','GTQ','HKD','HUF','JPY',
  'MXN','NOK','NZD','PLN','RON','RUB','SEK','SGD','USD','ZAR',
])

// REUSE — enum Platform do backend (note casing UPPER + INSTAGRAM/UNKNOWN)
export const MarketingPlatform = z.enum(['FACEBOOK', 'GOOGLE', 'TIKTOK', 'INSTAGRAM', 'UNKNOWN'])

// REUSE — enum PixelEventType do backend (packages/nosql). O funil usa um subconjunto ordenado.
export const PixelEventType = z.enum([
  'PAGE_VIEWED', 'PRODUCT_VIEWED', 'PRODUCT_ADDED_TO_CART', 'PRODUCT_REMOVED_FROM_CART',
  'CART_VIEWED', 'CHECKOUT_STARTED', 'CHECKOUT_COMPLETED', 'CHECKOUT_CONTACT_INFO_SUBMITTED',
])
// 5 passos canônicos do funil (display) ← mapeiam dos eventos acima:
export const FUNNEL_STEPS = ['PAGE_VIEWED','PRODUCT_VIEWED','PRODUCT_ADDED_TO_CART','CHECKOUT_STARTED','CHECKOUT_COMPLETED'] as const

// REUSE — pagamento (backend)
export const PaymentMethod = z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'BANK_SLOT', 'UNKNOWN'])
export const PaymentStatus = z.enum([
  'PENDING','PAID','REFUNDED','CANCELED','PARTIALLY_REFUNDED','VOIDED','UNKNOWN',
  'AUTHORIZED','CHARGEBACK','REFUSED','ABANDONED',
])
// O status do pedido É o PaymentStatus (canônico, em inglês, conjunto completo — NÃO simplificar
// nem traduzir no contrato). O frontend traduz cada valor (ex. PAID → "Aprovado") e pode agrupar
// visualmente. `ListOrders` deve devolver PaymentStatus (refinar o enum PT atual).

// REUSE — chargeback: valores mapeados de OrderTransactionType (DISPUTE_OPEN/WON/LOST)
export const ChargebackStatus = z.enum(['open', 'won', 'lost'])

// REUSE — meta (enum GoalType do backend)
export const GoalType = z.enum(['REVENUE', 'PROFIT'])

// REUSE — gráficos
export const TimeFrequency = z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'])
export const DayOfWeek     = z.enum(['sunday','monday','tuesday','wednesday','thursday','friday','saturday'])
export const DayPeriod     = z.enum(['morning', 'afternoon', 'evening', 'night'])

// REUSE — gateway fee kinds (de OrderMetrics.fees.gateway)
export const GatewayFeeKind = z.enum(['variable', 'fixed'])

// EXTEND — atribuição de anúncio (hoje `isManual: boolean` no backend)
export const AdAttribution = z.enum(['auto', 'manual'])

// NEW — custo operacional: crédito (entrada) vs débito (saída). Backend hoje guarda `category` (string).
export const OperationalCostFlow = z.enum(['credit', 'debit'])
// EXTEND — frequência (hoje `recurrency` string; legacy enum Frequency)
export const CostFrequency = z.enum([
  'once','daily','weekly','monthly','bimonthly','quarterly','semiannual','yearly',
])

// NEW — composição de custo do dashboard (ancorado nas chaves de OrderMetrics.costs/fees/taxes)
export const CostKind = z.enum([
  'marketing', 'product', 'shipping', 'fees', 'refund', 'chargeback', 'taxes', 'operational',
])
```

## Átomos

```ts
// StoreIntegrationId = id (UUID) de um IntegrationSet (a "loja"); multi-loja = MultiStoreDTO { stores: string[] }
export const StoreIntegrationId = z.string()

// REUSE — AmountCurrency do backend: um valor monetário COM sua moeda.
export const MonetaryAmountSchema = z.object({ amount: z.number(), currency: Currency })

// REUSE — CurrencyObj/TotalByCurrency: agregado multi-moeda (soma de várias lojas/moedas).
export const CurrencyAmount = z.record(Currency, z.number())  // = { BRL: 12087.41, USD: 12.5, … }

// Conveniência: valor já normalizado para a moeda de exibição (quando a tela é mono-moeda
// e o BFF já converteu). Prefira MonetaryAmountSchema quando a moeda precisa viajar junto.
export const Money = z.number()

// NEW — átomo de KPI: valor + variação período-a-período (o backend NÃO devolve delta; o BFF calcula).
export const MetricSchema = z.object({
  value: z.number(),                 // mono-moeda (normalizado p/ a moeda do Header)
  deltaPct: z.number().nullable(),   // fração (-0.41 = -41%); null = sem comparação
})
// Variante multi-moeda (agregado que cruza moedas)
export const CurrencyMetricSchema = z.object({
  value: CurrencyAmount,
  deltaPct: z.number().nullable(),
})
```

## Decomposição composeable (`Segmented`)

```ts
export const segmented = (key) => z.object({ total: MetricSchema, segments: z.record(key, MetricSchema) })

export const CostBreakdownSchema      = segmented(CostKind)          // total + por tipo de custo
export const AdsByPlatformSchema      = segmented(MarketingPlatform) // Record<Platform, Metric>
export const AdsByTypeSchema          = segmented(AdAttribution)     // auto/manual — SEM imposto
export const GatewayFeeSchema         = segmented(GatewayFeeKind)    // variable / fixed
export const ChargebackByStatusSchema = segmented(ChargebackStatus)  // open/won/lost
```

## Breakdowns nomeados (detalhe de tooltip — dados, não texto)

Espelham `OrderMetrics` do backend (`fees.{checkout,gateway,chargeback,manual}`, `costs.*`, `taxes`).

```ts
// Taxas — gateway aberto em variable/fixed; backend também traz gateway.warranty (custo de garantia)
export const FeesBreakdownSchema = z.object({
  gateway: GatewayFeeSchema,        // { total, segments: { variable, fixed } }
  checkout: MetricSchema,
  chargeback: MetricSchema,
})

// Anúncios — imposto SEPARADO de byType; cpa/roi/roas inclusos
export const AdsBreakdownSchema = z.object({
  total: MetricSchema,
  byPlatform: AdsByPlatformSchema,  // Record<MarketingPlatform, Metric>
  byType: AdsByTypeSchema,          // Record<AdAttribution, Metric> (auto/manual)
  tax: MetricSchema,                // imposto sobre anúncios — FORA de byType
  cpa:  MetricSchema,
  roi:  MetricSchema,
  roas: MetricSchema,
})

export const ChargebackBreakdownSchema = z.object({ byStatus: ChargebackByStatusSchema, fees: MetricSchema })
export const TaxesBreakdownSchema      = z.object({ ads: MetricSchema, others: MetricSchema })
export const ProductCostBreakdownSchema = z.object({ product: MetricSchema, shipping: MetricSchema })
```

## KPIs + multi-loja

```ts
export const KpisSchema = z.object({
  revenue:       MetricSchema,
  profit:        MetricSchema,
  margin:        MetricSchema,        // fração (%)
  orders:        MetricSchema,
  averageTicket: MetricSchema,
  unitsSold:     MetricSchema,
  costs:         CostBreakdownSchema, // total + segments por CostKind
})
export const PerStoreKpisSchema = z.record(StoreIntegrationId, KpisSchema) // cada loja é mono-moeda

// Agregado consolidado multi-moeda (dashboard multi-store)
export const CurrencyCostBreakdownSchema = z.object({
  total: CurrencyMetricSchema, segments: z.record(CostKind, CurrencyMetricSchema),
})
export const ConsolidatedKpisSchema = z.object({
  revenue: CurrencyMetricSchema, profit: CurrencyMetricSchema,
  margin: MetricSchema, orders: MetricSchema, averageTicket: CurrencyMetricSchema, unitsSold: MetricSchema,
  costs: CurrencyCostBreakdownSchema,
})
```

## Custos operacionais (tipados — sem "rows", sem "editable")

```ts
export const OperationalCostItemSchema = z.object({
  id: z.string(),
  name: z.string(),                 // backend: `description`
  flow: OperationalCostFlow,        // NEW: credit (entrada) | debit (saída)
  frequency: CostFrequency,         // backend: `recurrency`
  amount: Money,                    // backend: `value` (+ `currency`)
  currency: Currency,
  startDate: z.date(),
  endDate: z.date().nullable(),
})
export const OperationalCostsSchema = z.object({ total: MetricSchema, items: z.array(OperationalCostItemSchema) })
```

## Alertas de perfil (união discriminada por `kind`) — NEW (derivado dos campos da integração)

Derivado de `MarketingPlatformAdAccount`/integração: `valid=false → reconnectProfile`; falha/atraso de
`lastSyncAt → syncError`. Texto/ação são derivados no frontend (#1/#8).

```ts
const ProfileAlertBase = z.object({
  id: z.string(), platform: MarketingPlatform, profileId: z.string(), displayName: z.string(),
})
export const ReconnectProfileAlertSchema = ProfileAlertBase.extend({ kind: z.literal('reconnectProfile') })
export const SyncErrorAlertSchema        = ProfileAlertBase.extend({
  kind: z.literal('syncError'), lastSyncedAt: z.date().nullable(),
})
export const ProfileAlertSchema = z.discriminatedUnion('kind', [ReconnectProfileAlertSchema, SyncErrorAlertSchema])
```

## Gráfico de receita/lucro — bucket reusável (REUSE: backend `IncomeGraphData`)

Espelha `IncomeGraphData` (`backend/src/modules/dashboard/types/graphs.ts`). **Cada bucket carrega a
composição de custo**; dinheiro = `CurrencyAmount` (= `CurrencyObj`).

```ts
export const IncomeGraphBucketSchema = z.object({
  label: z.string(),            // ISO date do bucket (eixo X)
  orders: z.number(),
  revenue: CurrencyAmount,
  profit:  CurrencyAmount,
  marketingCost: CurrencyAmount,  // chaves = OrderMetrics.costs/fees/taxes (CostKind)
  productCost:   CurrencyAmount,
  fees:          CurrencyAmount,
  taxes:         CurrencyAmount,
})
export const IncomeGraphSchema = z.object({ data: z.array(IncomeGraphBucketSchema) })

// Recortes analíticos (chart-type selector) — mesmos buckets, chaveados por enum
export const SalesByDayOfWeekSchema = z.record(DayOfWeek, IncomeGraphBucketSchema)
export const SalesByDayPeriodSchema = z.record(DayPeriod, IncomeGraphBucketSchema)  // turno
export const SalesByHourSchema      = z.record(z.string(), IncomeGraphBucketSchema) // '0'..'23'
export const SalesByRegionSchema    = z.record(z.string(), z.object({
  state: z.string(), country: z.string(), total: CurrencyAmount, count: z.number(),
}))
```

## Vitrine de apps recomendados (compartilhado) — `ListRecommendedApps`

A faixa "Aplicativos Recomendados" + banner "Deseja anunciar sua marca aqui?" se repete em ~6 telas
(dashboard, suggestions, finance/costs, products/kits, marketing/traffic, marketing/$platform,
settings/integrations). **Um único controller** `ListRecommendedApps` (`GET /ui/bkdash/recommended-apps`)
serve todas — as telas só o consomem. `installUrl`/`advertiseUrl` são links externos reais (dados).

```ts
export const RecommendedAppSchema = z.object({
  id: z.string(),
  name: z.string(),
  logoUrl: z.string().url(),
  rating: z.number(),                   // 4.8 — frontend formata
  ratingCount: z.number(),              // 40000 — frontend formata "(40.000+)"
  description: z.string(),
  installUrl: z.string().url(),         // CTA "Visitar" — link externo real
})
export const ListRecommendedAppsOutputSchema = z.object({
  items: z.array(RecommendedAppSchema),
  advertiseUrl: z.string().url(),       // "Deseja anunciar sua marca aqui?" — link externo real
})
```

## O que NÃO entra nos contratos (#8 — derivado no frontend)

`href`/`ordersHref`, `tooltip`, `label`, `color`, `icon`, `editable` e textos formatados
(`"R$ 12.087,41"`, `"-41%"`, `"há menos de um minuto"`). O backend entrega `value`/`deltaPct`/enums;
o frontend deriva rótulo, formatação, cor do delta, ícone (por `CostKind`/`MarketingPlatform`), link de
navegação e o texto do tooltip via mapas i18n + enums.
