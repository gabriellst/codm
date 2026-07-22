# Rota /app/tools/calculator — Calculadora

## Visao Geral

A Calculadora e uma ferramenta de precificacao de tela unica que ajuda o lojista a definir o preco de venda de um produto a partir do custo, do custo de marketing e dos custos fixos da operacao (IOF, frete, checkout, gateway, impostos). A partir desses inputs, a tela calcula em tempo real um "Estimador de Lucro" (uma linha por multiplicador de markup, mostrando Preco / Custo / Lucro) e um "Facebook Ads Breakeven" (CPA maximo por markup), alem de sugerir um preco minimo. Tudo e "what-if": cada digitacao recalcula os resultados no client.

A tela e dividida em duas colunas: a esquerda concentra os campos de entrada (custo, marketing, markup customizado e os custos fixos); a direita exibe as tabelas derivadas. Nao ha persistencia nem chamadas de API — o calculo e 100% client-side. O shell da rota (Navbar + Header) e compartilhado com todas as telas `(app)`.

> Observacao de fidelidade: o snapshot DOM capturado (`htmls/app_tools_calculator.html`) saiu trocado — seu corpo contem a tela "Taxas e Tarifas" e o toast `#2 saved! (app_suggestions)`. A estrutura do corpo da calculadora abaixo foi derivada do wireframe ja existente neste SPEC (preservado na secao Inventario) e da nota de tarefa, nao do DOM capturado. Recapturar o snapshot real e a OQ-1.

## Inventario de Estados

| Arquivo HTML | Estado / Interacao | Citizen afetado |
|---|---|---|
| `app_tools_calculator.html` | Estado base da rota. Renderiza corretamente o shell (Navbar + Header), porem o corpo capturado e o da tela "Taxas e Tarifas" (snapshot trocado, toast `#2 saved! (app_suggestions)`). Util apenas para confirmar a rota no menu e o shell compartilhado; o corpo da calculadora nao e confiavel neste arquivo. | RouteShell (Navbar/Header compartilhados); corpo nao confiavel — ver OQ-1 |

## UI Composition

### URL Contract

- **Path:** `/app/tools/calculator`
- **Breadcrumb:** `Calculadora`
- **Search params (Zod sketch):** os inputs podem ser refletidos na URL para permitir compartilhar/recuperar uma simulacao (todos opcionais; ausentes = valores default):
  - `cost` — `number` (opcional) — custo do produto
  - `marketingPct` — `number` (opcional) — custo de marketing (%)
  - `customMarkup` — `number` (opcional) — markup customizado (ex.: `4.0x`)
  - `iofPct` — `number` (opcional) — IOF (%)
  - `shipping` — `number` (opcional) — frete (valor fixo)
  - `checkoutPct` — `number` (opcional) — taxa de checkout (%)
  - `gatewayPct` — `number` (opcional) — taxa de gateway (%)
  - `taxPct` — `number` (opcional) — impostos (%)
- **Loader (if any):** nenhum — sem dados de servidor.
- **errorComponent:** `RouteError` (default)

### ASCII Layout Map

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Navbar (shared) │  Header (shared)                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│ CalculatorHeader — titulo "Calculadora de Precificacao"                        │
│ ┌────────────────────────────────────┐  ┌──────────────────────────────────┐  │
│ │ PricingInputsForm                  │  │ PricingResultsSection            │  │
│ │  Custo produto / Custo Marketing   │  │  ┌────────────────────────────┐  │  │
│ │  Markup Custom                     │  │  │ ProfitEstimatorTable       │  │  │
│ │  Custos Fixos:                     │  │  │  (Markup|Preco|Custo|Lucro)│  │  │
│ │   IOF / Frete / Checkout /         │  │  │  MarkupRow (Leaf ×N)       │  │  │
│ │   Gateway / Impostos               │  │  └────────────────────────────┘  │  │
│ │  Preco Minimo: $100 (4.00x)        │  │  ┌────────────────────────────┐  │  │
│ │                                    │  │  │ AdsBreakevenTable          │  │  │
│ │                                    │  │  │  (Markup|Preco|Max CPA)    │  │  │
│ │                                    │  │  │  BreakevenRow (Leaf ×N)    │  │  │
│ └────────────────────────────────────┘  │  └────────────────────────────┘  │  │
│                                          └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘

Overlays:
  (nenhum)
```

### Component Tree

```text
CalculatorRouteShell                                         (Route Shell)
├─ Navbar                                                    (shared, reuse — nao redesenhar)
├─ Header                                                    (shared, reuse — nao redesenhar)
├─ CalculatorHeader                                          (Component, UI estatica)
├─ PricingInputsForm                                         (Form Type A, client-side)
└─ PricingResultsSection                                     (Section, raiz de dados da regiao de resultado)
   ├─ ProfitEstimatorTable                                   (Component)
   │  └─ MarkupRow                                           (Leaf ×N)
   └─ AdsBreakevenTable                                      (Component)
      └─ BreakevenRow                                        (Leaf ×N)

Overlays:
  (nenhum)
```

### Component Anatomy

**`CalculatorHeader`** (Component)

Mockup:

```text
┌──────────────────────────────────────────────────────────┐
│ Calculadora de Precificacao                                │
│ Defina preco, markup e CPA maximo do seu produto           │
└──────────────────────────────────────────────────────────┘
```

Slots:

```text
CalculatorHeader
└─ Header  [flex col, gap-1, px-6 py-4]
   ├─ Title: h1 "Calculadora de Precificacao"  [text-2xl font-bold]
   └─ Subtitle: p "Defina preco, markup e CPA maximo do seu produto"  [text-sm text-muted-foreground]
```

**`PricingInputsForm`** (Form Type A)

Slots:

```text
PricingInputsForm
└─ Form  [primitive: field + input]  [Card wrapper, flex col, gap-4, p-6]
   ├─ Group "Produto"
   │  ├─ cost: NumberInput "Custo do produto"        [primitive: input-group, prefixo moeda (USD)]
   │  ├─ marketingPct: NumberInput "Custo Marketing (%)"  [primitive: input-group, sufixo %]
   │  └─ customMarkup: NumberInput "Markup customizado (x)"  [primitive: input-group, sufixo x]
   ├─ Group "Custos Fixos"
   │  ├─ iofPct: NumberInput "IOF (%)"               [primitive: input-group, sufixo %]
   │  ├─ shipping: NumberInput "Frete"               [primitive: input-group, prefixo moeda]
   │  ├─ checkoutPct: NumberInput "Checkout (%)"     [primitive: input-group, sufixo %]
   │  ├─ gatewayPct: NumberInput "Gateway (%)"       [primitive: input-group, sufixo %]
   │  └─ taxPct: NumberInput "Impostos (%)"          [primitive: input-group, sufixo %]
   └─ Footer
      └─ MinPriceHint: "Preco Minimo: $100 (4.00x)"  [text-sm font-medium]  (derivado, read-only)
```

States:
- Form sem submit: recalculo reativo (onChange); validacao impede valores negativos. Sem botao "Calcular".

**`PricingResultsSection`** (Section)

```text
PricingResultsSection
└─ Section  [flex col, gap-4, p-6]  (raiz de dados derivados do calculo de precificacao)
   ├─ ProfitEstimatorTable   — tabela "Estimador de Lucro" (Markup | Preco | Custo | Lucro)
   └─ AdsBreakevenTable      — tabela "Facebook Ads Breakeven" (Markup | Preco | Max CPA)
```

**`ProfitEstimatorTable`** (Component)

Mockup:

```text
┌──────────────────────────────────────────────┐
│ Estimador de Lucro                             │
├────────┬─────────┬─────────┬──────────────────┤
│ Markup │ Preco   │ Custo   │ Lucro            │
├────────┼─────────┼─────────┼──────────────────┤
│ 3.0x   │ $75     │ $38     │ $14              │
│ 4.0x   │ $100    │ $42     │ $27              │
│ 5.0x   │ $125    │ $47     │ $40              │
└────────┴─────────┴─────────┴──────────────────┘
```

Slots:

```text
ProfitEstimatorTable
└─ Card  [primitive: card]
   ├─ Title: "Estimador de Lucro"  [text-base font-semibold]
   └─ Table  [primitive: table]
      ├─ Header: "Markup" | "Preco" | "Custo" | "Lucro"
      └─ Rows: MarkupRow (Leaf ×N)
