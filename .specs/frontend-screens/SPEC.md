# Rota /app — Dashboard (/app)

## Visao Geral

A rota `/app` e o painel principal do BK Dash: a tela mais rica do produto, consolidando
em uma unica visao todos os indicadores financeiros e operacionais da loja para o periodo e
moeda selecionados no `Header` compartilhado. Ela exibe Stats primarios (Lucro, Faturamento,
Custos Totais, Taxas, Margem), um funil de conversao baseado em eventos do Pixel, blocos de
custos (Anuncios, Custos Adicionais, C. de Produto, Custos Operacionais, Garantia), resumo de
pedidos (Pedidos, Ticket Medio, Unidades Vendidas), metricas de anuncio (CPA, ROI, ROAS), meta
de faturamento, grafico configuravel (por tipo de visao e por modo barra/linha), ranking de
produtos, distribuicao de custos (donut) e secoes promocionais (download do app, banners e
aplicativos recomendados).

Quase toda a leitura vem de um unico query consolidado (`GetDashboard`, ja existente porem hoje
um stub a ser refinado), refletindo o padrao de dashboard unificado. O ecra possui 44 snapshots
de estado: a maioria sao tooltips de hover que revelam o detalhamento de cada valor (campos do
response) e drawers (sheets) que abrem formularios — Meta de Faturamento (criar/editar), Garantia
(editar), Custo Operacional (adicionar), instalacao de Pixel — alem de menus do `Header`
(seletor de loja, moeda, filtro de produto, range de data) e do seletor de tipo de grafico. O
`Navbar` (rail de icones a esquerda) e o `Header` (barra superior) sao compartilhados por todas
as telas `(app)` e nao sao redesenhados aqui.

## Inventario de Estados

| Arquivo HTML | Estado / Interacao | Citizen afetado |
|---|---|---|
| `app.html` | Estado base (single store, sem meta cadastrada, sem pixel em alguns casos) | RouteShell + todas as Sections |
| `app-2.html` | Variacao base (outro periodo/loja) | StatCardsSection, AdsSection, OrdersSummarySection |
| `app-3.html` | Variacao base (outro periodo/loja) | mesmas Sections |
| `app_aberto-drawer-de-criação-de-meta-de-faturamento.html` | Drawer criar meta aberto | CreateGoalDrawer + GoalForm |
| `app_aberto-o-drawer-de-edição-de-meta-de-faturamento.html` | Drawer editar meta aberto | EditGoalDrawer + GoalForm |
| `app_clicado-no-botao-de-editar-meta-de-faturamento.html` | Clique em editar meta (abre drawer) | GoalSection -> EditGoalDrawer |
| `app_meta-de-faturamento-cadastrada.html` | Meta cadastrada (estado preenchido) | GoalSection |
| `app_clicado-em-na-garantia.html` | Drawer editar garantia aberto | WarrantyDrawer + WarrantyForm |
| `app_clicado-no-botao-de-em-custo-operacional.html` | Drawer adicionar custo operacional | OperationalCostDrawer + OperationalCostForm |
| `app_botao-de-instalacao-de-pixel-clicado.html` | Drawer/dialog instalacao do Pixel | PixelInstallDrawer |
| `app_sem-instalacao-de-pixel.html` | Funil sem pixel (CTA "instalar Pixel") | FunnelSection (variant empty) |
| `app_clicado-selector-de-tipo-de-grafico.html` | Menu de tipo de grafico aberto (6 opcoes) | ChartTypeSelector |
| `app_selecionado-grafico-faturamento-por-turno.html` | Grafico: Faturamento por Turno | RevenueChartSection |
| `app_selecionado-grafico-vendas-por-dia-da-semana.html` | Grafico: Vendas por Dia da Semana | RevenueChartSection |
| `app_selecionado-grafico-vendas-por-hora.html` | Grafico: Vendas por Hora | RevenueChartSection |
| `app_selecionado-grafico-vendas-por-regiao.html` | Grafico: Vendas por Regiao | RevenueChartSection |
| `app_selecionado-modo-de-grafico-de-linhas-em-vez-de-barra.html` | Toggle modo linha vs barra | ChartModeToggle |
| `app_hoverado-uma-barra-do-grafico.html` | Tooltip de barra do grafico | RevenueChartSection (tooltip) |
| `app_hoverando-barra-do-grafico-de-pixel.html` | Tooltip de barra do funil | FunnelSection (tooltip) |
| `app_clicado-na-selecao-de-todas-as-lojas.html` | Menu seletor de loja (busca + lista) | Header (shared) — StoreSelector |
| `app_hoverado-circulo-com-o-nome-da-loja-no-canto-superior-esquerdo.html` | Hover no avatar da loja | Header (shared) |
| `app_clicado-em-selecionar-moeda.html` | Menu seletor de moeda | Header (shared) — CurrencySelector |
| `app_clicado-em-filtrar-produto.html` | Popover filtro de produto | Header (shared) — ProductFilter |
| `app_clicado-em-data.html` | Popover range de data | Header (shared) — DateRangePicker |
| `app_clicado-no-icone-de-megafone.html` | Painel de notificacoes | Header (shared) — Notifications |
| `app_clicado-no-icone-de-engrenagem.html` | Menu de configuracoes/perfil | Header (shared) |
| `app_dashboard-multi-lojas.html` | Modo consolidado multi-lojas (cards por loja) | StatCardsSection (variant multi-store) |
| `app_navbar-aberta-multilojas.html` | Navbar expandida, multi-lojas | Navbar (shared) |
| `app_navbar-aberta.html` | Navbar expandida | Navbar (shared) |
| `app_dashboard-modo-nacional-selecionado.html` | Modo nacional selecionado | Header (shared) + StatCardsSection |
| `app_hoverado-custo-total-dashboard-multilojas.html` | Tooltip custos totais (multi-loja) | StatCardsSection (tooltip) |
| `app_hoverando-o-icone-de-info-dos-custos-totais.html` | Tooltip info Custos Totais | StatCard (tooltip) |
| `app_hoverando-taxas.html` | Tooltip Taxas (gateway/checkout/chargeback) | StatCard (tooltip) |
| `app_hoverando-icone-info-margem.html` | Tooltip info Margem | StatCard (tooltip) |
| `app_hoverado-icone-de-info-roi.html` | Tooltip info ROI | AdsMetricCard (tooltip) |
| `app_hoverado-icone-de-info-roas.html` | Tooltip info ROAS | AdsMetricCard (tooltip) |
| `app_hoverado-icone-info-ticket-medio.html` | Tooltip info Ticket Medio | OrdersSummarySection (tooltip) |
| `app_hoverado-texto-da-caixa-de-anuncios.html` | Tooltip Anuncios (por plataforma/tipo) | AdsSection (tooltip) |
| `app_hoverado-no-texto-impostos-no-bloco-custos-adicionais.html` | Tooltip Impostos | AdditionalCostsSection (tooltip) |
| `app_hoverado-no-texto-operacional-na-daixa-de-custos-adicionais.html` | Tooltip Operacional | AdditionalCostsSection (tooltip) |
| `app_hoverando-texto-chargeback-do-bloco-de-custos-adicionais.html` | Tooltip Chargeback | AdditionalCostsSection (tooltip) |
| `app_hoverado-texto-custo-de-produto.html` | Tooltip C. de Produto (produto/frete) | ProductCostCard (tooltip) |
| `app_hoverado-valor-de-custos-adicionais.html` | Tooltip valor Custos Adicionais | AdditionalCostsSection (tooltip) |
| `app_clicado-em-mostrar-mais-apps-na-secao-de-aplicativos-recomendados.html` | Expandir "mostrar mais apps" | RecommendedAppsSection |

## UI Composition

