# Rota /app/suggestions — Sugestoes

## Visao Geral

A tela de Sugestoes e uma pagina utilitaria unica do BK Dash que reune duas regioes independentes: uma **Calculadora de Precificacao** (ferramenta de calculo client-side que estima o preco de venda ideal a partir de custos, taxas e markup) e uma lista de **Aplicativos Recomendados** (vitrine de apps parceiros do ecossistema BK — BK Reviews, BK Arts, BK Ads — com avaliacao, contagem de instalacoes e link externo). A calculadora nao depende de dados do servidor: todos os campos sao inputs locais e o resultado (Preco Minimo Recomendado e o Estimador de Lucro) e derivado em tempo real desses inputs.

O papel da tela e dar ao lojista uma ferramenta de apoio a decisao (quanto cobrar para atingir a margem desejada) e, ao mesmo tempo, fazer cross-sell dos apps do grupo BK. Por ser uma tela unica sem navegacao interna, ela vive inteiramente dentro do Route Shell compartilhado (Navbar + Header), com apenas duas Sections empilhadas no conteudo principal.

## Inventario de Estados

| Arquivo HTML | Estado / Interacao | Citizen afetado |
|---|---|---|
| `app_suggestions.html` | Estado base da tela: calculadora preenchida com valores de exemplo (Custo do produto 20,00 USD, Custo do Marketing 30,00%, Markup, taxas IOF/Frete/Checkout/Gateway/Impostos), Preco Minimo Recomendado ($100.00), tabela Estimador de Lucro com 7 linhas, e grid de Aplicativos Recomendados com 3 cards + banner "Deseja anunciar sua marca aqui?" | `PricingCalculatorSection`, `CalculatorInputsPanel`, `ProfitEstimatorPanel`, `ProfitEstimatorRow`, `RecommendedAppsSection`, `AdvertiseBanner`, `RecommendedAppCard` |

Observacao: a captura possui apenas um arquivo de estado (nao ha arquivos `_hoverado-`, `_drawer-`, `_modal-` ou `_step-`), portanto nao ha Dialogs/Drawers nem micro-interacoes adicionais a mapear. O botao flutuante verde (`fixed bg-green`) e o toast `dom-snapshot-toast` no outline sao artefatos da extensao de captura (Plasmo/DOM snapshot), nao fazem parte da tela e foram ignorados.

## UI Composition

### URL Contract

- **Path:** `/app/suggestions`
- **Breadcrumb:** `Sugestoes`
- **Search params (Zod sketch):** nenhum — a tela nao persiste estado da calculadora na URL.
  - (opcional futuro) `currency` — `"USD" | "BRL"` — moeda exibida nos campos de custo/frete; default `"USD"`. Mantido como estado local por enquanto.
- **Loader (if any):** nenhum loader bloqueante. A lista de apps recomendados e carregada por query no client (`useListRecommendedApps`).
- **errorComponent:** `RouteError` (default).

### ASCII Layout Map

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Navbar (shared)          Header (shared)                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ SuggestionsRoute (Route Shell)                                                 │
│                                                                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │ PricingCalculatorSection                                                   │ │
│  │  ┌────────────────────────────┐  ┌────────────────────────────────────┐   │ │
│  │  │ CalculatorInputsPanel      │  │ ProfitEstimatorPanel               │   │ │
│  │  │  (Custo, Marketing, Markup,│  │  (Preco Minimo + tabela de lucro)  │   │ │
│  │  │   IOF/Frete/Checkout/...)  │  │   ProfitEstimatorRow (Leaf ×N)     │   │ │
│  │  └────────────────────────────┘  └────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │ RecommendedAppsSection                                                     │ │
│  │  ┌───────────────────────── AdvertiseBanner ────────────────────────────┐ │ │
│  │  └───────────────────────────────────────────────────────────────────────┘ │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                       │ │
│  │  │RecommendedApp│ │RecommendedApp│ │RecommendedApp│  (Leaf ×N)             │ │
│  │  │Card          │ │Card          │ │Card          │                       │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘                       │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Overlays:
  (nenhum) — a tela nao possui Dialogs nem Drawers.
