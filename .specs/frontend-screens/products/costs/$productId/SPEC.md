# Rota /app/products/costs/$productId — Custo de Produto (detalhe / variantes)

## Visao Geral

Tela de edicao dos custos das variantes de um produto especifico (identificado pelo parametro de rota `productId`). A esquerda/topo ha um formulario de aplicacao de custo (Pais, Custo, Frete, Data de Inicio, Data de Fim, moeda USD e um switch "Aplicar para todas as variantes"), alem de acoes em lote (Importar da Shopify, Importar por CSV, Deletar custos de variantes) e um seletor de escopo de pais (Global / Canada / United States of America). A direita/abaixo ha a tabela de variantes do produto (colunas Produto, Nome, Custo mais recente), onde cada linha representa uma variante (ex.: "US - W 6", "US - W 6.5", ...) com o ultimo custo cadastrado (`$41.00`) ou o estado "Nenhum custo cadastrado".

Ao selecionar/editar uma variante, abre-se um painel de detalhe ("Custos de variante: US - W 6") com o historico editavel de custos daquela variante — uma tabela com colunas Custo, Frete, Total, Data Inicio, Data Fim e acoes Adicionar/Deletar. Esse editor aparece inline (estado selecionado) e tambem dentro de um modal (`aria-modal="true"`), sendo o modal a forma de "editar um custo de variante especifica". A tela compartilha o `Navbar` (rail de icones a esquerda) e o `Header` (topo) do shell `(app)`.

## Inventario de Estados

| Arquivo HTML | Estado / Interacao | Citizen afetado |
|---|---|---|
| `app_product_cost_8459430002788.html` | Base: tabela de variantes carregada + formulario de custo; nenhuma variante selecionada | `VariantCostFormSection`, `VariantsTableSection`, `VariantRow` (Leaf xN) |
| `app_product_cost_8460479922276_edição-de-custo-de-uma-variante-especifica.html` | Variante "US - W 6" selecionada: painel inline "Custos de variante: US - W 6" com historico editavel (Custo/Frete/Total/Data Inicio/Data Fim, Adicionar/Deletar) | `VariantCostHistorySection`, `VariantCostEntryRow` (Leaf xN) |
| `app_product_cost_8460479922276_modal-de-edição-de-um-custo-de-variante-especifica.html` | Modal de edicao (`aria-modal="true"`) com o editor de custos da variante selecionada | `EditVariantCostDialog`, `VariantCostEntryForm` |

## UI Composition

### URL Contract

- **Path:** `/app/products/costs/$productId`
- **Breadcrumb:** `Produtos › Custos de Variante`
- **Path params:** `productId` — `string` — identificador Shopify do produto (ex.: `8459430002788`)
- **Search params (Zod sketch):**
  - `variantId` — `string.optional()` — variante selecionada cujo historico de custos esta aberto (alimenta `VariantCostHistorySection` / abre `EditVariantCostDialog`)
  - `country` — `string.optional()` (default `"GLOBAL"`) — escopo de pais ativo no formulario (Global / Canada / United States of America)
- **Loader (if any):** opcional — pode pre-carregar `ListProductVariantCosts({ productId })` para resolver o nome do produto no breadcrumb; caso contrario as Sections fazem fetch ao montar.
- **errorComponent:** `RouteError` (default)

