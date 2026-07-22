# Rota /app/finance/costs — Custos Operacionais (Financas)

## Visao Geral

A tela de Custos Operacionais permite ao usuario gerenciar os custos recorrentes e pontuais da operacao da loja (saidas e entradas). O corpo principal e uma tabela paginada de custos com colunas Tipo, Valor, Descricao, Data de Inicio e Categoria, alem de selecao por linha (checkbox para exclusao em lote) e acao de editar. Acima da tabela ha uma toolbar com filtro ("Filtrar"), busca, acao de excluir selecionados e a acao de incluir um novo custo, que abre um drawer lateral (sheet) com o formulario "Adicionar Custo Operacional".

No estado capturado a tabela esta vazia ("Nenhum registro encontrado"). A pagina tambem hospeda a secao compartilhada "Aplicativos Recomendados" (grid de apps externos / cross-sell), que aparece em varias telas do app e nao e o foco funcional desta rota. O drawer reusa o primitivo `sheet` e contem um `Form` (TanStack Form) com toggle de tipo (Saida/Entrada), valor monetario com seletor de moeda, descricao, frequencia, data de inicio (e data de fim quando recorrente) e categoria — o mesmo formulario serve para criar e editar um custo (`CreateOperationalCost` / `UpdateOperationalCost`).

## Inventario de Estados

| Arquivo HTML | Estado / Interacao | Citizen afetado |
|---|---|---|
| `app_finance_cost.html` | Estado base: header da rota, toolbar (Filtrar / Buscar / Deletar / Incluir), tabela de custos vazia ("Nenhum registro encontrado"), secao "Aplicativos Recomendados" e FAB "+" | `OperationalCostSection`, `CostToolbar`, `OperationalCostTable`, `RecommendedAppsSection`, `AddCostFab` |
| `app_finance_cost_drawer-de-custo-operacional.html` | Drawer lateral aberto: formulario "Adicionar Custo Operacional" (tipo Saida/Entrada, valor + moeda, descricao, frequencia, data de inicio, categoria, botao Adicionar) | `OperationalCostDrawer` (Dialog/sheet) + `OperationalCostForm` (Form) |

## UI Composition

### URL Contract

- **Path:** `/app/finance/costs`
- **Breadcrumb:** `Financas › Custos Operacionais`
- **Search params (Zod sketch):**
  - `pageNumber` — `number` (default 0) — pagina atual da tabela
  - `pageSize` — `number` (default 10) — itens por pagina
  - `search` — `string` (default "") — busca textual (descricao)
  - `category` — `OperationalCostCategory | undefined` — filtro de categoria
  - `costId` — `string | undefined` — id do custo em edicao (abre o `OperationalCostDrawer` em modo editar)
- **Loader (if any):** nenhum loader bloqueante; dados carregados client-side via query da Section.
- **errorComponent:** `RouteError` (default)

### ASCII Layout Map

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Navbar (shared, left rail)  │  Header (shared, top bar)                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────────────┐   │
│ │ Custos Operacionais — "Gerencie os custos operacionais da sua empresa"   │   │  (Route Shell static title)
│ └────────────────────────────────────────────────────────────────────────┘   │
│                                                                                │
│ ┌──OperationalCostSection────────────────────────────────────────────────┐   │
│ │ ┌──CostToolbar───────────────────────────────────────────────────────┐  │   │
│ │ │ [Filtrar ⏷] [Buscar ___] [Deletar]            [Incluir Dado Op.]   │  │   │
│ │ └────────────────────────────────────────────────────────────────────┘  │   │
│ │ ┌──OperationalCostTable──────────────────────────────────────────────┐  │   │
│ │ │ ☐ │ Tipo │ Valor │ Descricao │ Data de Inicio │ Categoria │ Acoes   │  │   │
│ │ │ ┌──OperationalCostRow (Leaf ×N)──────────────────────────────────┐ │  │   │
│ │ │ │ ☐ Saida R$… … dd/mm … [✎]                                     │ │  │   │
│ │ │ └────────────────────────────────────────────────────────────────┘ │  │   │
│ │ │ (empty: "Nenhum registro encontrado")                              │  │   │
│ │ └────────────────────────────────────────────────────────────────────┘  │   │
│ │ ┌──CostPagination────────────────────────────────────────────────────┐  │   │
│ │ │  ‹ 1 2 3 ›                                          10 / pagina ⏷  │  │   │
│ │ └────────────────────────────────────────────────────────────────────┘  │   │
│ └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                │
│ ┌──RecommendedAppsSection────────────────────────────────────────────────┐   │
│ │ "Aplicativos Recomendados"   "Deseja anunciar sua marca aqui?"          │   │
│ │ ┌──RecommendedAppCard (Leaf ×N)──────────────────────────────────┐      │   │
│ │ │ [🖼] BK Reviews  ★4.8 (40.000+)  [Visitar]                      │      │   │
│ │ └────────────────────────────────────────────────────────────────┘      │   │
│ └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                │
│                                                          ( ⊕ AddCostFab fixed) │
└──────────────────────────────────────────────────────────────────────────────┘

