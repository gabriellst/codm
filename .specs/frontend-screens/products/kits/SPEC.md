# Rota /app/products/kits — Kits de Produtos

## Visao Geral

A tela de Kits permite ao lojista agrupar produtos em "kits" e atribuir um custo
consolidado a cada agrupamento, complementando a tela de custos de produto. O corpo da
pagina e dominado por uma tabela paginada de kits ja cadastrados (colunas: checkbox de
selecao, Imagem, Nome do Kit, Tipo, Produtos, Custo Atual, datas e acao de editar), com
estado vazio "Nenhum registro encontrado". A toolbar reune busca, acao "Deletar"
(remove os kits marcados via checkbox) e a acao primaria "Novo kit". Abaixo da listagem
ha uma faixa promocional "Aplicativos Recomendados" (grid de apps parceiros como BK
Reviews), conteudo estatico de marketing reutilizado em varias telas do produto.

O fluxo de criacao e o coracao da tela: o botao "Novo kit" abre um modal de selecao de
tipo ("Selecione o Tipo do Kit": Produto Unico vs Varios Produtos). A escolha leva a um
WIZARD de criacao (Form Type B). O ramo Produto Unico tem tres passos (selecionar
produto -> definir quantidade/custo -> revisar Custo Total, Frete e Custo Atual); o ramo
Varios Produtos usa um passo unico com lista "Adicionar Produtos" mais campos de Custo e
Frete. Ambos terminam no comando "Criar Kit"; a edicao reaproveita o mesmo wizard.

## Inventario de Estados

| Arquivo HTML | Estado / Interacao | Citizen afetado |
|---|---|---|
| `app_product_kits.html` | Base: header "Kits", toolbar (busca + Deletar + Novo kit), tabela de kits (vazia: "Nenhum registro encontrado"), faixa "Aplicativos Recomendados" | `KitListSection`, `KitListToolbar`, `KitRow` (Leaf ×N), `RecommendedAppsSection` |
| `app_product_kits_modal-de-selecao-tipo-de-kit.html` | Modal "Selecione o Tipo do Kit" aberto com opcoes "Produto Unico" e "Varios Produtos" | `SelectKitTypeDialog` |
| `app_product_kits_selecao-kit-produto-unico.html` | Wizard ramo Produto Unico — passo 1: "Criar Kit de Produto Unico", Nome do Kit + selecao de Produto | `CreateKitWizardDialog` > `KitWizardForm` (step 1) |
| `app_product_kits_selecao-kit-produto-unico-step-2.html` | Wizard ramo Produto Unico — passo 2: detalhe/selecao do Produto | `CreateKitWizardDialog` > `KitWizardForm` (step 2) |
| `app_product_kits_selecao-kit-produto-unico-3.html` | Wizard ramo Produto Unico — passo 3: Produto, Quantidade, Custo Total, Frete -> "Criar Kit" | `CreateKitWizardDialog` > `KitWizardForm` (step 3) |
| `app_product_kits_selecao-kit-multiplos-produtos.html` | Wizard ramo Varios Produtos — Nome do Kit, Custo, Frete, "Adicionar Produtos" -> "Criar Kit" | `CreateKitWizardDialog` > `KitWizardForm` (ramo multiplo) |

## UI Composition

### URL Contract

- **Path:** `/app/products/kits`
- **Breadcrumb:** `Produtos / Kits`
- **Search params (Zod sketch):**
  - `page` — `number` (default 1) — pagina da tabela de kits
  - `limit` — `number` (default 10) — itens por pagina
  - `search` — `string` (default "") — busca por nome do kit
  - `sortBy` — `string` (opcional) — coluna de ordenacao
  - `sortOrder` — `'asc' | 'desc'` (opcional) — direcao de ordenacao
- **Loader (if any):** nenhum loader pesado; dados via query no `KitListSection`.
- **errorComponent:** `RouteError` (default)

