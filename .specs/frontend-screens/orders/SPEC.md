# Rota /app/orders — Pedidos

## Visao Geral

A tela **Pedidos** (`/app/orders`, implementada em `routes/(app)/orders/`) lista todos os pedidos da loja selecionada em uma tabela densa, paginada e ordenavel, construida sobre o `DataTable` compartilhado. Cada linha expoe metricas financeiras do pedido (receita, custo de produto, frete, taxas, impostos e lucro calculado) alem de status, metodo de pagamento, produtos e codigo. O contador no cabecalho ("1079 Pedidos") reflete o `total` retornado pela consulta apos os filtros aplicados.

O diferencial da tela e a **edicao inline por celula**: status, receita, taxas, impostos, custo de produto, metodo de pagamento e frete sao editaveis diretamente na grade via popovers (`role="dialog"`), com a coluna **Lucro** recalculada localmente em tempo real. Edicoes manuais ficam acumuladas e podem ser desfeitas/zeradas pelo controle "Resetar edicoes manuais" (undo). A toolbar oferece ainda: filtros parciais/completos por status e metodo de pagamento (dropdown com submenus), um seletor de range de datas (calendario) e busca textual. As snapshots tambem revelam selecao multipla de linhas (checkboxes) habilitando acoes em lote. Hoje as edicoes vivem apenas em `useState` (`useOrderEdits`); este spec formaliza os Commands PATCH que persistem cada coluna editavel.

## Inventario de Estados

| Arquivo HTML | Estado / Interacao | Citizen afetado |
|---|---|---|
| `app_order.html` | Estado base — tabela de pedidos carregada (1079 Pedidos) | `OrderTableSection` / `OrderRow` |
| `app_order-2.html` | Estado base (re-snapshot, identico ao base) | `OrderTableSection` |
| `app_order-3.html` | Tabela base + popover de metodo de pagamento aberto | `EditPaymentMethodPopover` |
| `app_order-4.html` | Tabela base + popover de custo de produto aberto | `EditProductCostPopover` |
| `app_order_editar-status.html` | Popover de edicao de **status** aberto sobre a celula | `EditStatusPopover` |
| `app_order_editar-receita.html` | Popover de edicao de **receita** (moeda) aberto | `EditCurrencyPopover` |
| `app_order_editar-taxas.html` | Popover de edicao de **taxas** (moeda + seletor de moeda USD) | `EditCurrencyPopover` |
| `app_order_editar-impostos.html` | Popover de edicao de **impostos do pedido** (moeda + USD) | `EditCurrencyPopover` |
| `app_order_editar-custo-de-produto.html` | Popover de **custo de produto** (imagem + moeda por item) | `EditProductCostPopover` |
| `app_order_editar-metodo-de-pagamento.html` | Popover de **metodo de pagamento** (lista de 4 opcoes) | `EditPaymentMethodPopover` |
| `app_order_editar-valor-dof-rete.html` | Popover de edicao de **frete** (moeda) aberto | `EditCurrencyPopover` |
| `app_order_dropdown-de-filtros-selecionados.html` | Dropdown de filtros aberto (menu com submenus: "Metodo de Pagamento" expandido) | `OrderFilterMenu` |
| `app_order_filtros-selecionados.html` | Filtros completos aplicados (todas as opcoes marcadas) | `OrderFilterMenu` / `OrderTableSection` |
| `app_order_filtros-parcialmente-selecionados.html` | Filtros parciais (count cai para "1061 Pedidos") | `OrderFilterMenu` / `OrderTableSection` |
| `app_order_calendario-aberto.html` | Calendario de range de datas aberto | `OrderDateRangePicker` |
| `app_order_checkboxes-de-pedidos-selecionados.html` | Linhas selecionadas via checkbox (acoes em lote) | `OrderRow` / `OrderBatchActionsBar` |
| `app_order_voltar-edição-undo.html` | Controle "Resetar edicoes manuais" exibido (undo) | `OrderEditsResetButton` |

## UI Composition

### URL Contract

- **Path:** `/(app)/orders/` (rota publica `/app/orders`)
- **Breadcrumb:** `Pedidos` (`i18n.t('nav.orders')`)
- **Search params (Zod sketch — `listOrdersQueryParamsSchema`, ja existente):**
  - `page` — `number` — pagina atual da tabela
  - `limit` — `number` — itens por pagina
  - `search` — `string?` — busca textual (codigo / nome de produto), debounced
  - `sortBy` — `string?` — chave de ordenacao (`code | date | revenue | profit`)
  - `sortOrder` — `'ASC' | 'DESC'?` — direcao de ordenacao
  - `paymentStatus` — `string?` (CSV) — filtro de status (`APROVADO,PENDENTE,...`)
  - `paymentMethod` — `string?` (CSV) — filtro de metodo de pagamento (novo, surfaced pelo dropdown)
  - `startDate` — `string? (ISO)` — inicio do range (calendario)
  - `endDate` — `string? (ISO)` — fim do range (calendario)