```

**`MarkupRow`** (Leaf ×N)

Mockup:

```text
│ 4.0x   │ $100    │ $42     │ $27              │
```

Slots:

```text
MarkupRow
└─ TableRow  [primitive: table]
   ├─ Markup: cell "4.0x"
   ├─ Price: cell "$100"            (cost * markup)
   ├─ Cost: cell "$42"             (custo + custos fixos)
   └─ Profit: cell "$27"  [fg-green se >0, fg-red se <0]
```

Variants:
- `markup === customMarkup` → linha destacada (bg suave / bold)
- `profit < 0` → Profit em `text-danger`

**`AdsBreakevenTable`** (Component)

Mockup:

```text
┌────────────────────────────────────┐
│ Facebook Ads Breakeven             │
├────────┬─────────┬─────────────────┤
│ Markup │ Preco   │ Max CPA         │
├────────┼─────────┼─────────────────┤
│ 3.0x   │ $75     │ $3.66           │
│ 4.0x   │ $100    │ $7.00           │
└────────┴─────────┴─────────────────┘
```

Slots:

```text
AdsBreakevenTable
└─ Card  [primitive: card]
   ├─ Title: "Facebook Ads Breakeven"  [text-base font-semibold]
   └─ Table  [primitive: table]
      ├─ Header: "Markup" | "Preco" | "Max CPA"
      └─ Rows: BreakevenRow (Leaf ×N)
```

**`BreakevenRow`** (Leaf ×N)

Mockup:

```text
│ 4.0x   │ $100    │ $7.00           │
```

Slots:

```text
BreakevenRow
└─ TableRow  [primitive: table]
   ├─ Markup: cell "4.0x"
   ├─ Price: cell "$100"
   └─ MaxCpa: cell "$7.00"   (lucro disponivel para aquisicao no breakeven)
