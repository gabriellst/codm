# Rota /app/settings/integrations — Configuracoes — Integracoes

## Visao Geral

Tela de configuracao das integracoes da loja. Concentra a regiao **Minhas Integracoes** — plataformas/gateways ja conectados (ex.: Shopify, com dominio, gateway de pagamento e estado de conexao) — onde o lojista pode conectar, reintegrar ou desconectar uma plataforma e expandir um bloco colapsavel "Ver credenciais" para destrinchar suas credenciais salvas (dominio Shopify, gateway, chaves de API). Acima da lista ha um campo "Buscar Integracoes" e uma faixa de categorias (Minhas / Loja / Marketing / Checkout / Gateway) que filtra/segmenta a lista de cartoes. Abaixo, a regiao **Aplicativos Recomendados** e uma vitrine de apps parceiros (BK Reviews etc.) com avaliacao, contagem de reviews e link externo "Visitar", alem do convite "Deseja anunciar sua marca aqui?".

O fluxo central da rota e o gerenciamento de credenciais: cada cartao de integracao tem um trigger "Conectar"/"Reintegrar" que abre um formulario de credenciais (sheet lateral), um botao "Desconectar" (com confirmacao) e um colapsavel "Ver credenciais" que expande inline os campos ja salvos — estado capturado em `app_settings_integration_aberto-destrinchagem-de-minhas-credenciais.html`. A vitrine de recomendados e puramente apresentacional e leva o usuario para sites externos. Navbar e Header sao compartilhados com todas as telas (app).

## Inventario de Estados

| Arquivo HTML | Estado / Interacao | Citizen afetado |
|---|---|---|
| `app_settings_integration.html` | Estado base: cabecalho "Integracoes" + subtitulo, faixa de categorias, busca "Buscar Integracoes", lista "Minhas Integracoes" (Shopify conectado, dominio, gateway, Conectar/Desconectar/Reintegrar/Ver credenciais) e grid "Aplicativos Recomendados" | `IntegrationCategoryTabs`, `IntegrationSearchBar`, `IntegrationsListSection`, `IntegrationCard` (Leaf), `RecommendedAppsSection`, `RecommendedAppCard` (Leaf) |
| `app_settings_integration_aberto-destrinchagem-de-minhas-credenciais.html` | Estado com o colapsavel "Ver credenciais" expandido (destrinchagem das credenciais salvas: dominio Shopify, gateway, chaves). Snapshot tirado por cima do conteudo de outra tela; o outline mostra "Taxas de Checkout" ao fundo, mas o estado representa a expansao do collapsible de credenciais | `IntegrationCard` (Leaf) > `CredentialsCollapsible` |

## UI Composition

### URL Contract

- **Path:** `/app/settings/integrations`
- **Breadcrumb:** `Configuracoes / Integracoes`
- **Search params (Zod sketch):**
  - `category` — `enum("minhas","loja","marketing","checkout","gateway")` (opcional, default `minhas`) — categoria ativa na faixa de tabs
  - `search` — `string` (opcional) — termo do campo "Buscar Integracoes"
  - `credentialsOpen` — `string` (opcional) — id da integracao com o collapsible "Ver credenciais" expandido (persiste a expansao no URL)
- **Loader (if any):** nenhum loader bloqueante; as Sections fazem fetch proprio ao montar.
- **errorComponent:** `RouteError` (default)