- **Loader:** nenhum — `OrderTableSection` busca via `useListOrders` no cliente.
- **errorComponent:** `RouteError` (default)

### ASCII Layout Map

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Navbar (shared, reuse)                  Header (shared, reuse)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │ OrderTableSection                                                          │ │
│  │  ┌────────────────────────────────────────────────────────────────────┐  │ │
│  │  │ OrderTableHeader  (titulo "Pedidos" + "1079 Pedidos" + StatusFilter)│  │ │
│  │  └────────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌────────────────────────────────────────────────────────────────────┐  │ │
│  │  │ OrderTableToolbar                                                   │  │ │
│  │  │  [OrderFilterButton][OrderDateRangePicker][ReloadBtn][DataTableSearch]│ │ │
│  │  └────────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌────────────────────────────────────────────────────────────────────┐  │ │
│  │  │ OrderBatchActionsBar   (visivel quando ha linhas selecionadas)      │  │ │
│  │  └────────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌────────────────────────────────────────────────────────────────────┐  │ │
│  │  │ DataTableContent                                                    │  │ │
│  │  │   OrderRow (Leaf ×N)  [☐ #cod | data | prods | metodo | status |    │  │ │
│  │  │                        receita | custo | frete | taxas | imp | lucro]│  │ │
│  │  └────────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌────────────────────────────────────────────────────────────────────┐  │ │
│  │  │ DataTablePagination                                                 │  │ │
│  │  └────────────────────────────────────────────────────────────────────┘  │ │
│  │  OrderEditsResetButton  ("Resetar edicoes manuais", quando ha edits)      │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Overlays:
  OrderFilterMenu (Component, menu)        ── abre no clique de "Filtros" (OrderFilterButton)
  OrderDateRangePicker (Component, popover) ── abre no clique do botao de calendario
  EditStatusPopover (Dialog)               ── abre no clique da celula Status
  EditPaymentMethodPopover (Dialog)        ── abre no clique da celula Metodo de Pagamento
  EditCurrencyPopover (Dialog)             ── abre nas celulas Receita / Frete / Taxas / Impostos
  EditProductCostPopover (Dialog)          ── abre na celula Custo de Produto
```

### Component Tree

```text
OrdersRouteShell                                             (Route Shell)
└─ OrderTableSection                                         (Section, owns useListOrders)
   ├─ OrderTableHeader                                       (Component)
   │  └─ StatusFilter                                        (Component, toggle-group)
   ├─ OrderTableToolbar                                      (Component)
   │  ├─ OrderFilterButton                                   (Component, opens OrderFilterMenu)
   │  ├─ OrderDateRangePicker                                (Component, popover + calendar)
   │  └─ DataTableSearch                                     (Component, reuse shared)
   ├─ OrderBatchActionsBar                                   (Component)
   ├─ OrderRow                                               (Leaf ×N)
   ├─ DataTablePagination                                    (Component, reuse shared)
   └─ OrderEditsResetButton                                  (Component)

Overlays:
├─ OrderFilterMenu                                           (Component, dropdown-menu w/ submenus)
├─ EditStatusPopover                                         (Dialog, route-local)
├─ EditPaymentMethodPopover                                  (Dialog, route-local)
├─ EditCurrencyPopover                                       (Dialog, route-local — receita/frete/taxas/impostos)
└─ EditProductCostPopover                                    (Dialog, route-local)
```

### Component Anatomy

**`OrderTableSection`** (Section)

```text
OrderTableSection
└─ Fragment  [flex flex-col gap-6]
   ├─ OrderTableHeader: titulo + contador + StatusFilter   (ref → Component)
   ├─ DataTable  [primitive: Table via shared DataTable]
   │  ├─ DataTableContent
   │  │  ├─ OrderTableToolbar                               (ref → Component)
   │  │  ├─ OrderBatchActionsBar                            (ref → Component, condicional)
   │  │  └─ DataTableBody → OrderRow ×N                     (ref → Leaf)
   │  └─ DataTablePagination                               (ref → Component, reuse)
   └─ OrderEditsResetButton                                 (ref → Component, condicional)