```

Variants:
- `markup === customMarkup` → linha destacada

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| CalculatorRouteShell | RouteShell | — | reads: [cost, marketingPct, customMarkup, iofPct, shipping, checkoutPct, gatewayPct, taxPct] | — | — | create-route-local | `app/src/routes/(app)/tools/calculator/index.tsx` | /route |
| Navbar | Component | — | — | useSidebarStore | — | reuse | `app/src/components/Navbar/` | (reuse) |
| Header | Component | useGetUserInfo / useListNotifications | — | — | — | reuse | `app/src/components/Header/` | (reuse) |
| CalculatorHeader | Component | — | — | — | — | create-route-local | `app/src/routes/(app)/tools/calculator/-components/CalculatorHeader/index.tsx` | /component |
| PricingInputsForm | Form | — (estado client) | reads+writes: [cost, marketingPct, customMarkup, iofPct, shipping, checkoutPct, gatewayPct, taxPct] | — | TanStack Form values | create-route-local | `app/src/routes/(app)/tools/calculator/-components/PricingInputsForm/index.tsx` | /form |
| PricingResultsSection | Section | props derivados (calculo client) from Form values | reads: [cost, marketingPct, customMarkup, iofPct, shipping, checkoutPct, gatewayPct, taxPct] | — | `[result]` (useMemo) | create-route-local | `app/src/routes/(app)/tools/calculator/-components/PricingResultsSection/index.tsx` | /component |
| ProfitEstimatorTable | Component | props from PricingResultsSection | — | — | — | create-route-local | `app/src/routes/(app)/tools/calculator/-components/PricingResultsSection/ProfitEstimatorTable/index.tsx` | /component |
| MarkupRow | Leaf | props from ProfitEstimatorTable | — | — | — | create-route-local | `app/src/routes/(app)/tools/calculator/-components/PricingResultsSection/ProfitEstimatorTable/MarkupRow/index.tsx` | /component |
| AdsBreakevenTable | Component | props from PricingResultsSection | — | — | — | create-route-local | `app/src/routes/(app)/tools/calculator/-components/PricingResultsSection/AdsBreakevenTable/index.tsx` | /component |
| BreakevenRow | Leaf | props from AdsBreakevenTable | — | — | — | create-route-local | `app/src/routes/(app)/tools/calculator/-components/PricingResultsSection/AdsBreakevenTable/BreakevenRow/index.tsx` | /component |

**Per-node notes:**

- **PricingInputsForm:** Sem submit/mutation — recalculo reativo via watch nos valores. O `MinPriceHint` ("Preco Minimo") e derivado, read-only. Skeleton: nao aplicavel (sem fetch). ARIA: cada input com `<label>` associado (primitive `field`/`label`). Rationale: ferramenta acoplada ao dominio de precificacao BK; sem paralelo em outra rota.
- **PricingResultsSection:** E `Section` por ser a raiz de dados (derivados) da regiao de resultado, orquestrando ≥3 sub-itens distintos (titulo + ProfitEstimatorTable + AdsBreakevenTable). O calculo (preco, custo total, lucro, CPA maximo por markup) vive em um hook puro `usePricingCalculator(values)`. Empty: antes de inputs, exibe linhas com zeros (nunca vazio). Rationale: dominio-especifico.
- **MarkupRow / BreakevenRow:** Leaves renderizados via `.map()` sobre a lista de markups (3.0x, 4.0x, 5.0x...). Cada linha destaca o `customMarkup` quando corresponde.
- **ProfitEstimatorTable / AdsBreakevenTable:** usam primitive `table`; linhas derivadas, sem fetch.

### Reuse Summary

- **Reuse (no work):** `Navbar` (`app/src/components/Navbar/`), `Header` (`app/src/components/Header/`) — shell compartilhado de toda rota `(app)`. Primitivos: `card`, `input`, `input-group`, `field`, `label`, `button`, `table`, `tooltip` — todos existem em `app/src/components/ui/`.
- **Promote to shared:** nenhum.
- **Create new shared:** nenhum.
- **Create route-local (default):** `CalculatorHeader`, `PricingInputsForm`, `PricingResultsSection`, `ProfitEstimatorTable`, `MarkupRow`, `AdsBreakevenTable`, `BreakevenRow` — todos acoplados ao dominio de precificacao desta rota.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | CalculatorRouteShell | `app/src/routes/(app)/tools/calculator/index.tsx` | URL contract + layout 2 colunas; sem loader |
| 2 | /component | CalculatorHeader | `app/src/routes/(app)/tools/calculator/-components/CalculatorHeader/` | UI estatica |
| 3 | /form | PricingInputsForm | `app/src/routes/(app)/tools/calculator/-components/PricingInputsForm/` | TanStack Form; sem mutation; sync com URL |
| 4 | /component | PricingResultsSection | `app/src/routes/(app)/tools/calculator/-components/PricingResultsSection/` | hook puro `usePricingCalculator` |
| 5 | /component | ProfitEstimatorTable | `app/src/routes/(app)/tools/calculator/-components/PricingResultsSection/ProfitEstimatorTable/` | usa primitive table |
| 6 | /component | MarkupRow | `app/src/routes/(app)/tools/calculator/-components/PricingResultsSection/ProfitEstimatorTable/MarkupRow/` | Leaf ×N |
| 7 | /component | AdsBreakevenTable | `app/src/routes/(app)/tools/calculator/-components/PricingResultsSection/AdsBreakevenTable/` | usa primitive table |
| 8 | /component | BreakevenRow | `app/src/routes/(app)/tools/calculator/-components/PricingResultsSection/AdsBreakevenTable/BreakevenRow/` | Leaf ×N |

Sem etapa `/primitive` (sem grafico; todos os primitivos existem). Sem etapa `/store` (estado vive em Form + URL).

### Open Questions

- OQ-1. O snapshot `app_tools_calculator.html` saiu trocado (corpo = tela "Taxas e Tarifas"; toast `#2 saved! (app_suggestions)`). A composicao do corpo foi derivada do wireframe ja existente neste SPEC. **Recapturar o snapshot real da calculadora** para validar campos, ordem e rotulos exatos.
- OQ-2. Quais multiplicadores de markup a tabela exibe por padrao (3.0x / 4.0x / 5.0x) e ate onde vai? O `customMarkup` adiciona uma linha extra ou apenas destaca a existente?
- OQ-3. A moeda exibida no wireframe e USD (`$`). Confirmar se a calculadora usa moeda fixa ou herda a moeda da loja (Header) — define a formatacao i18n dos resultados.
- OQ-4. "Salvar simulacao": existe requisito de persistir/compartilhar simulacoes? Hoje a tela e 100% client-side; se confirmado, adicionar Dialog + comando (controller novo).