### ASCII Layout Map

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Navbar (shared)  │  Header (shared)                                        │
├──────────────────┴──────────────────────────────────────────────────────┤
│ KitsRouteShell — titulo "Kits" + subtitulo "Adicione custos..."           │
│                                                                            │
│ ┌────────────────────────────────────────────────────────────────────┐   │
│ │ KitListSection                                                       │   │
│ │  ┌──────────────────────────────────────────────────────────────┐   │   │
│ │  │ KitListToolbar  (busca + [ Deletar ] + [ Novo kit ])         │   │   │
│ │  └──────────────────────────────────────────────────────────────┘   │   │
│ │  ┌──────────────────────────────────────────────────────────────┐   │   │
│ │  │ KitRow (Leaf ×N) — [x] Img Nome Tipo Produtos Custo Atual [✎] │   │   │
│ │  │ ...                                                            │   │   │
│ │  └──────────────────────────────────────────────────────────────┘   │   │
│ │  ┌──────────────────────────────────────────────────────────────┐   │   │
│ │  │ KitListPagination                                             │   │   │
│ │  └──────────────────────────────────────────────────────────────┘   │   │
│ └────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│ ┌────────────────────────────────────────────────────────────────────┐   │
│ │ RecommendedAppsSection — "Aplicativos Recomendados"                  │   │
│ │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                 │   │
│ │  │ RecommendedAppCard (Leaf ×N)  │ │ ...          │                 │   │
│ │  └──────────────┘ └──────────────┘ └──────────────┘                 │   │
│ └────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘

Overlays:
  SelectKitTypeDialog (Dialog)   ── abre ao clicar "[ Novo kit ]"
  CreateKitWizardDialog (Dialog) ── abre ao escolher um tipo no SelectKitTypeDialog
```

### Component Tree

```text
KitsRouteShell                                               (Route Shell)
├─ KitListSection                                            (Section, owns list query)
│  ├─ KitListToolbar                                         (Component, busca + Deletar + Novo kit)
│  ├─ KitRow                                                 (Leaf ×N)
│  └─ KitListPagination                                      (Component, paginacao)
├─ RecommendedAppsSection                                    (Section, owns recommended apps query)
│  └─ RecommendedAppCard                                     (Leaf ×N)
└─ titulo "Kits" + subtitulo                                 (static UI no Route Shell)

Overlays:
├─ SelectKitTypeDialog                                       (Dialog, route-local)
└─ CreateKitWizardDialog                                     (Dialog, route-local; contem Form)
   └─ KitWizardForm                                          (Form Type B, wizard)
```

### Component Anatomy

**`KitListSection`** (Section)

```text
KitListSection
└─ root  [flex flex-col gap-4]
   ├─ Toolbar: ref -> KitListToolbar
   ├─ Table: [primitive: Table] envolto por DataTable (shared)
   │  └─ Rows: ref -> KitRow (Leaf ×N)
   └─ Pagination: ref -> KitListPagination
```

States:
- skeleton: `DataTable` skeleton (linhas placeholder)
- empty: `Empty` primitive — "Nenhum registro encontrado"
- error: `DataError` inline

**`KitListToolbar`** (Component)

Mockup:

```text
┌────────────────────────────────────────────────────────────┐
│ [ Buscar kit ____________ ]      [ Deletar ]   [ + Novo kit ]│
└────────────────────────────────────────────────────────────┘
```

Slots:

```text
KitListToolbar
└─ root  [flex row items-center between gap-3]
   ├─ Search: input de busca  [primitive: Input]  (writes URL search, useDebouncedSearch)
   ├─ DeleteAction: botao "Deletar"  [primitive: Button, variant=destructive]
   │  └─ habilitado quando ha kits selecionados (checkbox) -> dispara DeleteKits
   └─ NewAction: botao "Novo kit"  [primitive: Button]  (aria-haspopup="dialog")
      └─ onClick -> useDialogStore.show(<SelectKitTypeDialog />)
```

Variants:
- sem selecao → "Deletar" desabilitado

**`KitRow`** (Leaf ×N)

Mockup:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ [x] [🖼] Kit Verao 2026 │ Produto Unico │ 3 produtos │ R$ 187,40 │ [✎] │
└──────────────────────────────────────────────────────────────────────┘
```

Slots:

```text
KitRow
└─ TableRow  [primitive: Table > TableRow]
   ├─ Select: checkbox de selecao  [primitive: Checkbox]  (marca para Deletar em lote)
   ├─ Image: thumbnail  [🖼]  (kit.imageUrl)
   ├─ Name: texto  (kit.name)
   ├─ Type: badge  [primitive: Badge]  (kit.type: "Produto Unico" | "Varios Produtos")
   ├─ ProductsCount: texto  (kit.productsCount, ex. "3 produtos")
   ├─ CurrentCost: texto monetario  (kit.currentCost, currency-formatted)
   ├─ CreatedAt: data  (kit.createdAt)
   └─ EditAction: icone editar  [primitive: Button, variant=ghost, size=icon]
      └─ onClick -> useDialogStore.show(<CreateKitWizardDialog kitId=... />)
```

**`KitListPagination`** (Component)

Mockup:

```text
┌──────────────────────────────────────────────────────────────┐
│                              < 1 2 3 >        10 / pagina  v   │
└──────────────────────────────────────────────────────────────┘
```

Slots:

```text
KitListPagination
└─ root  [flex row between]  [primitive: Pagination]
   ├─ Pages: controles de pagina  (writes URL page)
   └─ PageSize: seletor de tamanho  [primitive: Select]  (writes URL limit)
```

**`RecommendedAppsSection`** (Section)

```text
RecommendedAppsSection
└─ root  [flex flex-col gap-3]
   ├─ Header: h2 "Aplicativos Recomendados" + link "Deseja anunciar sua marca aqui?"
   └─ Grid: [grid grid-cols-3/4 gap-4]
      └─ Cards: ref -> RecommendedAppCard (Leaf ×N)
```

**`RecommendedAppCard`** (Leaf ×N)

Mockup:

```text
┌──────────────────────────────┐
│ [🖼] BK Reviews   ★ 4.8       │
│      (40.000+)    [ Visitar ] │
│ O BK Reviews e um app que ... │
└──────────────────────────────┘
```

Slots:

```text
RecommendedAppCard
└─ Card  [primitive: Card]  [flex flex-col gap-2 p-3, link href=app.url]
   ├─ Logo: imagem  [🖼]  (app.imageAlt)
   ├─ Name: titulo bold  (app.name)
   ├─ Rating: estrela + nota + contagem  (app.rating, app.reviewsCount)
   ├─ CTA: "Visitar"  [primitive: Button, variant=link]
   └─ Description: paragrafo  (app.description)
```

**`SelectKitTypeDialog`** (Dialog)

Mockup:

```text
╔════════════════════════════════════════════╗
║ Selecione o Tipo do Kit                  [×] ║
╠════════════════════════════════════════════╣
║  ┌──────────────────┐  ┌──────────────────┐ ║
║  │  Produto Unico    │  │  Varios Produtos │ ║
║  │  (1 produto)      │  │  (N produtos)    │ ║
║  └──────────────────┘  └──────────────────┘ ║
╚════════════════════════════════════════════╝
```

Slots:

```text
SelectKitTypeDialog
└─ Dialog  [primitive: Dialog]
   ├─ DialogHeader: titulo "Selecione o Tipo do Kit" + close
   └─ DialogBody: [grid grid-cols-2 gap-3]
      ├─ OptionSingle: card clicavel "Produto Unico"  [primitive: Card, role=button]
      │  └─ onClick -> useDialogStore.show(<CreateKitWizardDialog type="single" />)
      └─ OptionMultiple: card clicavel "Varios Produtos"  [primitive: Card, role=button]
         └─ onClick -> useDialogStore.show(<CreateKitWizardDialog type="multiple" />)
```

**`CreateKitWizardDialog`** (Dialog)

Mockup:

```text
╔══════════════════════════════════════════════════════╗
║ Criar Kit de Produto Unico                         [×] ║
╠══════════════════════════════════════════════════════╣
║  ( • )──( 2 )──( 3 )   <- StepIndicator (ramo single)  ║
║                                                        ║
║   [ KitWizardForm — corpo do passo atual ]             ║
║                                                        ║
╠══════════════════════════════════════════════════════╣
║                       [ Voltar ]      [ Criar Kit ]    ║
╚══════════════════════════════════════════════════════╝
```

Slots:

```text
CreateKitWizardDialog
└─ Dialog  [primitive: Dialog]
   ├─ DialogHeader: titulo dinamico "Criar Kit de Produto Unico" / "Criar Kit"
   ├─ StepIndicator: passos do wizard (so no ramo single: 1-2-3)  [primitive: Progress/Tabs]
   ├─ DialogBody: ref -> KitWizardForm
   └─ DialogFooter: navegacao [ Voltar ] [ Proximo ] / [ Criar Kit ]  [primitive: Button]
```