```

States:
- skeleton: `DataTableLoading` (linhas placeholder) enquanto `isLoading`
- empty: `DataTableEmpty` ("Nenhum pedido encontrado")
- error: `DataError` inline

**`OrderTableHeader`** (Component)

Mockup:

```text
┌────────────────────────────────────────────┐
│                  Pedidos                     │
│               1079 Pedidos                   │
│   [Todos][Aprovado][Pendente][Cancelado]…    │
└────────────────────────────────────────────┘
```

Slots:

```text
OrderTableHeader
└─ div  [flex flex-col items-center gap-2, mb-4]
   ├─ Title: h1 "Pedidos"  [text-[1.75rem] font-medium]
   ├─ Count: p "1079 Pedidos"  [text-[0.8rem] text-foreground/60]  (i18n count)
   └─ StatusFilter: toggle-group de status  (ref → Component)
```

**`StatusFilter`** (Component)

Mockup:

```text
[ Todos ] [▓Aprovado▓] [ Pendente ] [ Cancelado ] [ Reembolso ] [ Chargeback ]
```

Slots:

```text
StatusFilter
└─ div  [flex flex-row gap-2 flex-wrap]  [primitive: ToggleGroup]
   └─ StatusChip ×N  [primitive: Toggle]  (label = status, aria-pressed quando selecionado)
```

Variants:
- `status ∈ selected` → chip com fundo saturado (bg-<statusColor>)

**`OrderTableToolbar`** (Component)

Mockup:

```text
┌──────────────────────────────────────────────────────────────────┐
│ [⚙ Filtros] [📅 Este mes ▾] [↻]  [🔍 Buscar pedido...          ] │
└──────────────────────────────────────────────────────────────────┘
```

Slots:

```text
OrderTableToolbar
└─ DataTableToolbar  [flex flex-row gap-2, p-3]
   ├─ OrderFilterButton: botao "Filtros"  (ref → Component)  [primitive: Button]
   ├─ OrderDateRangePicker: botao "Este mes"  (ref → Component)  [primitive: Button]
   ├─ ReloadButton: icone refresh  [primitive: Button]  (aria-label "Recarregar")
   └─ DataTableSearch: input de busca  (ref → Component, reuse)  [primitive: Input]
```

**`OrderFilterButton`** (Component)

Mockup:

```text
╭───────────────╮
│ ⚙  Filtros  ▾ │
╰───────────────╯
```

Slots:

```text
OrderFilterButton
└─ Button  [primitive: Button, variant="secondary"]  [aria-haspopup="menu"]
   ├─ Icon: IconFilter  [size-4]
   └─ Label: "Filtros"
```

**`OrderDateRangePicker`** (Component)

Mockup:

```text
╭────────────────────╮        ┌─ popover ────────────────┐
│ 📅  Este mes     ▾ │  →     │  ‹  Junho 2026  ›         │
╰────────────────────╯        │  D S T Q Q S S            │
                              │  ▓ range selecionado ▓    │
                              └───────────────────────────┘
```

Slots:

```text
OrderDateRangePicker
└─ Popover  [primitive: Popover]
   ├─ Trigger: Button "Este mes"  [primitive: Button]  [aria-haspopup="dialog"]
   │  ├─ Icon: IconCalendar  [size-4]
   │  └─ Label: range atual (ex.: "Este mes")
   └─ Content: range calendar  [primitive: Calendar]  (mode="range")
```

Variants:
- range custom selecionado → label mostra "dd/MM – dd/MM"

**`OrderBatchActionsBar`** (Component)

Mockup:

```text
┌────────────────────────────────────────────────────────────┐
│ ☑ 3 pedidos selecionados   [Alterar status ▾] [Exportar] [×]│
└────────────────────────────────────────────────────────────┘
```

Slots:

```text
OrderBatchActionsBar
└─ div  [flex flex-row items-center between, p-3, sticky]  (role="region" aria-label="Acoes em lote")
   ├─ Count: "N pedidos selecionados"
   ├─ Action: "Alterar status"  [primitive: DropdownMenu]
   ├─ Action: "Exportar"  [primitive: Button]
   └─ Clear: botao limpar selecao  [primitive: Button, variant="ghost"]  (aria-label "Limpar selecao")
```

Variants:
- `selectedCount === 0` → barra oculta

**`OrderRow`** (Leaf ×N)

Mockup:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ☐ #BK-10421  15/03 14:30  [🖼🖼]  Cartao ✎  ▓APROVADO▓✎  R$497,00✎          │
│              R$0,00✎  R$0,00✎  R$49,70✎  R$24,85✎   ▓R$422,45▓               │
└────────────────────────────────────────────────────────────────────────────┘
```

Slots:

```text
OrderRow
└─ DataTableRow  [primitive: Table row]  (recebe order via prop)
   ├─ Select: checkbox de selecao  [primitive: Checkbox]  (aria-label "Selecionar pedido #code")
   ├─ Code: "#BK-10421"  [font-semibold text-bkdash-purple-soft]
   ├─ Date: data formatada  [text-foreground/70]
   ├─ Products: ProductImages (avatares empilhados)  [primitive: Avatar]
   ├─ PaymentMethod: PaymentMethod + IconPencil  → abre EditPaymentMethodPopover
   ├─ Status: StatusBadge + IconPencil  [primitive: Badge]  → abre EditStatusPopover
   ├─ Revenue: valor moeda + IconPencil  → abre EditCurrencyPopover (field=revenue)
   ├─ ProductCost: valor moeda + IconPencil  → abre EditProductCostPopover
   ├─ Shipping: valor moeda + IconPencil  → abre EditCurrencyPopover (field=shipping)
   ├─ Fees: valor moeda + IconPencil  → abre EditCurrencyPopover (field=fees)
   ├─ Taxes: valor moeda + IconPencil  → abre EditCurrencyPopover (field=taxes)
   └─ Profit: pill calculada  [bk-pill-success]  (read-only, recalculo local)
```

Variants:
- celula com valor editado localmente → realce (ex.: texto em destaque)
- linha selecionada (checkbox) → fundo realcado

**`DataTablePagination`** (Component)

Mockup:

```text
┌────────────────────────────────────────────────────┐
│  Linhas: [10 ▾]            ‹  1  2  3 … 108  ›       │
└────────────────────────────────────────────────────┘
```

Slots:

```text
DataTablePagination
└─ div  [flex flex-row between, p-3]  (reuse shared)
   ├─ PageSize: select de limit  [primitive: Select]
   └─ Pager: controle de paginas  [primitive: Pagination]
```

**`OrderEditsResetButton`** (Component)

Mockup:

```text
╭────────────────────────────╮
│ ↺  Resetar edicoes manuais │
╰────────────────────────────╯
```

Slots:

```text
OrderEditsResetButton
└─ Button  [primitive: Button, variant="ghost"]  (aria-label "Resetar edicoes manuais")
   ├─ Icon: IconRefresh/Undo  [size-4]
   └─ Label: "Resetar edicoes manuais"
```

Variants:
- `editsCount === 0` → botao oculto/desabilitado

**`OrderFilterMenu`** (Component — overlay)

Mockup:

```text
┌─ menu ───────────────────────────┐
│ Status               ▸            │
│ Metodo de Pagamento  ▾            │
│   ┌─ submenu ──────────────────┐  │
│   │ ☑ Cartao de Credito        │  │
│   │ ☐ PIX                      │  │
│   │ ☑ Boleto                   │  │
│   └────────────────────────────┘  │
└──────────────────────────────────┘
```

Slots:

```text
OrderFilterMenu
└─ DropdownMenu  [primitive: DropdownMenu]  (role="menu")
   ├─ SubTrigger "Status"  [aria-haspopup="menu"]
   │  └─ SubMenu: itens de status (checkbox)  [primitive: DropdownMenuCheckboxItem]
   └─ SubTrigger "Metodo de Pagamento"  [aria-haspopup="menu"]
      └─ SubMenu: itens de metodo (checkbox: Cartao de Credito / PIX / Boleto / …)
```

Variants:
- selecao parcial → contador "1061 Pedidos" no header; itens marcados parcialmente

**`EditStatusPopover`** (Dialog)

Mockup:

```text
╔═ Editar status ═══════════════╗
║ ○ Aprovado                    ║
║ ● Pendente                    ║
║ ○ Cancelado                   ║
║ ○ Reembolso  ○ Chargeback     ║
║              [ Salvar ]       ║
╚═══════════════════════════════╝
```

Slots:

```text
EditStatusPopover
└─ Popover/Dialog  [primitive: Popover]  (role="dialog")
   ├─ Header: "Editar status"
   ├─ Body: lista de status  [primitive: RadioGroup]
   └─ Footer: Button "Salvar"  [primitive: Button, variant primary]
```

**`EditPaymentMethodPopover`** (Dialog)

Mockup:

```text
╔═ Editar metodo de pagamento ══╗
║ ▾ Cartao de Credito           ║
║   ┌──────────────────────┐    ║
║   │ Cartao de Credito     │    ║
║   │ PIX  /  Boleto  / …   │    ║
║   └──────────────────────┘    ║
║              [ Salvar ]       ║
╚═══════════════════════════════╝
```

Slots:

```text
EditPaymentMethodPopover
└─ Popover/Dialog  [primitive: Popover]  (role="dialog")
   ├─ Header: "Editar metodo de pagamento"
   ├─ Body: select de metodo (4 opcoes)  [primitive: Select]
   └─ Footer: Button "Salvar"  [primitive: Button]
```

**`EditCurrencyPopover`** (Dialog)

Mockup:

```text
╔═ Editar receita ══════════════╗
║  ▾ USD     [ 6,35          ]  ║
║                 [ Salvar ]    ║
╚═══════════════════════════════╝
```

