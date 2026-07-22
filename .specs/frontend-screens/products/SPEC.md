# Rota /app/products — Produtos

## Visao Geral

A tela de Produtos lista o catalogo da loja com metricas financeiras por produto no periodo selecionado (faturamento, vendas, lucro liquido, custo de marketing, taxas, impostos, frete, custo de produto, CPA e conversao). E uma pagina de lista com filtros, ordenacao e paginacao, alimentada pelo seletor de loja / intervalo de datas / moeda que vivem no `Header` compartilhado. O contador no cabecalho ("71 produtos") reflete o total filtrado.

Alem da consulta da lista, a tela orquestra duas operacoes de escrita sobre um produto, ambas abertas como drawers laterais (primitive `sheet`): (1) o **drawer de Custo de Produto**, um formulario simples de custo + frete com seletor de moeda e link para o historico de custos; e (2) o **wizard de Custo de Marketing**, um fluxo multi-step (modo automatico/manual -> selecao de perfis -> selecao de campanhas -> revisao final) que vincula gastos de anuncio ao produto, modelado como Form Type B com store de navegacao de steps. O bloco "Aplicativos Recomendados" e conteudo estatico promocional, nao orientado a dados da loja.

## Inventario de Estados

| Arquivo HTML | Estado / Interacao | Citizen afetado |
|---|---|---|
| `app_product.html` | Estado base: lista de produtos com metricas, contador "71 produtos", toolbar (filtrar/ordenar/itens por pagina) e bloco de apps recomendados | `ProductListSection`, `ProductRow`, `ProductToolbar`, `RecommendedAppsSection` |
| `app_product_filtros-abertos.html` | Menu de filtros aberto (raiz: "Custo de Marketing", "Custo de Produto"); submenu de produtos por nome | `ProductFilterMenu` |
| `app_product_filtros-abertos-2.html` | Segundo nivel de filtros aberto (lista expandida de itens de filtro, ~12 itens) | `ProductFilterMenu` |
| `app_product_drawer-de-custo-de-produto-aberto.html` | Drawer "Adicionar C. de Produto" aberto: campos Custo/Frete com seletor de moeda (USD/BRL) e link "Ver Historico de Custos" | `ProductCostDrawer` + `ProductCostForm` |
| `app_product_drawer-de-adição-de-custo-de-marketing-ao-produto-aberto.html` | Wizard step inicial "Adicionar Custo de Marketing": escolha de modo (Automatico / Manual) | `MarketingCostDrawer` + `MarketingCostWizardForm` (step 1) |
| `app_product_drawer-de-adição-de-custo-de-marketing-ao-produto-aberto-step-2.html` | Wizard step 2 "Selecione os Perfis": busca + lista com "Selecionar Todos" + botao Continuar/Voltar | `MarketingCostWizardForm` (step 2) |
| `app_product_drawer-de-adição-de-custo-de-marketing-ao-produto-aberto-step-3.html` | Wizard step 3 "Selecione as Campanhas": busca + lista de campanhas + Voltar | `MarketingCostWizardForm` (step 3) |
| `app_product_drawer-de-adição-de-custo-de-marketing-ao-produto-aberto-step-final.html` | Wizard step final "Selecione as Campanhas" (revisao, "Desselecionar Todos" + itens selecionados) | `MarketingCostWizardForm` (step final) |

## UI Composition

### URL Contract

- **Path:** `/app/products`
- **Breadcrumb:** `Produtos`
- **Search params (Zod sketch):**
  - `page` — `number` (default 1) — pagina atual da lista
  - `limit` — `number` (default 25, "Itens por pagina") — tamanho da pagina
  - `search` — `string` — texto do campo "Filtrar"
  - `sortBy` — `string` ("revenue" | "sales" | "profit" | "name" | ...) — coluna de ordenacao ("Mais Vendidos" e o default)
  - `sortOrder` — `'ASC' | 'DESC'` — direcao
  - `filters` — `string[]` — chips de filtro ativos (ex.: "com custo de marketing", "com custo de produto")
- **Loja / periodo / moeda:** lidos do `Header` compartilhado (storeId, startDate, endDate, currency) — nao sao params locais desta rota; o `Header` os escreve em search params globais consumidos pela query da lista.
- **Loader (if any):** nenhum — a `ProductListSection` busca via hook no client.
- **errorComponent:** `RouteError` (default)