### ASCII Layout Map

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Navbar (shared, left rail)   │  Header (shared, top bar)                   │
├──────────────────────────────┴─────────────────────────────────────────────┤
│ IntegrationRouteShell                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ IntegrationsHeaderRegion (static: "Integracoes" + subtitle)           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  ┌────────────────────────────┐  │
│  │ IntegrationCategoryTabs                │  │ IntegrationSearchBar       │  │
│  │ [Minhas][Loja][Marketing][Checkout]... │  │ 🔍 Buscar Integrações      │  │
│  └──────────────────────────────────────┘  └────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ IntegrationsListSection ("Minhas Integracoes")                         │  │
│  │  ┌────────────────────────────────────────────────────────────────┐   │  │
│  │  │ IntegrationCard (Leaf ×N)                                       │   │  │
│  │  │   logo | nome | dominio | gateway | status                      │   │  │
│  │  │   [Conectar/Reintegrar] [Desconectar] [Ver credenciais ▾]       │   │  │
│  │  │   └─ CredentialsCollapsible (expande inline)                    │   │  │
│  │  └────────────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ RecommendedAppsSection ("Aplicativos Recomendados" + "Anunciar aqui?") │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                   │  │
│  │  │RecApp Leaf││RecApp Leaf││RecApp Leaf││RecApp Leaf│  (grid ×N)        │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘

Overlays:
  ConnectIntegrationSheet (Dialog/sheet) ── abre ao clicar "Conectar" / "Reintegrar" num IntegrationCard
```

### Component Tree

```text
IntegrationRouteShell                                        (Route Shell)
├─ Navbar                                                    (shared, reuse — Route Shell)
├─ Header                                                    (shared, reuse — Route Shell)
├─ IntegrationsHeaderRegion                                  (static UI no Route Shell: titulo + subtitulo)
├─ IntegrationCategoryTabs                                   (Component, escreve URL category)
├─ IntegrationSearchBar                                      (Component, escreve URL search)
├─ IntegrationsListSection                                   (Section, owns query "minhas integracoes")
│  └─ IntegrationCard                                        (Leaf ×N)
│     └─ CredentialsCollapsible                              (Component, collapsible inline)
└─ RecommendedAppsSection                                    (Section, owns query "recomendados")
   └─ RecommendedAppCard                                     (Leaf ×N)

Overlays:
└─ ConnectIntegrationSheet                                   (Dialog/sheet, route-local — contem ConnectIntegrationForm)
   └─ ConnectIntegrationForm                                 (Form Type C)
```

### Component Anatomy

**`IntegrationCategoryTabs`** (Component)

Mockup:

```text
┌───────────────────────────────────────────────────────────┐
│ [ Minhas ] [ Loja ] [ Marketing ] [ Checkout ] [ Gateway ] │
└───────────────────────────────────────────────────────────┘
```

Slots:

```text
IntegrationCategoryTabs
└─ root  [primitive: Tabs]  [flex row, gap-2]  (value = URL category)
   └─ Tab ×5: "Minhas" | "Loja" | "Marketing" | "Checkout" | "Gateway"  [primitive: Tabs trigger]
```

Variants:
- `tab.value === category` → trigger ativo (bg destacado).

**`IntegrationSearchBar`** (Component)

Mockup:

```text
┌────────────────────────────────────────────┐
│ 🔍  Buscar Integrações ...                  │
└────────────────────────────────────────────┘
```

Slots:

```text
IntegrationSearchBar
└─ root  [flex row items-center, w-full]  [primitive: InputGroup]
   ├─ Icon: lupa  [lucide Search, size-4, text-muted-foreground]
   └─ Field: input texto  [primitive: Input]  (placeholder "Buscar Integrações")
```

States:
- empty: input vazio com placeholder; sem skeleton (controle puro de URL).

**`IntegrationsListSection`** (Section)

```text
IntegrationsListSection
└─ root  [flex col, gap-4]  [section aria-label="Minhas Integracoes"]
   ├─ Header: titulo "Minhas Integracoes"  [text-xl/text20 font-semibold]
   └─ List: container vertical de cartoes  [flex col, gap-3, role="list"]
      └─ IntegrationCard ×N  (ver bloco proprio)