Slots:

```text
EditCurrencyPopover
└─ Popover/Dialog  [primitive: Popover]  (role="dialog")
   ├─ Header: label dinamico ("Editar receita" / "...frete" / "...taxas" / "Editar impostos do pedido")
   ├─ Body: linha [CurrencySelect (USD/BRL) + Input numerico]  [primitive: Select + Input]
   └─ Footer: Button "Salvar"  [primitive: Button]
```

Variants:
- field ∈ {revenue, shipping, fees, taxes} → muda o header e o Command alvo

**`EditProductCostPopover`** (Dialog)

Mockup:

```text
╔═ Editar custo de Produto ═════════════╗
║ [🖼]  ▾ USD   [ 1,00            ]      ║
║ [🖼]  ▾ USD   [ 1,00            ]      ║
║                       [ Salvar ]      ║
╚═══════════════════════════════════════╝
```

Slots:

```text
EditProductCostPopover
└─ Popover/Dialog  [primitive: Popover]  (role="dialog")
   ├─ Header: "Editar custo de Produto"
   ├─ Body: grid 2col por produto
   │  ├─ ProductImage  [primitive: Avatar/img]
   │  ├─ CurrencySelect (USD/BRL)  [primitive: Select]
   │  └─ Input custo por item  [primitive: Input]
   └─ Footer: Button "Salvar"  [primitive: Button]
```

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| OrdersRouteShell | RouteShell | — | reads: [page, limit, search, sortBy, sortOrder, paymentStatus, paymentMethod, startDate, endDate] | — | — | reuse (existe) | `routes/(app)/orders/index.tsx` | /route |
| OrderTableSection | Section | `useListOrders({ page, limit, search, sortBy, sortOrder, paymentStatus, paymentMethod, startDate, endDate })` | reads/writes: [todos os params] | useOrderEditsStore: { reads, writes } | — | reuse (existe `OrdersPage`) | `routes/(app)/orders/-components/OrdersPage/` | /component |
| OrderTableHeader | Component | props from OrderTableSection (`total`) | — | — | — | create-route-local | `routes/(app)/orders/-components/OrderTableHeader/` | /component |
| StatusFilter | Component | props from OrderTableHeader | reads/writes: [paymentStatus] | — | — | reuse (existe) | `routes/(app)/orders/-components/StatusFilter/` | /component |
| OrderTableToolbar | Component | — | — | — | — | reuse (parte do `OrdersPage`) | `routes/(app)/orders/-components/OrdersPage/` | /component |
| OrderFilterButton | Component | — | — | — | `[open]` | create-route-local | `routes/(app)/orders/-components/OrderFilterButton/` | /component |
| OrderDateRangePicker | Component | — | reads/writes: [startDate, endDate] | — | `[open]` | create-route-local | `routes/(app)/orders/-components/OrderDateRangePicker/` | /component |
| DataTableSearch | Component | props from DataTable | reads/writes: [search] | — | — | reuse (shared) | `@/components/DataTable/DataTableSearch.tsx` | (reuse) |
| OrderBatchActionsBar | Component | props from OrderTableSection (`selectedIds`) | — | useOrderSelectionStore: { reads, writes } | — | create-route-local | `routes/(app)/orders/-components/OrderBatchActionsBar/` | /component |
| OrderRow | Leaf | props from OrderTableSection (`order`, `getEditedValue`, `onEdit`) | — | useOrderSelectionStore: { reads, writes } | — | reuse (existe via `useOrderColumns`) | `routes/(app)/orders/-components/useOrderColumns.tsx` | /component |
| DataTablePagination | Component | props from DataTable | reads/writes: [page, limit] | — | — | reuse (shared) | `@/components/DataTable/DataTablePagination.tsx` | (reuse) |
| OrderEditsResetButton | Component | — | — | useOrderEditsStore: { reads: [editsCount], writes: [reset] } | — | create-route-local | `routes/(app)/orders/-components/OrderEditsResetButton/` | /component |
| OrderFilterMenu | Component | — | reads/writes: [paymentStatus, paymentMethod] | — | — | create-route-local | `routes/(app)/orders/-components/OrderFilterMenu/` | /component |
| EditStatusPopover | Dialog | — | — | useDialogStore | `[value]` | reuse (existe) | `routes/(app)/orders/-components/EditStatusPopover/` | /component |
| EditPaymentMethodPopover | Dialog | — | — | useDialogStore | `[value]` | reuse (existe) | `routes/(app)/orders/-components/EditPaymentMethodPopover/` | /component |
| EditCurrencyPopover | Dialog | — | — | useDialogStore | `[value, currency]` | reuse (existe `EditCurrencyPopover`) | `routes/(app)/orders/-components/EditCurrencyPopover/` | /component |
| EditProductCostPopover | Dialog | — | — | useDialogStore | `[perItemValues]` | reuse (existe) | `routes/(app)/orders/-components/EditProductCostPopover/` | /component |