Overlays:
  OperationalCostDrawer (Dialog, sheet) ── opens on click of FAB "+" / "Incluir" (criar)
                                            ou linha [editar] (editar via costId)
    └─ OperationalCostForm (Form Type C, dentro do drawer)
```

### Component Tree

```text
CostRouteShell                                               (Route Shell)
├─ Navbar                                                    (shared Component, reuse — nao redesenhar)
├─ Header                                                    (shared Component, reuse — nao redesenhar)
├─ OperationalCostSection                                    (Section, owns list query)
│  ├─ CostToolbar                                            (Component, filtro/busca/deletar/incluir)
│  ├─ OperationalCostTable                                   (Component, render da tabela + empty)
│  │  └─ OperationalCostRow                                  (Leaf ×N)
│  └─ CostPagination                                         (Component, escreve URL pageNumber/pageSize)
├─ RecommendedAppsSection                                    (Section, owns recommended-apps query)
│  └─ RecommendedAppCard                                     (Leaf ×N)
└─ AddCostFab                                                (Component, action → abre drawer)

Overlays:
└─ OperationalCostDrawer                                     (Dialog, sheet, route-local)
   └─ OperationalCostForm                                    (Form Type C)
```

### Component Anatomy

**`OperationalCostSection`** (Section)

```text
OperationalCostSection
└─ section  [flex col, gap-4]
   ├─ Toolbar: ref → CostToolbar
   ├─ Body: ref → OperationalCostTable (contem OperationalCostRow ×N)
   └─ Footer: ref → CostPagination
```

States:
- skeleton: toolbar + 5 linhas de tabela como `Skeleton`
- empty: `OperationalCostTable` renderiza "Nenhum registro encontrado"
- error: `DataError` inline

**`CostToolbar`** (Component)

Mockup:

```text
┌──────────────────────────────────────────────────────────────────┐
│ [Filtrar ⏷] [Buscar __________]  [Deletar]      [Incluir Dado Op.]│
└──────────────────────────────────────────────────────────────────┘
```

```text
CostToolbar
└─ div  [flex row, between, gap-2]
   ├─ Filter: botao "Filtrar"  [primitive: DropdownMenu]  (aria-haspopup="menu", escreve URL category)
   ├─ Search: input de busca  [primitive: Input]  (useDebouncedSearch → URL search)
   ├─ DeleteAction: botao "Deletar"  [primitive: Button]  (habilita com ≥1 linha selecionada → DeleteOperationalCost batch)
   └─ AddAction: botao "Incluir Dado Operacional"  [primitive: Button]  → useDialogStore.show(<OperationalCostDrawer />)
```

Variants:
- nenhuma linha selecionada → "Deletar" desabilitado
- filtro ativo → badge de contagem no "Filtrar"

**`OperationalCostTable`** (Component)

Mockup:

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ ☐ │ Tipo │ Valor │ Descricao │ Data de Inicio │ Categoria │ Acoes          │
├───┼──────┼───────┼───────────┼────────────────┼───────────┼────────────────┤
│ ☐ │Saida │ R$ …  │ …         │ dd/mm/aaaa     │ …         │ [✎]            │
│ ...                                                                        │
│                                                                            │
│              (vazio)  Nenhum registro encontrado                           │
└──────────────────────────────────────────────────────────────────────────┘
```

```text
OperationalCostTable
└─ div  [primitive: Table]  (data-table grid)
   ├─ Head: linha de cabecalho  [primitive: Table]
   │  ├─ Col: SelectAll checkbox  [primitive: Checkbox]
   │  ├─ Col: "Tipo"
   │  ├─ Col: "Valor"  [txt-right]
   │  ├─ Col: "Descricao"
   │  ├─ Col: "Data de Inicio"
   │  ├─ Col: "Categoria"
   │  └─ Col: "Acoes"  [txt-right]
   ├─ Body: OperationalCostRow ×N  [primitive: Table]
   └─ Empty: Empty "Nenhum registro encontrado"  [primitive: Empty]
```