### ASCII Layout Map

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Navbar (shared)                Header (shared)                                 │
├──────┬─────────────────────────────────────────────────────────────────────┬─┤
│      │ ┌─────────────────────────────────────────────────────────────────┐ │ │
│ Nav  │ │ ProductCostRoute — h2 "Custos de Variante" + subtitulo          │ │ │
│ bar  │ └─────────────────────────────────────────────────────────────────┘ │ │
│      │ ┌──────────────────────────┐  ┌───────────────────────────────────┐ │ │
│      │ │ VariantCostFormSection   │  │ VariantsTableSection              │ │ │
│      │ │                          │  │  ┌─────────────────────────────┐  │ │ │
│      │ │                          │  │  │ VariantRow (Leaf ×N)        │  │ │ │
│      │ │                          │  │  └─────────────────────────────┘  │ │ │
│      │ └──────────────────────────┘  └───────────────────────────────────┘ │ │
│      │ ┌─────────────────────────────────────────────────────────────────┐ │ │
│      │ │ VariantCostHistorySection (visivel quando variantId definido)   │ │ │
│      │ │  ┌───────────────────────────────────────────────────────────┐  │ │ │
│      │ │  │ VariantCostEntryRow (Leaf ×N)                             │  │ │ │
│      │ │  └───────────────────────────────────────────────────────────┘  │ │ │
│      │ └─────────────────────────────────────────────────────────────────┘ │ │
│      │ ┌─────────────────────────────────────────────────────────────────┐ │ │
│      │ │ RecommendedAppsSection (h2 "Aplicativos Recomendados")          │ │ │
│      │ └─────────────────────────────────────────────────────────────────┘ │ │
└──────┴─────────────────────────────────────────────────────────────────────┴─┘

Overlays:
  EditVariantCostDialog    (Dialog) ── abre ao editar uma variante / "Adicionar" custo
  ImportCsvDialog          (Dialog) ── abre em "Importar por CSV"
  DeleteVariantCostsDialog (Dialog, confirm) ── abre em "Deletar custos de variantes"
```

### Component Tree

```text
ProductCostRoute                                             (Route Shell)
├─ VariantCostFormSection                                    (Section, orquestra form + acoes em lote)
│  └─ VariantCostForm                                        (Form, Type A — aplicar custo)
├─ VariantsTableSection                                      (Section, owns list query)
│  └─ VariantRow                                             (Leaf ×N)
├─ VariantCostHistorySection                                 (Section, owns variant cost-history query)
│  └─ VariantCostEntryRow                                    (Leaf ×N)
├─ RecommendedAppsSection                                    (Section, grade promocional)
│  └─ RecommendedAppCard                                     (Leaf ×N)
└─ h2 "Custos de Variante" + subtitulo                       (static UI in route shell)

Overlays:
├─ EditVariantCostDialog                                     (Dialog, route-local)
│  └─ VariantCostEntryForm                                   (Form, Type C — dentro do dialog)
├─ ImportCsvDialog                                           (Dialog, route-local)
└─ DeleteVariantCostsDialog                                  (Dialog, confirm)
```

### Component Anatomy

One block per citizen (except RouteShell). Order = Component Tree order.

**`VariantCostFormSection`** (Section)

```text
VariantCostFormSection
└─ Card  [primitive: Card]  [flex col, gap-4, p-4]
   ├─ Body: referencia a VariantCostForm  (campos e botoes do formulario)
   └─ ImportActions: linha de acoes em lote  [flex row, gap-2, flex-wrap]
      ├─ ImportShopifyBtn: "Importar da Shopify"  [primitive: Button variant="outline"]
      ├─ ImportCsvBtn: "Importar por CSV"  [primitive: Button variant="outline"] → abre ImportCsvDialog
      └─ DeleteCostsBtn: "Deletar custos de variantes"  [primitive: Button variant="destructive"] → abre DeleteVariantCostsDialog
```

**`VariantCostForm`** (Form, Type A)

```text
VariantCostForm
└─ form  [grid de Field/Label, gap-3]
   ├─ country: Select "Pais" (Global / Canada / United States of America)  [primitive: Select]
   ├─ cost: Input "Custo"  [primitive: Input + input-group prefixo $]
   ├─ shipping: Input "Frete"  [primitive: Input + input-group prefixo $]
   ├─ startDate: DatePicker "Data de Inicio do Custo" + helper "Todos pedidos anteriores"  [primitive: DatePicker]
   ├─ endDate: DatePicker "Data de Fim do Custo" + helper "Todos pedidos futuros"  [primitive: DatePicker]
   ├─ currency: Select/badge "USD"  [primitive: Select]
   ├─ applyToAll: Switch "Aplicar para todas as variantes"  [primitive: Switch]
   └─ Footer: SubmitBtn "Salvar"  [primitive: Button]
