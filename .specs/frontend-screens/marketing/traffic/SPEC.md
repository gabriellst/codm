# Rota /app/marketing/traffic — Trafego / Anuncios

## Visao Geral

A tela de Trafego / Anuncios ("Fontes de Tráfego") consolida o desempenho de mídia paga da loja, mostrando lado a lado os resultados das plataformas de anúncio conectadas (Facebook/Meta, Google, TikTok e demais contas). Há um cartão de Total consolidado e um cartão por plataforma, cada um com cinco métricas no período selecionado: Valor Gasto, CPA, Compras, ROAS e Valor de Conversão. Uma toolbar superior permite atualizar os dados, escolher o período (ex.: "Hoje"), incluir lançamentos de anúncios manualmente (drawer/sheet com formulário) e gerenciar/conectar contas de anúncio.

Abaixo do bloco de plataformas há uma seção de "Aplicativos Recomendados" (BK Reviews, BK Arts, BK Ads, Empresa Fora, Dolphin{anty}, FlowBorder), um catálogo de parceiros com nota, número de avaliações, descrição e link "Visitar", além de um CTA "Deseja anunciar sua marca aqui?". O papel da tela é ser o painel de marketing pago do dashboard: leitura rápida de eficiência por canal e entrada de dados que as integrações automáticas não cobrem.

## Inventario de Estados

| Arquivo HTML | Estado / Interacao | Citizen afetado |
|---|---|---|
| `app_marketing_traffic.html` | Estado base da tela: toolbar, cartão Total + cartões por plataforma com métricas, seção de apps recomendados. | `TrafficShell`, `TrafficToolbar`, `TrafficSourcesSection` + `PlatformMetricsCard` (Leaf), `RecommendedAppsSection` + `RecommendedAppCard` (Leaf) |
| `app_marketing_traffic_drawer-incluir-ads-manual-aberto.html` | Clique em "Incluir Ads Manual" (`aria-haspopup="dialog"`) abre o drawer/sheet lateral com o formulário de lançamento manual de anúncios (plataforma, data, valor, descrição). (No snapshot o drawer ainda não havia sido pintado — o gatilho e o destino estão confirmados pelo botão `aria-haspopup="dialog"`.) | `IncluirAdsManualDialog` (sheet) + `IncluirAdsManualForm` |

## UI Composition

### URL Contract

- **Path:** `/app/marketing/traffic`
- **Breadcrumb:** `Marketing › Tráfego`
- **Search params (Zod sketch):**
  - `period` — `enum('today','yesterday','7d','30d','custom')` (default `'today'`) — período das métricas; rótulo "Hoje" na toolbar
  - `startDate` — `string` (ISO date, opcional) — início do range quando `period === 'custom'`
  - `endDate` — `string` (ISO date, opcional) — fim do range quando `period === 'custom'`
- **Loader (if any):** nenhum loader bloqueante; cada Section dispara sua própria query no client a partir de `period`/`startDate`/`endDate`.
- **errorComponent:** `RouteError` (default)

### ASCII Layout Map

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Navbar (shared)  │  Header (shared)                                            │
├──────────────────┴─────────────────────────────────────────────────────────── ┤
│ ┌────────────────────────────────────────────────────────────────────────────┐ │
│ │ TrafficToolbar  (título "Fontes de Tráfego" + ações)                        │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────────────────┐ │
│ │ TrafficSourcesSection                                                       │ │
│ │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐    │ │
│ │  │PlatformMetrics│ │PlatformMetrics│ │PlatformMetrics│ │PlatformMetrics│    │ │
│ │  │Card (Leaf ×N) │ │Card (Leaf ×N) │ │Card (Leaf ×N) │ │Card (Leaf ×N) │    │ │
│ │  └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘    │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────────────────┐ │
│ │ RecommendedAppsSection ("Aplicativos Recomendados" + CTA)                   │ │
│ │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                            │ │
│ │  │RecommendedApp│ │RecommendedApp│ │RecommendedApp│  ... (×N) [▼ Mais apps] │ │
│ │  │Card (Leaf ×N)│ │Card (Leaf ×N)│ │Card (Leaf ×N)│                          │ │
│ │  └─────────────┘ └─────────────┘ └─────────────┘                            │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Overlays:
  IncluirAdsManualDialog (Dialog/sheet) ── abre no clique de "Incluir Ads Manual"
                                            (contém IncluirAdsManualForm)