States:
- empty: `Empty` com texto "Nenhum registro encontrado"
- skeleton: 5 linhas `Skeleton`

**`OperationalCostRow`** (Leaf ×N)

Mockup:

```text
│ ☐ │ Saida │ R$ 1.250,00 │ Aluguel galpao │ 01/06/2026 │ Operacional │ [✎] │
```

```text
OperationalCostRow
└─ div  [primitive: Table row, grid]
   ├─ Select: checkbox de selecao  [primitive: Checkbox]  (aria-label="Selecionar custo")
   ├─ Tipo: Badge "Saida" / "Entrada"  [primitive: Badge]  (variant por sinal)
   ├─ Valor: texto monetario  [txt-right]  (currency-formatted)
   ├─ Descricao: texto
   ├─ DataInicio: data dd/mm/aaaa
   ├─ Categoria: texto
   └─ Acoes: Edit IconButton  [primitive: Button ghost icon]  (Pencil, aria-label="Editar custo") → abre drawer(costId)
```

Variants:
- `flow === 'credit'` (entrada) → Badge variant success; `flow === 'debit'` (saída) → Badge variant danger (derivado no frontend)

**`CostPagination`** (Component)

Mockup:

```text
┌───────────────────────────────────────────────┐
│            ‹  1  2  3  ›       10 / pagina ⏷   │
└───────────────────────────────────────────────┘
```

```text
CostPagination
└─ div  [flex row, between]  [primitive: Pagination]
   ├─ Pages: controles de pagina  [primitive: Pagination]  (escreve URL pageNumber)
   └─ PageSize: seletor itens/pagina  [primitive: Select]  (escreve URL pageSize)
```

**`RecommendedAppsSection`** (Section)

```text
RecommendedAppsSection
└─ section  [flex col, gap-4]
   ├─ Header: titulo "Aplicativos Recomendados" + link "Deseja anunciar sua marca aqui?"  [primitive: Button link]
   └─ Grid: RecommendedAppCard ×N  [grid grid-cols-4 gap-4]
```

**`RecommendedAppCard`** (Leaf ×N)

Mockup:

```text
┌──────────────────────────────┐
│ [🖼]  BK Reviews              │
│ ★ 4.8  (40.000+)             │
│ "O BK Reviews e um app…"      │
│              [ Visitar → ]    │
└──────────────────────────────┘
```

```text
RecommendedAppCard
└─ a (href externo)  [primitive: Card]  [grid]
   ├─ Logo: img  [🖼]  (alt = nome do app)
   ├─ Name: titulo bold  (ex.: "BK Reviews")
   ├─ Rating: estrela + nota + contagem  (ex.: "4.8  (40.000+)")
   ├─ Description: paragrafo
   └─ Cta: "Visitar" + icone seta  [primitive: Button link]
```

**`AddCostFab`** (Component)

Mockup:

```text
        ╭───╮
        │ + │   (fixed, canto inferior direito)
        ╰───╯
```

```text
AddCostFab
└─ button  [fixed, rounded-full, bg-emerald, p-4]  [primitive: Button]
   └─ Icon: Plus  [lucide]  (aria-label="Adicionar custo operacional") → useDialogStore.show(<OperationalCostDrawer />)
```

**`OperationalCostDrawer`** (Dialog, sheet)

Mockup:

```text
                         ╔════════════════════════════════════╗
                         ║ Adicionar Custo Operacional    [×] ║
                         ╠════════════════════════════════════╣
                         ║  (OperationalCostForm)             ║
                         ║  [ Saida ] [ Entrada ]             ║
                         ║  Valor   [BRL ⏷] [ 0,00         ]  ║
                         ║  Descricao        [             ]  ║
                         ║  Frequencia       [Selecione  ⏷]  ║
                         ║  Data de Inicio   [Selecione  📅] ║
                         ║  Categoria        [Selecione  ⏷]  ║
                         ║                    [ Adicionar ]   ║
                         ╚════════════════════════════════════╝
```

```text
OperationalCostDrawer
└─ Sheet (lado direito)  [primitive: Sheet]
   ├─ Header: titulo "Adicionar Custo Operacional" / "Editar Custo Operacional" + Close  [primitive: Button icon]
   ├─ Body: ref → OperationalCostForm  (Form Type C)
   └─ Footer: submit reside no proprio Form ("Adicionar" / "Salvar")
```

