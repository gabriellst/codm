# Rota /app/products/costs — Custos de Produto (lista)

## Visao Geral

A tela de Custos de Produto e a area onde o lojista cadastra e mantem o custo de cada produto (COGS) por pais de venda, alimentando o calculo de lucro/margem em todo o BK Dash. Ela combina um formulario de aplicacao em lote no topo (`CostFormSection`) — onde se escolhe o pais, o valor de custo, o frete, as datas de vigencia e o escopo (pedidos anteriores e/ou futuros) — com uma grade paginada (`ProductCostTable`) que lista produtos com suas variacoes, volume de vendas, ultimo custo cadastrado e acoes de selecao em massa. Um seletor de paises (multi-select / combobox com opcoes Global, United States of America, Canada, Australia) filtra a grade e define o pais-alvo do custo a ser aplicado.

O papel da tela e operacional e transacional: alem de visualizar, o usuario seleciona N produtos (checkboxes), define um custo no formulario e dispara "Aplicar para 10 produtos" (ou "Aplicar para todos os produtos"), ou remove custos com "Deletar para 10 custos". Tambem oferece importacao em massa (CSV / Shopify) e download de template. A coluna lateral repete o painel compartilhado de "Aplicativos Recomendados" presente em outras telas do app.

## Inventario de Estados

| Arquivo HTML | Estado / Interacao | Citizen afetado |
|---|---|---|
| `app_product_cost.html` | Estado base da lista (vazia/sem selecao); cabecalho, formulario de custo e grade renderizados | `ProductCostRoute`, `CostFormSection`, `ProductCostTable` |
| `app_product_cost-2.html` | Re-snapshot do estado base (mesma estrutura, contagem de irmaos repetidos +1); confirma shape da grade | `ProductCostTable`, `ProductCostRow` |
| `app_product_cost_dados-preenchidos.html` | Grade com dados preenchidos: linhas com Produto, variacoes, vendas, Custo, Ultimo custo cadastrado; barra de selecao em massa ("Aplicar para 10 produtos" / "Deletar para 10 custos"); campos Valor do Custo / Data de Inicio / Data de Fim; filtro "Com Venda e Sem Custo" | `ProductCostTable`, `ProductCostRow`, `BulkActionBar`, `CostFormSection` |
| `app_product_cost_seletor-paises-aberto.html` | Seletor de paises aberto (combobox multi-select) exibindo Global, United States of America, Canada, Australia; acao "Aplicar para todos os produtos" | `CountrySelect` |

## UI Composition

### URL Contract

- **Path:** `/app/products/costs`
- **Breadcrumb:** `Produto › Custos de Produto`
- **Search params (Zod sketch):**
  - `page` — `number` (default `1`) — pagina atual da grade
  - `limit` — `number` (default `10`) — itens por pagina ("Itens por página")
  - `search` — `string` (default `""`) — busca textual por produto (input type=text)
  - `country` — `string` (default `""` = Global) — pais selecionado no `CountrySelect`; filtra a grade e define o pais-alvo do custo
  - `onlySoldNoCost` — `boolean` (default `false`) — filtro "Com Venda e Sem Custo"
- **Loader (if any):** nenhum loader bloqueante; dados carregam client-side via `useListProductCosts`
- **errorComponent:** `RouteError` (default)