Variants:
- `type === "single"` → StepIndicator com 3 passos; footer "Proximo" ate o passo 3
- `type === "multiple"` → passo unico; footer direto "Criar Kit"
- `kitId` presente → modo edicao (titulo + payload de update)

**`KitWizardForm`** (Form Type B)

```text
KitWizardForm  (TanStack Form, multi-step; validators do schema SDK de CreateKit)
└─ Form  [primitive: Form/Field]
   ├─ field name: "Nome do Kit"  [primitive: Input]            (ambos os ramos)
   ├─ RAMO single — step 1: field product: "Produto"  [primitive: Combobox]
   ├─ RAMO single — step 2: field product (detalhe / selecao)  [primitive: Combobox]
   ├─ RAMO single — step 3:
   │  ├─ field quantity: "Quantidade"  [primitive: Input number]
   │  ├─ field shipping: "Frete"  [primitive: Input money]
   │  ├─ readonly totalCost: "Custo Total"  (calculado)
   │  └─ readonly currentCost: "Custo Atual"  (calculado)
   └─ RAMO multiple — passo unico:
      ├─ field cost: "Custo"  [primitive: Input money]
      ├─ field shipping: "Frete"  [primitive: Input money]
      └─ ProductsList: "Adicionar Produtos" (lista dinamica { productId, quantity })  [primitive: Combobox + Button]
```

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| KitsRouteShell | RouteShell | — | reads: [page, limit, search, sortBy, sortOrder] | — | — | create-route-local | `routes/(app)/products/kits/index.tsx` | /route |
| KitListSection | Section | `useListKits({ page, limit, search, sortBy, sortOrder })` | reads: [page, limit, search, sort*] | — | `[selectedIds]` | create-route-local | `routes/(app)/products/kits/-components/KitListSection/index.tsx` | /component |
| KitListToolbar | Component | props from KitListSection | reads/writes: [search] | useDialogStore: { writes: [show] } | — | create-route-local | `routes/(app)/products/kits/-components/KitListSection/KitListToolbar.tsx` | /component |
| KitRow | Leaf | props from KitListSection | — | useDialogStore: { writes: [show] } | — | create-route-local | `routes/(app)/products/kits/-components/KitListSection/KitRow.tsx` | /component |
| KitListPagination | Component | props from KitListSection | writes: [page, limit] | — | — | reuse | `@/components/ui/pagination.tsx` | /component |
| RecommendedAppsSection | Section | `useListRecommendedApps()` | — | — | — | promote-to-shared | `@/components/RecommendedAppsSection/index.tsx` | /component |
| RecommendedAppCard | Leaf | props from RecommendedAppsSection | — | — | — | promote-to-shared | `@/components/RecommendedAppsSection/RecommendedAppCard.tsx` | /component |
| SelectKitTypeDialog | Dialog | — | — | useDialogStore | `[]` | create-route-local | `routes/(app)/products/kits/-components/SelectKitTypeDialog/index.tsx` | /component |
| CreateKitWizardDialog | Dialog | `useListProductsForKit()` (combobox) | — | useDialogStore + useKitWizardStore: { reads/writes: [step, type] } | — | create-route-local | `routes/(app)/products/kits/-components/CreateKitWizardDialog/index.tsx` | /component |
| KitWizardForm | Form | TanStack Form -> `CreateKit` / `UpdateKit` | — | useKitWizardStore: { reads: [step, type] } | form state | create-route-local | `routes/(app)/products/kits/-components/CreateKitWizardDialog/KitWizardForm.tsx` | /form |

**Per-node notes:**