```

### Component Tree

```text
SuggestionsRoute                                             (Route Shell)
├─ PricingCalculatorSection                                  (Section, orquestra calculadora)
│  ├─ CalculatorInputsPanel                                  (Component, inputs + estado local)
│  └─ ProfitEstimatorPanel                                   (Component, deriva resultados)
│     └─ ProfitEstimatorRow                                  (Leaf ×N — linhas do estimador)
└─ RecommendedAppsSection                                    (Section, owns list query)
   ├─ AdvertiseBanner                                        (Component, link externo)
   └─ RecommendedAppCard                                     (Leaf ×N — apps recomendados)

Overlays:
  (nenhum)
```

### Component Anatomy

**`PricingCalculatorSection`** (Section)

```text
PricingCalculatorSection
└─ Card  [primitive: Card]  [grid grid-cols-1 lg:grid-cols-2 gap-6 p-6]
   ├─ Header: titulo + descricao
   │  ├─ Title: "Calculadora de Precificacao"  [text-2xl font-bold]
   │  └─ Subtitle: "Calcule o preco de venda ideal..."  [text-sm text-muted-foreground]
   ├─ Left: ref → CalculatorInputsPanel
   └─ Right: ref → ProfitEstimatorPanel
```

Variants: nenhuma.
States: sem skeleton/empty — e ferramenta client-side com defaults sempre presentes.

**`CalculatorInputsPanel`** (Component)

Mockup:

```text
┌────────────────────────────────────────────┐
│ Custo do produto        [ 20,00      ][USD] │
│ Custo do Marketing      [ 30,00%         ]  │
│ Markup Customizado      [ 0,00x          ]  │
│ ──────────────────────────────────────────  │
│ IOF                     [ 0,38%          ]  │
│ Frete                   [ 5,00       ][USD] │
│ Checkout                [ 2,50%          ]  │
│ Gateway                 [ 5,00%          ]  │
│ Impostos                [ 10,00%         ]  │
│ ──────────────────────────────────────────  │
│ Preco Minimo Recomendado (Markup 4,00x)     │
│                                  $100.00     │
└────────────────────────────────────────────┘
```

Slots:

```text
CalculatorInputsPanel
└─ div  [flex flex-col gap-4]
   ├─ FieldGroup (custos)  [flex flex-col gap-3]
   │  ├─ ProductCostField: label "Custo do produto" + valor + sufixo moeda  [primitive: InputGroup]
   │  │  ├─ Input: numero  [primitive: Input]
   │  │  └─ CurrencyToggle: "USD"  [primitive: Button, variant="outline", size="sm"]
   │  ├─ MarketingCostField: label "Custo do Marketing" + % input  [primitive: Input]
   │  └─ MarkupField: label "Markup Customizado" + input "0,00x"  [primitive: Input]
   ├─ Separator  [primitive: Separator]
   ├─ FeesGroup  [flex flex-col gap-2]
   │  ├─ IofField: label "IOF" + "0,38%"  [primitive: Input]
   │  ├─ FreightField: label "Frete" + valor + sufixo "USD"  [primitive: InputGroup]
   │  ├─ CheckoutField: label "Checkout" + "2,50%"  [primitive: Input]
   │  ├─ GatewayField: label "Gateway" + "5,00%"  [primitive: Input]
   │  └─ TaxesField: label "Impostos" + "10,00%"  [primitive: Input]
   ├─ Separator  [primitive: Separator]
   └─ MinPriceResult: label "Preco Minimo Recomendado (Markup 4,00x)" + valor  [text-xl font-bold]
```

Variants: `currency === "BRL"` → sufixo dos campos monetarios troca de "USD" para "BRL".
States: nenhum estado de carregamento — calculo sincrono local.

**`ProfitEstimatorPanel`** (Component)

Mockup:

```text
┌────────────────────────────────────────────┐
│ Estimador de Lucro                          │
│ ┌──────────┬──────────┬──────────┐          │
│ │ Preco    │ Lucro    │ Margem   │          │
│ ├──────────┼──────────┼──────────┤          │
│ │ $38.41   │ $14.09   │ 18,79%   │  ← Row   │
│ │ $40.64   │ $20.61   │ 23,55%   │          │
│ │ $42.88   │ $27.12   │ 27,12%   │          │
│ │ ...      │ ...      │ ...      │          │
│ └──────────┴──────────┴──────────┘          │
└────────────────────────────────────────────┘
```

Slots:

```text
ProfitEstimatorPanel
└─ div  [flex flex-col gap-3]
   ├─ Title: "Estimador de Lucro"  [text-lg font-semibold]
   └─ Table  [primitive: Table]
      ├─ THead: colunas "Preco" | "Lucro" | "Margem"
      └─ TBody: ProfitEstimatorRow ×N  (ref → Leaf)