Variants:
- `costId` presente → titulo "Editar…", form pre-preenchido, botao "Salvar"

**`OperationalCostForm`** (Form Type C)

```text
OperationalCostForm
└─ form  [flex col, gap-4]
   ├─ type: ToggleGroup Saida / Entrada  [primitive: ToggleGroup]  (campo "type")
   ├─ currency: Select de moeda "BRL"  [primitive: Select]  (campo "currency")
   ├─ value: Input monetario "0,00"  [primitive: Input + InputGroup]  (campo "value")
   ├─ description: Input texto  [primitive: Input]  (campo "description")
   ├─ frequency: Select "Selecione a frequencia"  [primitive: Select]  (campo "frequency")
   ├─ startDate: DatePicker "Selecione a data de inicio"  [primitive: DatePicker]  (campo "startDate", aria-haspopup="dialog")
   ├─ endDate: DatePicker (condicional, se frequencia recorrente)  [primitive: DatePicker]  (campo "endDate")
   ├─ category: Select "Selecione a categoria"  [primitive: Select]  (campo "category")
   └─ submit: Button "Adicionar" / "Salvar"  [primitive: Button]
```

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| CostRouteShell | RouteShell | — | reads: [pageNumber,pageSize,search,category,costId] | — | — | create-route-local | `routes/(app)/finance/costs/index.tsx` | /route |
| Navbar | Component | — | — | useSidebarStore | — | reuse | `@/components/Navbar/` | (reuse) |
| Header | Component | — | reads: [date,currency,store] | — | — | reuse | `@/components/Header/` | (reuse) |
| OperationalCostSection | Section | `useListOperationalCosts({ pageNumber, pageSize, search, category })` | reads: [pageNumber,pageSize,search,category] | — | `[selectedIds]` | create-route-local | `routes/(app)/finance/costs/-components/OperationalCostSection/` | /component |
| CostToolbar | Component | props de OperationalCostSection | reads: [search,category], writes: [search,category] | useDialogStore | `[open]` | create-route-local | `.../OperationalCostSection/CostToolbar/` | /component |
| OperationalCostTable | Component | props from OperationalCostSection | — | — | — | reuse (DataTable) | `@/components/DataTable` | /component |
| OperationalCostRow | Leaf | props from OperationalCostTable | — | useDialogStore | — | create-route-local | `.../OperationalCostSection/OperationalCostRow/` | /component |
| CostPagination | Component | props from OperationalCostSection | reads: [pageNumber,pageSize], writes: [pageNumber,pageSize] | — | — | reuse (Pagination) | `@/components/ui/pagination.tsx` | /component |
| RecommendedAppsSection | Section | `useListRecommendedApps()` | — | — | — | promote-to-shared | `@/components/RecommendedAppsSection/` | /component |
| RecommendedAppCard | Leaf | props from RecommendedAppsSection | — | — | — | promote-to-shared | `@/components/RecommendedAppsSection/RecommendedAppCard/` | /component |
| AddCostFab | Component | — | writes: [costId] (limpa) | useDialogStore | — | create-route-local | `.../OperationalCostSection/AddCostFab/` | /component |
| OperationalCostDrawer | Dialog | `useGetOperationalCost({ costId })` quando edit | reads: [costId] | useDialogStore | — | create-route-local | `.../OperationalCostDrawer/` | /component |
| OperationalCostForm | Form | mutacoes Create/Update | — | — | TanStack Form state | create-route-local | `.../OperationalCostDrawer/OperationalCostForm.tsx` | /form |

**Per-node notes:**

- **OperationalCostSection:** Skeleton: toolbar + 5 linhas `Skeleton`. Error: `DataError` inline. Sole data root da regiao de custos (orquestra CostToolbar + OperationalCostTable + CostPagination → 3 sub-componentes distintos). Mantem `selectedIds` para exclusao em lote. Rationale: dominio financeiro acoplado, sem paralelo em outra rota.
- **OperationalCostTable:** Empty: `Empty` "Nenhum registro encontrado" (citado em `app_finance_cost.html`). ARIA: `role="table" aria-label="Custos operacionais"`. Reuse: shared `DataTable` cobre cabecalho + body + empty + selecao; OperationalCostRow define as celulas.
- **OperationalCostRow:** ARIA: `aria-label="Selecionar custo"` no checkbox e `aria-label="Editar custo"` no icone. Cada linha = `OperationalCostRow ×N` (grupo repetido da tabela).
- **RecommendedAppsSection / RecommendedAppCard:** mesma forma aparece tambem na rota dashboard/outras telas (cross-sell) → promote-to-shared. Cada card = `… ×3 (repeated siblings)` no outline (`app_finance_cost.html`).
- **OperationalCostDrawer:** abre via FAB/"Incluir" (criar) ou OperationalCostRow editar (editar). Mapeia ao primitivo `sheet`. Drawer state: `app_finance_cost_drawer-de-custo-operacional.html`.
- **OperationalCostForm:** validators a partir do schema SDK de `CreateOperationalCost`/`UpdateOperationalCost`. Campo `startDate`/`endDate` usam DatePicker (aria-haspopup="dialog" no outline do drawer); `endDate` so aparece quando a frequencia e recorrente.