- **KitListSection:** Skeleton: linhas placeholder via `DataTable`. Empty: `Empty` primitive "Nenhum registro encontrado". Error: `DataError`. ARIA: `role="table" aria-label="Lista de kits"`. Mantem `selectedIds` (kits marcados) usado pela acao Deletar da toolbar. Rationale: dominio de kits, sem paralelo em outras rotas.
- **KitListToolbar:** ARIA: botao "Novo kit" com `aria-haspopup="dialog"`. Busca usa `useDebouncedSearch`. "Deletar" so habilita com selecao -> `DeleteKits({ ids })`.
- **KitRow:** Acao de editar abre o wizard em modo edicao (`kitId`). Checkbox alimenta `selectedIds` no Section.
- **RecommendedAppsSection / RecommendedAppCard:** A faixa "Aplicativos Recomendados" aparece em multiplas telas do produto (kits, cost, listing) → candidata a `promote-to-shared`. Props genericas: `{ name, imageAlt, imageUrl, rating, reviewsCount, description, url }`.
- **SelectKitTypeDialog:** ARIA: `role="dialog" aria-label="Selecione o Tipo do Kit"`. Cada opcao e card clicavel que dispara o wizard com o tipo escolhido.
- **CreateKitWizardDialog:** O `StepIndicator` so existe no ramo "single" (3 passos). O ramo "multiple" e passo unico. `useKitWizardStore` guarda o indice do passo e o tipo selecionado.
- **KitWizardForm:** Validadores derivados do schema SDK do `CreateKit`. Campos calculados (Custo Total, Custo Atual) sao readonly derivados de quantidade/custo/frete.

### Reuse Summary

- **Reuse (no work):** `KitListPagination` (`@/components/ui/pagination.tsx`); tabela via `DataTable` shared (`@/components/DataTable`); `DataError`/`Empty` inline; primitivos `Dialog`, `Card`, `Button`, `Input`, `Combobox`, `Badge`, `Checkbox`, `Select`, `Progress`/`Tabs`, `Field`.
- **Promote to shared:** `RecommendedAppsSection` + `RecommendedAppCard` — consumidores: `routes/(app)/products/kits` e `routes/(app)/products/costs` (e potencialmente `product` listing). Alvo: `@/components/RecommendedAppsSection/`.
- **Create new shared:** nenhum.
- **Create route-local:** `KitsRouteShell`, `KitListSection`, `KitListToolbar`, `KitRow`, `SelectKitTypeDialog`, `CreateKitWizardDialog`, `KitWizardForm` — acoplados ao dominio de kits.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | KitsRouteShell | `routes/(app)/products/kits/index.tsx` | URL contract + layout |
| 2 | /store | useKitWizardStore | `routes/(app)/products/kits/-stores/useKitWizardStore.ts` | indice de passo + tipo do wizard |
| 3 | /component (promote) | RecommendedAppsSection + RecommendedAppCard | `@/components/RecommendedAppsSection/` | extrair e reusar entre kits/cost |
| 4 | /component | KitListSection | `routes/(app)/products/kits/-components/KitListSection/` | owns useListKits + selectedIds |
| 5 | /component | KitListToolbar | `routes/(app)/products/kits/-components/KitListSection/KitListToolbar.tsx` | busca + Deletar + Novo kit |
| 6 | /component | KitRow | `routes/(app)/products/kits/-components/KitListSection/KitRow.tsx` | Leaf da tabela |
| 7 | (reuse) | KitListPagination | `@/components/ui/pagination.tsx` | sem trabalho novo |
| 8 | /component | SelectKitTypeDialog | `routes/(app)/products/kits/-components/SelectKitTypeDialog/` | modal de selecao de tipo |
| 9 | /component | CreateKitWizardDialog | `routes/(app)/products/kits/-components/CreateKitWizardDialog/` | dialog hospedeiro do wizard |
| 10 | /form | KitWizardForm | `routes/(app)/products/kits/-components/CreateKitWizardDialog/KitWizardForm.tsx` | Form Type B (single 3 passos / multiple 1 passo) |

### Open Questions

- OQ-1. As colunas exatas alem de checkbox / Imagem / Nome / Tipo / Produtos / Custo Atual / data nao puderam ser totalmente confirmadas (tabela vazia no snapshot) — validar ordenacao e presenca de "Custo de Criacao".
- OQ-2. O ramo "single" tem 3 passos distintos no wizard, mas os campos exatos do passo 2 (Produto) versus passo 1 nao ficaram claros nos snapshots — proposta: passo 1 = nome+produto, passo 2 = selecao/detalhe do produto, passo 3 = quantidade/frete/custos calculados. Validar.

## Controller Contract