## Controller Contract

> Consome os schemas de [`_schema-fundamentals.md`](../../_schema-fundamentals.md)
> (`Money`, `Currency`). Aplica os princípios: **um controller por preocupação** e
> **dados, não apresentação** (o payload carrega `value`/enums; o frontend deriva rótulo,
> formatação de moeda e prefixos/sufixos `$`/`%`/`x`). A calculadora é **100% client-side**:
> o cálculo (preço, custo total, lucro, CPA máximo por markup) roda no `usePricingCalculator`,
> sem query nem mutation obrigatória.

### Queries

| Controller | Método + Path | Componente(s) consumidor(es) | Quando carrega |
|---|---|---|---|
| (nenhum) | — | — | Calculadora 100% client-side; nenhuma query no corpo. |

> Os dados de usuário/loja exibidos no topo vêm do `Header` compartilhado (que já consome
> `GetUserInfo` / `ListNotifications`), não do corpo da calculadora.

### Commands

| Controller | Método + Path | Componente | Payload (campos — sem apresentação) |
|---|---|---|---|
| (nenhum obrigatório) | — | — | O cálculo é client-side; nenhuma mutation requerida. |
| `SaveCalculatorSimulation` (novo, opcional — OQ-4) | POST `/ui/bkdash/tools/calculator/simulations` | SaveSimulationDialog (hipotético) | `name` (string), `currency` (`Currency`), `cost` (Money), `shipping` (Money), `marketingPct`, `customMarkup`, `iofPct`, `checkoutPct`, `gatewayPct`, `taxPct` (number — frações/multiplicadores) |

### Response Schemas (sketch)

Nenhuma query nova (sem dados de servidor). Para referência, caso OQ-4 confirme persistência
de simulações, o comando opcional retornaria o snapshot persistido. Valores monetários usam
`Money`; a moeda da simulação é `Currency`; percentuais/multiplicador são `number` cru (o
frontend formata `%`/`x`). Sem strings pré-formatadas, `label`, `href` ou `editable`.

```ts
import { Money, Currency } from '@ui/schemas' // ver _schema-fundamentals.md

// NEW (opcional — somente se OQ-4 confirmar persistencia)

// inputs da simulação — schema LOCAL desta tela (espelha os search params)
export const CalculatorInputsSchema = z.object({
  cost:         Money,      // custo do produto, na moeda da simulação
  shipping:     Money,      // frete (valor fixo)
  marketingPct: z.number(), // fração — frontend formata %
  customMarkup: z.number(), // multiplicador — frontend formata x
  iofPct:       z.number(),
  checkoutPct:  z.number(),
  gatewayPct:   z.number(),
  taxPct:       z.number(),
})

export const SaveCalculatorSimulationOutputSchema = z.object({
  simulation: z.object({
    id: z.string(),
    name: z.string(),
    currency: Currency,
    createdAt: z.date(),     // frontend formata a data
    inputs: CalculatorInputsSchema,
  }),
})
```

### Reaproveitamento de Controllers

- **Existentes (reutilizar):** `GetUserInfo` e `ListNotifications` apenas indiretamente, via
  `Header` compartilhado — não consumidos pelo corpo da calculadora. Nenhum controller existente
  é necessário para o cálculo.
- **Novos (criar):** nenhum obrigatório. `SaveCalculatorSimulation` (command opcional) somente
  se OQ-4 confirmar persistência de simulações.
- **Compartilhados:** dos fundamentos (`@ui/schemas`) reutiliza apenas `Money` e `Currency` no
  payload opcional; `CalculatorInputsSchema` é schema **local** desta tela (não promovido).