### ASCII Layout Map

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Navbar (shared)        Header (shared: store/date/currency/notif/profile)      │
├──────────────────────────────────────────────────────────────────────────────┤
│ ProductCostRoute — "Custos de Produtos" / "Adicione custos aos seus produtos"  │
│ ┌───────────────────────────────────────────────┐  ┌───────────────────────┐  │
│ │ CostFormSection                               │  │ RecommendedAppsSection│  │
│ │  ┌───────────────┐ ┌──────────┐ ┌──────────┐  │  │  ┌──────────────────┐ │  │
│ │  │ CountrySelect │ │CostValue │ │ScopeTogg.│  │  │  │ RecommendedAppCard│ │  │
│ │  └───────────────┘ └──────────┘ └──────────┘  │  │  │      (Leaf ×N)    │ │  │
│ │  [ Aplicar para todos / N produtos ]          │  │  └──────────────────┘ │  │
│ └───────────────────────────────────────────────┘  └───────────────────────┘  │
│ ┌───────────────────────────────────────────────────────────────────────────┐ │
│ │ ProductCostTable                                                          │ │
│ │  ┌─────────────────────────────────────────────────────────────────────┐ │ │
│ │  │ CostToolbar (search · "Com Venda e Sem Custo" · Importar · Deletar) │ │ │
│ │  └─────────────────────────────────────────────────────────────────────┘ │ │
│ │  BulkActionBar (visivel com selecao: Aplicar N / Deletar N)              │ │ │
│ │  ┌─────────────────────────────────────────────────────────────────────┐ │ │
│ │  │ [☑] Produto | Variacoes | Vendas | Custo | Ultimo | [→]              │ │ │
│ │  │ ProductCostRow (Leaf ×N)                                            │ │ │
│ │  └─────────────────────────────────────────────────────────────────────┘ │ │
│ │  TablePagination (Itens por página · anterior/seguinte)                  │ │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Overlays:
  CountrySelect (popover/combobox) ── abre no clique do trigger "País"
  AddProductCostDialog (Dialog)    ── abre no clique de "[→]" / "Adicionar custo" de uma linha
  ImportCostCsvDialog (Dialog)     ── abre no clique de "Importar CSV" / "Importar Shopify"
```

### Component Tree

```text
ProductCostRoute                                             (Route Shell)
├─ Navbar                                                    (shared Component — reuse)
├─ Header                                                    (shared Component — reuse)
├─ CostFormSection                                           (Section, orquestra >=3 sub)
│  ├─ CountrySelect                                          (Component, combobox multi-select)
│  ├─ CostValueFields                                        (Component, Custo + Frete + datas)
│  ├─ ScopeToggleGroup                                       (Component, pedidos anteriores/futuros)
│  └─ ApplyCostForm                                          (Form Type A — aplicar em lote)
├─ ProductCostTable                                          (Section, owns list query)
│  ├─ CostToolbar                                            (Component, search + filtros + importar)
│  ├─ BulkActionBar                                          (Component, acoes em massa)
│  ├─ ProductCostRow                                         (Leaf ×N)
│  └─ TablePagination                                        (Component, paginacao)
└─ RecommendedAppsSection                                    (Section, lista de apps)
   └─ RecommendedAppCard                                     (Leaf ×N)

Overlays:
├─ AddProductCostDialog                                      (Dialog, route-local; contem Form)
└─ ImportCostCsvDialog                                       (Dialog, route-local; contem Form)
```

### Component Anatomy

**`CostFormSection`** (Section)

```text
CostFormSection
└─ Card  [primitive: Card]  [flex col, gap-4, p-4]
   ├─ Header: titulo curto + descricao do escopo de aplicacao
   ├─ Row: [grid, cols-3, gap-3]
   │  ├─ ref → CountrySelect
   │  ├─ ref → CostValueFields
   │  └─ ref → ScopeToggleGroup
   └─ Footer: ref → ApplyCostForm (botao "Aplicar para todos / N produtos")
```

States:
- skeleton: bloco `Skeleton` na altura do card enquanto o catalogo de paises carrega
- empty: nunca vazio (formulario sempre presente)

**`CountrySelect`** (Component)

Mockup:

```text
╭─────────────────────────────╮      (aberto)
│ País            [ ⌄ ]        │   ┌─────────────────────────────┐
╰─────────────────────────────╯   │ [☑] Global                  │
                                   │ [ ] United States of America│
                                   │ [ ] Canada                  │
                                   │ [ ] Australia               │
                                   └─────────────────────────────┘