```

States:
- skeleton: 2-3 `Skeleton` no formato do IntegrationCard (h-24).
- empty: `Empty` primitive — "Nenhuma integracao conectada".
- error: `DataError` inline.

**`IntegrationCard`** (Leaf ×N)

Mockup:

```text
┌──────────────────────────────────────────────────────────┐
│ [🖼 logo]  Shopify                         ● Conectado     │
│            Domínio: minhaloja.myshopify.com                │
│            Gateway: Shopify Payments                       │
│  ┌────────────────────────────────────────────────────┐   │
│  │ [ Reintegrar ]  [ Desconectar ]  [ Ver credenciais ▾]│   │
│  └────────────────────────────────────────────────────┘   │
│  ╭── CredentialsCollapsible (expandido) ───────────────╮   │
│  │  Domínio Shopify   minhaloja.myshopify.com   [copiar]│   │
│  │  Gateway           Shopify Payments                  │   │
│  │  API Key           ••••••••••••  [copiar]            │   │
│  ╰──────────────────────────────────────────────────────╯  │
└──────────────────────────────────────────────────────────┘
```

Slots:

```text
IntegrationCard
└─ Card  [primitive: Card]  [flex col gap-3 p-4, role="listitem"]
   ├─ HeaderRow: flex row items-center between
   │  ├─ Logo: imagem da plataforma  [🖼, size-10 rounded]
   │  ├─ Name: nome da plataforma  [font-semibold]  (ex. "Shopify")
   │  └─ StatusBadge: estado da conexao  [primitive: Badge]  (Conectado / Desconectado / Erro)
   ├─ Meta: flex col gap-1, text-sm text-muted-foreground
   │  ├─ Domain: "Dominio: <store.domain>"
   │  └─ Gateway: "Gateway: <gateway.name>"
   ├─ Actions: flex row gap-2
   │  ├─ ConnectBtn: "Conectar" / "Reintegrar"  [primitive: Button, variant="default"]  (abre ConnectIntegrationSheet)
   │  ├─ DisconnectBtn: "Desconectar"  [primitive: Button, variant="outline"]  (confirm + DisconnectIntegration)
   │  └─ CredentialsTrigger: "Ver credenciais" + chevron  [primitive: Button variant="ghost"]  (toggle CredentialsCollapsible)
   └─ CredentialsCollapsible: ver bloco proprio  [primitive: Collapsible]
```

Variants:
- `status === "connected"` → StatusBadge verde "Conectado"; ConnectBtn rotula "Reintegrar".
- `status === "disconnected"` → StatusBadge neutro; ConnectBtn rotula "Conectar"; DisconnectBtn oculto.
- `status === "error"` → StatusBadge vermelho; ConnectBtn rotula "Reintegrar".

States:
- empty: nunca vazio — o card so existe se ha uma integracao.

**`CredentialsCollapsible`** (Component)

Mockup:

```text
╭─ Ver credenciais (expandido) ───────────────────────────╮
│  Domínio Shopify   minhaloja.myshopify.com      [ copiar]│
│  Gateway           Shopify Payments                      │
│  API Key           ••••••••••••••••             [ copiar]│
╰──────────────────────────────────────────────────────────╯
```

Slots:

```text
CredentialsCollapsible
└─ Collapsible  [primitive: Collapsible]  [open when URL credentialsOpen === integration.id]
   ├─ Trigger: reusa o botao "Ver credenciais" do IntegrationCard (chevron rotaciona em data-state=open)
   └─ Content: lista de pares label/valor  [flex col gap-2, p-3, bg-muted/40 rounded]
      └─ CredentialRow ×N  [flex row between items-center]
         ├─ Label: nome do campo  [text-sm text-muted-foreground]  (ex. "Dominio Shopify", "API Key")
         ├─ Value: valor (mascarado quando secreto)  [text-sm font-mono]
         └─ CopyBtn: "copiar"  [primitive: Button variant="ghost" size="icon"]  (aria-label "Copiar credencial")