### ASCII Layout Map

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Navbar (shared)  │  Header (shared: loja · periodo · moeda · notif · perfil) │
├──────────────────┴─────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ ProductListSection                                                      │ │
│  │  "Produtos"   "71 produtos"                                             │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │ ProductToolbar  [Filtrar▾] [Mais Vendidos▾] [Itens por pagina▾]   │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │ ProductRow (Leaf ×N)                                              │  │ │
│  │  │ ProductRow (Leaf ×N)                                              │  │ │
│  │  │ ...                                                               │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │ ProductPagination                                                 │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ RecommendedAppsSection   "Aplicativos Recomendados"                     │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                           │ │
│  │  │ AppCard│ │ AppCard│ │ AppCard│ │ AppCard│  (Leaf ×N)                 │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘                           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Overlays:
  ProductFilterMenu  (Component, dropdown-menu) ── abre no clique de "Filtrar" na ProductToolbar
  ProductCostDrawer  (Dialog/sheet) ── abre no botao "C. Produto" / "Custo" de uma ProductRow
  MarketingCostDrawer (Dialog/sheet, wizard) ── abre no botao "Marketing" de uma ProductRow
```

### Component Tree

```text
ProductRouteShell                                            (Route Shell)
├─ ProductListSection                                        (Section, owns list query)
│  ├─ ProductToolbar                                         (Component, filtro/ordenacao/page-size)
│  ├─ ProductRow                                             (Leaf ×N)
│  └─ ProductPagination                                      (Component, paginacao)
└─ RecommendedAppsSection                                    (Section, estatico)
   └─ RecommendedAppCard                                     (Leaf ×N)

Overlays:
├─ ProductFilterMenu                                         (Component, dropdown-menu)
├─ ProductCostDrawer                                         (Dialog, sheet)  → ProductCostForm (Form Type C)
└─ MarketingCostDrawer                                       (Dialog, sheet, wizard) → MarketingCostWizardForm (Form Type B)
```

### Component Anatomy

**`ProductListSection`** (Section)

```text
ProductListSection
└─ section  [flex flex-col gap-4]
   ├─ Header: titulo + contador  [flex row between]
   │  ├─ Title: "Produtos"  [text-2xl font-bold]
   │  └─ Count: "71 produtos"  [text-sm text-muted-foreground]
   ├─ Toolbar: ref → ProductToolbar
   ├─ List: ref → ProductRow ×N  [flex flex-col gap-2, role="list"]
   └─ Footer: ref → ProductPagination
```

States:
- skeleton: 6 linhas `Skeleton` na altura de `ProductRow`
- empty: `Empty` primitive "Nenhum produto encontrado"
- error: `DataError` inline

**`ProductToolbar`** (Component)

Mockup:

```text
┌──────────────────────────────────────────────────────────────────┐
│ [🔎 Filtrar............▾]   [↕ Mais Vendidos ▾]   [Itens/pag ▾]   │
└──────────────────────────────────────────────────────────────────┘
```

Slots:

```text
ProductToolbar
└─ div  [flex row gap-2 items-center between]
   ├─ FilterTrigger: botao que abre ProductFilterMenu  [primitive: Button, variant="outline"]  (aria-haspopup="menu")
   │  └─ Label: "Filtrar"  + Icon  [lucide]
   ├─ SortSelect: ordenacao "Mais Vendidos"  [primitive: Select]  (aria-haspopup="menu")
   └─ PageSizeSelect: "Itens por pagina"  [primitive: Select]
```

**`ProductRow`** (Leaf ×N)

Mockup:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ [🖼] ThunderShield Tactical Jacket                                           │
│      Faturamento R$ 0,00 · Lucro Liquido R$ 0,00 · Conversao 0% · CPA R$0,00 │
│      Marketing R$0,00 · Taxas R$0,00 · Impostos R$0,00 · Frete · C.Produto   │
│                                          [ Marketing ]  [ C. Produto ]       │
└────────────────────────────────────────────────────────────────────────────┘
```

Slots:

```text
ProductRow
└─ Card  [primitive: Card]  [flex row items-center gap-3 p-3]
   ├─ Thumb: imagem do produto  [img, alt="Produto", size-12 rounded]
   ├─ Info: nome + metricas  [flex col gap-1 flex-1]
   │  ├─ Name: nome do produto  [font-semibold]  (ex.: "ThunderShield Tactical Jacket")
   │  └─ Metrics: grade de metricas  [grid/flex wrap text-xs]
   │     ├─ Faturamento (currency)   ├─ Vendas (int)
   │     ├─ LucroLiquido (currency, fg-green/red por sinal)
   │     ├─ Marketing (currency)     ├─ Taxas (currency)
   │     ├─ Impostos (currency)      ├─ Frete (currency)
   │     ├─ CustoProduto (currency)  ├─ CPA (currency)
   │     └─ Conversao (percent)
   └─ Actions: botoes de acao  [flex row gap-2]
      ├─ MarketingBtn: "Marketing" → useDialogStore.show(<MarketingCostDrawer productId/>)  [primitive: Button]
      └─ CostBtn: "C. Produto" → useDialogStore.show(<ProductCostDrawer productId/>)  [primitive: Button]
```

Variants:
- `lucroLiquido < 0` → valor em `fg-red`; `>= 0` → `fg-green`

**`ProductPagination`** (Component)

Mockup:

```text
┌──────────────────────────────────────────┐
│        ‹  1  2  3  …  8  ›                 │
└──────────────────────────────────────────┘
```

Slots:

```text
ProductPagination
└─ nav  [flex row gap-1 justify-center]  [primitive: Pagination]
   ├─ Prev / Next  [primitive: Button, variant="ghost", size="icon"]
   └─ PageItems: numeros de pagina  [primitive: Pagination]
```

**`ProductFilterMenu`** (Component)

Mockup:

```text
╭─────────────────────────────╮
│ Custo de Marketing        ▸ │
│ Custo de Produto          ▸ │
│ ─────────────────────────── │
│  Skyline   Wolf   Grey  ... │  (submenu por nome de produto)
╰─────────────────────────────╯
```

Slots:

```text
ProductFilterMenu
└─ DropdownMenu  [primitive: dropdown-menu]
   ├─ MenuItem: "Custo de Marketing"  (submenu, aria-haspopup="menu")
   ├─ MenuItem: "Custo de Produto"    (submenu, aria-haspopup="menu")
   └─ SubMenu: lista de itens de filtro / nomes  [role="menu"]  (×N itens)
```

**`RecommendedAppsSection`** (Section, estatico)

```text
RecommendedAppsSection
└─ section  [flex col gap-3]
   ├─ Title: "Aplicativos Recomendados"  [text-xl]
   ├─ AdLink: "Deseja anunciar sua marca aqui?"  [a, external]
   └─ Grid: ref → RecommendedAppCard ×N  [grid grid-cols-4 gap-3]
```

**`RecommendedAppCard`** (Leaf ×N)

Mockup:

```text
┌──────────────────────────┐
│ [🖼] BK Reviews          │
│ ⭐ 4.8  (40.000+)        │
│ O BK Reviews facilita... │
│              [ Visitar ] │
└──────────────────────────┘
```

Slots:

```text
RecommendedAppCard
└─ a (external)  [primitive: Card]  [grid gap-2 p-3]
   ├─ Logo: imagem do app  [img]
   ├─ Name: "BK Reviews"  [font-bold]
   ├─ Rating: "4.8" + star icon + "(40.000+)"
   ├─ Description: texto promocional
   └─ Cta: "Visitar"  [font-bold] + arrow icon
```

**`ProductCostDrawer`** (Dialog, sheet)

Mockup:

```text
╔════════════════════════════════════╗
║ Adicionar C. de Produto         [×] ║
╠════════════════════════════════════╣
║  Custo    [USD ▾] [ 0,00          ] ║
║  Frete    [USD ▾] [ 0,00          ] ║
║  ...                                ║
║  → Ver Historico de Custos          ║
╠════════════════════════════════════╣
║              [   Adicionar   ]      ║
╚════════════════════════════════════╝
```

Slots:

```text
ProductCostDrawer
└─ Sheet  [primitive: sheet]
   ├─ SheetHeader
   │  ├─ Title: "Adicionar C. de Produto"  [text-xl]
   │  └─ Close: botao fechar  [primitive: Button, variant="ghost", size="icon"]
   ├─ SheetBody: ref → ProductCostForm  (Form Type C)
   │  └─ HistoryLink: "Ver Historico de Custos" → /app/products/costs/id/$productId
   └─ SheetFooter: "Adicionar"  [primitive: Button]
```

**`ProductCostForm`** (Form Type C — dentro de ProductCostDrawer)

```text
ProductCostForm
└─ Form  [TanStack Form, schema = AddProductCost]
   ├─ cost: campo Custo  [primitive: input-group]  (input numerico + currency Select USD/BRL)
   ├─ shipping: campo Frete  [primitive: input-group]  (input numerico + currency Select)
   └─ (campos adicionais de custo, ×5 conforme outline)  [primitive: input]
```

**`MarketingCostDrawer`** (Dialog, sheet, wizard)

Mockup:

```text
╔══════════════════════════════════════╗
║ Adicionar Custo de Marketing      [×] ║
╠══════════════════════════════════════╣
║  [ Automatico ]   [  Manual  ]        ║   ← step 1
║  ─────────────────────────────────────║
║  body do step atual (ver Form)        ║
╠══════════════════════════════════════╣
║   [ Voltar ]            [ Continuar ] ║
╚══════════════════════════════════════╝
```

Slots:

```text
MarketingCostDrawer
└─ Sheet  [primitive: sheet]
   ├─ SheetHeader: titulo dinamico por step
   │  └─ Close  [primitive: Button, variant="ghost", size="icon"]
   ├─ SheetBody: ref → MarketingCostWizardForm  (Form Type B)
   └─ SheetFooter: navegacao (Voltar / Continuar / Adicionar)  [primitive: Button]
```

**`MarketingCostWizardForm`** (Form Type B — wizard multi-step)

```text
MarketingCostWizardForm
└─ Form  [TanStack Form, schema = AddMarketingCost; navegacao via useMarketingWizardStore]
   ├─ Step 1 — Modo  ("Adicionar Custo de Marketing")
   │  └─ mode: ToggleGroup "Automatico" | "Manual"  [primitive: toggle-group]
   ├─ Step 2 — Perfis  ("Selecione os Perfis")
   │  ├─ search: "Buscar perfil"  [primitive: input]
   │  ├─ selectAll: "Selecionar Todos"  [primitive: checkbox]
   │  └─ profiles[]: lista de perfis (grid 2col)  [primitive: checkbox ×N]
   ├─ Step 3 — Campanhas  ("Selecione as Campanhas")
   │  ├─ search: "Buscar campanha"  [primitive: input]
   │  └─ campaigns[]: lista de campanhas  [primitive: checkbox ×N]
   └─ Step final — Revisao  ("Selecione as Campanhas" / "Desselecionar Todos")
      └─ resumo das campanhas selecionadas + confirmacao
```