### URL Contract

- **Path:** `/app`
- **Breadcrumb:** `Dashboard`
- **Search params (Zod sketch):**
  - `startDate` — `string (ISO datetime)` — inicio do range (lido/escrito pelo `Header`, consumido pelo dashboard)
  - `endDate` — `string (ISO datetime)` — fim do range
  - `storeId` — `string | "all"` — loja selecionada ou consolidado multi-loja
  - `currency` — `enum("BRL","USD","EUR")` — moeda de exibicao
  - `productId` — `string | undefined` — filtro de produto (opcional)
  - `mode` — `enum("international","national")` — modo consolidado nacional vs internacional
  - `chartType` — `enum("revenue","revenueByShift","salesByWeekday","salesByHour","salesByRegion", ...)` — tipo do grafico
  - `chartMode` — `enum("bar","line")` — modo de visualizacao do grafico
- **Loader (if any):** nenhum loader bloqueante; o `Header` resolve `storeId`/`currency` default a partir do `GetUserInfo`. As Sections fazem suas proprias queries.
- **errorComponent:** `RouteError` (default)

### ASCII Layout Map

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Navbar (shared, left rail)  │  Header (shared: store · date · currency · product)   │
├──────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ AlertsSection ──────────────────────────────────────────────────────────────┐  │
│ │ AlertBanner (Leaf ×N) — "Reconecte o perfil…"                                  │  │
│ └────────────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ StatCardsSection ──────────────────────────────────────────────────────────────┐  │
│ │ StatCard (Leaf ×5: Lucro · Faturamento · Custos · Taxas · Margem)         │  │
│ └────────────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ FunnelSection ────────────────┐ ┌─ OrdersSummarySection ──────────────────────┐ │
│ │ FunnelStep (Leaf ×5)            │ │ OrderStatCard (Leaf ×3)                     │ │
│ │ FunnelHighlightCard (Leaf ×2)   │ └─────────────────────────────────────────────┘ │
│ │ (PixelInstallCta — variant)     │ ┌─ AdsSection ────────────────────────────────┐ │
│ └─────────────────────────────────┘ │ AdsMetricCard (Leaf ×4: Anúncios·CPA·ROI·ROAS)│ │
│ ┌─ AdditionalCostsSection ───────┐ └─────────────────────────────────────────────┘ │
│ │ AdditionalCostRow (Leaf ×5)     │ ┌─ GoalSection ───────────────────────────────┐ │
│ │ DiscountToggle                  │ │ GoalCard / "Nenhuma meta cadastrada"        │ │
│ │ (Garantia row → drawer)         │ └─────────────────────────────────────────────┘ │
│ └─────────────────────────────────┘ ┌─ ProductCostCard ───────────────────────────┐ │
│                                       │ "C. de Produto R$ 10.920,51"                │ │
│                                       └─────────────────────────────────────────────┘ │
│ ┌─ RevenueChartSection ──────────────────────────────────────────────────────────┐  │
│ │ ChartTypeSelector   ChartModeToggle           RevenueChartCanvas                │  │
│ └────────────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ RankingSection ───────────────────────────┐ ┌─ CostDistributionSection ────────┐  │
│ │ RankingProductRow (Leaf ×N) · [Ver Tudo]   │ │ donut + CostLegendRow (Leaf ×9)  │  │
│ └─────────────────────────────────────────────┘ └──────────────────────────────────┘ │
│ ┌─ AppDownloadSection ───────────────────────┐ ┌─ SponsorBannerCarousel ──────────┐  │
│ │ QR + Android/iOS buttons                   │ │ BannerSlide (Leaf ×6)            │  │
│ └─────────────────────────────────────────────┘ └──────────────────────────────────┘ │
│ ┌─ RecommendedAppsSection ─────────────────────────────────────────────────────────┐ │
│ │ RecommendedAppCard (Leaf ×N)                                                      │ │
│ └────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘

Overlays:
  CreateGoalDrawer (Dialog/sheet)        ── abre em "Cadastrar Meta" (GoalSection, sem meta)
  EditGoalDrawer (Dialog/sheet)          ── abre no botao editar (GoalSection, com meta)
  WarrantyDrawer (Dialog/sheet)          ── abre na linha "Garantia" (AdditionalCostsSection)
  OperationalCostDrawer (Dialog/sheet)   ── abre na linha "Operacional" (AdditionalCostsSection)
  PixelInstallDrawer (Dialog/sheet)      ── abre em "Saiba como instalar o Pixel" (FunnelSection)
  ConfirmDeleteGoalDialog (Dialog)       ── abre em deletar meta (EditGoalDrawer / GoalSection)
```

### Component Tree

```text
DashboardRoute                                               (Route Shell)
├─ AlertsSection                                             (Section, owns alerts data via GetDashboard)
│  └─ AlertBanner                                            (Leaf ×N)
├─ StatCardsSection                                           (Section, owns Stat region of GetDashboard)
│  └─ StatCard                                          (Leaf ×5; +tooltip de detalhamento)
├─ FunnelSection                                             (Section, owns funnel region)
│  ├─ FunnelStep                                             (Leaf ×5)
│  ├─ FunnelHighlightCard                                    (Leaf ×2: Taxa de Conversão, Carrinhos)
│  └─ PixelInstallCta                                        (Component, variant sem pixel → abre drawer)
├─ OrdersSummarySection                                      (Section, owns orders summary region)
│  └─ OrderStatCard                                          (Leaf ×3: Pedidos, Ticket Médio, Unidades)
├─ AdsSection                                                (Section, owns ads region)
│  └─ AdsMetricCard                                          (Leaf ×4: Anúncios, CPA, ROI, ROAS)
├─ AdditionalCostsSection                                    (Section, owns additional-costs region)
│  ├─ AdditionalCostRow                                      (Leaf ×5: Chargeback, Reembolso, Impostos, Operacional, Garantia)
│  └─ DiscountToggle                                         (Component, checkbox "Descontar Custos Adicionais")
├─ GoalSection                                               (Section, owns goal data via GetDashboard.goal)
├─ ProductCostCard                                           (Component, "C. de Produto" + tooltip)
├─ RevenueChartSection                                       (Section, orquestra selector + toggle + canvas)
│  ├─ ChartTypeSelector                                      (Component, menu 6 tipos → URL chartType)
│  ├─ ChartModeToggle                                        (Component, bar/line → URL chartMode)
│  └─ RevenueChartCanvas                                     (Component, render do grafico + tooltip)
├─ RankingSection                                            (Section, owns ranking region)
│  └─ RankingProductRow                                      (Leaf ×N) + link "Ver Tudo" → /app/products
├─ CostDistributionSection                                   (Section, owns cost-distribution region)
│  └─ CostLegendRow                                          (Leaf ×9)
├─ AppDownloadSection                                        (Component, QR + lojas, estatico)
├─ SponsorBannerCarousel                                     (Component, carrossel)
│  └─ BannerSlide                                            (Leaf ×6)
└─ RecommendedAppsSection                                    (Section, owns recommended apps)
   └─ RecommendedAppCard                                     (Leaf ×N)

Overlays:
├─ CreateGoalDrawer                                          (Dialog/sheet, route-local) → GoalForm
├─ EditGoalDrawer                                            (Dialog/sheet, route-local) → GoalForm
├─ WarrantyDrawer                                            (Dialog/sheet, route-local) → WarrantyForm
├─ OperationalCostDrawer                                     (Dialog/sheet, route-local) → OperationalCostForm
├─ PixelInstallDrawer                                        (Dialog/sheet, route-local)
└─ ConfirmDeleteGoalDialog                                   (Dialog, reuse confirm-dialog)
```

### Component Anatomy

**`AlertsSection`** (Section)

```text
AlertsSection
└─ div  [grid gap-1rem]
   └─ AlertBanner (Leaf ×N)  — ver anatomia abaixo