**Per-node notes:**

- **OrderTableSection:** Skeleton: `DataTableLoading` com N linhas placeholder. Empty: `DataTableEmpty` "Nenhum pedido encontrado". ARIA: `role="region" aria-label="Tabela de pedidos"`. Rationale: orquestra header + toolbar + body + paginacao + reset (≥3 distintos) e e a unica raiz de dados (`useListOrders`).
- **OrderRow:** ARIA: cada celula editavel e um botao `aria-haspopup="dialog"`; checkbox com `aria-label="Selecionar pedido #code"`. Rationale: renderizado N vezes via `useOrderColumns`, recebe `order` por prop; nunca refetcha. A coluna Lucro e read-only (recalculo local a partir de receita − custo − frete − taxas − impostos).
- **EditCurrencyPopover:** mesmo shape reaproveitado por receita, frete, taxas e impostos — apenas `label`/`field` mudam (ver outlines `editar-receita`, `editar-valor-dof-rete`, `editar-taxas`, `editar-impostos`).
- **OrderFilterMenu:** dropdown com submenus (`role="menu"` + `aria-haspopup="menu"` em "Status" e "Metodo de Pagamento", visto em `dropdown-de-filtros-selecionados`). Selecao parcial reduz o `total` (1079 → 1061).
- **OrderBatchActionsBar / OrderRow selection:** selecao multipla via checkbox e estado efemero compartilhado entre a barra e as linhas → `useOrderSelectionStore` (Zustand), nao URL (ids de runtime nao precisam sobreviver a refresh).
- **OrderEditsResetButton:** consome o mesmo `useOrderEditsStore` que acumula as edicoes inline (hoje `useOrderEdits` em `useState`); o botao zera o mapa de edicoes.

### Reuse Summary

- **Reuse (sem trabalho):** `OrdersRouteShell` (`routes/(app)/orders/index.tsx`), `OrderTableSection`/`OrderTableToolbar` (`OrdersPage`), `StatusFilter`, `OrderRow`/`useOrderColumns`, `EditStatusPopover`, `EditPaymentMethodPopover`, `EditCurrencyPopover`, `EditProductCostPopover` (todos ja em `routes/(app)/orders/-components/`); `DataTable`, `DataTableSearch`, `DataTablePagination`, `DataTableContent`, `DataTableToolbar` (`@/components/DataTable/`); primitivos `Button`, `Badge`, `Avatar`, `Checkbox`, `Select`, `RadioGroup`, `Popover`, `DropdownMenu`, `Calendar`, `Pagination`, `ToggleGroup` (`@/components/ui/`).
- **Promote to shared:** nenhum — todos os edit-popovers sao acoplados ao dominio de pedidos e tem um unico consumidor hoje.
- **Create new shared:** nenhum.
- **Create route-local:** `OrderTableHeader`, `OrderFilterButton`, `OrderFilterMenu`, `OrderDateRangePicker`, `OrderBatchActionsBar`, `OrderEditsResetButton` — extraidos do `OrdersPage` inline atual; acoplados ao dominio de pedidos. Stores `useOrderSelectionStore` e `useOrderEditsStore` (promover `useOrderEdits` de `useState` para store) sob `-stores/`.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | (reuse) | OrdersRouteShell | `routes/(app)/orders/index.tsx` | ja existe; adicionar params `paymentMethod`, `startDate`, `endDate` ao schema |
| 2 | /store | useOrderSelectionStore | `routes/(app)/orders/-stores/useOrderSelectionStore.ts` | selecao multipla efemera |
| 3 | /store | useOrderEditsStore | `routes/(app)/orders/-stores/useOrderEditsStore.ts` | promover `useOrderEdits` (hoje useState) |
| 4 | /component | OrderTableSection | `routes/(app)/orders/-components/OrdersPage/` | ja existe; ligar Commands PATCH no `onEdit` |
| 5 | /component | OrderTableHeader | `routes/(app)/orders/-components/OrderTableHeader/` | extrair do `OrdersPage` |
| 6 | (reuse) | StatusFilter | `routes/(app)/orders/-components/StatusFilter/` | ja existe |
| 7 | /component | OrderFilterButton | `routes/(app)/orders/-components/OrderFilterButton/` | abre OrderFilterMenu |
| 8 | /component | OrderFilterMenu | `routes/(app)/orders/-components/OrderFilterMenu/` | dropdown com submenus status/metodo |
| 9 | /component | OrderDateRangePicker | `routes/(app)/orders/-components/OrderDateRangePicker/` | usa primitive Calendar (mode range) |
| 10 | /component | OrderBatchActionsBar | `routes/(app)/orders/-components/OrderBatchActionsBar/` | acoes em lote |
| 11 | /component | OrderEditsResetButton | `routes/(app)/orders/-components/OrderEditsResetButton/` | undo "Resetar edicoes manuais" |
| 12 | /component | OrderRow | `routes/(app)/orders/-components/useOrderColumns.tsx` | adicionar coluna de checkbox de selecao |
| 13 | (reuse) | EditStatusPopover | `routes/(app)/orders/-components/EditStatusPopover/` | ligar Command PatchOrderStatus |
| 14 | (reuse) | EditPaymentMethodPopover | `routes/(app)/orders/-components/EditPaymentMethodPopover/` | ligar Command PatchOrderPaymentMethod |
| 15 | (reuse) | EditCurrencyPopover | `routes/(app)/orders/-components/EditCurrencyPopover/` | ligar Command PatchOrderFinancials (revenue/shipping/fees/taxes) |
| 16 | (reuse) | EditProductCostPopover | `routes/(app)/orders/-components/EditProductCostPopover/` | ligar Command PatchOrderProductCost |