```

### Component Tree

```text
TrafficShell                                                 (Route Shell)
├─ TrafficToolbar                                            (Component, ações + period)
├─ TrafficSourcesSection                                     (Section, owns metrics query)
│  └─ PlatformMetricsCard                                    (Leaf ×N)
├─ RecommendedAppsSection                                    (Section, owns apps query)
│  └─ RecommendedAppCard                                     (Leaf ×N)
└─ (Navbar + Header — shared, no Route Shell, nao redesenhados)

Overlays:
└─ IncluirAdsManualDialog                                    (Dialog/sheet, route-local)
   └─ IncluirAdsManualForm                                   (Form Type C)
```

### Component Anatomy

**`TrafficToolbar`** (Component)

Mockup:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Fontes de Tráfego                                                            │
│ Analise separadamente os resultados das plataformas que você anuncia         │
│                                                                              │
│ [ ↻ Atualizar ]  [ 📅 Hoje ▾ ]      [ + Incluir Ads Manual ] [ Gerenciar… ] │
└────────────────────────────────────────────────────────────────────────────┘
```

Slots:

```text
TrafficToolbar
└─ Header  [flex col gap-3]
   ├─ TitleBlock: flex col
   │  ├─ Title: h2 "Fontes de Tráfego"  [text-2xl font-bold]
   │  └─ Subtitle: p "Analise separadamente os resultados…"  [text-sm text-muted-foreground]
   └─ ActionsRow: flex row items-center gap-2 between
      ├─ RefreshButton: "Atualizar"  [primitive: Button, variant="outline"] (icon ↻)
      ├─ PeriodPicker: "Hoje"  [primitive: DatePicker]  (escreve period/startDate/endDate na URL)
      ├─ IncluirAdsManualButton: "Incluir Ads Manual"  [primitive: Button] (aria-haspopup="dialog")
      └─ GerenciarContasButton: "Gerenciar Contas"  [primitive: Button, variant="outline"]
```

Variants:
- `period` selecionado controla o rótulo do `PeriodPicker` (ex.: "Hoje", "Últimos 7 dias").

States:
- nenhum estado de dados próprio (não busca lista); botão Atualizar invalida as queries das Sections.

**`TrafficSourcesSection`** (Section)

```text
TrafficSourcesSection
└─ root  [grid grid-cols-4 gap-4]  (responsivo: cols-1 → cols-2 → cols-4)
   └─ PlatformMetricsCard ×N  (cartão Total + um por plataforma/conta retornada)
   └─ states: skeleton (4 cards), empty (sem contas conectadas), error (DataError inline)
```

States:
- skeleton: 4 blocos `Skeleton` na altura do card (h-40)
- empty: `Empty` "Nenhuma conta de anúncio conectada" + ação "Gerenciar Contas"

**`PlatformMetricsCard`** (Leaf)

Mockup:

```text
┌──────────────────────────────────────┐
│ ╭───╮  Facebook Ads                   │
│ │ f │  The Walkway · conta #1         │
│ ╰───╯                                 │
│ ────────────────────────────────────  │
│  Valor Gasto        R$ 7.968,24       │
│  CPA                R$ 0,00           │
│  Compras            0                 │
│  ROAS               0.0               │
│  Valor de Conversão R$ 0,00           │
└──────────────────────────────────────┘
```

Slots:

```text
PlatformMetricsCard
└─ Card  [primitive: Card]  [flex col gap-3 p-4]
   ├─ Header: flex row items-center gap-3
   │  ├─ PlatformIcon: rounded box com logo/letra da plataforma  [size-10]
   │  └─ TitleBlock: flex col
   │     ├─ PlatformName: text-sm font-bold  (ex.: "Total", "Facebook Ads", "Google Ads", "TikTok Ads")
   │     └─ AccountLabel: text-xs text-muted-foreground  (nome da conta/loja)  (oculto no cartão Total)
   ├─ Separator  [primitive: Separator]
   └─ MetricsList: flex col gap-2
      ├─ MetricRow "Valor Gasto": Label + Value (currency)  [flex row between]
      ├─ MetricRow "CPA": Label + Value (currency)
      ├─ MetricRow "Compras": Label + Value (integer)
      ├─ MetricRow "ROAS": Label + Value (decimal 1 casa)
      └─ MetricRow "Valor de Conversão": Label + Value (currency)
```

Variants:
- `source.kind === 'total'` → cartão Total, destacado (ex.: `border-emerald-500/40`), sem `AccountLabel`.
- `account.status === 'disconnected'` → Card com opacidade reduzida + badge "Desconectado"  [primitive: Badge].

States:
- empty: nunca vazio individualmente — métricas zeradas são exibidas como `R$ 0,00` / `0`.

**`RecommendedAppsSection`** (Section)

```text
RecommendedAppsSection
└─ root  [flex col gap-4]
   ├─ Header: flex row between
   │  ├─ Title: h2 "Aplicativos Recomendados"  [text-xl]
   │  └─ CTA: a "Deseja anunciar sua marca aqui?"  [link externo ClickUp form]  [font-bold]
   ├─ Grid  [grid grid-cols-3 gap-4]
   │  └─ RecommendedAppCard ×N
   └─ MoreToggle: "▼ Mais apps"  [primitive: Button, variant="ghost"]  (expande/colapsa grid)
```

States:
- estático (catálogo); skeleton só se a lista vier de query — ver Data Card / Open Questions.

**`RecommendedAppCard`** (Leaf)

Mockup:

```text
┌──────────────────────────────────────┐
│ [🖼]  BK Reviews                      │
│       ★ 4.8  (40.000+)      [ Visitar ]│
│ O BK Reviews facilita a importação e  │
│ exibição de avaliações de clientes…   │
└──────────────────────────────────────┘
```

Slots:

```text
RecommendedAppCard
└─ Anchor (a href=app.url target=_blank)  [primitive: Card dentro do anchor]  [grid / flex col gap-2 p-4]
   ├─ Logo: img alt=app.name  [size-10 rounded]
   ├─ Name: div font-bold  (app.name, ex.: "BK Reviews")
   ├─ RatingRow: flex row items-center gap-1
   │  ├─ Rating: span "4.8"
   │  ├─ StarIcon: svg  [lucide star]
   │  └─ ReviewsCount: span "(40.000+)"
   ├─ VisitBadge: div "Visitar" + arrow icon  [font-bold]
   └─ Description: div text-sm text-muted-foreground  (app.description)
```

States:
- skeleton: 6 cards placeholder no grid (h-32).

**`IncluirAdsManualDialog`** (Dialog / sheet)

Mockup:

```text
╔══════════════════════════════════════╗ (sheet lateral à direita)
║ Incluir Ads Manual               [×] ║
╠══════════════════════════════════════╣
║  <IncluirAdsManualForm>              ║
║                                      ║
╠══════════════════════════════════════╣
║              [ Cancelar ] [ Adicionar ]║
╚══════════════════════════════════════╝
```

Slots:

```text
IncluirAdsManualDialog
└─ Sheet  [primitive: sheet]  (side="right")
   ├─ SheetHeader
   │  ├─ Title: "Incluir Ads Manual"
   │  └─ Close: [×]  [primitive: Button, variant="ghost", size="icon"]
   ├─ SheetBody: <IncluirAdsManualForm />   (ver Form)
   └─ SheetFooter: [ Cancelar ]  [primitive: Button, variant="outline"] · [ Adicionar ]  [primitive: Button]
```

**`IncluirAdsManualForm`** (Form Type C)

Slots:

```text
IncluirAdsManualForm
└─ Form  [TanStack Form, schema = CreateManualAdInputSchema]  [flex col gap-4]
   ├─ platform: Select de plataforma (facebook/google/tiktok/outras)  [primitive: Select]
   ├─ date: data do lançamento  [primitive: DatePicker]
   ├─ value: Valor (currency)  [primitive: Input, input-group prefixo R$]
   └─ description: Descrição (texto livre)  [primitive: Textarea]
```

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| TrafficShell | RouteShell | — | reads: [period, startDate, endDate] | — | — | create-route-local | `routes/(app)/marketing/traffic/index.tsx` | /route |
| TrafficToolbar | Component | — | reads: [period], writes: [period, startDate, endDate] | useDialogStore: { writes: [show] } | — | create-route-local | `routes/(app)/marketing/traffic/-components/TrafficToolbar/index.tsx` | /component |
| TrafficSourcesSection | Section | `useGetTrafficSources({ period, startDate, endDate })` | reads: [period, startDate, endDate] | — | — | create-route-local | `routes/(app)/marketing/traffic/-components/TrafficSourcesSection/index.tsx` | /component |
| PlatformMetricsCard | Leaf | props from TrafficSourcesSection | — | — | — | create-route-local | `routes/(app)/marketing/traffic/-components/TrafficSourcesSection/PlatformMetricsCard/index.tsx` | /component |
| RecommendedAppsSection | Section | `useListRecommendedApps()` | — | — | [isExpanded] | create-route-local | `routes/(app)/marketing/traffic/-components/RecommendedAppsSection/index.tsx` | /component |
| RecommendedAppCard | Leaf | props from RecommendedAppsSection | — | — | — | create-route-local | `routes/(app)/marketing/traffic/-components/RecommendedAppsSection/RecommendedAppCard/index.tsx` | /component |
| IncluirAdsManualDialog | Dialog | — | — | useDialogStore | — | create-route-local | `routes/(app)/marketing/traffic/-components/IncluirAdsManualDialog/index.tsx` | /component |
| IncluirAdsManualForm | Form | `useCreateManualAd()` (mutation) | — | — | TanStack Form state | create-route-local | `routes/(app)/marketing/traffic/-components/IncluirAdsManualDialog/IncluirAdsManualForm.tsx` | /form |

**Per-node notes:**

- **TrafficToolbar:** ARIA: botão "Incluir Ads Manual" `aria-haspopup="dialog"`; ação dispara `useDialogStore.show(<IncluirAdsManualDialog />)`. "Gerenciar Contas" abre o fluxo de contas (ver Open Questions). "Atualizar" invalida as queries das Sections via `queryClient.invalidateQueries`.
- **TrafficSourcesSection:** Skeleton: 4 cards `Skeleton` (h-40). Empty: `Empty` "Nenhuma conta de anúncio conectada" com CTA "Gerenciar Contas". Error: `DataError` inline. ARIA: `role="list" aria-label="Fontes de tráfego"`. É a raiz de dados da região de plataformas (toolbar period + cartões). Rationale: domínio de tráfego, sem paralelo em outras rotas.
- **PlatformMetricsCard:** Cada card corresponde ao grupo `… ×N (repeated siblings)` (no snapshot: cartão Total + Facebook + Google + TikTok). Recebe `source` via prop; não refaz fetch.
- **RecommendedAppsSection:** Skeleton: 6 cards placeholder. Catálogo possivelmente estático/CMS — ver Open Questions sobre origem. `isExpanded` controla "Mais apps".
- **RecommendedAppCard:** Cada card é o grupo `… ×3 (repeated siblings)` aninhado no grid de apps. Link externo `target="_blank" rel="noreferrer"`.
- **IncluirAdsManualDialog:** Drawer mapeado ao primitivo `sheet` (side="right") conforme nota de rota. Aberto via `useDialogStore.show`; nunca recebe `open`/`onOpenChange`.
- **IncluirAdsManualForm:** Validators do schema `CreateManualAdInputSchema` (SDK). Submete via `useCreateManualAd`; em sucesso fecha o sheet e invalida `useGetTrafficSources`.

### Reuse Summary