```

Slots:

```text
CountrySelect
└─ Trigger  [primitive: Combobox]  [flex row between, w-full, role="combobox"]
   ├─ Label: "País"
   ├─ Value: pais(es) selecionado(s) (default "Global")
   ├─ Icon: chevron  [lucide, size-4]
   └─ Popover  [primitive: Popover]  [listbox]
      └─ Option: linha de pais com checkbox  [primitive: Checkbox]
```

Variants:
- multi-select → varios paises marcados; trigger mostra contagem ("3 países")
- `country === ""` → exibe "Global"

States:
- skeleton: trigger como `Skeleton` de input enquanto carrega catalogo

**`CostValueFields`** (Component)

Mockup:

```text
┌──────────────────────────────────────────────────────────┐
│ Custo  [ USD ][ 0,00 ]    Frete  [ USD ][ 0,00 ]          │
│ Data de Início do Custo [ 📅 ]   Data de Fim do Custo [📅] │
└──────────────────────────────────────────────────────────┘
```

Slots:

```text
CostValueFields
└─ root  [flex col, gap-2]
   ├─ CostInput: "Valor do Custo" prefixo moeda  [primitive: InputGroup + Input]
   ├─ FreightInput: "Frete" prefixo moeda  [primitive: InputGroup + Input]
   ├─ StartDate: "Data de Início do Custo"  [primitive: DatePicker]
   └─ EndDate: "Data de Fim do Custo"  [primitive: DatePicker]
```

**`ScopeToggleGroup`** (Component)

Mockup:

```text
┌───────────────────────────────────┐
│ [☑] Todos pedidos anteriores       │
│ [☑] Todos pedidos futuros          │
└───────────────────────────────────┘
```

Slots:

```text
ScopeToggleGroup
└─ root  [flex col, gap-2]
   ├─ PastToggle: "Todos pedidos anteriores"  [primitive: Checkbox]
   └─ FutureToggle: "Todos pedidos futuros"  [primitive: Checkbox]
```

**`ProductCostRow`** (Leaf ×N)

Mockup:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ [☑] [🖼] Free 3 Pairs of Premium Socks   1/1   1751   $1.00   22/03 [→]│
│ [ ] [🖼] ThunderShield                  15/15   600   $20-$24 07/04 [→]│
│ ...                                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

Slots:

```text
ProductCostRow
└─ Row  [primitive: Card / div]  [grid cols, items-center, gap-2, p-2, role="listitem"]
   ├─ Select: checkbox de selecao  [primitive: Checkbox]
   ├─ Thumb: imagem do produto  [primitive: Avatar]  ([🖼])
   ├─ Name: nome do produto  [bold]
   ├─ Variants: contagem de variacoes (ex. "1/1", "15/15")
   ├─ Sales: volume de vendas (ex. "1751")
   ├─ Cost: custo atual ou faixa (ex. "$1.00", "$20-$24")  [primitive: Badge se faixa]
   ├─ LastCost: "Último custo cadastrado" (data, ex. "22/03")
   └─ Action: botao "[→]" / abrir custo  [primitive: Button, variant=ghost]  → AddProductCostDialog
```

Variants:
- `cost === null` → exibe placeholder "—" (sem custo)
- selecionado → row destacada (bg-muted)

**`CostToolbar`** (Component)

Mockup:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ [🔎 Buscar produto____]  [● Com Venda e Sem Custo]  [Importar Shopify] │
│                          [Importar CSV]  [Baixar template]  [Deletar]  │
└──────────────────────────────────────────────────────────────────────┘
```

Slots:

```text
CostToolbar
└─ root  [flex row, between, gap-2, p-3]
   ├─ Search: input de busca  [primitive: Input]  (URL search, useDebouncedSearch)
   ├─ SoldNoCostFilter: toggle "Com Venda e Sem Custo"  [primitive: Switch]
   ├─ ImportShopify: botao  [primitive: Button]  → abre ImportCostCsvDialog
   ├─ ImportCsv: botao  [primitive: Button]  → abre ImportCostCsvDialog
   ├─ DownloadTemplate: botao  [primitive: Button]
   └─ DeleteSelected: botao  [primitive: Button, variant=destructive]  (condicional)
```