### Open Questions

- OQ-1. O `EditCurrencyPopover` cobre 4 campos (receita, frete, taxas, impostos) via um unico shape. Persistir cada um como Command separado ou um unico `PatchOrderFinancials` com campo dinamico? Proposta: um Command `PatchOrderFinancials` aceitando `{ field, value }` — precisa de decisao do operador.
- OQ-2. O seletor de moeda (USD/BRL) dentro dos popovers de moeda/custo implica que o valor pode ser editado em moeda diferente da exibida. O backend deve receber a moeda junto do valor (`{ value, currency }`)? Precisa confirmacao do contrato.
- OQ-3. As acoes em lote (`OrderBatchActionsBar`) — alem de "Alterar status", quais operacoes existem (exportar, excluir)? Os outlines so confirmam selecao multipla; a lista de acoes precisa de definicao.

## Controller Contract

> Consome os schemas de [`_schema-fundamentals.md`](../_schema-fundamentals.md)
> (`Money`, `Currency`). Aplica os princípios: **um controller por preocupação**
> e **dados, não apresentação** (sem `href`, `tooltip`, `label`, `color`, `icon`,
> `editable` nem strings pré-formatadas — o frontend deriva). Cada coluna financeira
> editável usa `Money` (+ `Currency` quando o popover permite trocar de moeda); o
> recalculo de `profit` é server-side e o `status` é o `PaymentStatus` canônico (o frontend traduz, sem simplificar).

### Queries

| Controller | Metodo + Path | Componente(s) consumidor(es) | Quando carrega |
|---|---|---|---|
| `ListOrders` (existente) | `GET /ui/bkdash/orders` | `OrderTableSection` (`useListOrders`) | No mount e a cada mudanca de params de URL (page, limit, search, sort, paymentStatus, paymentMethod, startDate, endDate) |
| `GetUserInfo` (existente) | `GET /ui/bkdash/user-info` | `Header` (shared) | No mount da shell (app) |
| `ListNotifications` (existente) | `GET /ui/bkdash/notifications` | `Header` (shared) | No mount da shell (app) |

### Commands

| Controller | Metodo + Path | Componente | Payload (campos — sem apresentação) |
|---|---|---|---|
| `PatchOrderStatus` (novo) | `PATCH /ui/bkdash/orders/:id/status` | `EditStatusPopover` | `{ status: PaymentStatus }` |
| `PatchOrderPaymentMethod` (novo) | `PATCH /ui/bkdash/orders/:id/payment-method` | `EditPaymentMethodPopover` | `{ paymentMethod: PaymentMethod }` |
| `PatchOrderRevenue` (novo) | `PATCH /ui/bkdash/orders/:id/revenue` | `EditCurrencyPopover` (field=revenue) | `{ value: Money, currency: Currency }` |
| `PatchOrderShipping` (novo) | `PATCH /ui/bkdash/orders/:id/shipping` | `EditCurrencyPopover` (field=shipping) | `{ value: Money, currency: Currency }` |
| `PatchOrderFees` (novo) | `PATCH /ui/bkdash/orders/:id/fees` | `EditCurrencyPopover` (field=fees) | `{ value: Money, currency: Currency }` |
| `PatchOrderTaxes` (novo) | `PATCH /ui/bkdash/orders/:id/taxes` | `EditCurrencyPopover` (field=taxes) | `{ value: Money, currency: Currency }` |
| `PatchOrderProductCost` (novo) | `PATCH /ui/bkdash/orders/:id/product-cost` | `EditProductCostPopover` | `{ items: { productName: string, value: Money, currency: Currency }[] }` |
| `BatchUpdateOrders` (novo) | `PATCH /ui/bkdash/orders/batch` | `OrderBatchActionsBar` | `{ ids: string[], status?: PaymentStatus }` |