### Reuse Summary

- **Reuse (no work):** `Navbar` (`@/components/Navbar/`), `Header` (`@/components/Header/`), `OperationalCostTable` via `DataTable` (`@/components/DataTable`), `CostPagination` via `Pagination` (`@/components/ui/pagination.tsx`), `OperationalCostDrawer` via `Sheet` (`@/components/ui/sheet.tsx`).
- **Promote to shared:** `RecommendedAppsSection` + `RecommendedAppCard` — consumidores: rota `/app/finance/costs` e `/app` (dashboard) e demais telas do app exibem o mesmo grid "Aplicativos Recomendados"; alvo `@/components/RecommendedAppsSection/`.
- **Create new shared:** nenhum.
- **Create route-local:** `CostRouteShell`, `OperationalCostSection`, `CostToolbar`, `OperationalCostRow`, `AddCostFab`, `OperationalCostDrawer`, `OperationalCostForm` — acoplados ao dominio de custos operacionais.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | CostRouteShell | `routes/(app)/finance/costs/index.tsx` | URL contract (pageNumber, pageSize, search, category, costId) |
| 2 | /component (promote) | RecommendedAppsSection + RecommendedAppCard | `@/components/RecommendedAppsSection/` | extrair do dashboard; consumidores: cost + dashboard |
| 3 | /component | OperationalCostSection | `routes/(app)/finance/costs/-components/OperationalCostSection/` | owns `useListOperationalCosts`, selectedIds |
| 4 | /component | CostToolbar | `.../OperationalCostSection/CostToolbar/` | filtro/busca/deletar/incluir |
| 5 | /component | OperationalCostTable | consome `@/components/DataTable` | empty "Nenhum registro encontrado" |
| 6 | /component | OperationalCostRow | `.../OperationalCostSection/OperationalCostRow/` | Leaf ×N; selecao + editar |
| 7 | /component | CostPagination | consome `@/components/ui/pagination.tsx` | escreve URL pageNumber/pageSize |
| 8 | /component | AddCostFab | `.../OperationalCostSection/AddCostFab/` | abre drawer |
| 9 | /component | OperationalCostDrawer | `.../OperationalCostDrawer/` | usa primitivo `sheet`; modo criar/editar |
| 10 | /form | OperationalCostForm | `.../OperationalCostDrawer/OperationalCostForm.tsx` | dentro do drawer (Type C) |

Nenhum `/primitive` pendente: a tela nao possui graficos; drawer mapeia ao `sheet` existente; tabela ao `DataTable`/`Table` existente.

### Open Questions

- OQ-1. O outline do drawer mostra "×2 repeated siblings" no grupo de tipo, mas o HTML so revela rotulos "Saida" e "Entrada" — proposto: ToggleGroup de 2 opcoes (type=saida/entrada). Confirmar se ha um terceiro tipo.
- OQ-2. Os valores possiveis de `frequency` e `category` (placeholders "Selecione a frequencia" / "Selecione a categoria") nao aparecem no snapshot — necessario o enum do backend (`OperationalCostCategory`, `OperationalCostFrequency`).
- OQ-3. Confirmar se `endDate` ("Data Fim") so se aplica a custos recorrentes (sugerido pelo SPEC anterior).

## Controller Contract

> Consome os schemas de [`_schema-fundamentals.md`](../../_schema-fundamentals.md)
> (`OperationalCostItemSchema`, `Money`, enums `OperationalCostFlow`/`CostFrequency`/`Currency`).
> Esta rota é a **DONA de OperationalCost**: a entidade vive aqui e é reusada por outras telas
> (ex.: o `OperationalCostDrawer` do dashboard). Aplica os princípios: **um controller por
> preocupação** e **dados, não apresentação** — sem `label`, `editable`, `color` ou textos
> formatados; o frontend deriva rótulo/badge/formatação a partir dos enums + mapas i18n.