```

**`VariantsTableSection`** (Section)

```text
VariantsTableSection
└─ Card  [primitive: Card]  [flex col]
   ├─ Header: titulo da tabela de variantes do produto
   └─ Table: tabela de variantes  [primitive: Table / shared DataTable]
      ├─ HeaderRow: "Produto" | "Nome" | "Custo mais recente"
      └─ Body: VariantRow ×N
```

States:
- skeleton: `DataTable` com ~8 linhas placeholder
- empty: `Empty` "Nenhuma variante encontrada"

**`VariantRow`** (Leaf ×N)

Mockup:

```text
┌─────────────────────────────────────────────────────────────┐
│ [🖼] THEWALKWAY   │ US - W 6        │ $41.00            [ ✎ ] │
│ [🖼] THEWALKWAY   │ US - W 6.5      │ Nenhum custo ...  [ ✎ ] │
│ ...                                                           │
└─────────────────────────────────────────────────────────────┘
```

Slots:

```text
VariantRow
└─ tr  [primitive: Table row, role="button" / clicavel]
   ├─ Produto: thumb + nome do produto ("THEWALKWAY")  [img + text]
   ├─ Nome: nome da variante ("US - W 6")  [text]
   ├─ CustoMaisRecente: valor formatado ("$41.00") OU "Nenhum custo cadastrado"  [text / muted]
   └─ Action: IconButton editar  [primitive: Button variant="ghost" size="icon"] (aria-label="Editar custos da variante") → seleciona variantId / abre EditVariantCostDialog
```

Variants:
- `variant.id === variantId` (URL) → linha destacada (selecionada)
- `latestCost == null` → CustoMaisRecente renderiza "Nenhum custo cadastrado" em muted

**`VariantCostHistorySection`** (Section)

```text
VariantCostHistorySection
└─ Card  [primitive: Card]  [flex col, gap-3]
   ├─ Header: titulo "Custos de variante: {variantName}" + AddBtn "Adicionar"  [primitive: Button]
   └─ Table: historico de custos  [primitive: Table]
      ├─ HeaderRow: "Custo" | "Frete" | "Total" | "Data Inicio" | "Data Fim" | (acoes)
      └─ Body: VariantCostEntryRow ×N
```

Variants:
- so renderiza quando `variantId` esta definido na URL (estado `edição-de-custo-de-uma-variante-especifica`)

States:
- empty: `Empty` "Nenhum custo cadastrado para esta variante"

**`VariantCostEntryRow`** (Leaf ×N)

Mockup:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ $41.00 │ $0.00  │ $47.00 │ Todos pedidos ant. │ Todos pedidos fut. │[🗑]│
│ ...                                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

Slots:

```text
VariantCostEntryRow
└─ tr  [primitive: Table row]
   ├─ Custo: valor ("$41.00")  [text]
   ├─ Frete: valor ("$0.00")  [text]
   ├─ Total: custo+frete ("$47.00")  [text, bold]
   ├─ DataInicio: data ou "Todos pedidos anteriores"  [text]
   ├─ DataFim: data ou "Todos pedidos futuros"  [text]
   └─ Action: DeleteBtn  [primitive: Button variant="ghost" size="icon"] (aria-label="Deletar custo")
```

**`RecommendedAppsSection`** (Section)

```text
RecommendedAppsSection
└─ section  [flex col, gap-3]
   ├─ Header: h2 "Aplicativos Recomendados" + link "Deseja anunciar sua marca aqui?"
   └─ Grid: grade de apps  [grid]
      └─ RecommendedAppCard ×N
```

**`RecommendedAppCard`** (Leaf ×N)

Mockup:

```text
┌───────────────────────────────────┐
│ [🖼]  BK Reviews        ★ 4.8      │
│       (40.000+)         [ Visitar ]│
│  O BK Reviews e um aplicativo ...  │
└───────────────────────────────────┘
```

Slots:

```text
RecommendedAppCard
└─ a (link externo)  [primitive: Card, flex col, gap-2]
   ├─ Logo: img  [🖼]
   ├─ Title: nome ("BK Reviews")  [bold]
   ├─ Rating: estrela + nota ("4.8") + instalacoes ("(40.000+)")  [icon + text]
   ├─ Cta: "Visitar"  [bold / link]
   └─ Description: texto descritivo  [text muted]