```

States:
- empty: secao nao renderiza quando nao ha alertas

**`AlertBanner`** (Leaf ×N)

Mockup:

```text
┌────────────────────────────────────────────────────────────┐
│ [!] Reconecte o perfil: Raissa Lourenço          [Resolver] │
└────────────────────────────────────────────────────────────┘
```

Slots:

```text
AlertBanner
└─ Card  [primitive: Card]  [flex row items-center gap-3, border-l warning]
   ├─ IconBadge: icone de alerta  [lucide]
   ├─ Message: texto do alerta  (alert.message)
   └─ Action: link  [primitive: Button asChild]  (alert.actionLabel → alert.actionHref)
```

**`StatCardsSection`** (Section)

```text
StatCardsSection
└─ div  [grid grid-cols-5 gap-4]  (em multi-loja vira grid de cards por loja)
   └─ StatCard (Leaf ×5)
```

Variants:
- `mode === multi-store` → cada celula vira um card por loja (`app_dashboard-multi-lojas`)
- `mode === national` → consolida valores no modo nacional (`app_dashboard-modo-nacional-selecionado`)

States:
- skeleton: 5 blocos `Skeleton` na grade

**`StatCard`** (Leaf ×5)

Mockup:

```text
┌──────────────────────────────────┐
│ ╭───╮  Lucro                  (i) │
│ │ $ │  R$ 12.087,41  ▼ -41%      │
│ ╰───╯                            │
└──────────────────────────────────┘
```

Slots:

```text
StatCard
└─ Card  [primitive: Card]  [flex row items-center gap-3 p-4]
   ├─ IconBadge: rounded size-10 bg-metric.color/10
   │  └─ Icon  [lucide]
   ├─ Body: [flex col gap-1, flex-1]
   │  ├─ LabelRow: Label + InfoIcon  [primitive: Tooltip] (detalhamento ao hover)
   │  ├─ Value: text-2xl font-bold  (formatado por moeda)
   │  └─ Delta: text-xs fg-success/fg-danger + seta  (metric.deltaPct)
   └─ Action (apenas Taxas): link "engrenagem" → /app/settings/taxesAndFees  [primitive: Button]
```

Variants:
- `metric.selected` → fundo `bg-emerald-500/10` (Stat primario destacado)
- `metric.delta === 0` → Delta oculto
Tooltips (revelados nos states de hover):
- Custos Totais (i) → texto: "Soma de Anuncios + Produto + Taxas + Custos Adicionais"
- Taxas → linhas "Taxa Gateway Variável", "Gateway Fixo", "Checkout", "Chargeback" (`fees.breakdown`)
- Margem (i) → explicacao do calculo da margem

**`FunnelSection`** (Section)

```text
FunnelSection
└─ Card  [primitive: Card]  [grid]
   ├─ FunnelStep (Leaf ×5)
   ├─ FunnelHighlightCard (Leaf ×2)
   └─ PixelInstallCta  (variant: so quando pixel nao instalado)
```

States:
- empty (sem pixel): mostra `PixelInstallCta` "Saiba como instalar o Pixel" (`app_sem-instalacao-de-pixel`)

**`FunnelStep`** (Leaf ×5)

Mockup:

```text
┌──────────────────────────────────┐
│ Page View                         │
│ 100,0%   2.542 de 2.542   ▓▓▓▓▓▓ │
└──────────────────────────────────┘
```

Slots:

```text
FunnelStep
└─ div  [grid]
   ├─ Label: nome do evento  (step.label, ex. "Add to Cart")
   ├─ Percent: text bold  (step.pct)
   ├─ Count: "183 de 2.542"  (step.count / step.base)
   └─ Bar: barra proporcional  [bg-blue]  (+ tooltip ao hover → app_hoverando-barra-do-grafico-de-pixel)
```

**`FunnelHighlightCard`** (Leaf ×2)

Mockup:

```text
┌──────────────────────────────────┐
│ (i) Taxa de Conversão             │
│ 2,0%                     ▼ -5,1%  │
└──────────────────────────────────┘
```

Slots:

```text
FunnelHighlightCard
└─ Card  [primitive: Card]  [flex col]
   ├─ LabelRow: Icon + Label + InfoIcon  [primitive: Tooltip]
   └─ ValueRow: Value text-2xl + Delta fg-success/fg-danger
```

**`OrdersSummarySection`** (Section)

```text
OrdersSummarySection
└─ Card  [primitive: Card]  [grid grid-cols-3]
   └─ OrderStatCard (Leaf ×3)
```

**`OrderStatCard`** (Leaf ×3)

Mockup:

```text
┌──────────────────────────────────┐
│ 🛒 Pedidos        Todos com Custo→│
│ 50                       ▼ -40%   │
└──────────────────────────────────┘
```

Slots:

```text
OrderStatCard
└─ Card  [primitive: Card]  [flex col gap-1]
   ├─ Header: IconBadge + Label + (opcional link "Todos com Custo" → /app/orders?startDate&endDate)
   ├─ Value: text-2xl font-bold  (formatado por moeda quando aplicavel)
   └─ Delta: fg-success/fg-danger + seta  ; LabelRow pode ter InfoIcon [primitive: Tooltip] (Ticket Médio)
```

**`AdsSection`** (Section)

```text
AdsSection
└─ Card  [primitive: Card]  [grid grid-cols-4]
   └─ AdsMetricCard (Leaf ×4)
```

States:
- tooltip Anuncios → por plataforma (Facebook/Google/TikTok) + por tipo (Automático/Manual/Imposto) (`app_hoverado-texto-da-caixa-de-anuncios`)

**`AdsMetricCard`** (Leaf ×4)

Mockup:

```text
┌──────────────────────────────────┐
│ 📢 ROAS                       (i) │
│ 4.12                      ▼ -3%   │
└──────────────────────────────────┘
```

Slots:

```text
AdsMetricCard
└─ Card  [primitive: Card]  [flex row items-center gap-3 p-4]
   ├─ IconBadge: rounded size-10  └─ Icon [lucide]
   ├─ Body: LabelRow (Label + InfoIcon [primitive: Tooltip] em ROI/ROAS) + Value + Delta
   └─ Action (Anúncios/CPA/ROI/ROAS): botao info  [primitive: Button ghost]
```

Tooltips: ROI (`app_hoverado-icone-de-info-roi`), ROAS (`app_hoverado-icone-de-info-roas`).

**`AdditionalCostsSection`** (Section)

```text
AdditionalCostsSection
└─ Card  [primitive: Card]  [flex col gap-2]
   ├─ Header: "Custos Adicionais" + Value text-2xl  (+ tooltip valor → app_hoverado-valor-de-custos-adicionais)
   ├─ DiscountToggle  (Component)
   └─ AdditionalCostRow (Leaf ×5)
```

**`AdditionalCostRow`** (Leaf ×5)

Mockup:

```text
┌──────────────────────────────────────────┐
│ (i) Operacional               [ + ]  R$ 0 │
│ (i) Garantia                  [ + ]  R$ … │
└──────────────────────────────────────────┘
```

Slots:

```text
AdditionalCostRow
└─ div  [flex row items-center justify-between]
   ├─ LabelRow: Icon + Label  [primitive: Tooltip] (detalhamento por linha)
   ├─ AddButton (apenas Operacional e Garantia): botao "+"  [primitive: Button] → abre drawer
   └─ Value: fg-danger  (row.value formatado)