### Queries

| Controller | Metodo + Path | Componente(s) consumidor(es) | Quando carrega |
|---|---|---|---|
| `ListOperationalCosts` (novo) | GET `/ui/bkdash/operational-costs` | OperationalCostSection (→ OperationalCostTable, OperationalCostRow, CostPagination) | Ao montar e a cada mudanca de pageNumber/pageSize/search/category |
| `GetOperationalCost` (novo) | GET `/ui/bkdash/operational-costs/:id` | OperationalCostDrawer (modo editar) | Ao abrir o drawer com `costId` presente |
| `ListRecommendedApps` (novo, compartilhado) | GET `/ui/bkdash/recommended-apps` | RecommendedAppsSection (→ RecommendedAppCard) | Ao montar a pagina |
| `GetUserInfo` (existente) | GET `/ui/bkdash/user-info` | Header | Ao montar o shell |
| `ListNotifications` (existente) | GET `/ui/bkdash/notifications` | Header | Ao montar o shell |

### Commands

| Controller | Metodo + Path | Componente | Payload (campos — sem apresentação) |
|---|---|---|---|
| `CreateOperationalCost` (novo) | POST `/ui/bkdash/operational-costs` | OperationalCostDrawer > OperationalCostForm (criar) | `name` (string), `flow` (`OperationalCostFlow`), `frequency` (`CostFrequency`), `amount` (Money), `currency` (`Currency`), `startDate`, `endDate?` |
| `UpdateOperationalCost` (novo) | PATCH `/ui/bkdash/operational-costs/:id` | OperationalCostDrawer > OperationalCostForm (editar) | `name?`, `flow?`, `frequency?`, `amount?`, `currency?`, `startDate?`, `endDate?` |
| `DeleteOperationalCost` (novo) | DELETE `/ui/bkdash/operational-costs` | CostToolbar > [Deletar] (lote) e OperationalCostRow | `ids` (string[]) — exclusao em lote |

### Response Schemas (sketch)

```ts
import {
  OperationalCostItemSchema,            // { id, name, flow, frequency, amount, startDate, endDate }
  OperationalCostFlow, CostFrequency,   // enums de domínio (credit/debit, once/…/yearly)
  Money, Currency, ListRecommendedAppsOutputSchema,
} from '@ui/schemas' // ver _schema-fundamentals.md

// ListOperationalCosts — tabela paginada. Cada item É um OperationalCostItem dos fundamentos
// (feedback #7: entidade tipada, sem "rows" genéricas, sem editable/label).
// flow/frequency são enums → o frontend deriva o Badge "Saída"/"Entrada" e a formatação monetária.
export const ListOperationalCostsOutputSchema = z.paginatedResponse(
  OperationalCostItemSchema.shape,
)

// GetOperationalCost — detalhe para pre-preencher o form em modo editar.
// As opções dos selects (frequency/flow/currency) são os PRÓPRIOS enums → derivadas no frontend
// a partir dos mapas i18n; não vêm como { value, label } no contrato.
export const GetOperationalCostOutputSchema = z.object({
  cost: OperationalCostItemSchema,
})

// ListRecommendedApps usa o ListRecommendedAppsOutputSchema COMPARTILHADO dos fundamentos
// (ver _schema-fundamentals.md): { items: RecommendedAppSchema[], advertiseUrl }. Não redefinir aqui.
```

### Reaproveitamento de Controllers

- **Existentes (reutilizar):** `GetUserInfo`, `ListNotifications` (consumidos pelo `Header` compartilhado do shell).
- **Novos (criar):** queries `ListOperationalCosts` (GET), `GetOperationalCost` (GET); commands `CreateOperationalCost` (POST), `UpdateOperationalCost` (PATCH), `DeleteOperationalCost` (DELETE). Esta rota é a dona da entidade OperationalCost — os schemas vêm de `OperationalCostItemSchema`/`OperationalCostFlow`/`CostFrequency` dos fundamentos.
- **Compartilhados:** `ListRecommendedApps` (GET) alimenta a `RecommendedAppsSection` reutilizada em múltiplas rotas (dashboard etc.) — mesmo controller, schema único. `CreateOperationalCost` definido aqui é acionado também pelo `OperationalCostDrawer` do dashboard (`/app`).