```

**`EditVariantCostDialog`** (Dialog)

Mockup:

```text
╔══════════════════════════════════════════════════════╗
║ Custos de variante: US - W 6                      [×] ║
╠══════════════════════════════════════════════════════╣
║  Custo │ Frete │ Total │ Data Inicio │ Data Fim │[🗑] ║
║  $41.00│ $0.00 │ $47.00│ ...         │ ...      │     ║
║  [ + Adicionar ]                                      ║
║  ── VariantCostEntryForm (linha em edicao) ──         ║
╠══════════════════════════════════════════════════════╣
║                              [ Cancelar ] [ Salvar ]  ║
╚══════════════════════════════════════════════════════╝
```

Slots:

```text
EditVariantCostDialog
└─ Dialog  [primitive: Dialog]
   ├─ DialogHeader: titulo "Custos de variante: {variantName}" + Close
   ├─ DialogBody: tabela de historico (mesma forma de VariantCostHistorySection) + VariantCostEntryForm
   │  └─ AddBtn "Adicionar"  [primitive: Button]
   └─ DialogFooter: "Cancelar" + "Salvar"  [primitive: Button]
```

**`VariantCostEntryForm`** (Form, Type C)

```text
VariantCostEntryForm
└─ form  [grid, gap-2, dentro do DialogBody]
   ├─ cost: Input "Custo"  [primitive: Input + input-group $]
   ├─ shipping: Input "Frete"  [primitive: Input + input-group $]
   ├─ startDate: DatePicker "Data Inicio"  [primitive: DatePicker]
   ├─ endDate: DatePicker "Data Fim"  [primitive: DatePicker]
   └─ (Total e calculado/read-only)
```

**`ImportCsvDialog`** (Dialog)

Mockup:

```text
╔════════════════════════════════════╗
║ Importar custos por CSV        [×] ║
╠════════════════════════════════════╣
║  [ Selecionar arquivo .csv ]       ║
║  Dropzone / file input             ║
╠════════════════════════════════════╣
║              [ Cancelar ] [Enviar] ║
╚════════════════════════════════════╝
```

Slots:

```text
ImportCsvDialog
└─ Dialog  [primitive: Dialog]
   ├─ DialogHeader: "Importar custos por CSV" + Close
   ├─ DialogBody: file input / dropzone  [primitive: Input type=file]
   └─ DialogFooter: "Cancelar" + "Enviar"  [primitive: Button]
```

**`DeleteVariantCostsDialog`** (Dialog, confirm)

Mockup:

```text
╔════════════════════════════════════════════╗
║ Deletar custos de variantes?           [×] ║
╠════════════════════════════════════════════╣
║ Esta acao removera todos os custos das     ║
║ variantes deste produto.                   ║
╠════════════════════════════════════════════╣
║                 [ Cancelar ] [ Deletar ]   ║
╚════════════════════════════════════════════╝
```

Slots:

```text
DeleteVariantCostsDialog
└─ ConfirmDialog  [primitive: confirm-dialog]
   ├─ Title: "Deletar custos de variantes?"
   ├─ Description: aviso de acao destrutiva
   └─ Footer: "Cancelar" + "Deletar"  [primitive: Button variant="destructive"]