**`BulkActionBar`** (Component)

Mockup:

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ 10 selecionados   [ Aplicar para 10 produtos ]  [ Deletar para 10 custos ]  │
└───────────────────────────────────────────────────────────────────────────┘
```

Slots:

```text
BulkActionBar
└─ root  [flex row, between, gap-2, p-2]  (render quando selectedIds.length > 0)
   ├─ Count: "N selecionados"
   ├─ ApplyN: botao "Aplicar para N produtos"  [primitive: Button]
   └─ DeleteN: botao "Deletar para N custos"  [primitive: Button, variant=destructive]
```

**`TablePagination`** (Component)

Mockup:

```text
┌──────────────────────────────────────────────────────────┐
│ Itens por página [10 ⌄]      ‹ anterior   1 / N   seguinte ›│
└──────────────────────────────────────────────────────────┘
```

Slots:

```text
TablePagination
└─ root  [flex row, between, gap-2, p-3]
   ├─ PageSize: "Itens por página" select  [primitive: Select]  (URL limit)
   └─ Pager: controles anterior/seguinte  [primitive: Pagination]  (URL page)
```

**`ProductCostTable`** (Section)

```text
ProductCostTable
└─ Card  [primitive: Card]  [flex col, gap-0]
   ├─ ref → CostToolbar
   ├─ ref → BulkActionBar  (condicional: selecao > 0)
   ├─ GridHeader: [☑] · Produto · Variacoes · Vendas · Custo · Último custo · acao
   ├─ Body: ref → ProductCostRow (Leaf ×N)  [role="list"]
   └─ ref → TablePagination
```

States:
- skeleton: 10 linhas `Skeleton` na altura da row
- empty: `Empty` primitive — "Nenhum produto encontrado" (respeita filtro/search/country)
- error: `DataError`

**`ApplyCostForm`** (Form — Type A)

```text
ApplyCostForm
└─ Form  [TanStack Form, schema CreateProductCost]
   ├─ field: country  → CountrySelect
   ├─ field: costValue → CostValueFields.CostInput
   ├─ field: freightValue → CostValueFields.FreightInput
   ├─ field: startDate → CostValueFields.StartDate
   ├─ field: endDate → CostValueFields.EndDate
   ├─ field: applyToPastOrders → ScopeToggleGroup.PastToggle
   ├─ field: applyToFutureOrders → ScopeToggleGroup.FutureToggle
   ├─ field: productIds[] → selecao em ProductCostTable (ou "todos")
   └─ Submit: "Aplicar para todos os produtos" / "Aplicar para N produtos"  [primitive: Button]
```

**`RecommendedAppsSection`** (Section)

```text
RecommendedAppsSection
└─ Card  [primitive: Card]  [flex col, gap-3, p-4]
   ├─ Header: "Aplicativos Recomendados" + link "Deseja anunciar sua marca aqui?"
   └─ Grid: ref → RecommendedAppCard (Leaf ×N)  [grid]
```

**`RecommendedAppCard`** (Leaf ×N)

Mockup:

```text
┌──────────────────────────────┐
│ [🖼] BK Reviews               │
│  ★ 4.8  (40.000+)   [Visitar] │
│ "O BK Reviews é um app que..."│
└──────────────────────────────┘
```

Slots:

```text
RecommendedAppCard
└─ Card  [primitive: Card]  [link externo, flex col, gap-1, p-3]
   ├─ Logo: img  [🖼]
   ├─ Name: nome do app  [bold]
   ├─ Rating: nota + estrela + contagem (ex. "4.8 ★ (40.000+)")
   ├─ Cta: "Visitar"  [primitive: Button / link]
   └─ Description: texto descritivo