```

Variants: nenhuma.
States: empty: nunca vazio — sempre gera linhas derivadas dos inputs (zeros se inputs zerados).

**`ProfitEstimatorRow`** (Leaf ×N)

Mockup:

```text
│ $42.88   │ $27.12   │ 27,12%   │
```

Slots:

```text
ProfitEstimatorRow
└─ TableRow  [primitive: Table (TableRow/TableCell)]
   ├─ PriceCell: valor de preco  (currency, ex: "$42.88")
   ├─ ProfitCell: valor de lucro  (currency, ex: "$27.12")
   └─ MarginCell: percentual de margem  (ex: "27,12%")
```

Variants: nenhuma.

**`RecommendedAppsSection`** (Section, owns list query)

```text
RecommendedAppsSection
└─ section  [flex flex-col gap-4]
   ├─ Title: "Aplicativos Recomendados"  [text-xl font-bold]
   ├─ AdvertiseBanner (ref → Component)
   └─ Grid  [grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4]
      └─ RecommendedAppCard ×N  (ref → Leaf)
```

Variants: nenhuma.
States: skeleton: 4 placeholders de card em grid (h-64). empty: `Empty` primitive "Nenhum aplicativo recomendado". error: `DataError` inline.

**`AdvertiseBanner`** (Component)

Mockup:

```text
╭──────────────────────────────────────────────╮
│  📢  Deseja anunciar sua marca aqui?       →  │
╰──────────────────────────────────────────────╯
```

Slots:

```text
AdvertiseBanner
└─ a (href externo ClickUp form)  [flex row items-center gap-2 rounded p-4 font-bold]  (target="_blank")
   ├─ Icon: megafone  [lucide, size-5]
   ├─ Label: "Deseja anunciar sua marca aqui?"  [font-bold]
   └─ Arrow: icone seta  [lucide, size-4]
```

Variants: nenhuma.

**`RecommendedAppCard`** (Leaf ×N)

Mockup:

```text
┌──────────────────────────────────┐
│ [🖼]  BK Reviews                  │
│       ★ 4.8  (40.000+)            │
│                                   │
│ O BK Reviews e um aplicativo que  │
│ facilita a importacao e exibicao  │
│ de avaliacoes de clientes...      │
│                                   │
│              [ Visitar  → ]       │
└──────────────────────────────────┘
```

Slots:

```text
RecommendedAppCard
└─ a (href app.url, target="_blank")  → Card  [primitive: Card]  [grid gap-2 p-4]
   ├─ Logo: img alt=app.name  [primitive: Avatar ou img]
   ├─ Name: "BK Reviews"  [font-bold]
   ├─ RatingRow: flex items-center gap-1
   │  ├─ Rating: "4.8"
   │  ├─ StarIcon  [lucide, size-4]
   │  └─ InstallCount: "(40.000+)"
   ├─ Description: paragrafo descritivo  [text-sm text-muted-foreground]
   └─ VisitAction: "Visitar" + seta  [primitive: Button, variant="default", size="sm"]