States:
- A navegacao de steps (indice atual, "Voltar"/"Continuar") e mantida em `useMarketingWizardStore` (Zustand), nao em URL.

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| ProductRouteShell | RouteShell | — | reads: [page, limit, search, sortBy, sortOrder, filters] | — | — | create-route-local | `routes/(app)/products/index.tsx` | /route |
| ProductListSection | Section | `useListProducts({ page, limit, search, sortBy, sortOrder, filters, storeId, startDate, endDate, currency })` | reads: [page, limit, search, sortBy, sortOrder, filters] | — | — | create-route-local | `routes/(app)/products/-components/ProductListSection/` | /component |
| ProductToolbar | Component | props from ProductListSection | reads/writes: [search, sortBy, sortOrder, limit] | — | — | create-route-local | `routes/(app)/products/-components/ProductListSection/ProductToolbar/` | /component |
| ProductRow | Leaf | props from ProductListSection | — | — | — | create-route-local | `routes/(app)/products/-components/ProductListSection/ProductRow/` | /component |
| ProductPagination | Component | props from ProductListSection | reads/writes: [page] | — | — | reuse | `@/components/ui/pagination.tsx` | (reuse) |
| ProductFilterMenu | Component | `useListProductFilters()` | writes: [filters] | — | `[openSub]` | create-route-local | `routes/(app)/products/-components/ProductListSection/ProductFilterMenu/` | /component |
| RecommendedAppsSection | Section | estatico (constante local) | — | — | — | create-route-local | `routes/(app)/products/-components/RecommendedAppsSection/` | /component |
| RecommendedAppCard | Leaf | props from RecommendedAppsSection | — | — | — | create-route-local | `routes/(app)/products/-components/RecommendedAppsSection/RecommendedAppCard/` | /component |
| ProductCostDrawer | Dialog | owns mutation `useAddProductCost()` | — | useDialogStore | — | create-route-local | `routes/(app)/products/-components/ProductCostDrawer/` | /component |
| ProductCostForm | Form | props (productId) from ProductCostDrawer | — | — | TanStack Form | create-route-local | `routes/(app)/products/-components/ProductCostDrawer/ProductCostForm.tsx` | /form |
| MarketingCostDrawer | Dialog | owns mutation `useAddMarketingCost()` | — | useDialogStore | — | create-route-local | `routes/(app)/products/-components/MarketingCostDrawer/` | /component |
| MarketingCostWizardForm | Form | `useListProductAdProfiles()`, `useListProductAdCampaigns()` | — | useMarketingWizardStore: { reads: [step], writes: [step] } | TanStack Form | create-route-local | `routes/(app)/products/-components/MarketingCostDrawer/MarketingCostWizardForm.tsx` | /form |

**Per-node notes:**

- **ProductListSection:** Skeleton: 6 placeholders de linha. Empty: `Empty` "Nenhum produto encontrado". Error: `DataError`. ARIA: `role="list" aria-label="Lista de produtos"`. Rationale: lista acoplada ao dominio de produto, sem paralelo em outras rotas.
- **ProductToolbar:** combina o trigger do `ProductFilterMenu` (aria-haspopup="menu"), o select de ordenacao e o select de itens por pagina; escreve diretamente nos search params da lista.
- **ProductRow:** ARIA: cada linha e um item de lista; botoes "Marketing" / "C. Produto" sao `aria-label`-ados pois abrem drawers. Mutations nao vivem aqui — apenas disparam `useDialogStore.show(...)`.
- **ProductFilterMenu:** dois submenus de filtro ("Custo de Marketing", "Custo de Produto") mais lista por nome; usa o primitive `dropdown-menu`.
- **RecommendedAppsSection / RecommendedAppCard:** conteudo promocional estatico; nao consome controller. Mantido route-local por nao haver segundo consumidor.
- **ProductCostDrawer / MarketingCostDrawer:** mapeiam para o primitive `sheet` (drawer lateral). Abertos via `useDialogStore.show(...)` a partir de `ProductRow`; nao recebem props `open`/`onOpenChange`.
- **MarketingCostWizardForm:** Form Type B; a navegacao entre os 4 steps usa `useMarketingWizardStore` (indice de step). Steps 2/3 buscam perfis e campanhas sob demanda.

### Reuse Summary

- **Reuse (no work):** `ProductPagination` → `@/components/ui/pagination.tsx`; primitives `sheet`, `dropdown-menu`, `select`, `input`, `input-group`, `checkbox`, `toggle-group`, `button`, `card`, `empty`, `skeleton` em `@/components/ui/`; `Navbar` e `Header` em `@/components/` (shared, parte do Route Shell — internals nao redesenhados aqui).
- **Promote to shared:** nenhum nesta rota.
- **Create new shared:** nenhum — todos os componentes de dominio sao especificos de produto.
- **Create route-local:** `ProductListSection`, `ProductToolbar`, `ProductRow`, `ProductFilterMenu`, `RecommendedAppsSection`, `RecommendedAppCard`, `ProductCostDrawer`, `ProductCostForm`, `MarketingCostDrawer`, `MarketingCostWizardForm` (default; acoplados ao dominio de produto).

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | ProductRouteShell | `routes/(app)/products/index.tsx` | define search params + breadcrumb |
| 2 | /store | useMarketingWizardStore | `routes/(app)/products/-stores/useMarketingWizardStore.ts` | indice de step do wizard |
| 3 | /component | ProductListSection | `routes/(app)/products/-components/ProductListSection/` | owns `useListProducts` |
| 4 | /component | ProductToolbar | `.../ProductListSection/ProductToolbar/` | escreve search/sort/page-size |
| 5 | /component | ProductFilterMenu | `.../ProductListSection/ProductFilterMenu/` | dropdown-menu de filtros |
| 6 | /component | ProductRow | `.../ProductListSection/ProductRow/` | Leaf ×N; abre drawers |
| 7 | (reuse) | ProductPagination | `@/components/ui/pagination.tsx` | ja existe |
| 8 | /component | RecommendedAppsSection | `routes/(app)/products/-components/RecommendedAppsSection/` | estatico |
| 9 | /component | RecommendedAppCard | `.../RecommendedAppsSection/RecommendedAppCard/` | Leaf ×N |
| 10 | /component | ProductCostDrawer | `routes/(app)/products/-components/ProductCostDrawer/` | sheet + useDialogStore |
| 11 | /form | ProductCostForm | dentro de ProductCostDrawer | Type C |
| 12 | /component | MarketingCostDrawer | `routes/(app)/products/-components/MarketingCostDrawer/` | sheet + useDialogStore |
| 13 | /form | MarketingCostWizardForm | dentro de MarketingCostDrawer | Type B (4 steps) |