```

**`AddProductCostDialog`** (Dialog)

Mockup:

```text
╔══════════════════════════════════════════════╗
║ Adicionar custo — <Produto>            [×]    ║
╠══════════════════════════════════════════════╣
║ País [⌄]   Custo [USD][0,00]  Frete [USD][..] ║
║ Data Início [📅]   Data Fim [📅]               ║
║ [☑] anteriores   [☑] futuros                  ║
╠══════════════════════════════════════════════╣
║                       [ Cancelar ] [ Salvar ] ║
╚══════════════════════════════════════════════╝
```

Slots:

```text
AddProductCostDialog
└─ Dialog  [primitive: Dialog]  (useDialogStore.show)
   ├─ DialogHeader: "Adicionar custo — <Produto>" + close
   ├─ DialogBody: ref → ApplyCostForm (escopo de 1 produto, mesmos campos)
   └─ DialogFooter: [Cancelar] [Salvar]  [primitive: Button]
```

**`ImportCostCsvDialog`** (Dialog)

Mockup:

```text
╔══════════════════════════════════════════════╗
║ Importar custos                        [×]    ║
╠══════════════════════════════════════════════╣
║ [ Baixar template CSV ]                        ║
║ ┌──────────────────────────────────────────┐ ║
║ │  Arraste o CSV aqui ou clique para enviar │ ║
║ └──────────────────────────────────────────┘ ║
╠══════════════════════════════════════════════╣
║                      [ Cancelar ] [ Importar ]║
╚══════════════════════════════════════════════╝
```

Slots:

```text
ImportCostCsvDialog
└─ Dialog  [primitive: Dialog]  (useDialogStore.show)
   ├─ DialogHeader: "Importar custos" + close
   ├─ DialogBody: link "Baixar template" + dropzone de arquivo  [primitive: Field + Input type=file]
   └─ DialogFooter: [Cancelar] [Importar]  [primitive: Button]