- **Reuse (no work):** primitivos `Card`, `Button`, `Badge`, `Separator`, `Select`, `Input`, `input-group`, `Textarea`, `DatePicker`, `Empty`, `Skeleton`, `sheet` (drawer), `tooltip` — todos em `@/components/ui/`. `Navbar` e `Header` compartilhados em `@/components/` (não redesenhados). `DataError` em `@/components/`.
- **Promote to shared:** nenhum nó qualifica hoje (sem segundo consumidor confirmado).
- **Create new shared:** nenhum — todos os nós são acoplados ao domínio de tráfego/marketing.
- **Create route-local:** `TrafficToolbar`, `TrafficSourcesSection`, `PlatformMetricsCard`, `RecommendedAppsSection`, `RecommendedAppCard`, `IncluirAdsManualDialog`, `IncluirAdsManualForm` — todos sob `routes/(app)/marketing/traffic/-components/`.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | TrafficShell | `routes/(app)/marketing/traffic/index.tsx` | URL contract period/startDate/endDate |
| 2 | /component | TrafficToolbar | `routes/(app)/marketing/traffic/-components/TrafficToolbar/` | escreve period na URL; abre dialog |
| 3 | /component | TrafficSourcesSection | `routes/(app)/marketing/traffic/-components/TrafficSourcesSection/` | owns useGetTrafficSources |
| 4 | /component | PlatformMetricsCard | `…/TrafficSourcesSection/PlatformMetricsCard/` | Leaf ×N |
| 5 | /component | RecommendedAppsSection | `routes/(app)/marketing/traffic/-components/RecommendedAppsSection/` | owns useListRecommendedApps |
| 6 | /component | RecommendedAppCard | `…/RecommendedAppsSection/RecommendedAppCard/` | Leaf ×N |
| 7 | /component | IncluirAdsManualDialog | `routes/(app)/marketing/traffic/-components/IncluirAdsManualDialog/` | sheet; useDialogStore |
| 8 | /form | IncluirAdsManualForm | `…/IncluirAdsManualDialog/IncluirAdsManualForm.tsx` | Type C; useCreateManualAd |

> Observação: esta tela **não** apresenta gráficos no snapshot atual (apenas cartões de métricas e listas), portanto **não** é necessário um passo `/primitive` para Chart. Caso uma futura visualização de série temporal seja adicionada à região de tráfego, abrir `/primitive Chart` antes da Section consumidora.

### Open Questions

- OQ-1. "Gerenciar Contas" — destino não capturado no snapshot. Proposta: navega para sub-rota `/app/marketing/traffic/accounts` OU abre um `ManageAccountsDialog` (sheet) com OAuth de Facebook/Google/TikTok. Precisa de decisão do operador.
- OQ-2. Origem dos "Aplicativos Recomendados" — catálogo estático embutido no front vs. query de BFF/CMS. Proposta: `useListRecommendedApps` (query nova). Se estático, vira constante local e a Section vira Component sem fetch.
- OQ-3. Cartão Total vs. cartões de plataforma — confirmar se o primeiro cartão é o agregado "Total" (sugerido pelo draft anterior) e se os demais são uma plataforma cada (Facebook/Google/TikTok/Outras) ou contas dentro de plataforma, para fixar a chave do `.map()`.

## Controller Contract

> Consome os schemas de [`_schema-fundamentals.md`](../../_schema-fundamentals.md)
> (`MetricSchema`, `Money`, `Currency`, `MarketingPlatform`, `AdsByPlatformSchema`).
> Aplica os princípios: **um controller por preocupação** e **dados, não apresentação**
> — sem `platformLabel`, `iconUrl`, `reviewsLabel` (texto pré-formatado) nem `href`/`label`/`color`;
> o frontend deriva rótulo, ícone e link do enum `MarketingPlatform` + mapas i18n.
> Métricas viram `MetricSchema { value, deltaPct }`; valores monetários são `Money`.

### Queries