```

Tooltips: Chargeback (Aberto/Ganho/Perdido/Taxas), Reembolso, Impostos (Anúncios/Outros), Operacional (lista ou "Nenhum custo").

**`DiscountToggle`** (Component)

Mockup:

```text
[●] Descontar Custos Adicionais
```

Slots:

```text
DiscountToggle
└─ label  [flex row items-center gap-2]
   ├─ Checkbox  [primitive: Checkbox]  (aria-label="Descontar Custos Adicionais")
   └─ Text: "Descontar Custos Adicionais"
```

**`GoalSection`** (Section)

```text
GoalSection
└─ Card  [primitive: Card]  [flex col]
   ├─ Title: "Meta de Faturamento"
   ├─ Body: GoalCard (progresso) OU "Nenhuma meta cadastrada" + ilustracao
   └─ Actions: botao "Cadastrar Meta" (sem meta) | "Editar" + "Deletar" (com meta)  [primitive: Button]
```

Variants:
- sem meta → "Nenhuma meta cadastrada" + CTA Cadastrar (`app.html`)
- com meta → progresso da meta + editar/deletar (`app_meta-de-faturamento-cadastrada`)

**`ProductCostCard`** (Component)

Mockup:

```text
┌──────────────────────────────────┐
│ 📦 C. de Produto                  │
│ R$ 10.920,51             ▼ -37%   │
└──────────────────────────────────┘
```

Slots:

```text
ProductCostCard
└─ Card  [primitive: Card]  [flex row items-center gap-3 p-4]
   ├─ IconBadge + Body: Label (tooltip Produto/Frete) + Value + Delta
   └─ Action: link → /app/products/costs  [primitive: Button asChild]
```

Tooltip: C. de Produto → "Custo Produto" / "Frete" (`app_hoverado-texto-custo-de-produto`).

**`RevenueChartSection`** (Section)

```text
RevenueChartSection
└─ Card  [primitive: Card]  [flex col]
   ├─ Header: h2 + ChartTypeSelector + ChartModeToggle
   └─ Body: RevenueChartCanvas
```

**`ChartTypeSelector`** (Component)

Mockup:

```text
[ Faturamento  ▾ ]
```

Slots:

```text
ChartTypeSelector
└─ DropdownMenu  [primitive: DropdownMenu]  (aria-haspopup="menu")
   ├─ Trigger: label atual + chevron  [primitive: Button]
   └─ Items (6, menuitemcheckbox): Faturamento, Faturamento por Turno, Vendas por Dia da Semana,
      Vendas por Hora, Vendas por Região, ...  → escreve URL chartType
```

**`ChartModeToggle`** (Component)

Mockup:

```text
[ ▦ Barra ][ ⌁ Linha ]
```

Slots:

```text
ChartModeToggle
└─ ToggleGroup  [primitive: ToggleGroup]
   ├─ Item: Barra  (chartMode="bar")
   └─ Item: Linha  (chartMode="line")
```

**`RevenueChartCanvas`** (Component)

Mockup:

```text
┌──────────────────────────────────────────────┐
│  ▆   ▃   ▅   ▂   ▇   ▄        (hover → tooltip)│
│ ───────────────────────────────────────────── │
└──────────────────────────────────────────────┘
```

Slots:

```text
RevenueChartCanvas
└─ div  [Chart wrapper — NAO existe primitivo ainda]
   ├─ Bars/Line: series do tipo selecionado
   └─ Tooltip: valor da barra ao hover (`app_hoverado-uma-barra-do-grafico`)
```

States: skeleton (grafico em `Skeleton`); empty ("Sem dados no período").

**`RankingSection`** (Section)

```text
RankingSection
└─ Card  [primitive: Card]  [flex col]
   ├─ Header: "Ranking" + Value + link "Ver Tudo" → /app/products
   └─ RankingProductRow (Leaf ×N)
```

**`RankingProductRow`** (Leaf ×N)

Mockup:

```text
┌──────────────────────────────────┐
│ 1  [🖼] Produto X    R$ 1.234  ▲  │
└──────────────────────────────────┘
```

Slots:

```text
RankingProductRow
└─ div  [flex row items-center gap-3]
   ├─ Rank: posicao  ├─ Thumb: imagem  [🖼]  ├─ Name  └─ Value + Delta
```

**`CostDistributionSection`** (Section)

```text
CostDistributionSection
└─ Card  [primitive: Card]  [grid]
   ├─ Donut: grafico de rosca (centro "Faturamento")  [Chart wrapper — sem primitivo]
   └─ Legend: CostLegendRow (Leaf ×9)
```

**`CostLegendRow`** (Leaf ×9)

Mockup:

```text
■ Marketing        R$ … (xx%)
■ Produto          R$ … (xx%)
```

Slots:

```text
CostLegendRow
└─ div  [flex row items-center gap-2]
   ├─ Swatch: quadrado de cor  ├─ Label (Marketing/Produto/Frete/Taxas/Reembolso/Chargeback/Impostos/Custos Operacionais/Lucro)
   └─ ValuePct: valor + percentual
```

**`AppDownloadSection`** (Component)

Mockup:

```text
┌──────────────────────────────────┐
│ Escaneie para instalar o app      │
│        [QR Code]                  │
│ ou baixe direto da loja           │
│ [ Android ] [ iOS ]               │
└──────────────────────────────────┘
```

Slots:

```text
AppDownloadSection
└─ Card  [primitive: Card]  [flex col items-center]
   ├─ Title  ├─ QrImage [🖼]  ├─ Subtitle  └─ StoreButtons (Android/iOS)  [primitive: Button]
```

**`SponsorBannerCarousel`** (Component)

Mockup:

```text
┌──────────────────────────────────┐
│ [<]        [🖼 Banner]        [>] │
│            ● ○ ○ ○ ○ ○             │
└──────────────────────────────────┘
```

Slots:

```text
SponsorBannerCarousel
└─ div  [relative]
   ├─ PrevButton  [primitive: Button]  (aria-label="Banner anterior")
   ├─ BannerSlide (Leaf ×6)
   ├─ NextButton  [primitive: Button]
   └─ Dots: botoes de paginacao (aria-label="Ir para banner N")
```

**`BannerSlide`** (Leaf ×6)

Mockup:

```text
┌──────────────────────────────────┐
│ [🖼  Banner patrocinado]          │
└──────────────────────────────────┘
```

Slots:

```text
BannerSlide
└─ a [href externo]  └─ Image  [🖼]  (alt do banner)
```

**`RecommendedAppsSection`** (Section)

```text
RecommendedAppsSection
└─ div  [flex col]
   ├─ Header: h2 "Aplicativos Recomendados" + link "Deseja anunciar sua marca aqui?"
   └─ Grid: RecommendedAppCard (Leaf ×N)  (+ "mostrar mais")
```

**`RecommendedAppCard`** (Leaf ×N)

Mockup:

```text
┌──────────────────────────────────┐
│ [🖼] BK Reviews   4.8★ (40.000+)  │
│ O BK Reviews é um aplicativo …    │
│                        [ Visitar ]│
└──────────────────────────────────┘
```

Slots:

```text
RecommendedAppCard
└─ a [href externo]  [grid]
   ├─ Logo [🖼]  ├─ Name  ├─ Rating: nota + estrela + "(40.000+)"
   ├─ Description  └─ VisitButton "Visitar"  [primitive: Button asChild]
```

**`PixelInstallCta`** (Component)

Mockup:

```text
[ Saiba como instalar o Pixel → ]
```

Slots:

```text
PixelInstallCta
└─ Button  [primitive: Button, variant=link]  (aria-haspopup="dialog") → abre PixelInstallDrawer
```

**`CreateGoalDrawer`** (Dialog/sheet)

Mockup:

```text
╔══════════════════════════════════════╗
║ Meta de Faturamento               [×] ║
╠══════════════════════════════════════╣
║  (GoalForm)                           ║
╠══════════════════════════════════════╣
║                  [ Cadastrar Meta ]   ║
╚══════════════════════════════════════╝
```

Slots:

```text
CreateGoalDrawer
└─ Sheet  [primitive: sheet]
   ├─ Header: h1 "Meta de Faturamento" + CloseButton
   ├─ Body: GoalForm  (Type C)
   └─ Footer: submit "Cadastrar Meta"  [primitive: Button]