```

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| ProductCostRoute | RouteShell | — | reads: [page, limit, search, country, onlySoldNoCost] | — | — | create-route-local | routes/(app)/products/costs/index.tsx | /route |
| Navbar | Component | own | — | useSidebarStore | — | reuse | @/components/Navbar/ | (reuse) |
| Header | Component | useGetUserInfo, useListNotifications | reads: [store, range, currency] | — | — | reuse | @/components/Header/ | (reuse) |
| CostFormSection | Section | catalogo de paises (de useListProductCosts.filters) | reads: [country], writes: [country] | — | [costDraft] | create-route-local | routes/(app)/products/costs/-components/CostFormSection/ | /component |
| CountrySelect | Component | props (countries) from CostFormSection | reads: [country], writes: [country] | — | [open] | create-route-local | .../-components/CostFormSection/CountrySelect/ | /component |
| CostValueFields | Component | props from ApplyCostForm | — | — | — | create-route-local | .../-components/CostFormSection/CostValueFields/ | /component |
| ScopeToggleGroup | Component | props from ApplyCostForm | — | — | — | create-route-local | .../-components/CostFormSection/ScopeToggleGroup/ | /component |
| ApplyCostForm | Form | useCreateProductCost (mutation) | — | useDialogStore (quando em dialog) | — | create-route-local | .../-components/CostFormSection/ApplyCostForm/ | /form |
| ProductCostTable | Section | useListProductCosts({page,limit,search,country,onlySoldNoCost}) | reads: [page, limit, search, country, onlySoldNoCost] | — | [selectedIds] | create-route-local | .../-components/ProductCostTable/ | /component |
| CostToolbar | Component | props from ProductCostTable | reads: [search, onlySoldNoCost], writes: [search, onlySoldNoCost] | — | — | create-route-local | .../-components/ProductCostTable/CostToolbar/ | /component |
| BulkActionBar | Component | props (selectedIds) from ProductCostTable | — | — | — | create-route-local | .../-components/ProductCostTable/BulkActionBar/ | /component |
| ProductCostRow | Leaf | props (item) from ProductCostTable | — | — | — | create-route-local | .../-components/ProductCostTable/ProductCostRow/ | /component |
| TablePagination | Component | props (totalPages) from ProductCostTable | reads: [page, limit], writes: [page, limit] | — | — | create-route-local | .../-components/ProductCostTable/TablePagination/ | /component |
| RecommendedAppsSection | Section | useListRecommendedApps (ou estatico) | — | — | — | promote-to-shared | @/components/RecommendedAppsSection/ | /component |
| RecommendedAppCard | Leaf | props (app) from RecommendedAppsSection | — | — | — | promote-to-shared | @/components/RecommendedAppsSection/RecommendedAppCard/ | /component |
| AddProductCostDialog | Dialog | useCreateProductCost | — | useDialogStore | — | create-route-local | .../-components/AddProductCostDialog/ | /component |
| ImportCostCsvDialog | Dialog | useImportProductCostCsv | — | useDialogStore | — | create-route-local | .../-components/ImportCostCsvDialog/ | /component |

**Per-node notes:**

- **ProductCostTable:** Skeleton: 10 linhas placeholder com altura da row. Empty: `Empty` primitive — "Nenhum produto encontrado" (respeitando search/country/onlySoldNoCost). Error: `DataError`. ARIA: `role="list" aria-label="Lista de custos de produto"`. Rationale: dominio de custo de produto, sem paralelo em outras rotas — unica raiz de dados da regiao.
- **CountrySelect:** ARIA: `role="combobox" aria-expanded`. Multi-select com checkboxes por opcao (Global, United States of America, Canada, Australia). Rationale: combobox de paises especifico desta tela.
- **BulkActionBar:** renderiza apenas com `selectedIds.length > 0`; "Aplicar para N produtos" e "Deletar para N custos" usam a contagem da selecao.
- **ProductCostRow:** ARIA: `role="listitem"`; checkbox com `aria-label="Selecionar <Produto>"`; acao "[→]" com `aria-label="Adicionar/editar custo"`. Coluna Custo pode exibir faixa (ex. "$20-$24") via Badge.
- **RecommendedAppsSection / RecommendedAppCard:** estrutura identica aparece nesta rota e em outras telas do app (painel lateral de apps) → candidato a shared; props genericas (logo, nome, nota, link, descricao).
- **AddProductCostDialog / ImportCostCsvDialog:** abertos via `useDialogStore.show(...)`; nao recebem `open`/`onOpenChange`. Tracam-se aos triggers `aria-haspopup="dialog"` (acao da row e botoes "Importar CSV/Shopify").

### Reuse Summary

- **Reuse (no work):** `Navbar` (@/components/Navbar/), `Header` (@/components/Header/) — shells compartilhados; primitives `Card`, `Combobox`, `Popover`, `Checkbox`, `Input`, `InputGroup`, `Switch`, `DatePicker`, `Select`, `Pagination`, `Button`, `Avatar`, `Badge`, `Dialog`, `Empty`, `Skeleton`, `Field` (todos em @/components/ui/); `DataError`, `DataTable` (@/components/) como base da grade.
- **Promote to shared:** `RecommendedAppsSection` + `RecommendedAppCard` — o painel "Aplicativos Recomendados" se repete nesta rota e em outras telas do BK Dash (ex. dashboard, marketing); extrair para `@/components/RecommendedAppsSection/` com props genericas. Consumidores: `/app/products/costs` e demais rotas (app) que exibem o mesmo painel lateral.
- **Create new shared:** nenhum.
- **Create route-local:** `CostFormSection`, `CountrySelect`, `CostValueFields`, `ScopeToggleGroup`, `ApplyCostForm`, `ProductCostTable`, `CostToolbar`, `BulkActionBar`, `ProductCostRow`, `TablePagination`, `AddProductCostDialog`, `ImportCostCsvDialog` — todos acoplados ao dominio de custo de produto.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | ProductCostRoute | routes/(app)/products/costs/index.tsx | define search params (page, limit, search, country, onlySoldNoCost) |
| 2 | /component (promote) | RecommendedAppsSection + RecommendedAppCard | @/components/RecommendedAppsSection/ | extrair de painel repetido; atualizar consumidores |
| 3 | /component | CostFormSection | .../-components/CostFormSection/ | orquestra CountrySelect + CostValueFields + ScopeToggleGroup + ApplyCostForm |
| 4 | /component | CountrySelect | .../CostFormSection/CountrySelect/ | combobox multi-select de paises |
| 5 | /component | CostValueFields | .../CostFormSection/CostValueFields/ | custo + frete + datas |
| 6 | /component | ScopeToggleGroup | .../CostFormSection/ScopeToggleGroup/ | toggles anteriores/futuros |
| 7 | /form | ApplyCostForm | .../CostFormSection/ApplyCostForm/ | TanStack Form + CreateProductCost schema |
| 8 | /component | ProductCostTable | .../-components/ProductCostTable/ | owns useListProductCosts; selectedIds state |
| 9 | /component | CostToolbar | .../ProductCostTable/CostToolbar/ | search (URL) + filtros + importar |
| 10 | /component | BulkActionBar | .../ProductCostTable/BulkActionBar/ | acoes em massa |
| 11 | /component | ProductCostRow | .../ProductCostTable/ProductCostRow/ | Leaf da grade |
| 12 | /component | TablePagination | .../ProductCostTable/TablePagination/ | paginacao (URL) |
| 13 | /component | AddProductCostDialog | .../-components/AddProductCostDialog/ | Dialog + ApplyCostForm |
| 14 | /component | ImportCostCsvDialog | .../-components/ImportCostCsvDialog/ | Dialog + upload CSV |

### Open Questions

- OQ-1. A grade usa CSS grid de divs repetidos (sem `<table>`). Proposta: usar o shared `DataTable` se o contrato de colunas couber; caso contrario, manter grade route-local. Precisa de decisao do operador.
- OQ-2. `CountrySelect` aparenta ser multi-select (checkboxes por opcao), porem o search param `country` e singular. Confirmar se o filtro/aplicacao suporta multiplos paises simultaneos ou apenas um por vez.
- OQ-3. "Importar Shopify" vs "Importar CSV" — confirmar se sao dois fluxos distintos (um sincroniza custos do Shopify, outro faz upload de CSV) ou variacoes do mesmo dialog.

## Controller Contract

> Consome os schemas de [`_schema-fundamentals.md`](../../_schema-fundamentals.md)
> (`Money`, `Currency`, `MetricSchema`, `StoreIntegrationId`).
> Aplica os princípios: **um controller por preocupação** e **dados, não apresentação**
> (sem `label`/`isRange`/strings formatadas — o frontend deriva rótulo, faixa "$20-$24" e
> moeda a partir de enums + Money + mapas i18n). Custos por país; valores em `Money`.

### Queries

| Controller | Metodo + Path | Componente(s) consumidor(es) | Quando carrega |
|---|---|---|---|
| `ListProductCosts` | GET `/ui/bkdash/product-costs` | ProductCostTable (linhas paginadas) | Ao montar e a cada mudanca de page/limit/search/country/onlySoldNoCost |
| `ListCostCountries` (novo) | GET `/ui/bkdash/product-costs/countries` | CountrySelect (catalogo de paises) | Ao montar; popula o seletor de paises |
| `GetUserInfo` | GET `/ui/bkdash/user-info` | Header | Ao montar (shell) |
| `ListNotifications` | GET `/ui/bkdash/notifications` | Header | Ao montar / polling (shell) |
| `ListRecommendedApps` (compartilhado) | GET `/ui/bkdash/recommended-apps` | RecommendedAppsSection | Ao montar; vitrine de apps (mesmo controller das outras telas) |

### Commands

| Controller | Metodo + Path | Componente | Payload (campos — sem apresentação) |
|---|---|---|---|
| `CreateProductCost` | POST `/ui/bkdash/product-costs` | ApplyCostForm / AddProductCostDialog / BulkActionBar | `productIds[]`, `country` (`CostCountry`), `cost` (Money), `freight` (Money), `currency` (`Currency`), `startDate`, `endDate?`, `applyToPastOrders` (boolean), `applyToFutureOrders` (boolean) |
| `DeleteProductCost` | DELETE `/ui/bkdash/product-costs` | BulkActionBar / CostToolbar ("Deletar para N custos") | `productIds[]`, `country` (`CostCountry`) |
| `ImportProductCostCsv` | POST `/ui/bkdash/product-costs/csv` | ImportCostCsvDialog ("Importar CSV" / "Importar Shopify") | `file` (multipart), `source` (`CostImportSource`) |
| `ExportProductCostCsv` | GET `/ui/bkdash/product-costs/csv` | CostToolbar ("Baixar template") | `{ }` (download de template) |

### Response Schemas (sketch)

```ts
import {
  Money, Currency, MetricSchema, StoreIntegrationId, ListRecommendedAppsOutputSchema,
} from '@ui/schemas' // ver _schema-fundamentals.md