### Open Questions

- OQ-1. As outlines limpas colapsam a lista de produtos no bloco "Aplicativos Recomendados"; a anatomia de `ProductRow` foi reconstruida a partir dos rotulos do HTML original (Faturamento, Lucro Liquido, Marketing, Taxas, Impostos, Frete, C. Produto, CPA, Conversao). Confirmar se a lista e renderizada como cards (`ProductRow`) ou como `DataTable` compartilhado — neste ultimo caso `ProductRow` vira coluna e o componente passa a `reuse` de `@/components/DataTable`.

## Controller Contract

> Consome os schemas de [`_schema-fundamentals.md`](../_schema-fundamentals.md)
> (`MetricSchema`, `Money`, `Currency`, `ProductCostBreakdownSchema`, enums
> `MarketingPlatform`/`AdAttribution`). Aplica os princípios: **dados, não apresentação**
> (sem `label`, `href`, flags derivadas ou strings formatadas — o frontend deriva rótulo,
> moeda e ícone a partir de enums + mapas i18n). Listas usam `z.paginatedResponse`; métricas
> de produto (faturamento, custo) usam `MetricSchema`/`Money`; custo de marketing referencia
> `MarketingPlatform`.

### Queries

| Controller | Metodo + Path | Componente(s) consumidor(es) | Quando carrega |
|---|---|---|---|
| `ListProducts` (novo) | `GET /ui/bkdash/products` | `ProductListSection` | No mount e a cada mudanca de page/limit/search/sortBy/sortOrder/filters ou de loja/periodo/moeda do Header |
| `ListProductFilters` (novo) | `GET /ui/bkdash/products/filters` | `ProductFilterMenu` | Quando o menu "Filtrar" e aberto |
| `ListProductAdProfiles` (novo) | `GET /ui/bkdash/products/ad-profiles` | `MarketingCostWizardForm` (step 2) | Ao entrar no step "Selecione os Perfis" |
| `ListProductAdCampaigns` (novo) | `GET /ui/bkdash/products/ad-campaigns` | `MarketingCostWizardForm` (step 3/final) | Ao entrar no step "Selecione as Campanhas" |
| `GetProductCostHistory` (novo) | `GET /ui/bkdash/products/{productId}/cost-history` | `ProductCostDrawer` (link "Ver Historico de Custos" → rota `/app/products/costs/id/$productId`) | Ao navegar para o historico |

### Commands

| Controller | Metodo + Path | Componente | Payload (campos — sem apresentação) |
|---|---|---|---|
| `AddProductCost` (novo) | `POST /ui/bkdash/products/{productId}/cost` | `ProductCostForm` | `cost` (Money), `shipping` (Money), `currency` (`Currency`) |
| `AddMarketingCost` (novo) | `POST /ui/bkdash/products/{productId}/marketing-cost` | `MarketingCostWizardForm` | `attribution` (`AdAttribution` — auto/manual), `profileIds` (string[]), `campaignIds` (string[]) |

### Response Schemas (sketch)