> Consome os schemas de [`_schema-fundamentals.md`](../../_schema-fundamentals.md)
> (`Money`, `MetricSchema`, `Currency`, `ListRecommendedAppsOutputSchema`).
> Aplica os princípios: **um controller por preocupação** e **dados, não apresentação**
> (sem `href`, `tooltip`, `label`, `color`, `editable` nem strings pré-formatadas — o
> frontend deriva tudo a partir de enums + valores + mapas i18n). Mantém apenas dados
> genuinamente externos (ex.: `imageUrl`, `installUrl`/`advertiseUrl`).

### Queries

| Controller | Metodo + Path | Componente(s) consumidor(es) | Quando carrega |
|---|---|---|---|
| `ListKits` (novo) | GET `/ui/bkdash/kits` | `KitListSection` | Ao montar e ao mudar page/limit/search/sort |
| `ListProductsForKit` (novo) | GET `/ui/bkdash/kits/products` | `CreateKitWizardDialog` > `KitWizardForm` (combobox de produtos) | Ao abrir o wizard / ao digitar no combobox |
| `ListRecommendedApps` (novo, compartilhado) | GET `/ui/bkdash/recommended-apps` | `RecommendedAppsSection` | Ao montar a tela |

### Commands

| Controller | Metodo + Path | Componente | Payload (campos — sem apresentação) |
|---|---|---|---|
| `CreateKit` (novo) | POST `/kits` | `KitWizardForm` > [ Criar Kit ] | `{ name, type: KitType, shipping (Money), cost?: Money, items: [{ productId, quantity }] }` |
| `UpdateKit` (novo) | PATCH `/kits/:id` | `KitWizardForm` (modo edicao) > [ Salvar ] | `{ name?, shipping?: Money, cost?: Money, items? }` |
| `DeleteKits` (novo) | DELETE `/kits` | `KitListToolbar` > [ Deletar ] | `{ ids: string[] }` (kits marcados via checkbox) |

### Response Schemas (sketch)

```ts
import {
  Money, MetricSchema, Currency,
  ListRecommendedAppsOutputSchema,
} from '@ui/schemas' // ver _schema-fundamentals.md

// Enum LOCAL do domínio de kits (tipo do agrupamento)
export const KitType = z.enum(['single', 'multiple'])

// GET /ui/bkdash/kits — lista paginada de kits. currentCost é Money + variação (MetricSchema).
export const ListKitsOutputSchema = z.paginatedResponse({
  id: z.string(),
  name: z.string(),                          // "Nome do Kit"
  imageUrl: z.string().url().nullable(),     // thumbnail (dado externo real)
  type: KitType,                             // 'single' | 'multiple' — label derivado no frontend
  productsCount: z.number(),                 // "Produtos" (contagem)
  currentCost: MetricSchema,                 // "Custo Atual": { value (Money), deltaPct }
  createdAt: z.date(),                       // frontend formata a data
})

// GET /ui/bkdash/kits/products — produtos disponiveis para compor um kit
export const ListProductsForKitOutputSchema = z.paginatedResponse({
  id: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  imageUrl: z.string().url().nullable(),     // dado externo real
  currentCost: Money,                        // custo unitario atual do produto
})

// GET /ui/bkdash/recommended-apps — faixa "Aplicativos Recomendados".
// Reusa o schema compartilhado dos fundamentos (mesmo controller de várias telas):
// items[] = { id, name, logoUrl, rating, ratingCount, description, installUrl }.
// installUrl é dado externo real (link "Visitar"); rating/ratingCount são números
// (o "(40.000+)" é formatado no frontend, não vem como string pronta).
export { ListRecommendedAppsOutputSchema }
```

### Reaproveitamento de Controllers

- **Existentes (reutilizar):** nenhum dos controllers de dados existentes (`GetDashboard`, `ListOrders`) cobre kits; o `Header`/`Navbar` shared continuam consumindo `GetUserInfo` e `ListNotifications` como em todas as telas (app).
- **Novos (criar):** `ListKits` (lista paginada; `currentCost` em `MetricSchema`/`Money`), `ListProductsForKit` (combobox do wizard), `CreateKit` e `UpdateKit` (comandos do wizard), `DeleteKits` (exclusao em lote pela toolbar).
- **Compartilhados:** `ListRecommendedApps` é o mesmo controller usado por `/app` e por `products/costs` — consome `ListRecommendedAppsOutputSchema` dos fundamentos (sem redefinir a forma). `RecommendedAppsSection`/`RecommendedAppCard` são `promote-to-shared`.