| Controller | Metodo + Path | Componente(s) consumidor(es) | Quando carrega |
|---|---|---|---|
| `GetTrafficSources` (novo) | `GET /ui/bkdash/marketing/traffic/sources` | `TrafficSourcesSection` | No mount e a cada mudança de `period/startDate/endDate`; reexecuta no "Atualizar" |
| `ListRecommendedApps` (novo, compartilhado) | `GET /ui/bkdash/recommended-apps` | `RecommendedAppsSection` | No mount (cacheável; catálogo) |
| `GetUserInfo` (existente) | `GET /ui/bkdash/user-info` | `Header` (shared) | No mount do shell |
| `ListNotifications` (existente) | `GET /ui/bkdash/notifications` | `Header` (shared) | No mount / SSE |

### Commands

| Controller | Metodo + Path | Componente | Payload (campos — sem apresentação) |
|---|---|---|---|
| `CreateManualAd` (novo) | `POST /ui/bkdash/marketing/traffic/manual-ads` | `IncluirAdsManualForm` | `platform` (`MarketingPlatform`), `date` (ISO date), `value` (`Money`), `description?` (string) |

### Response Schemas (sketch)

```ts
import {
  MetricSchema, Money, Currency,
  MarketingPlatform, AdsByPlatformSchema, ListRecommendedAppsOutputSchema,
} from '@ui/schemas' // ver _schema-fundamentals.md

// Cinco métricas por fonte de tráfego — cada uma é um Metric { value, deltaPct }.
// As unidades (R$, contagem, decimal) NÃO entram no schema: o frontend formata por contexto.
// Schema LOCAL desta tela (composição das 5 KPIs de mídia paga).
export const TrafficMetricsSchema = z.object({
  spend:           MetricSchema, // "Valor Gasto" (frontend formata como Money)
  cpa:             MetricSchema, // "CPA"
  purchases:       MetricSchema, // "Compras"
  roas:            MetricSchema, // "ROAS"
  conversionValue: MetricSchema, // "Valor de Conversão"
})

// GetTrafficSources — região "Fontes de Tráfego" (cartão Total + cartões por plataforma).
// 'period' é estado de URL derivado pelo Header/toolbar; não retorna rótulo formatado.
export const GetTrafficSourcesOutputSchema = z.object({
  total: TrafficMetricsSchema,                          // cartão "Total" consolidado
  byPlatform: z.record(MarketingPlatform, z.object({    // Record<MarketingPlatform, …> (#3/#4)
    accountId: z.string(),                              // identidade externa real da conta
    accountName: z.string(),                            // nome da conta/loja (dado, não label da plataforma)
    connected: z.boolean(),                             // dado: frontend deriva badge "Desconectado"/opacidade
    metrics: TrafficMetricsSchema,
  })),
  // 'spend' por plataforma também é expressável como AdsByPlatformSchema (segmented(MarketingPlatform))
  // quando só interessa o gasto consolidado + segmentos; aqui guardamos as 5 métricas por card.
})

// ListRecommendedApps usa o ListRecommendedAppsOutputSchema COMPARTILHADO dos fundamentos
// (ver _schema-fundamentals.md): { items: RecommendedAppSchema[], advertiseUrl }. Não redefinir aqui.
```

```ts
// CreateManualAd — input do drawer "Incluir Ads Manual" (Money + MarketingPlatform)
export const CreateManualAdInputSchema = z.object({
  platform: MarketingPlatform,        // facebook | google | tiktok
  date: z.string(),                   // ISO date do lançamento
  value: Money,                       // valor gasto (na moeda do contexto)
  description: z.string().optional(),
})
```

### Reaproveitamento de Controllers

- **Existentes (reutilizar):** `GetUserInfo` e `ListNotifications` (consumidos pelo `Header` compartilhado); `ListenEvents` (SSE) se "Atualizar" precisar de push em tempo real.
- **Novos (criar):** `GetTrafficSources` (KPIs de mídia paga por `MarketingPlatform` + total) e `CreateManualAd` (command do drawer de lançamento manual, com `Money` + `MarketingPlatform`).
- **Compartilhados:** `ListRecommendedApps` é o mesmo controller do dashboard (`GET /ui/bkdash/recommended-apps`) — reusar o `ListRecommendedAppsOutputSchema` daquele contrato em vez de redefinir (ver OQ-2; pode virar constante local se estático).