```

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| ProductCostRoute | RouteShell | — (param `productId`) | reads: [productId, variantId, country] | — | — | create-route-local | routes/(app)/products/costs/$productId/index.tsx | /route |
| VariantCostFormSection | Section | — (orquestra form + acoes) | reads: [country] | — | — | create-route-local | routes/(app)/products/costs/$productId/-components/VariantCostFormSection/index.tsx | /component |
| VariantCostForm | Form | mutation `useCreateProductCost({ productId })` | reads: [country], writes: [country] | — | [applyToAll] | create-route-local | routes/(app)/products/costs/$productId/-components/VariantCostFormSection/VariantCostForm.tsx | /form |
| VariantsTableSection | Section | `useListProductVariantCosts({ productId })` | reads: [variantId], writes: [variantId] | — | — | create-route-local | routes/(app)/products/costs/$productId/-components/VariantsTableSection/index.tsx | /component |
| VariantRow | Leaf | props from VariantsTableSection | writes: [variantId] | useDialogStore | — | create-route-local | routes/(app)/products/costs/$productId/-components/VariantsTableSection/VariantRow.tsx | /component |
| VariantCostHistorySection | Section | `useGetVariantCostHistory({ productId, variantId })` | reads: [variantId] | — | — | create-route-local | routes/(app)/products/costs/$productId/-components/VariantCostHistorySection/index.tsx | /component |
| VariantCostEntryRow | Leaf | props from VariantCostHistorySection | — | useDialogStore | — | create-route-local | routes/(app)/products/costs/$productId/-components/VariantCostHistorySection/VariantCostEntryRow.tsx | /component |
| RecommendedAppsSection | Section | dados estaticos (curados) | — | — | — | promote-to-shared | @/components/RecommendedAppsSection/index.tsx | /component |
| RecommendedAppCard | Leaf | props from RecommendedAppsSection | — | — | — | promote-to-shared | @/components/RecommendedAppsSection/RecommendedAppCard.tsx | /component |
| EditVariantCostDialog | Dialog | mutations `useCreateProductCost` / `useUpdateProductCost` / `useDeleteProductCost` | — | useDialogStore | — | create-route-local | routes/(app)/products/costs/$productId/-components/EditVariantCostDialog/index.tsx | /component |
| VariantCostEntryForm | Form | mutation `useCreateProductCost` / `useUpdateProductCost` | — | — | — | create-route-local | routes/(app)/products/costs/$productId/-components/EditVariantCostDialog/VariantCostEntryForm.tsx | /form |
| ImportCsvDialog | Dialog | mutation `useImportProductCostCsv({ productId })` | — | useDialogStore | [file] | create-route-local | routes/(app)/products/costs/$productId/-components/ImportCsvDialog/index.tsx | /component |
| DeleteVariantCostsDialog | Dialog | mutation `useDeleteProductCost({ productId })` | — | useDialogStore | — | reuse | @/components/ui/confirm-dialog.tsx | /component |

**Per-node notes:**

- **VariantsTableSection:** Skeleton: `DataTable` 8 linhas. Empty: `Empty` "Nenhuma variante encontrada". ARIA: `role="table" aria-label="Variantes do produto"`. Rationale: lista de variantes acoplada ao dominio de custo de produto; e o data-root da regiao.
- **VariantRow:** ARIA: botao de edicao `aria-label="Editar custos da variante"`; linha clicavel `role="button"`. Define `variantId` na URL e abre `EditVariantCostDialog`.
- **VariantCostHistorySection:** so renderiza com `variantId` presente; quando ausente fica oculta. Empty: "Nenhum custo cadastrado para esta variante". Rationale: data-root do historico de custos da variante selecionada.
- **VariantCostEntryRow:** `Total` = `cost + shipping` (read-only). Datas exibem fallback "Todos pedidos anteriores" / "Todos pedidos futuros" quando nulas.
- **RecommendedAppsSection / RecommendedAppCard:** bloco promocional "Aplicativos Recomendados" identico em multiplas telas do app (dashboard e demais rotas `(app)`) → promover para shared. Props genericas (logo, nome, nota, instalacoes, url, descricao), >=2 consumidores.
- **EditVariantCostDialog:** aberto via `useDialogStore.show(<EditVariantCostDialog variantId=.../>)`; estado `modal-de-edição-de-um-custo-de-variante-especifica` (`aria-modal="true"`). Reaproveita a forma de `VariantCostHistorySection`.
- **DeleteVariantCostsDialog:** usa o primitivo `confirm-dialog`; acao destrutiva.

### Reuse Summary

- **Reuse (no work):** `DeleteVariantCostsDialog` (primitivo `@/components/ui/confirm-dialog.tsx`); todos os primitivos citados (`Card`, `Table`, `Button`, `Input`, `Select`, `Switch`, `DatePicker`, `Dialog`, `Empty`, `Skeleton`, `Badge`, `input-group`) existem em `@/components/ui/`. `Navbar` e `Header` reaproveitados do shell `(app)` (`@/components/Navbar/`, `@/components/Header/`). `VariantsTableSection` pode reusar o shared `@/components/DataTable`.
- **Promote to shared:** `RecommendedAppsSection` + `RecommendedAppCard` — bloco "Aplicativos Recomendados" repetido em multiplas rotas (dashboard + outras telas `(app)`); extrair para `@/components/RecommendedAppsSection/` com props genericas.
- **Create new shared:** nenhum.
- **Create route-local:** `ProductCostRoute`, `VariantCostFormSection`, `VariantCostForm`, `VariantsTableSection`, `VariantRow`, `VariantCostHistorySection`, `VariantCostEntryRow`, `EditVariantCostDialog`, `VariantCostEntryForm`, `ImportCsvDialog` — acoplados ao dominio de custo de variante.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | ProductCostRoute | routes/(app)/products/costs/$productId/index.tsx | define search params variantId, country |
| 2 | /component (promote) | RecommendedAppsSection + RecommendedAppCard | @/components/RecommendedAppsSection/ | extrair de uso repetido; props genericas |
| 3 | /component | VariantCostFormSection | routes/(app)/products/costs/$productId/-components/VariantCostFormSection/ | |
| 4 | /form | VariantCostForm | dentro de VariantCostFormSection | mutation CreateProductCost (applyToAll) |
| 5 | /component | VariantsTableSection | routes/(app)/products/costs/$productId/-components/VariantsTableSection/ | owns ListProductVariantCosts |
| 6 | /component | VariantRow | .../VariantsTableSection/VariantRow.tsx | Leaf xN |
| 7 | /component | VariantCostHistorySection | routes/(app)/products/costs/$productId/-components/VariantCostHistorySection/ | owns GetVariantCostHistory |
| 8 | /component | VariantCostEntryRow | .../VariantCostHistorySection/VariantCostEntryRow.tsx | Leaf xN |
| 9 | /component | EditVariantCostDialog | routes/(app)/products/costs/$productId/-components/EditVariantCostDialog/ | useDialogStore |
| 10 | /form | VariantCostEntryForm | dentro de EditVariantCostDialog | mutation Create/UpdateProductCost |
| 11 | /component | ImportCsvDialog | routes/(app)/products/costs/$productId/-components/ImportCsvDialog/ | upload CSV |
| 12 | (reuse) | DeleteVariantCostsDialog | @/components/ui/confirm-dialog.tsx | confirm wrapper |

### Open Questions

- OQ-1. O editor de historico de custos aparece tanto inline (`VariantCostHistorySection`) quanto em modal (`EditVariantCostDialog`) com o mesmo conteudo — confirmar se sao dois modos do mesmo componente (inline em desktop, modal em foco) ou se o inline e estado intermediario e o modal o editor canonico. Proposta: `EditVariantCostDialog` e o editor canonico; `VariantCostHistorySection` e visualizacao/atalho inline.
- OQ-2. O campo "Pais" (Global / Canada / United States of America) escopa o custo por-pais simultaneamente ou e seletor unico? Assumido como search param `country` escopando o custo aplicado.
- OQ-3. "Importar da Shopify" abre dialog ou dispara sync direto? Modelado como mutation direta sem dialog (`ImportProductCostShopify`); confirmar.

## Controller Contract

> Consome os schemas de [`_schema-fundamentals.md`](../../../_schema-fundamentals.md)
> (`Money`, `Currency`, `MetricSchema`). Aplica os princípios: **um controller por
> preocupação** e **dados, não apresentação** — sem `formatted`/`label`/`href`/`editable`;
> o frontend deriva moeda, formatação (`"$41.00"`), os fallbacks de data
> ("Todos pedidos anteriores/futuros") e o `total` (= `cost + shipping`).

### Queries

| Controller | Metodo + Path | Componente(s) consumidor(es) | Quando carrega |
|---|---|---|---|
| `ListProductVariantCosts` | GET `/ui/bkdash/product-costs/{productId}` | VariantsTableSection (+ VariantRow), breadcrumb/titulo | Ao montar: lista variantes do produto com custo mais recente |
| `GetVariantCostHistory` | GET `/ui/bkdash/product-costs/{productId}/variants/{variantId}` | VariantCostHistorySection (+ VariantCostEntryRow), EditVariantCostDialog | Quando `variantId` definido na URL / ao abrir o dialog |
| `ListRecommendedApps` (compartilhado) | GET `/ui/bkdash/recommended-apps` | RecommendedAppsSection | Ao montar; vitrine de apps (mesmo controller das outras telas) |

### Commands

| Controller | Metodo + Path | Componente | Payload (campos — sem apresentação) |
|---|---|---|---|
| `CreateProductCost` (compartilhado) | POST `/ui/bkdash/product-costs` | VariantCostForm; VariantCostEntryForm (Adicionar) | `productId`, `variantId?`, `country` (string, default `"GLOBAL"`), `cost` (Money), `shipping` (Money), `currency` (`Currency`), `startDate` (nullable), `endDate` (nullable), `applyToAll` (boolean) |
| `UpdateProductCost` (compartilhado) | PUT `/ui/bkdash/product-costs` | VariantCostEntryForm (editar existente) | `productId`, `variantId`, `costId`, `cost` (Money), `shipping` (Money), `startDate` (nullable), `endDate` (nullable) |
| `DeleteProductCost` | DELETE `/ui/bkdash/product-costs` | VariantCostEntryRow; DeleteVariantCostsDialog | `productId`, `variantId?`, `costId?` (sem `costId` => deleta todos do produto) |
| `ImportProductCostCsv` | POST `/ui/bkdash/product-costs/csv` | ImportCsvDialog | `productId`, `file` (multipart) |
| `ImportProductCostShopify` | POST `/ui/bkdash/product-costs/shopify` | VariantCostFormSection (botao) | `productId` |

### Response Schemas (sketch)

```ts
import { Money, Currency, ListRecommendedAppsOutputSchema } from '@ui/schemas' // ver _schema-fundamentals.md