```

Variants:
- `field.secret === true` → Value mascarado (`••••`) com CopyBtn ativo.
- `credentialsOpen !== integration.id` → Content recolhido (altura 0).

States:
- empty: "Sem credenciais salvas" quando a integracao nunca foi conectada.

**`RecommendedAppsSection`** (Section)

```text
RecommendedAppsSection
└─ root  [flex col gap-4]  [section aria-label="Aplicativos Recomendados"]
   ├─ Header: flex row between
   │  ├─ Title: "Aplicativos Recomendados"  [text20 font-semibold]
   │  └─ AdLink: "Deseja anunciar sua marca aqui?"  [link externo, font-semibold]
   └─ Grid: grid de cartoes  [grid grid-cols-4 gap-4, role="list"]
      └─ RecommendedAppCard ×N  (ver bloco proprio)
```

States:
- skeleton: 4 `Skeleton` em grid (h-48).
- empty: `Empty` — "Nenhum aplicativo recomendado".

**`RecommendedAppCard`** (Leaf ×N)

Mockup:

```text
┌────────────────────────────┐
│ [🖼 BK Reviews]             │
│ BK Reviews                  │
│ ★ 4.8  (40.000+)            │
│ O BK Reviews é um app que   │
│ facilita a importação ...   │
│            [ Visitar → ]    │
└────────────────────────────┘
```

Slots:

```text
RecommendedAppCard
└─ Anchor (link externo)  [primitive: Card dentro de <a target=_blank>]  [flex col gap-2 p-4, role="listitem"]
   ├─ Logo: imagem do app  [🖼, alt=app.name]
   ├─ Name: nome  [font-bold]  (ex. "BK Reviews")
   ├─ RatingRow: flex row items-center gap-1
   │  ├─ Score: nota  (ex. "4.8")
   │  ├─ StarIcon  [lucide Star, size-4]
   │  └─ Count: "(40.000+)"  [text-muted-foreground]
   ├─ Description: texto descritivo  [text-sm text-muted-foreground, line-clamp]
   └─ VisitCta: "Visitar" + seta  [font-bold]  [lucide ExternalLink/ArrowRight]
```

States:
- sem skeleton/empty proprios — a Section ja cobre.

**`ConnectIntegrationSheet`** (Dialog / sheet)

Mockup:

```text
╔══════════════════════════════════════════╗
║ Conectar Shopify                      [×] ║
╠══════════════════════════════════════════╣
║  (ConnectIntegrationForm)                 ║
║  Domínio Shopify  [____________________]  ║
║  API Key          [____________________]  ║
║  Gateway          [ Shopify Payments  ▾]  ║
╠══════════════════════════════════════════╣
║              [ Cancelar ]  [ Conectar ]   ║
╚══════════════════════════════════════════╝
```

Slots:

```text
ConnectIntegrationSheet
└─ Sheet  [primitive: sheet]  (aberto via useDialogStore.show; lado direito)
   ├─ Header: titulo "Conectar <plataforma>" + botao fechar
   ├─ Body: ConnectIntegrationForm (ver Form)
   └─ Footer: [Cancelar] [Conectar]  [primitive: Button]
```

**`ConnectIntegrationForm`** (Form Type C — dentro do sheet)

```text
ConnectIntegrationForm
└─ Form (TanStack Form)  [flex col gap-4]
   ├─ domain: "Dominio Shopify"  [primitive: Input]
   ├─ apiKey: "API Key / Token"  [primitive: Input, type=password]
   ├─ apiSecret: "API Secret" (opcional, por plataforma)  [primitive: Input, type=password]
   └─ gateway: "Gateway"  [primitive: Select]  (Shopify Payments / Mercado Pago)