> **Financeiros editáveis (#1, #2):** cada `Patch*` financeiro recebe `{ value, currency }`
> — `value` é `Money` e `currency` é o enum `Currency` selecionado no popover (USD/BRL),
> confirmando a moeda em que o operador digitou (OQ-2). Os quatro popovers de moeda
> (receita/frete/taxas/impostos) compartilham o **shape** no frontend, mas persistem em
> Commands separados e tipados (sem `field` dinâmico genérico — #7). O cálculo de `profit`
> e a moeda de exibição são derivados; o contrato não carrega rótulo, cor nem texto.

### Response Schemas (sketch)

`ListOrders` ja existe (`ListOrdersControllerOutputSchema`, `z.paginatedResponse`) e NAO sera redefinido. Apenas o `inputSchema` ganha `paymentMethod`, `startDate`, `endDate` (parcialmente ja presentes). Os Commands abaixo sao novos; cada um retorna o pedido atualizado para o cliente refletir o recalculo de `profit` server-side. `PaymentStatus`/`PaymentMethod`/`Money`/`Currency` vem de `@ui/schemas` (fundamentals), espelhando os enums do backend. O `ListOrders` atual usa um enum PT simplificado — **refinar** para devolver `PaymentStatus` (o frontend traduz/agrupa os rótulos).

```ts
import { Money, Currency, PaymentStatus, PaymentMethod } from '@ui/schemas' // ver _schema-fundamentals.md

// Sub-objeto reaproveitado: shape canonico de um pedido (alinhado ao item de ListOrders).
// So dados: status/paymentMethod sao enums; valores sao Money na moeda do pedido.
// profit e recalculado server-side; rotulo/cor/icone/href sao derivados no frontend.
export const OrderSchema = z.object({
  id: z.string(),
  code: z.string(),
  date: z.date(),
  currency: Currency, // moeda do pedido — frontend formata os Money
  products: z.array(z.object({ name: z.string(), imageUrl: z.string().nullable() })),
  paymentMethod: PaymentMethod,
  status: PaymentStatus,         // canônico (backend); o frontend traduz o rótulo
  revenue: Money,
  productCost: Money,
  shipping: Money,
  fees: Money,
  taxes: Money,
  profit: Money, // read-only: recalculado server-side (revenue − productCost − shipping − fees − taxes)
})

// PATCH /orders/:id/status — pedido atualizado (status + profit recalculado)
export const PatchOrderStatusOutputSchema = z.object({ order: OrderSchema })

// PATCH /orders/:id/payment-method
export const PatchOrderPaymentMethodOutputSchema = z.object({ order: OrderSchema })

// PATCH /orders/:id/{revenue,shipping,fees,taxes} — { value, currency }; profit recalculado server-side
export const PatchOrderRevenueOutputSchema  = z.object({ order: OrderSchema })
export const PatchOrderShippingOutputSchema = z.object({ order: OrderSchema })
export const PatchOrderFeesOutputSchema     = z.object({ order: OrderSchema })
export const PatchOrderTaxesOutputSchema    = z.object({ order: OrderSchema })

// PATCH /orders/:id/product-cost — custo por item ({ value, currency })
export const PatchOrderProductCostOutputSchema = z.object({ order: OrderSchema })

// PATCH /orders/batch
export const BatchUpdateOrdersOutputSchema = z.object({
  updated: z.array(z.string()),            // ids efetivamente atualizados
  failed: z.array(z.string()).optional(),
})
```

### Reaproveitamento de Controllers

- **Existentes (reutilizar):** `ListOrders` (`GET /orders` — feed da tabela; estender input com `paymentMethod`/`startDate`/`endDate`), `GetUserInfo` e `ListNotifications` (consumidos pelo `Header` shared), `ListenEvents` (SSE, opcional para invalidacao otimista pos-edicao).
- **Novos (criar):** `PatchOrderStatus`, `PatchOrderPaymentMethod`, `PatchOrderRevenue`, `PatchOrderShipping`, `PatchOrderFees`, `PatchOrderTaxes`, `PatchOrderProductCost`, `BatchUpdateOrders` — um Command tipado por coluna editavel (mais o batch), todos retornando o `OrderSchema` atualizado com `profit` recalculado server-side. Os quatro Commands de moeda recebem `{ value: Money, currency: Currency }`.
- **Compartilhados:** `Money`, `Currency`, `PaymentStatus`, `PaymentMethod` vem de `@ui/schemas` (`_schema-fundamentals.md`) — todos espelhando enums do backend. Nada de status traduzido/simplificado no contrato.