// --- enums LOCAIS desta tela (sem equivalente nos fundamentos) ---
export const CostCountry      = z.enum(['global', 'US', 'CA', 'AU']) // país-alvo do custo
export const CostImportSource = z.enum(['csv', 'shopify'])           // origem da importação

// Faixa de custo: o backend entrega os valores em Money; o frontend deriva
// "$1.00" vs "$20-$24" comparando min/max (sem flag `isRange`, sem string formatada).
export const ProductCostRangeSchema = z.object({
  currency: Currency,
  min: Money.nullable(),   // null = sem custo cadastrado
  max: Money.nullable(),
})

// ListProductCosts — apenas as linhas paginadas da grade (feedback #5: um controller por preocupação).
// Catálogo de países e contagens de resumo saem para controllers próprios (ver abaixo).
export const ListProductCostsOutputSchema = z.paginatedResponse({
  productId: z.string(),
  name: z.string(),
  thumbnailUrl: z.string().url().nullable(),
  variants: z.object({
    total: z.number(),       // ex. 15
    withCost: z.number(),    // ex. 15 -> frontend exibe "15/15"
  }),
  sales: MetricSchema,       // volume de vendas com variação período-a-período (#2)
  cost: ProductCostRangeSchema,
  lastCostRegisteredAt: z.date().nullable(), // frontend formata a data
})

// ListCostCountries — catálogo do seletor; `label` é derivado do enum no frontend (i18n).
export const ListCostCountriesOutputSchema = z.object({
  countries: z.array(CostCountry),
})
```

### Reaproveitamento de Controllers

- **Existentes (reutilizar):** `GetUserInfo`, `ListNotifications` (ambos consumidos pelo `Header` compartilhado). O padrao de lista paginada segue `ListOrders` (`z.paginatedQuery` / `z.paginatedResponse`); `Money`/`Currency`/`MetricSchema` vêm de `_schema-fundamentals.md`.
- **Novos (criar):** `ListProductCosts` (grade paginada), `ListCostCountries` (catalogo do seletor — extraido do antigo bloco `filters`), `CreateProductCost` (aplicar custo individual/lote), `DeleteProductCost` (remover custos selecionados), `ImportProductCostCsv` (upload CSV / sync Shopify), `ExportProductCostCsv` (download de template). Enums locais `CostCountry`/`CostImportSource` definidos inline (sem equivalente nos fundamentos).
- **Compartilhados:** `RecommendedAppsSection` consome `ListRecommendedApps` (controller compartilhado) via o `ListRecommendedAppsOutputSchema` dos fundamentos.