```

**`EditGoalDrawer`** (Dialog/sheet)

```text
EditGoalDrawer
└─ Sheet  [primitive: sheet]
   ├─ Header: h1 "Meta de Faturamento" + CloseButton
   ├─ Body: GoalForm (pre-preenchido)  (Type C)
   └─ Footer: submit "Editar Meta" + (acao deletar → ConfirmDeleteGoalDialog)
```

**`GoalForm`** (Form, Type C)

```text
GoalForm
└─ form
   ├─ value: "Meta" — Input numerico + CurrencyMenu (BRL)  [primitive: Input + DropdownMenu]
   ├─ startDate: "Data de Início da Meta"  [primitive: DatePicker]  (aria-haspopup="dialog")
   ├─ endDate: "Data de Fim da Meta"  [primitive: DatePicker]
   └─ type: "Selecione o tipo da sua meta" — Faturamento | Lucro  [primitive: RadioGroup]
```

**`WarrantyDrawer`** (Dialog/sheet)

```text
WarrantyDrawer
└─ Sheet  [primitive: sheet]
   ├─ Header: h1 "Editar Garantia" + CloseButton
   ├─ Body: WarrantyForm  (Type C)
   └─ Footer: submit "Editar Garantia"
```

**`WarrantyForm`** (Form, Type C)

```text
WarrantyForm
└─ form
   ├─ percentage: "Porcentagem de Garantia"  [primitive: Input]  (value "15,00%")
   ├─ startDate: "Data de Início da Garantia"  [primitive: DatePicker]
   └─ period: "Período" — menu "30 dias"  [primitive: Select/DropdownMenu]
```

**`OperationalCostDrawer`** (Dialog/sheet)

```text
OperationalCostDrawer
└─ Sheet  [primitive: sheet]
   ├─ Header: h1 "Adicionar Custo Operacional" + CloseButton
   ├─ Body: OperationalCostForm  (Type C) + link "Ver Custos Operacionais" → /app/finance/costs
   └─ Footer: submit "Adicionar"
```

**`OperationalCostForm`** (Form, Type C)

```text
OperationalCostForm
└─ form
   ├─ direction: "Saída"/Entrada  [primitive: RadioGroup/ToggleGroup]
   ├─ value: "Valor" — Input + CurrencyMenu (BRL)  [primitive: Input + DropdownMenu]
   ├─ description: "Descrição"  [primitive: Input]
   ├─ frequency: "Frequência" — "Selecione a frequência"  [primitive: Select]
   ├─ startDate: "Data de Início"  [primitive: DatePicker]
   └─ category: "Categoria" — "Selecione a categoria"  [primitive: Select]
```

**`PixelInstallDrawer`** (Dialog/sheet)

```text
PixelInstallDrawer
└─ Sheet  [primitive: sheet]
   ├─ Header: titulo + CloseButton
   ├─ Body: instrucoes + script copiavel  [primitive: input-group / Button "Copiar"]
   └─ Footer: acao de fechar
```

**`ConfirmDeleteGoalDialog`** (Dialog)

```text
ConfirmDeleteGoalDialog
└─ ConfirmDialog  [primitive: confirm-dialog]
   ├─ Title: "Excluir meta?"  ├─ Body: aviso
   └─ Footer: [Cancelar] [Excluir]  → DeleteGoal