```

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| IntegrationRouteShell | RouteShell | — | reads: [category, search, credentialsOpen] | — | — | create-route-local | `routes/(app)/settings/integrations/index.tsx` | /route |
| Navbar | Component (shared) | — | — | useSidebarStore | — | reuse | `@/components/Navbar/` | (reuse) |
| Header | Component (shared) | useGetUserInfo, useListNotifications | reads: [store, range, currency] | — | — | reuse | `@/components/Header/` | (reuse) |
| IntegrationCategoryTabs | Component | — | reads: [category], writes: [category] | — | — | create-route-local | `.../-components/IntegrationCategoryTabs/` | /component |
| IntegrationSearchBar | Component | — | reads: [search], writes: [search] | — | — | create-route-local | `.../-components/IntegrationSearchBar/` | /component |
| IntegrationsListSection | Section | useListIntegrations({ category, search }) | reads: [category, search] | — | — | create-route-local | `.../-components/IntegrationsListSection/` | /component |
| IntegrationCard | Leaf | props from IntegrationsListSection | — | useDialogStore (writes via Connect) | — | create-route-local | `.../IntegrationsListSection/IntegrationCard/` | /component |
| CredentialsCollapsible | Component | props from IntegrationCard | reads: [credentialsOpen], writes: [credentialsOpen] | — | `[copiedFieldId]` | create-route-local | `.../IntegrationCard/CredentialsCollapsible/` | /component |
| RecommendedAppsSection | Section | useListRecommendedApps({ search }) | reads: [search] | — | — | create-route-local | `.../-components/RecommendedAppsSection/` | /component |
| RecommendedAppCard | Leaf | props from RecommendedAppsSection | — | — | — | create-route-local | `.../RecommendedAppsSection/RecommendedAppCard/` | /component |
| ConnectIntegrationSheet | Dialog | — (own mutation) | — | useDialogStore | — | create-route-local | `.../-components/ConnectIntegrationSheet/` | /component |
| ConnectIntegrationForm | Form | useConnectIntegration() mutation | — | — | TanStack form state | create-route-local | inside ConnectIntegrationSheet | /form |

**Per-node notes:**

- **IntegrationCategoryTabs:** ARIA: `Tabs` com `aria-label="Categorias de integracoes"`. Escreve URL `category`; cada troca refaz a query da List.
- **IntegrationsListSection:** Skeleton: 2-3 cards placeholder (h-24). Empty: `Empty` "Nenhuma integracao conectada". ARIA: `role="list" aria-label="Minhas Integracoes"`. Rationale: dominio de integracoes da loja, sem paralelo em outra rota.
- **IntegrationCard:** ARIA: botoes "Conectar"/"Desconectar" com texto; `role="listitem"`. "Desconectar" dispara `confirm-dialog` antes do command. StatusBadge codifica connected/disconnected/error.
- **CredentialsCollapsible:** ARIA: trigger com `aria-expanded` + `aria-controls`; CopyBtn `aria-label="Copiar credencial"`. Estado de expansao persistido em URL `credentialsOpen` (estado capturado em `app_settings_integration_aberto-destrinchagem-de-minhas-credenciais.html`). Valores secretos mascarados.
- **RecommendedAppsSection:** Skeleton: 4 cards em grid. Empty: `Empty`. ARIA: `role="list" aria-label="Aplicativos Recomendados"`. Inclui link externo "Deseja anunciar sua marca aqui?" (ClickUp form).
- **RecommendedAppCard:** Cada card e um `<a target="_blank">` para o site do app (ex. bkreviews.com.br). Sem mutation.
- **ConnectIntegrationSheet:** Mapeado para o primitive `sheet` (drawer lateral). Aberto por `useDialogStore.show(<ConnectIntegrationSheet integration={...} />)` no clique de "Conectar"/"Reintegrar".

### Reuse Summary

- **Reuse (no work):** `Navbar` (`@/components/Navbar/`), `Header` (`@/components/Header/`); primitives `Card`, `Button`, `Badge`, `Collapsible`, `Tabs`, `Input`, `InputGroup`, `Select`, `sheet`, `Skeleton`, `Empty`, `confirm-dialog`, `tooltip` — todos em `@/components/ui/`.
- **Promote to shared:** nenhum — as estruturas sao especificas do dominio de integracoes; nenhuma outra rota construida hoje compartilha o shape.
- **Create new shared:** nenhum.
- **Create route-local:** `IntegrationCategoryTabs`, `IntegrationSearchBar`, `IntegrationsListSection`, `IntegrationCard`, `CredentialsCollapsible`, `RecommendedAppsSection`, `RecommendedAppCard`, `ConnectIntegrationSheet`, `ConnectIntegrationForm` — acoplados ao dominio de integracoes da loja, consumidos so nesta rota.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | IntegrationRouteShell | `routes/(app)/settings/integrations/index.tsx` | search params `category`, `search`, `credentialsOpen`; static header region |
| 2 | /component | IntegrationCategoryTabs | `.../-components/IntegrationCategoryTabs/` | escreve URL `category` (primitive Tabs) |
| 3 | /component | IntegrationSearchBar | `.../-components/IntegrationSearchBar/` | escreve URL `search` (useDebouncedSearch) |
| 4 | /component | IntegrationsListSection | `.../-components/IntegrationsListSection/` | owns `useListIntegrations` |
| 5 | /component | IntegrationCard | `.../IntegrationsListSection/IntegrationCard/` | Leaf; abre ConnectIntegrationSheet; confirm para Desconectar |
| 6 | /component | CredentialsCollapsible | `.../IntegrationCard/CredentialsCollapsible/` | collapsible inline; copy-to-clipboard |
| 7 | /component | RecommendedAppsSection | `.../-components/RecommendedAppsSection/` | owns `useListRecommendedApps` |
| 8 | /component | RecommendedAppCard | `.../RecommendedAppsSection/RecommendedAppCard/` | Leaf; link externo |
| 9 | /component | ConnectIntegrationSheet | `.../-components/ConnectIntegrationSheet/` | sheet via useDialogStore; owns mutation |
| 10 | /form | ConnectIntegrationForm | inside ConnectIntegrationSheet | campos domain/apiKey/apiSecret/gateway |

### Open Questions

- OQ-1. O snapshot `app_settings_integration_aberto-destrinchagem-de-minhas-credenciais.html` mostra no outline o conteudo "Taxas de Checkout" ao fundo (DOM de outra tela), embora o nome indique a expansao das credenciais nesta rota. Assumido que o estado representa o collapsible "Ver credenciais" expandido do IntegrationCard. Precisa de confirmacao do operador sobre os campos exatos de credencial por plataforma.
- OQ-2. "Conectar" foi modelado como `sheet` (drawer lateral) por convencao do projeto para formularios; se o design final usar `dialog` centralizado, trocar o primitive. Precisa de confirmacao visual.
- OQ-3. A faixa de categorias (Minhas/Loja/Marketing/Checkout/Gateway) foi inferida do rascunho de SPEC anterior; o snapshot base so deixa "Minhas Integracoes" explicito. Confirmar se a List filtra client-side por categoria ou se cada categoria refaz a query.

## Controller Contract

> Consome os schemas de [`_schema-fundamentals.md`](../../_schema-fundamentals.md)
> (`Currency`; e o controller compartilhado `ListRecommendedApps`, mesmo do índice/dashboard).
> Aplica os princípios: **um controller por preocupação** e **dados, não apresentação**
> (status como enum — sem `label`/`color`/`icon`; credenciais sem `label` pré-formatado;
> sem `reviewsLabel` — o frontend deriva rótulo, cor do badge, ícone e formatação dos mapas i18n + enums).

### Queries

| Controller | Metodo + Path | Componente(s) consumidor(es) | Quando carrega |
|---|---|---|---|
| `ListIntegrations` (novo) | GET `/ui/bkdash/integrations` | IntegrationsListSection, IntegrationCard, CredentialsCollapsible | Ao montar a Section; refetch ao mudar `category` ou `search`. Retorna plataformas conectadas + credenciais (mascaradas) |
| `ListRecommendedApps` (compartilhado) | GET `/ui/bkdash/recommended-apps` | RecommendedAppsSection, RecommendedAppCard | Ao montar a Section; vitrine de apps recomendados (mesmo controller do índice/dashboard) |
| `GetUserInfo` (existente) | GET `/ui/bkdash/user-info` | Header (shared) | Ao montar o shell |
| `ListNotifications` (existente) | GET `/ui/bkdash/notifications` | Header (shared) | Ao montar / SSE |

### Commands

| Controller | Metodo + Path | Componente | Payload (campos — sem apresentação) |
|---|---|---|---|
| `ConnectIntegration` (novo) | POST `/ui/bkdash/integrations/connect` | ConnectIntegrationForm (dentro de ConnectIntegrationSheet) | `provider` (`IntegrationProvider`), `category` (`IntegrationCategory`), `domain`, `apiKey`, `apiSecret?`, `gateway` |
| `ReintegrateIntegration` (novo) | POST `/ui/bkdash/integrations/:id/reintegrate` | IntegrationCard > [Reintegrar] | path param `id` |
| `DisconnectIntegration` (novo) | DELETE `/ui/bkdash/integrations/:id` | IntegrationCard > [Desconectar] | path param `id` (+ confirmacao) |

### Response Schemas (sketch)

```ts
import {
  Currency,
  ListRecommendedAppsOutputSchema, // controller compartilhado (índice/dashboard)
} from '@ui/schemas' // ver _schema-fundamentals.md