```

Variants: nenhuma.

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| SuggestionsRoute | RouteShell | — | reads: [] | — | — | create-route-local | `routes/(app)/suggestions/index.tsx` | /route |
| PricingCalculatorSection | Section | props → filhos | — | — | — | create-route-local | `routes/(app)/suggestions/-components/PricingCalculatorSection/index.tsx` | /component |
| CalculatorInputsPanel | Component | estado local | — | — | `[productCost, marketingPct, markup, iof, freight, checkout, gateway, taxes, currency]` | create-route-local | `routes/(app)/suggestions/-components/PricingCalculatorSection/CalculatorInputsPanel.tsx` | /component |
| ProfitEstimatorPanel | Component | props from CalculatorInputsPanel (valores derivados) | — | — | — | create-route-local | `routes/(app)/suggestions/-components/PricingCalculatorSection/ProfitEstimatorPanel.tsx` | /component |
| ProfitEstimatorRow | Leaf | props from ProfitEstimatorPanel | — | — | — | create-route-local | `routes/(app)/suggestions/-components/PricingCalculatorSection/ProfitEstimatorRow.tsx` | /component |
| RecommendedAppsSection | Section | `useListRecommendedApps()` | — | — | — | create-route-local | `routes/(app)/suggestions/-components/RecommendedAppsSection/index.tsx` | /component |
| AdvertiseBanner | Component | constante (URL externa fixa) | — | — | — | create-route-local | `routes/(app)/suggestions/-components/RecommendedAppsSection/AdvertiseBanner.tsx` | /component |
| RecommendedAppCard | Leaf | props from RecommendedAppsSection | — | — | — | create-route-local | `routes/(app)/suggestions/-components/RecommendedAppsSection/RecommendedAppCard.tsx` | /component |

**Per-node notes:**

- **PricingCalculatorSection:** Rationale: orquestra >=3 sub-elementos distintos (header + inputs panel + estimator panel) e e a raiz da regiao de calculo, embora sem query (estado local). Nao possui skeleton — defaults sempre presentes.
- **CalculatorInputsPanel:** A logica de calculo (IOF, frete, checkout, gateway, impostos, markup → preco minimo) reside aqui ou num hook colocado `usePricingCalculator`. Os valores derivados sao passados via prop para `ProfitEstimatorPanel`. ARIA: cada input tem `<label>` associado. Rationale: dominio-acoplado (taxas de dropshipping), sem paralelo em outras rotas.
- **ProfitEstimatorPanel:** Renderiza a tabela de 7 faixas de markup; recebe o array de linhas calculadas via prop. Empty nunca ocorre.
- **ProfitEstimatorRow:** Leaf da tabela do estimador — corresponde ao grupo de linhas repetidas (`span` de preco/lucro/margem ×7 no outline). Apenas display.
- **RecommendedAppsSection:** Skeleton: 4 placeholders de card. Empty: `Empty` "Nenhum aplicativo recomendado". Error: `DataError`. ARIA: `role="list" aria-label="Aplicativos recomendados"`. Rationale: raiz de dados da regiao (owns `useListRecommendedApps`), orquestra banner + grid de cards.
- **AdvertiseBanner:** Link externo fixo para o formulario ClickUp (`https://forms.clickup.com/.../OR7PZI60FO66N7IWLW`). Sem dados dinamicos.
- **RecommendedAppCard:** Leaf renderizada N vezes (×3+ no outline). Possui logo, nome, rating, contagem de instalacoes, descricao e botao "Visitar" (link externo `app.url`). ARIA: `role="listitem"`.

### Reuse Summary

- **Reuse (no work):** `Navbar`, `Header` (shared, Route Shell — `@/components/Navbar/`, `@/components/Header/`); primitivos `Card`, `Input`, `InputGroup`, `Button`, `Separator`, `Table`, `Avatar`, `Empty`, `Skeleton` (`@/components/ui/`); `DataError` (`@/components/DataError`).
- **Promote to shared:** nenhum.
- **Create new shared:** nenhum — a calculadora e dominio-acoplada e os cards de app sao especificos desta tela.
- **Create route-local:** `PricingCalculatorSection`, `CalculatorInputsPanel`, `ProfitEstimatorPanel`, `ProfitEstimatorRow`, `RecommendedAppsSection`, `AdvertiseBanner`, `RecommendedAppCard` — todos vivem sob `routes/(app)/suggestions/-components/`.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | SuggestionsRoute | `routes/(app)/suggestions/index.tsx` | sem search params; breadcrumb "Sugestoes" |
| 2 | /component | PricingCalculatorSection | `routes/(app)/suggestions/-components/PricingCalculatorSection/index.tsx` | Section orquestradora client-side |
| 3 | /component | CalculatorInputsPanel | `routes/(app)/suggestions/-components/PricingCalculatorSection/CalculatorInputsPanel.tsx` | inputs + hook de calculo |
| 4 | /component | ProfitEstimatorPanel | `routes/(app)/suggestions/-components/PricingCalculatorSection/ProfitEstimatorPanel.tsx` | tabela derivada |
| 5 | /component | ProfitEstimatorRow | `routes/(app)/suggestions/-components/PricingCalculatorSection/ProfitEstimatorRow.tsx` | Leaf da tabela |
| 6 | /component | RecommendedAppsSection | `routes/(app)/suggestions/-components/RecommendedAppsSection/index.tsx` | owns `useListRecommendedApps` |
| 7 | /component | AdvertiseBanner | `routes/(app)/suggestions/-components/RecommendedAppsSection/AdvertiseBanner.tsx` | link externo fixo |
| 8 | /component | RecommendedAppCard | `routes/(app)/suggestions/-components/RecommendedAppsSection/RecommendedAppCard.tsx` | Leaf ×N |