// schema LOCAL: um custo cadastrado (custo + frete). total/formatted derivados no frontend.
export const VariantCostSchema = z.object({
  id: z.string(),
  cost: Money,                      // 41.0
  shipping: Money,                  // 0.0
  currency: Currency,               // 'USD'
  startDate: z.date().nullable(),   // null => "Todos pedidos anteriores"
  endDate: z.date().nullable(),     // null => "Todos pedidos futuros"
})

// GET /ui/bkdash/product-costs/{productId}
// Lista de variantes; cada item traz o último custo (ou null = "Nenhum custo cadastrado").
export const ListProductVariantCostsOutputSchema = z.paginatedResponse({
  product: z.object({
    id: z.string(),
    title: z.string(),              // "THEWALKWAY"
    imageUrl: z.string().url().nullable(),
  }),
  variant: z.object({
    id: z.string(),
    name: z.string(),               // "US - W 6"
    latestCost: VariantCostSchema.nullable(), // null => "Nenhum custo cadastrado"
  }),
})

// GET /ui/bkdash/product-costs/{productId}/variants/{variantId}
// Histórico de custos da variante selecionada.
export const GetVariantCostHistoryOutputSchema = z.object({
  variant: z.object({
    id: z.string(),
    name: z.string(),               // "US - W 6" (frontend monta "Custos de variante: …")
  }),
  entries: z.array(VariantCostSchema),
})
```

### Reaproveitamento de Controllers

- **Existentes (reutilizar):** `GetUserInfo` (Header / saudacao "Seja bem-vindo,"), `ListNotifications` (sino do Header). Nenhum controller de dados de negocio existente cobre custos de variante — `GetDashboard` e `ListOrders` nao se aplicam.
- **Novos (criar):** `ListProductVariantCosts`, `GetVariantCostHistory` (queries); `DeleteProductCost`, `ImportProductCostCsv`, `ImportProductCostShopify` (commands).
- **Compartilhados:** `CreateProductCost` e `UpdateProductCost` são os mesmos controllers de custo de produto usados em outras telas (ex. `ProductCostCard` do dashboard que aponta para `/app/products/costs`); aqui são apenas acionados por `VariantCostForm` (aplicar) e `VariantCostEntryForm` (linha do histórico). `RecommendedAppsSection` consome `ListRecommendedApps` (controller compartilhado entre rotas `(app)`).