```

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| DashboardRoute | RouteShell | — | reads: [startDate,endDate,storeId,currency,productId,mode,chartType,chartMode] | — | — | create-route-local | `routes/(app)/dashboard/index.tsx` | /route |
| AlertsSection | Section | useGetDashboard() -> alerts | reads: [storeId,startDate,endDate] | — | — | create-route-local | `routes/(app)/dashboard/-components/AlertsSection/` | /component |
| AlertBanner | Leaf | props from AlertsSection | — | — | — | create-route-local | `…/AlertsSection/AlertBanner/` | /component |
| StatCardsSection | Section | useGetDashboard() -> kpis | reads: [storeId,currency,startDate,endDate,mode] | — | — | create-route-local | `…/-components/StatCardsSection/` | /component |
| StatCard | Leaf | props from StatCardsSection | — | — | — | create-route-local | `…/StatCardsSection/StatCard/` | /component |
| FunnelSection | Section | useGetDashboard() -> funnel | reads: [storeId,startDate,endDate] | — | — | create-route-local | `…/-components/FunnelSection/` | /component |
| FunnelStep | Leaf | props from FunnelSection | — | — | — | create-route-local | `…/FunnelSection/FunnelStep/` | /component |
| FunnelHighlightCard | Leaf | props from FunnelSection | — | — | — | create-route-local | `…/FunnelSection/FunnelHighlightCard/` | /component |
| PixelInstallCta | Component | props (hasPixel) | — | useDialogStore | — | create-route-local | `…/FunnelSection/PixelInstallCta/` | /component |
| OrdersSummarySection | Section | useGetDashboard() -> ordersSummary | reads: [storeId,currency,startDate,endDate] | — | — | create-route-local | `…/-components/OrdersSummarySection/` | /component |
| OrderStatCard | Leaf | props from OrdersSummarySection | writes via links: [startDate,endDate] | — | — | create-route-local | `…/OrdersSummarySection/OrderStatCard/` | /component |
| AdsSection | Section | useGetDashboard() -> ads | reads: [storeId,currency,startDate,endDate] | — | — | create-route-local | `…/-components/AdsSection/` | /component |
| AdsMetricCard | Leaf | props from AdsSection | — | — | — | create-route-local | `…/AdsSection/AdsMetricCard/` | /component |
| AdditionalCostsSection | Section | useGetDashboard() -> additionalCosts | reads: [storeId,currency,startDate,endDate] | — | [discount] | create-route-local | `…/-components/AdditionalCostsSection/` | /component |
| AdditionalCostRow | Leaf | props from AdditionalCostsSection | — | useDialogStore | — | create-route-local | `…/AdditionalCostsSection/AdditionalCostRow/` | /component |
| DiscountToggle | Component | props from AdditionalCostsSection | — | — | [checked] | create-route-local | `…/AdditionalCostsSection/DiscountToggle/` | /component |
| GoalSection | Section | useGetDashboard() -> goal | — | useDialogStore | — | create-route-local | `…/-components/GoalSection/` | /component |
| ProductCostCard | Component | useGetDashboard() -> productCost | — | — | — | create-route-local | `…/-components/ProductCostCard/` | /component |
| RevenueChartSection | Section | useGetIncomeGraph() / useGetSalesBy*() (por chartType) | reads/writes: [chartType,chartMode] | — | — | create-route-local | `…/-components/RevenueChartSection/` | /component |
| ChartTypeSelector | Component | props from RevenueChartSection | writes: [chartType] | — | — | create-route-local | `…/RevenueChartSection/ChartTypeSelector/` | /component |
| ChartModeToggle | Component | props from RevenueChartSection | writes: [chartMode] | — | — | create-route-local | `…/RevenueChartSection/ChartModeToggle/` | /component |
| RevenueChartCanvas | Component | props from RevenueChartSection | — | — | — | create-route-local | `…/RevenueChartSection/RevenueChartCanvas/` | /component |
| RankingSection | Section | useGetDashboard() -> ranking | reads: [storeId,startDate,endDate] | — | — | create-route-local | `…/-components/RankingSection/` | /component |
| RankingProductRow | Leaf | props from RankingSection | — | — | — | create-route-local | `…/RankingSection/RankingProductRow/` | /component |
| CostDistributionSection | Section | useGetDashboard() -> costDistribution | reads: [storeId,startDate,endDate] | — | — | create-route-local | `…/-components/CostDistributionSection/` | /component |
| CostLegendRow | Leaf | props from CostDistributionSection | — | — | — | create-route-local | `…/CostDistributionSection/CostLegendRow/` | /component |
| AppDownloadSection | Component | useGetAppDownload() | — | — | — | create-route-local | `…/-components/AppDownloadSection/` | /component |
| SponsorBannerCarousel | Component | useGetDashboard() -> banners | — | — | [index] | create-route-local | `…/-components/SponsorBannerCarousel/` | /component |
| BannerSlide | Leaf | props from SponsorBannerCarousel | — | — | — | create-route-local | `…/SponsorBannerCarousel/BannerSlide/` | /component |
| RecommendedAppsSection | Section | useGetDashboard() -> recommendedApps | — | — | [expanded] | create-route-local | `…/-components/RecommendedAppsSection/` | /component |
| RecommendedAppCard | Leaf | props from RecommendedAppsSection | — | — | — | create-route-local | `…/RecommendedAppsSection/RecommendedAppCard/` | /component |
| CreateGoalDrawer | Dialog | useCreateGoal() | — | useDialogStore | — | create-route-local | `…/-components/CreateGoalDrawer/` | /component |
| EditGoalDrawer | Dialog | useUpdateGoal(), useDeleteGoal() | — | useDialogStore | — | create-route-local | `…/-components/EditGoalDrawer/` | /component |
| GoalForm | Form | useCreateGoal()/useUpdateGoal() | — | — | — | create-route-local | inside *GoalDrawer | /form |
| WarrantyDrawer | Dialog | useUpsertWarranty(), useGetActiveWarranty() | — | useDialogStore | — | create-route-local | `…/-components/WarrantyDrawer/` | /component |
| WarrantyForm | Form | useUpsertWarranty() | — | — | — | create-route-local | inside WarrantyDrawer | /form |
| OperationalCostDrawer | Dialog | useAddOperationalCost() | — | useDialogStore | — | create-route-local | `…/-components/OperationalCostDrawer/` | /component |
| OperationalCostForm | Form | useAddOperationalCost() | — | — | — | create-route-local | inside OperationalCostDrawer | /form |
| PixelInstallDrawer | Dialog | useGetPixelScript() | — | useDialogStore | — | create-route-local | `…/-components/PixelInstallDrawer/` | /component |
| ConfirmDeleteGoalDialog | Dialog | useDeleteGoal() | — | useDialogStore | — | reuse | `@/components/ui/confirm-dialog.tsx` | /component |

**Per-node notes:**

- **StatCardsSection:** ARIA: `role="list" aria-label="Indicadores principais"`. Skeleton: 5 cards. Variants multi-loja/nacional descritas na anatomia. O response carrega os campos de tooltip (`fees.breakdown`, texto de Custos Totais, Margem).
- **FunnelSection:** Empty (sem pixel) renderiza `PixelInstallCta`. Skeleton: 5 barras.
- **AdditionalCostsSection:** `DiscountToggle` recalcula localmente o desconto; os tooltips por linha vem de `additionalCosts.<row>.breakdown` (chargeback Aberto/Ganho/Perdido/Taxas; impostos Anúncios/Outros; operacional itens).
- **RevenueChartSection / RevenueChartCanvas / CostDistributionSection:** dependem de um wrapper `Chart` inexistente → ver Hand-off (`/primitive`). Tooltips de barra surgem em `app_hoverado-uma-barra-do-grafico`.
- **GoalSection:** ARIA nos botoes icon-only (editar/deletar). Variant sem-meta vs com-meta.
- **SponsorBannerCarousel:** ARIA: `aria-label="Banner anterior/proximo"`, dots `aria-label="Ir para banner N"`.
- **ConfirmDeleteGoalDialog:** reutiliza o primitivo `confirm-dialog` diretamente.

### Reuse Summary

- **Reuse (no work):** `ConfirmDeleteGoalDialog` (`@/components/ui/confirm-dialog.tsx`); primitivos `Card`, `Button`, `Badge`, `Tooltip`, `Checkbox`, `RadioGroup`, `ToggleGroup`, `DropdownMenu`, `Select`, `DatePicker`, `Input`, `input-group`, `sheet` (drawers), `Skeleton`, `Empty`. `Navbar` e `Header` (incl. StoreSelector, CurrencySelector, ProductFilter, DateRangePicker, Notifications) sao **shared** (`@/components/Navbar/`, `@/components/Header/`) — marcados reuse e nao redesenhados.
- **Promote to shared:** nenhum no momento — os cards de metrica sao bastante acoplados ao dominio do dashboard. (Se `orders/` futuramente exibir os mesmos Stats, `StatCard` vira candidato a promote.)
- **Create new shared:** nenhum — todas as Sections/Leaves sao acopladas ao dominio do dashboard.
- **Create route-local:** todas as Sections, Components, Leaves e Drawers/Forms listados acima (default).

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | DashboardRoute | `routes/(app)/dashboard/index.tsx` | define search params (storeId, currency, dates, chartType, chartMode) |
| 2 | /primitive | Chart (wrapper) | `@/components/ui/chart.tsx` | NAO existe primitivo de grafico — necessario para RevenueChartCanvas, donut de CostDistribution e barras do funil |
| 3 | /component | AlertsSection (+AlertBanner) | `…/-components/AlertsSection/` | |
| 4 | /component | StatCardsSection (+StatCard) | `…/-components/StatCardsSection/` | tooltips de detalhamento |
| 5 | /component | FunnelSection (+FunnelStep, FunnelHighlightCard, PixelInstallCta) | `…/-components/FunnelSection/` | |
| 6 | /component | OrdersSummarySection (+OrderStatCard) | `…/-components/OrdersSummarySection/` | |
| 7 | /component | AdsSection (+AdsMetricCard) | `…/-components/AdsSection/` | |
| 8 | /component | AdditionalCostsSection (+AdditionalCostRow, DiscountToggle) | `…/-components/AdditionalCostsSection/` | |
| 9 | /component | GoalSection | `…/-components/GoalSection/` | |
| 10 | /component | ProductCostCard | `…/-components/ProductCostCard/` | |
| 11 | /component | RevenueChartSection (+ChartTypeSelector, ChartModeToggle, RevenueChartCanvas) | `…/-components/RevenueChartSection/` | depende do passo 2 |
| 12 | /component | RankingSection (+RankingProductRow) | `…/-components/RankingSection/` | |
| 13 | /component | CostDistributionSection (+CostLegendRow) | `…/-components/CostDistributionSection/` | depende do passo 2 |
| 14 | /component | AppDownloadSection / SponsorBannerCarousel (+BannerSlide) / RecommendedAppsSection (+RecommendedAppCard) | `…/-components/` | estaticos/promo |
| 15 | /component | CreateGoalDrawer / EditGoalDrawer | `…/-components/*GoalDrawer/` | usam useDialogStore |
| 16 | /form | GoalForm | inside *GoalDrawer | Type C |
| 17 | /component | WarrantyDrawer | `…/-components/WarrantyDrawer/` | |
| 18 | /form | WarrantyForm | inside WarrantyDrawer | Type C |
| 19 | /component | OperationalCostDrawer | `…/-components/OperationalCostDrawer/` | |
| 20 | /form | OperationalCostForm | inside OperationalCostDrawer | Type C |
| 21 | /component | PixelInstallDrawer | `…/-components/PixelInstallDrawer/` | script copiavel |
| 22 | (reuse) | ConfirmDeleteGoalDialog | `@/components/ui/confirm-dialog.tsx` | ja existe |

### Open Questions

- OQ-1. Contrato de DADOS dos gráficos resolvido (espelha `GetIncomeGraph` do backend; buckets com composição de custo). Resta o **primitivo de UI** `Chart` (Recharts vs visx) para `RevenueChartCanvas`/donut/funil — decidir antes do `/primitive`.
- OQ-2. O detalhamento dos tooltips (ex. `fees.breakdown`, `ads.byPlatform`) deve vir embutido no `GetDashboard` ou em endpoints sob demanda? Proposta: embutir no response (evita N requests no hover).
- OQ-3. `OperationalCostDrawer` e `PixelInstallDrawer` referenciam fluxos de outras rotas (`/app/finance/costs`, integracao de Pixel) — confirmar se os commands vivem aqui ou nas rotas de origem.

## Controller Contract

> Consome os schemas de [`_schema-fundamentals.md`](./_schema-fundamentals.md)
> (`MetricSchema`, `KpisSchema`, `PerStoreKpisSchema`, `CostBreakdownSchema`,
> `FeesBreakdownSchema`, `AdsBreakdownSchema`, `ChargebackBreakdownSchema`, `TaxesBreakdownSchema`,
> `ProductCostBreakdownSchema`, enums `PixelEventType`/`MarketingPlatform`/`CostKind`).
> Aplica os princípios: **um controller por preocupação** e **dados, não apresentação**
> (sem `href`, `tooltip`, `label`, `color`, `editable` — o frontend deriva).

### Queries

| Controller | Método + Path | Componente(s) consumidor(es) | Quando carrega |
|---|---|---|---|
| `GetStoreInfo` (novo) | GET `/ui/bkdash/store-info` | Header (StoreSelector, boas-vindas, moeda, "atualizado há…"), AlertsSection | Ao montar; identidade da loja e lista multi-loja |
| `GetSingleStoreDashboard` (refina o `GetDashboard` atual) | GET `/ui/bkdash/dashboard` | StatCardsSection, OrdersSummarySection, AdsSection, AdditionalCostsSection, ProductCostCard, CostDistributionSection | StoreSelector numa loja específica → usa a loja da **sessão**; refaz com `startDate`/`endDate`/`productId` |
| `GetMultiStoreDashboard` (novo) | GET `/ui/bkdash/dashboard/multi-store` | (as mesmas Sections) + recorte per-loja | StoreSelector em **"Todas as lojas"** → agrega **todas as lojas integradas e ativas** do usuário |
| `GetCurrentGoal` (novo) | GET `/ui/bkdash/goals/current` | GoalSection | Ao montar; meta vigente ou `null` |
| `GetFunnel` (novo) | GET `/ui/bkdash/funnel` | FunnelSection | Ao montar; etapas do pixel |
| `GetIncomeGraph` (espelha backend) | GET `/ui/bkdash/dashboard/graphs/income` | RevenueChartSection (modo "Faturamento") | Ao montar e ao mudar `frequency`/período/`products` |
| `GetSalesByDayOfWeek` / `GetSalesByHour` / `GetSalesByDayPeriod` / `GetSalesByRegion` (novos) | GET `/ui/bkdash/dashboard/graphs/{recorte}` | RevenueChartSection (via ChartTypeSelector) | Ao selecionar o recorte no ChartTypeSelector |
| `GetProductRanking` (novo) | GET `/ui/bkdash/products/ranking` | RankingSection | Ao montar; top produtos |
| `GetBanners` (novo) | GET `/ui/bkdash/banners` | SponsorBannerCarousel | Ao montar |
| `GetAppDownload` (novo) | GET `/ui/bkdash/app-download` | AppDownloadSection | Ao montar; URL do QR (redireciona por User-Agent) + badges das lojas |
| `ListRecommendedApps` (novo, compartilhado) | GET `/ui/bkdash/recommended-apps` | RecommendedAppsSection | Ao montar |
| `GetActiveWarranty` (novo) | GET `/ui/bkdash/warranty` | WarrantyDrawer | Ao abrir o drawer de garantia |
| `GetPixelScript` (novo) | GET `/ui/bkdash/pixel/script` | PixelInstallDrawer | Ao abrir o drawer de instalação do Pixel |

> **Decomposição (feedback #3, #4, #6):** `meta`/info da loja → `GetStoreInfo` (StoreInfoController);
> a meta de faturamento → `GetCurrentGoal`; funil e gráficos → endpoints próprios (`GetFunnel`,
> `GetIncomeGraph` + recortes); banners e apps recomendados → `GetBanners` + `ListRecommendedApps`.
> O `GetDashboard` fica responsável só por Stats + custos (incl. detalhamento de tooltip), e é
> **dividido por escopo de loja** (feedback): `GetSingleStoreDashboard` (loja da sessão, mono-moeda)
> vs `GetMultiStoreDashboard` (todas as lojas ativas/integradas — agregado multi-moeda + `perStore`).

### Commands

| Controller | Método + Path | Componente | Payload (campos — sem apresentação) |
|---|---|---|---|
| `CreateGoal` (novo) | POST `/ui/bkdash/goals` | CreateGoalDrawer > GoalForm | `type` (`GoalType`), `currency` (`Currency`), `target` (Money), `startDate`, `endDate` |
| `UpdateGoal` (novo) | PATCH `/ui/bkdash/goals/:id` | EditGoalDrawer > GoalForm | `type?`, `currency?`, `target?`, `startDate?`, `endDate?` |
| `DeleteGoal` (novo) | DELETE `/ui/bkdash/goals/:id` | ConfirmDeleteGoalDialog | `id` |
| `UpsertWarranty` (novo) | POST `/ui/bkdash/warranty` | WarrantyDrawer > WarrantyForm | `percentage` (number), `startDate`, `periodDays` (number) |
| `CreateOperationalCost` (reusar de `/app/finance/costs`) | POST `/ui/bkdash/operational-costs` | OperationalCostDrawer > OperationalCostForm | ver contrato de `finance/costs` (`flow`, `frequency`, `amount`, `name`, `startDate`, `endDate?`) |

### Response Schemas (sketch)

```ts
import {
  MetricSchema, Money, StoreIntegrationId, Currency,
  KpisSchema, PerStoreKpisSchema, ConsolidatedKpisSchema,
  FeesBreakdownSchema, AdsBreakdownSchema, ProductCostBreakdownSchema,
  ChargebackBreakdownSchema, TaxesBreakdownSchema, OperationalCostsSchema,
  PixelEventType, GoalType, CurrencyAmount, TimeFrequency, ProfileAlertSchema,
  IncomeGraphSchema, SalesByDayOfWeekSchema, SalesByHourSchema, SalesByDayPeriodSchema, SalesByRegionSchema,
  ListRecommendedAppsOutputSchema,
} from '@ui/schemas' // ver _schema-fundamentals.md

// GetStoreInfo (StoreInfoController) — identidade + multi-loja (feedback #3)
export const GetStoreInfoOutputSchema = z.object({
  current: z.object({
    id: StoreIntegrationId.nullable(),       // null = visão consolidada
    name: z.string(),
    currency: Currency,
  }),
  stores: z.array(z.object({                 // StoreSelector (multi-loja)
    id: StoreIntegrationId, name: z.string(), currency: Currency,
  })),
  alerts: z.array(ProfileAlertSchema),        // AlertsSection — união discriminada por `kind` (ver fundamentals)
})

// Dashboard DIVIDIDO por escopo de loja. `details` (tooltips de custo) é o mesmo nos dois.
const DashboardDetailsSchema = z.object({       // detalhamento p/ tooltips — dados, não texto
  fees:        FeesBreakdownSchema,             // gateway.{variable,fixed} + checkout + chargeback (#2)
  ads:         AdsBreakdownSchema,              // total + byPlatform + byType + tax + cpa/roi/roas (#5) → AdsSection
  productCost: ProductCostBreakdownSchema,      // product + shipping
  // custos adicionais: uma propriedade por tipo (sem wrapper AdditionalCostsSchema)
  chargeback:  ChargebackBreakdownSchema,       // byStatus (open/won/lost) + fees
  refund:      MetricSchema,
  taxes:       TaxesBreakdownSchema,            // ads + others
  operational: OperationalCostsSchema,          // total + items tipados
})

// SINGLE STORE — usa a loja da SESSÃO (uma loja, mono-moeda). Refina o GetDashboard atual.
export const GetSingleStoreDashboardOutputSchema = z.object({
  store: z.object({ id: StoreIntegrationId, currency: Currency }), // a loja da sessão
  kpis:  KpisSchema,                            // mono-moeda. Inclui revenue/profit/margin + orders,
                                                // averageTicket, unitsSold (→ OrdersSummarySection) e
                                                // costs.{total,segments[CostKind]} = custos por categoria (→ CostDistributionSection)
  details: DashboardDetailsSchema,
})

// MULTI STORE — TODAS as lojas integradas e ATIVAS do usuário (agregado multi-moeda).
export const GetMultiStoreDashboardOutputSchema = z.object({
  kpis:     ConsolidatedKpisSchema,             // multi-moeda. Mesmos campos do KpisSchema (orders, averageTicket,
                                                // unitsSold, costs por categoria) com valores em CurrencyAmount
  perStore: PerStoreKpisSchema,                 // Record<StoreIntegrationId, KpisSchema> (cada loja mono-moeda)
  details:  DashboardDetailsSchema,             // agregado de todas as lojas
})
// CostDistributionSection (donut) é DERIVADO no frontend de kpis.costs + revenue/profit.

// GetCurrentGoal — meta de faturamento (feedback #3). Progresso derivado de kpis no frontend.
export const GetCurrentGoalOutputSchema = z.object({
  goal: z.object({
    id: z.string(),
    type: GoalType,                           // 'REVENUE' | 'PROFIT'
    currency: Currency,
    target: Money,
    startDate: z.date(),
    endDate: z.date(),
  }).nullable(),                              // null = "Nenhuma meta cadastrada"
})

// GetFunnel — usa o enum PixelEventType (feedback #4)
export const FunnelStepSchema = z.object({ count: z.number(), rate: z.number() }) // rate = fração da base
export const GetFunnelOutputSchema = z.object({
  hasPixel: z.boolean(),
  base: z.number(),                           // PageView (denominador)
  steps: z.record(PixelEventType, FunnelStepSchema),
})

// Gráfico de receita — ESPELHA o backend GetIncomeGraph (GET /dashboard/graphs/income).
// 'mode' (bar/line) é apresentação → frontend. Cada bucket já carrega a composição de custo
// (revenue/profit/marketingCost/productCost/fees/taxes em CurrencyAmount), então a barra empilhada
// e o tooltip por CostKind saem do mesmo payload — sem séries extras.
export const GetIncomeGraphInputSchema = z.object({ query: z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  frequency: TimeFrequency.optional(),    // HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY (eixo X)
  products: z.array(z.string()).optional(),
}) })
export const GetIncomeGraphOutputSchema = IncomeGraphSchema  // { data: IncomeGraphBucketSchema[] }

// Recortes analíticos do ChartTypeSelector — mesmos buckets, chaveados por enum de domínio.
// (Existem em backend-old: GetSalesByDayOfWeek/PerHour/PerDayPeriod/ByRegion — portar para o BFF.)
export const GetSalesByDayOfWeekOutputSchema = SalesByDayOfWeekSchema  // Record<DayOfWeek, bucket>
export const GetSalesByHourOutputSchema      = SalesByHourSchema       // Record<'0'..'23', bucket>
export const GetSalesByDayPeriodOutputSchema = SalesByDayPeriodSchema  // Record<DayPeriod, bucket> (turno)
export const GetSalesByRegionOutputSchema    = SalesByRegionSchema     // Record<region, { state, country, total, count }>

// GetProductRanking — top produtos (lista)
export const GetProductRankingOutputSchema = z.paginatedResponse({
  productId: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  revenue: MetricSchema,
})

// GetBanners (feedback #6). targetUrl é dado externo real.
export const GetBannersOutputSchema = z.object({
  items: z.array(z.object({ id: z.string(), imageUrl: z.string(), targetUrl: z.string() })),
})
// ListRecommendedApps usa o ListRecommendedAppsOutputSchema COMPARTILHADO dos fundamentos
// (ver _schema-fundamentals.md): { items: RecommendedAppSchema[], advertiseUrl }. Não redefinir aqui.

// GetAppDownload — QR do app BK Dash ("Escaneie para instalar o app BK Dash" + badges).
// O QR codifica `qrRedirectUrl`: um endpoint que faz 302 para a loja que CORRESPONDE ao
// User-Agent do device que escaneia (iOS → App Store, Android → Google Play). Os badges
// "iOS"/"Android" usam as URLs diretas.
export const GetAppDownloadOutputSchema = z.object({
  qrRedirectUrl: z.string(),   // alvo do QR; resolve a loja por User-Agent no backend
  iosUrl: z.string(),          // badge App Store
  androidUrl: z.string(),      // badge Google Play
})

// GetActiveWarranty / GetPixelScript
export const GetActiveWarrantyOutputSchema = z.object({
  warranty: z.object({ id: z.string(), percentage: z.number(), startDate: z.date(), periodDays: z.number() }).nullable(),
})
export const GetPixelScriptOutputSchema = z.object({
  installed: z.boolean(), script: z.string(), steps: z.array(z.string()),
})
```

### Reaproveitamento de Controllers

- **Existentes (reutilizar):** `GetDashboard` (GET `/dashboard`) — hoje stub `{ userId, welcome }`; **dividir** em `GetSingleStoreDashboard` (mantém o path `/dashboard`, loja da sessão) e `GetMultiStoreDashboard` (`/dashboard/multi-store`, todas as lojas ativas). `GetUserInfo`/`ListNotifications` alimentam o `Header` compartilhado. `ListOrders` é consumido indiretamente (navegação para `/app/orders`).
- **Novos (criar):** queries `GetStoreInfo`, `GetMultiStoreDashboard`, `GetCurrentGoal`, `GetFunnel`, `GetIncomeGraph`, `GetSalesByDayOfWeek`, `GetSalesByHour`, `GetSalesByDayPeriod`, `GetSalesByRegion`, `GetProductRanking`, `GetBanners`, `GetAppDownload`, `ListRecommendedApps`, `GetActiveWarranty`, `GetPixelScript`; commands `CreateGoal`, `UpdateGoal`, `DeleteGoal`, `UpsertWarranty`.
- **Compartilhados:** `ListRecommendedApps` é o mesmo controller de várias telas (ver colisão #1 no índice). `CreateOperationalCost` pertence a `/app/finance/costs` e é apenas acionado pelo `OperationalCostDrawer` daqui.
- **Referência de backend:** `GetIncomeGraph` JÁ EXISTE em `bk-dash-backend` (`GET /dashboard/graphs/income`, `IncomeGraphData` em `backend/src/modules/dashboard/types/graphs.ts`) — o BFF (`api/src/ui`) deve **espelhar** esse contrato. Os recortes weekday/hour/turno/região existem em `backend-old/src/modules/dashboard/services` (portar). Dinheiro agregado usa `CurrencyAmount` (= `CurrencyObj` do backend).