### Open Questions

- OQ-1. A persistencia dos valores da calculadora (ex.: ultimo custo/markup usado pelo lojista) — manter como estado local efemero (proposto) ou persistir em store/URL/backend? Precisa de decisao do operador.
- OQ-2. A lista de Aplicativos Recomendados e estatica (hardcoded no frontend) ou deve vir do backend? O outline sugere conteudo fixo (3 apps BK), mas propomos `ListRecommendedApps` para permitir gestao via servidor; confirmar.

## Controller Contract

> Consome os schemas de [`_schema-fundamentals.md`](../_schema-fundamentals.md)
> (`Currency`). Aplica os princípios: **um controller por preocupação** e
> **dados, não apresentação** (sem `href`, `tooltip`, `label`, `color`,
> `editable`, nem strings pré-formatadas — o frontend deriva). A Calculadora de
> Precificação é 100% client-side: não consome nenhum controller.

### Queries

| Controller | Método + Path | Componente(s) consumidor(es) | Quando carrega |
|---|---|---|---|
| `ListRecommendedApps` (novo, compartilhado) | GET `/ui/bkdash/recommended-apps` | `RecommendedAppsSection` | Ao montar a tela `/app/suggestions` |

A Calculadora de Precificação não consome nenhuma query — todo o cálculo (preço
mínimo e estimador de lucro) é derivado client-side a partir dos inputs locais.

### Commands

| Controller | Método + Path | Componente | Payload (campos — sem apresentação) |
|---|---|---|---|
| (nenhum) | — | — | — |

A tela é somente leitura/utilitária: não há mutações. Os botões "Visitar" e o
banner são apenas links externos (`<a target="_blank">`).

### Response Schemas (sketch)

```ts
import { Currency, ListRecommendedAppsOutputSchema } from '@ui/schemas' // ver _schema-fundamentals.md

// ListRecommendedApps usa o ListRecommendedAppsOutputSchema COMPARTILHADO dos fundamentos
// (ver _schema-fundamentals.md): { items: RecommendedAppSchema[], advertiseUrl }. Não redefinir aqui.
```

Observação: caso a decisão (OQ-2) seja manter a lista estática no frontend, este
controller pode ser dispensado e os dados ficam como constante em
`-components/RecommendedAppsSection/`. O sketch acima cobre o caso server-driven.

### Reaproveitamento de Controllers

- **Existentes (reutilizar):** nenhum dos controllers atuais (`GetDashboard`, `ListOrders`, `GetUserInfo`, `ListNotifications`) tem overlap de dados com esta tela. `GetUserInfo`/`ListNotifications` continuam sendo consumidos indiretamente pelo `Header` compartilhado (Route Shell), não pela tela em si.
- **Novos (criar):** nenhum exclusivo desta tela — a Calculadora é client-side e a vitrine reusa o controller compartilhado abaixo.
- **Compartilhados:** `ListRecommendedApps` (GET `/ui/bkdash/recommended-apps`) é o **mesmo** controller consumido pelo dashboard (`/app`) e pelo índice — o shape do response foi alinhado ao de lá (`logoUrl`, `rating`, `ratingCount`, `description`, `installUrl`). Condicional a OQ-2: se a vitrine permanecer estática, nenhum controller é necessário.