```ts
import {
  MetricSchema, Money, Currency,
  MarketingPlatform, AdAttribution,
  ProductCostBreakdownSchema,
} from '@ui/schemas' // ver _schema-fundamentals.md

// ListProducts — uma linha por produto; métricas no período selecionado.
// Cada métrica é Metric { value, deltaPct }; valores monetários em Money (moeda do Header).
// A moeda NÃO viaja por linha (é a do contexto/Header); o frontend formata.
export const ProductMetricsSchema = z.object({
  revenue:        MetricSchema,             // Faturamento
  sales:          MetricSchema,             // Vendas (unidades)
  netProfit:      MetricSchema,             // Lucro Líquido (value pode ser negativo)
  marketingCost:  MetricSchema,             // Marketing (total)
  fees:           MetricSchema,             // Taxas
  taxes:          MetricSchema,             // Impostos
  productCost:    ProductCostBreakdownSchema, // product + shipping (#9: compõe via fundamentals)
  cpa:            MetricSchema,             // CPA
  conversionRate: MetricSchema,             // Conversão (value em fração; frontend formata %)
})

export const ListProductsOutputSchema = z.paginatedResponse({
  id: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  metrics: ProductMetricsSchema,
  // chips de filtro (com/sem custo) são DERIVADOS no frontend de metrics.marketingCost.value
  // e metrics.productCost.product.value — não viajam como flags no contrato (#1/#8).
})

// ListProductFilters — alimenta o ProductFilterMenu (menu + submenus).
// Filtros de custo são tipados por enum (sem 'label'); o frontend deriva o texto via i18n (#1).
export const ProductCostFilter = z.enum(['marketingCost', 'productCost'])
export const ListProductFiltersOutputSchema = z.object({
  costFilters: z.array(ProductCostFilter),                     // enum — label derivado no frontend
  products: z.array(z.object({ id: z.string(), name: z.string() })), // submenu por nome
})

// ListProductAdProfiles — step 2 do wizard. platform referencia MarketingPlatform (#5).
export const ListProductAdProfilesOutputSchema = z.paginatedResponse({
  id: z.string(),
  name: z.string(),
  platform: MarketingPlatform,
})

// ListProductAdCampaigns — step 3/final do wizard. status é enum de domínio (screen-local).
export const CampaignStatus = z.enum(['active', 'paused', 'archived'])
export const ListProductAdCampaignsOutputSchema = z.paginatedResponse({
  id: z.string(),
  name: z.string(),
  profileId: z.string(),    // perfil dono da campanha
  platform: MarketingPlatform,
  spend: Money,             // gasto da campanha no período (moeda do contexto)
  status: CampaignStatus,
})

// GetProductCostHistory — histórico exibido fora do drawer.
export const GetProductCostHistoryOutputSchema = z.object({
  productId: z.string(),
  product: z.object({ name: z.string(), imageUrl: z.string().nullable() }),
  currency: Currency,
  entries: z.array(z.object({
    id: z.string(),
    date: z.date(),
    cost: Money,
    shipping: Money,
  })),
})
```

### Reaproveitamento de Controllers

- **Existentes (reutilizar):** nenhum controller de dominio de produto ja existe. `GetDashboard`, `ListOrders`, `GetOnboarding`, `SaveOnboardingState`, `CompleteOnboarding`, `ListenEvents` nao cobrem a tela. `GetUserInfo` e `ListNotifications` continuam servindo o `Header`/`Navbar` compartilhados (reutilizados no Route Shell, fora do contrato local). O contexto loja/periodo/moeda vem do `Header` (search params globais), nao de um controller proprio desta rota.
- **Novos (criar):** `ListProducts`, `ListProductFilters`, `ListProductAdProfiles`, `ListProductAdCampaigns`, `GetProductCostHistory` (queries); `AddProductCost`, `AddMarketingCost` (commands).
- **Compartilhados:** enums e schemas de `_schema-fundamentals.md` (`MetricSchema`, `Money`, `Currency`, `MarketingPlatform`, `AdAttribution`, `ProductCostBreakdownSchema`) são reusados aqui — não redefinidos. `MarketingPlatform` é o mesmo enum consumido pelo `GetDashboard` (`ads.byPlatform`) da rota `/app`.