// --- Enums LOCAIS desta tela (não pertencem aos fundamentos) ---
export const IntegrationProvider = z.enum([
  'shopify', 'yampi', 'cartpanda', 'appmax', 'adoorei', 'mercadopago',
])
export const IntegrationCategory = z.enum([
  'minhas', 'loja', 'marketing', 'checkout', 'gateway',
])
export const IntegrationStatus = z.enum(['connected', 'disconnected', 'error']) // StatusBadge: cor/label/ícone derivados no frontend
export const CredentialKind = z.enum(['domain', 'gateway', 'apiKey', 'apiSecret', 'token']) // rótulo derivado do enum (i18n)

// GET /ui/bkdash/integrations  → minhas integracoes (regiao IntegrationsListSection)
// Status como enum (sem label/cor/icone); credenciais sem label pré-formatado.
export const CredentialFieldSchema = z.object({
  id: z.string(),
  kind: CredentialKind,         // frontend mapeia kind → rótulo ("Domínio Shopify", "API Key")
  value: z.string(),            // mascarado quando secret=true
  secret: z.boolean(),
})
export const ListIntegrationsOutputSchema = z.paginatedResponse({
  id: z.string(),
  provider: IntegrationProvider,
  category: IntegrationCategory,
  name: z.string(),                 // "Shopify" (nome real da plataforma — dado, não label de UI)
  logoUrl: z.string().url(),
  status: IntegrationStatus,        // StatusBadge deriva cor/label/ícone
  summary: z.object({               // bloco resumo no card
    domain: z.string().nullable(),  // "minhaloja.myshopify.com"
    gateway: z.string().nullable(), // "Shopify Payments" | "Mercado Pago"
  }),
  credentials: z.array(CredentialFieldSchema), // destrinchado pelo CredentialsCollapsible
})

// GET /ui/bkdash/recommended-apps  → vitrine (regiao RecommendedAppsSection)
// Reusa ListRecommendedAppsOutputSchema dos fundamentos (mesmo controller do índice/dashboard):
//   { items: [{ id, name, logoUrl, rating, ratingCount, description, installUrl }] }
// rating/ratingCount são números (frontend formata "4.8" e "(40.000+)"); installUrl é dado externo real.
```

### Reaproveitamento de Controllers

- **Existentes (reutilizar):** `GetUserInfo`, `ListNotifications` (ambos consumidos pelo `Header` compartilhado do shell).
- **Novos (criar):** `ListIntegrations` (GET, regiao Minhas Integracoes + credenciais), `ConnectIntegration` (POST, formulario de conexao), `ReintegrateIntegration` (POST, acao do card), `DisconnectIntegration` (DELETE, acao do card).
- **Compartilhados:** `ListRecommendedApps` é o mesmo controller da vitrine usado no índice/dashboard (consome `ListRecommendedAppsOutputSchema` dos fundamentos) — esta rota apenas o consome, não o redefine.
