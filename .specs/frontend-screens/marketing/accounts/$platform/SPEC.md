# Rota /app/marketing/accounts/$platform — Marketing por Plataforma (conta integrada)

## Visao Geral

Esta rota e a tela de Contas Integradas escopada por plataforma de anuncios. O parametro dinamico `$platform` (ex.: `facebook`, `google`, `tiktok`) define qual plataforma esta sendo detalhada. A pagina lista os perfis conectados daquela plataforma (cada perfil contem N contas de anuncio com gasto e status), permite conectar um novo perfil ("Conectar com o Facebook"), reintegrar perfis expirados, deletar perfis e ativar/desativar contas de anuncio. O objetivo e que o lojista vincule suas contas de anuncio para que o BK Dash calcule automaticamente os gastos com ads no periodo.

O card de perfil de marketing aparece em estado "destrinchado" (expandido), revelando a lista de contas de anuncio com checkbox de selecao, gasto e toggle de status ativo/inativo. O botao "Conectar com o Facebook" dispara um modal de instrucao que explica, passo a passo, como autorizar a conta via link externo da plataforma. Abaixo, a regiao "Aplicativos Recomendados" exibe um grid de cards de apps BK (BK Reviews, BK Ads, BK Arts, BK Dash) com link "Visitar". Navbar e Header sao o shell compartilhado de todas as telas (app).

## Inventario de Estados

| Arquivo HTML | Estado / Interacao | Citizen afetado |
|---|---|---|
| `app_marketing_integratedAccounts_facebook_tela-especifica-de-marketing-de-plataforma.html` | Estado base: tela da plataforma `facebook`, lista de perfis na regiao "Contas Integradas" + grid "Aplicativos Recomendados" | `ProfilesSection`, `MarketingProfileCard`, `RecommendedAppsSection`, `RecommendedAppCard` |
| `app_marketing_integratedAccounts_facebook_destrinchado-card-de-marketing.html` | Card de perfil de marketing expandido (destrinchado): lista de contas de anuncio com checkbox, gasto e toggle ativo/inativo | `MarketingProfileCard` (variant `expanded`), `AdAccountRow` |
| `app_marketing_integratedAccounts_facebook_clicado-botao-conectar-com-facebook-abre-modal-de-instrucao.html` | Clique em "Conectar com o Facebook" abre modal de instrucao ("Conecte seu perfil do Facebook seguindo os passos abaixo." + link de integracao) | `ConnectPlatformDialog` (Dialog) |

## UI Composition

### URL Contract

- **Path:** `/app/marketing/accounts/$platform`
- **Breadcrumb:** `Marketing / Contas Integradas / {platform}` (label da plataforma derivado do param, ex.: "Facebook")
- **Search params (Zod sketch):**
  - `search` — `string` (opcional) — busca textual de perfis/contas (input "Buscar")
  - `page` — `number` (opcional, default 1) — paginacao da lista de perfis
  - `range` — `{ from: string; to: string }` (opcional) — periodo de gasto, herdado do Header (date range global)
  - `currency` — `string` (opcional) — moeda exibida (ex.: `BRL`), herdada do Header
- **Path params (Zod sketch):**
  - `platform` — `enum('facebook','google','tiktok')` — plataforma detalhada; alimenta `useListMarketingProfiles({ platform })`
- **Loader (if any):** nenhum loader bloqueante; dados carregam via React Query nas Sections. Pode validar `platform` contra o enum e redirecionar para a listagem se invalido.
- **errorComponent:** `RouteError` (default)

### ASCII Layout Map

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Navbar (shared)  │  Header (shared: store, range, currency, notif, profile)   │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ProfilesSection                                                            │ │
│ │  "Contas Integradas" — "Conecte seus perfis para calcular gastos com ads"  │ │
│ │  ┌──────────────────────────────────────────────────────────────────────┐ │ │
│ │  │ ProfilesToolbar  [Buscar][Conectar FB][Reintegrar][Deletar]           │ │ │
│ │  └──────────────────────────────────────────────────────────────────────┘ │ │
│ │  ┌──────────────────────────────────────────────────────────────────────┐ │ │
│ │  │ MarketingProfileCard (Leaf ×N) — facebook EXPANDIDO                   │ │ │
│ │  │   ┌────────────────────────────────────────────────────────────────┐ │ │ │
│ │  │   │ AdAccountRow (Leaf ×N) [x] Jack Agc  R$2.862  [●/○]            │ │ │ │
│ │  │   └────────────────────────────────────────────────────────────────┘ │ │ │
│ │  └──────────────────────────────────────────────────────────────────────┘ │ │
│ │  ┌──────────────────────────────────────────────────────────────────────┐ │ │
│ │  │ Pagination                                                            │ │ │
│ │  └──────────────────────────────────────────────────────────────────────┘ │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ RecommendedAppsSection                                                     │ │
│ │  "Aplicativos Recomendados"        [ Deseja anunciar sua marca aqui? ]     │ │
│ │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                       │ │
│ │  │Recommend │ │Recommend │ │Recommend │ │Recommend │  (RecommendedAppCard   │ │
│ │  │AppCard ×N│ │AppCard ×N│ │AppCard ×N│ │AppCard ×N│   Leaf ×N)             │ │
│ │  └──────────┘ └──────────┘ └──────────┘ └──────────┘                       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

Overlays:
  ConnectPlatformDialog (Dialog) ── abre no clique de "Conectar com o Facebook" na ProfilesToolbar
```

### Component Tree

```text
IntegratedAccountsPlatformRoute                              (Route Shell)
├─ Navbar                                                    (Component, shared — reuse)
├─ Header                                                    (Component, shared — reuse)
├─ ProfilesSection                                           (Section, owns profiles query)
│  ├─ ProfilesToolbar                                        (Component, search + acoes)
│  ├─ MarketingProfileCard                                   (Leaf ×N)
│  │  └─ AdAccountRow                                         (Leaf ×N)
│  └─ Pagination                                             (Component)
└─ RecommendedAppsSection                                    (Section, owns recommended apps)
   └─ RecommendedAppCard                                     (Leaf ×N)

Overlays:
└─ ConnectPlatformDialog                                     (Dialog, route-local)
```

### Component Anatomy

**`ProfilesSection`** (Section)

```text
ProfilesSection
└─ section  [flex flex-col gap-4]
   ├─ Header: title + subtitle  [grid]
   │  ├─ Title: "Contas Integradas"  [h2, text-2xl]
   │  └─ Subtitle: "Conecte seus perfis para calcular seus gastos com os ads"  [p, text-muted-foreground]
   ├─ ProfilesToolbar (Component)  → ver bloco proprio
   ├─ List: cards de perfil  [flex flex-col gap-3]
   │  └─ MarketingProfileCard (Leaf ×N)  → ver bloco proprio
   └─ Pagination (Component)  → ver bloco proprio
```

States:
- skeleton: 2 placeholders de card (`Skeleton`)
- empty: `Empty` "Nenhum perfil conectado nesta plataforma"
- error: `DataError` inline

**`ProfilesToolbar`** (Component)

```text
┌────────────────────────────────────────────────────────────────────────┐
│ [ 🔍 Buscar______ ]   [ Conectar com o Facebook ]  [ Reintegrar ] [ 🗑 ]│
└────────────────────────────────────────────────────────────────────────┘
```

Slots:

```text
ProfilesToolbar
└─ div  [flex row items-center gap-3, between]
   ├─ Search: input de busca  [primitive: Input, placeholder="Buscar"]
   ├─ ConnectButton: "Conectar com o {platform}"  [primitive: Button]  (aria-haspopup="dialog")
   ├─ ReintegrateButton: "Reintegrar"  [primitive: Button variant=outline]
   └─ DeleteButton: "Deletar" (perfis selecionados)  [primitive: Button variant=destructive]  (aria-label="Deletar perfis selecionados")
```

Variants:
- nenhum perfil selecionado → `ReintegrateButton`/`DeleteButton` desabilitados

**`MarketingProfileCard`** (Leaf)

```text
┌────────────────────────────────────────────────────┐
│ ╭───╮  Maria Tereza               ● Ativo   [⋮][▾] │
│ │ f │  Contas: 29   Ativas: 12   Gasto R$7.968     │
│ ╰───╯                                               │
│ ── destrinchado (expandido) ──────────────────────  │
│  AdAccountRow (Leaf ×N):                            │
│   [x] Jack Agc        R$ 2.862   [●] Ativo          │
│   [ ] Outra Conta     R$ 0       [○] Inativo        │
│   ...                                               │
└────────────────────────────────────────────────────┘
```

Slots:

```text
MarketingProfileCard
└─ Card  [primitive: Card]  [flex flex-col gap-3 p-4]
   ├─ Header: linha topo  [flex row items-center gap-3, between]
   │  ├─ SelectCheckbox: selecao do perfil  [primitive: Checkbox]  (aria-label="Selecionar perfil")
   │  ├─ Avatar: logo/foto do perfil  [primitive: Avatar]  [🖼]
   │  ├─ Title: nome do perfil "Maria Tereza"  [font-bold]
   │  ├─ Summary: "Contas: 29  Ativas: 12  Gasto R$ 7.968"  [text-sm text-muted-foreground]
   │  ├─ StatusBadge: "Ativo" / "Expirado"  [primitive: Badge]
   │  ├─ ContextMenu: acoes do perfil (Renomear, Reintegrar, Deletar)  [primitive: DropdownMenu]  (aria-haspopup="menu")
   │  └─ ExpandToggle: chevron expandir/recolher  [primitive: Button variant=ghost]  (aria-label="Expandir perfil")
   ├─ Separator  [primitive: Separator]  (apenas quando expandido)
   ├─ ExpiredBanner: "Perfil expirado" + [Reconectar]  [primitive: Button]  (variant expirado)
   └─ Accounts: lista de contas de anuncio  [flex flex-col gap-2]  (apenas quando expandido)
      └─ AdAccountRow (Leaf ×N)  → ver bloco proprio
```

Variants:
- `profile.id === expandedProfileId` → estado `expanded` (destrinchado): renderiza `Separator` + `Accounts`
- `profile.status === 'expired'` → `StatusBadge` "Expirado" + `ExpiredBanner` com botao "Reconectar"; lista de contas oculta
- `profile.status === 'active'` → `StatusBadge` verde "Ativo"

States:
- skeleton: bloco `Skeleton` na altura do card

**`AdAccountRow`** (Leaf)

```text
┌────────────────────────────────────────────────────┐
│ [x]  Jack Agc            R$ 2.862        [●] Ativo  │
└────────────────────────────────────────────────────┘
```

Slots:

```text
AdAccountRow
└─ div  [flex row items-center gap-3, between, p-2]
   ├─ SelectCheckbox: selecao da conta  [primitive: Checkbox]  (aria-label="Selecionar conta")
   ├─ Name: nome da conta "Jack Agc"  [text-sm]
   ├─ Spend: gasto da conta "R$ 2.862"  [text-sm font-medium]
   └─ ActiveToggle: ativo/inativo  [primitive: Switch]  (aria-label="Ativar conta de anuncio")
```

Variants:
- `account.active === false` → `Switch` off, `Spend` em text-muted-foreground

**`Pagination`** (Component)

```text
┌──────────────────────────────────┐
│      ‹  1  2  3  ...  9  ›        │
└──────────────────────────────────┘
```

Slots:

```text
Pagination
└─ nav  [flex row items-center justify-center gap-1]  [primitive: Pagination]
   ├─ Prev: "‹"  [primitive: Button variant=ghost]  (aria-label="Pagina anterior")
   ├─ Pages: numeros de pagina  [primitive: Button ×N]
   └─ Next: "›"  [primitive: Button variant=ghost]  (aria-label="Proxima pagina")
```

**`RecommendedAppsSection`** (Section)

```text
RecommendedAppsSection
└─ section  [flex flex-col gap-4]
   ├─ Header: linha titulo + cta  [flex row between]
   │  ├─ Title: "Aplicativos Recomendados"  [h2, text-xl]
   │  └─ CtaLink: "Deseja anunciar sua marca aqui?"  [primitive: Button variant=link, href=ClickUp form]
   └─ Grid: lista de apps  [grid grid-cols-4 gap-4]
      └─ RecommendedAppCard (Leaf ×N)  → ver bloco proprio
```

States:
- skeleton: 4 placeholders de card (`Skeleton`)
- empty: `Empty` "Nenhum aplicativo recomendado"

**`RecommendedAppCard`** (Leaf)

```text
┌──────────────────────────┐
│ [🖼]  BK Reviews          │
│  ★ 4.8  (40.000+)         │
│  Importa e exibe avalia-  │
│  coes de clientes...      │
│           [ Visitar → ]   │
└──────────────────────────┘
```

Slots:

```text
RecommendedAppCard
└─ a (link externo)  [primitive: Card como wrapper]  [grid gap-2 p-4]
   ├─ Logo: imagem do app  [🖼, img alt={app.name}]
   ├─ Title: nome do app "BK Reviews"  [font-bold]
   ├─ Rating: nota + contagem  [flex row gap-1]
   │  ├─ Score: "4.8"  [span]
   │  ├─ StarIcon  [lucide star]
   │  └─ Count: "(40.000+)"  [span, text-muted-foreground]
   ├─ Description: texto do app  [p, text-sm, line-clamp]
   └─ VisitCta: "Visitar"  [font-bold] + ArrowIcon  [lucide arrow]
```

States:
- skeleton: 4 placeholders em grid

**`ConnectPlatformDialog`** (Dialog)

```text
╔══════════════════════════════════════════════════╗
║  Conectar com o Facebook                     [×]  ║
╠══════════════════════════════════════════════════╣
║  Conecte seu perfil do Facebook seguindo os       ║
║  passos abaixo.                                   ║
║                                                   ║
║  1. Acesse sua conta do Facebook pelo link abaixo ║
║     [ Acessar Facebook → ]  (link externo)        ║
║  2. Apos conectar sua conta do Facebook por meio  ║
║     do link acima, clique no link abaixo para     ║
║     realizar a integracao                         ║
║     [ Realizar integracao → ]                     ║
╠══════════════════════════════════════════════════╣
║                              [ Fechar ]           ║
╚══════════════════════════════════════════════════╝
```

Slots:

```text
ConnectPlatformDialog
└─ Dialog  [primitive: Dialog]
   ├─ DialogHeader
   │  ├─ Title: "Conectar com o {platform}"  [DialogTitle]
   │  └─ Close: botao fechar  [primitive: Button, aria-label="Fechar"]
   ├─ DialogBody  [flex flex-col gap-4]
   │  ├─ Description: "Conecte seu perfil do Facebook seguindo os passos abaixo."  [p]
   │  ├─ StepOne: instrucao + link externo de autorizacao  [primitive: Button variant=outline]
   │  └─ StepTwo: instrucao "clique no link abaixo para realizar a integracao" + link de integracao (ConnectIntegration)  [primitive: Button]
   └─ DialogFooter
      └─ CloseAction: "Fechar"  [primitive: Button]
```

Variants:
- titulo e links derivam de `platform` (texto "Facebook" parametrizavel)

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| IntegratedAccountsPlatformRoute | RouteShell | — | reads: [platform (path), search, page, range, currency] | — | — | create-route-local | `routes/(app)/marketing/accounts/$platform/index.tsx` | /route |
| Navbar | Component | own (shared) | — | useSidebarStore | — | reuse | `@/components/Navbar/` | (reuse) |
| Header | Component | own (shared) | reads/writes: [range, currency, store] | — | — | reuse | `@/components/Header/` | (reuse) |
| ProfilesSection | Section | `useListMarketingProfiles({ platform, search, page, range })` | reads: [platform, search, page, range] | — | [expandedProfileId, selectedProfileIds] | create-route-local | `routes/(app)/marketing/accounts/$platform/-components/ProfilesSection/` | /component |
| ProfilesToolbar | Component | — (acoes) | reads/writes: [search] | useDialogStore (write) | — | create-route-local | `routes/(app)/marketing/accounts/$platform/-components/ProfilesSection/ProfilesToolbar/` | /component |
| MarketingProfileCard | Leaf | props from ProfilesSection | — | — | — | create-route-local | `routes/(app)/marketing/accounts/$platform/-components/ProfilesSection/MarketingProfileCard/` | /component |
| AdAccountRow | Leaf | props from MarketingProfileCard | — | — | — | create-route-local | `routes/(app)/marketing/accounts/$platform/-components/ProfilesSection/MarketingProfileCard/AdAccountRow/` | /component |
| Pagination | Component | props from ProfilesSection (totalPages) | reads/writes: [page] | — | — | reuse | `@/components/ui/pagination.tsx` | (reuse) |
| RecommendedAppsSection | Section | `useListRecommendedApps()` | — | — | — | create-route-local | `routes/(app)/marketing/accounts/$platform/-components/RecommendedAppsSection/` | /component |
| RecommendedAppCard | Leaf | props from RecommendedAppsSection | — | — | — | promote-to-shared | `routes/(app)/marketing/accounts/-components/RecommendedAppCard/` | /component |
| ConnectPlatformDialog | Dialog | — (instrucional; mutation `ConnectIntegration` no link de integracao) | reads: [platform] | useDialogStore | — | create-route-local | `routes/(app)/marketing/accounts/$platform/-components/ConnectPlatformDialog/` | /component |

**Per-node notes:**

- **ProfilesSection:** Skeleton: 2 placeholders de card. Empty: `Empty` "Nenhum perfil conectado nesta plataforma". Error: `DataError` inline. ARIA: `role="region" aria-label="Contas integradas"`. Rationale: orquestra toolbar + lista de cards + paginacao (≥3 sub-componentes distintos) e e a raiz de dados da regiao de perfis. `expandedProfileId`/`selectedProfileIds` poderiam migrar para URL (`expanded`, `selected`) para bookmarkabilidade — ver OQ-2.
- **ProfilesToolbar:** ARIA: botao deletar `aria-label="Deletar perfis selecionados"`; botao conectar `aria-haspopup="dialog"`. Rationale: barra de acoes acoplada ao dominio (busca URL + abrir dialog + comandos de reintegrar/deletar).
- **MarketingProfileCard:** ARIA: checkbox `aria-label="Selecionar perfil"`, menu de contexto `aria-haspopup="menu"`, toggle expandir `aria-label="Expandir perfil"`. Rationale: card de perfil de marketing especifico desta tela; owns mutacoes de linha (reintegrar/renomear/deletar/status do perfil via ContextMenu).
- **AdAccountRow:** ARIA: checkbox `aria-label="Selecionar conta"`, switch `aria-label="Ativar conta de anuncio"`. Rationale: linha de conta de anuncio dentro do card; owns mutacao `ToggleAdAccount` no `Switch` — porem nao re-busca o item (recebe via props do card).
- **Pagination:** primitivo reutilizado; escreve `page` na URL.
- **RecommendedAppsSection:** Skeleton: 4 placeholders. Empty: `Empty` "Nenhum aplicativo recomendado". ARIA: `role="region" aria-label="Aplicativos recomendados"`. Rationale: orquestra titulo + CTA externo + grid de cards (raiz de dados da regiao).
- **RecommendedAppCard:** Link externo (`target="_blank" rel="noreferrer"`). Rationale: mesma forma aparece na rota indice `/app/marketing/accounts` e nesta rota `$platform` (≥2 consumidores) — promover para `-components/` compartilhado.
- **ConnectPlatformDialog:** ARIA: `role="dialog"`, disparado por `aria-haspopup="dialog"` no botao conectar; links externos com `aria-label`. Rationale: dialog instrucional do fluxo de conexao desta rota (1 consumidor). O segundo link dispara `ConnectIntegration` (type=marketing_platform).

### Reuse Summary

- **Reuse (no work):** `Navbar` (`@/components/Navbar/`), `Header` (`@/components/Header/`) — shell compartilhado de todas as telas (app), nao redesenhados aqui. `Pagination` (`@/components/ui/pagination.tsx`). Primitivos: `Card`, `Badge`, `Button`, `Checkbox`, `Switch`, `Avatar`, `Separator`, `Input`, `DropdownMenu`, `Dialog`, `Skeleton`, `Empty` (todos em `@/components/ui/`).
- **Promote to shared:** `RecommendedAppCard` — aparece na rota indice `/app/marketing/accounts` e nesta rota `/app/marketing/accounts/$platform` (≥2 consumidores). Extrair para `routes/(app)/marketing/accounts/-components/RecommendedAppCard/`.
- **Create new shared:** nenhum.
- **Create route-local:** `ProfilesSection`, `ProfilesToolbar`, `MarketingProfileCard`, `AdAccountRow`, `RecommendedAppsSection`, `ConnectPlatformDialog` — acoplados ao dominio desta rota.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | IntegratedAccountsPlatformRoute | `routes/(app)/marketing/accounts/$platform/index.tsx` | valida path param `platform`; define search schema (search, page) |
| 2 | /component (promote) | RecommendedAppCard | `routes/(app)/marketing/accounts/-components/RecommendedAppCard/` | compartilhado indice + $platform |
| 3 | /component | ProfilesSection | `routes/(app)/marketing/accounts/$platform/-components/ProfilesSection/` | owns `useListMarketingProfiles` |
| 4 | /component | ProfilesToolbar | `.../ProfilesSection/ProfilesToolbar/` | busca URL + abre `ConnectPlatformDialog`; comandos reintegrar/deletar |
| 5 | /component | MarketingProfileCard | `.../ProfilesSection/MarketingProfileCard/` | variant `expanded`; ContextMenu (renomear/reintegrar/deletar/status) |
| 6 | /component | AdAccountRow | `.../ProfilesSection/MarketingProfileCard/AdAccountRow/` | `Switch` dispara `ToggleAdAccount` |
| 7 | /component | RecommendedAppsSection | `.../$platform/-components/RecommendedAppsSection/` | owns `useListRecommendedApps` |
| 8 | /component | ConnectPlatformDialog | `.../$platform/-components/ConnectPlatformDialog/` | aberto via `useDialogStore.show(...)`; link dispara `ConnectIntegration` |

### Open Questions

- OQ-1. Os tres snapshots de DOM limpos sao praticamente identicos (o conteudo dinamico de "destrinchado" e do modal nao renderizou em arvores distintas no snapshot). A anatomia do `MarketingProfileCard` expandido, `AdAccountRow` e `ConnectPlatformDialog` foi inferida do HTML original e do SPEC anterior desta pasta (perfis, contas de anuncio, gasto, toggle, modal "Conecte seu perfil do Facebook seguindo os passos abaixo."). Confirmar campos exatos do resumo do perfil e dos passos do modal.
- OQ-2. `expandedProfileId` e `selectedProfileIds` estao como `useState` local da `ProfilesSection`; se a selecao/expansao deve sobreviver a refresh, migrar para URL search params (`expanded`, `selected`) conforme UIC-C02. Assumido estado efemero local por ora.
- OQ-3. Confirmar se "Reintegrar"/"Deletar" operam sobre perfis selecionados em massa (toolbar) ou apenas via ContextMenu de cada card — o SPEC anterior cita ambos os fluxos.

## Controller Contract

> Consome os schemas de [`_schema-fundamentals.md`](../../../_schema-fundamentals.md)
> (`MetricSchema`, `Money`, `Currency`, enum `MarketingPlatform`). Aplica os princípios:
> **um controller por preocupação** e **dados, não apresentação** — sem `href`, `tooltip`,
> `label`, `color`, `icon`, `editable` nem strings pré-formatadas. Perfis de anúncio são
> escopados por `MarketingPlatform`; os toggles de conta retornam apenas `active` (status), e o
> frontend deriva rótulo/cor do badge. Gasto é `MetricSchema` (`value` + `deltaPct`); valores
> monetários usam `Money` e a moeda do contexto vem de `Currency`. `targetUrl`/`installUrl`/
> `authorizeUrl` permanecem por serem **dados externos reais**.

### Queries

| Controller | Metodo + Path | Componente(s) consumidor(es) | Quando carrega |
|---|---|---|---|
| `ListMarketingProfiles` (novo) | `GET /ui/bkdash/marketing-platforms/$platform/profiles` | `ProfilesSection` → `MarketingProfileCard` → `AdAccountRow` | No mount da Section; refetch quando muda `search`/`page`/`range` ou `platform` |
| `ListRecommendedApps` (compartilhado) | `GET /ui/bkdash/recommended-apps` | `RecommendedAppsSection` → `RecommendedAppCard` | No mount da Section (estatico/cacheavel) |
| `GetUserInfo` (existente) | `GET /ui/bkdash/user-info` | `Header` (shared) | shell |
| `ListNotifications` (existente) | `GET /ui/bkdash/notifications` | `Header` (shared) | shell |

### Commands

| Controller | Metodo + Path | Componente | Payload (campos — sem apresentação) |
|---|---|---|---|
| `ConnectIntegration` (novo) | `POST /ui/bkdash/integrations` | `ConnectPlatformDialog` (link de integracao) | `type: 'marketing_platform'`, `platform` (`MarketingPlatform`) |
| `ReintegrateIntegration` (novo) | `POST /ui/bkdash/integrations/reintegrate` | `ProfilesToolbar` / `MarketingProfileCard` (ExpiredBanner/ContextMenu) | `scope: 'marketing-profile'`, `profileId` |
| `DisconnectIntegration` (novo) | `DELETE /ui/bkdash/integrations/$id` | `ProfilesToolbar` (Deletar) / `MarketingProfileCard` (ContextMenu) | `id` (perfil selecionado) |
| `RenameAdProfile` (novo) | `PATCH /ui/bkdash/integrations/marketing/profile/$id/name` | `MarketingProfileCard` (ContextMenu > Renomear) | `name` (string) |
| `SetAllAdAccountsStatus` (novo) | `PATCH /ui/bkdash/integrations/marketing/profile/$id/status` | `MarketingProfileCard` (ContextMenu > Ativar/Desativar todas) | `active` (boolean) |
| `ToggleAdAccount` (novo) | `PATCH /ui/bkdash/integrations/marketing/ad-account/$id` | `AdAccountRow` (Switch) | `active` (boolean) |

### Response Schemas (sketch)

```ts
import {
  MetricSchema, Money, Currency, MarketingPlatform, ListRecommendedAppsOutputSchema,
} from '@ui/schemas' // ver _schema-fundamentals.md

// Status do perfil — dado, não apresentação (frontend deriva label/cor do badge)
export const MarketingProfileStatus = z.enum(['active', 'expired'])

// AdAccountRow — conta de anúncio (toggle retorna status; gasto é MetricSchema)
export const AdAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  spend: MetricSchema,                  // { value, deltaPct } — frontend formata por moeda
  active: z.boolean(),                  // Switch ativo/inativo — só status, sem label/cor
})

// MarketingProfileCard — perfil conectado (item paginado)
export const MarketingProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.string().url().nullable(),
  status: MarketingProfileStatus,       // active/expired (StatusBadge/ExpiredBanner derivados)
  accountsCount: z.number(),
  activeAccountsCount: z.number(),
  spend: MetricSchema,                  // gasto agregado do perfil no período
  adAccounts: z.array(AdAccountSchema), // contas de anúncio (visíveis quando expandido)
})

// ListMarketingProfiles — região "Contas Integradas" (perfis + contas de anúncio)
export const ListMarketingProfilesOutputSchema = z.paginatedResponse({
  platform: MarketingPlatform,          // plataforma corrente (path param) — enum do domínio
  currency: Currency,                   // moeda do contexto (do Header)
  summary: z.object({                   // agregados do header da região
    profilesCount: z.number(),
    accountsCount: z.number(),
    activeAccountsCount: z.number(),
    totalSpend: MetricSchema,           // gasto total no período
  }),
  item: MarketingProfileSchema,         // perfil de marketing
})

// ListRecommendedApps usa o ListRecommendedAppsOutputSchema COMPARTILHADO dos fundamentos
// (ver _schema-fundamentals.md): { items: RecommendedAppSchema[], advertiseUrl }. Não redefinir aqui.
```

### Reaproveitamento de Controllers

- **Existentes (reutilizar):** `GetUserInfo`, `ListNotifications` (consumidos pelo `Header` compartilhado do shell). `GetDashboard`/`ListOrders` nao se aplicam a esta tela.
- **Novos (criar):** Queries — `ListMarketingProfiles` (perfis + contas de anuncio da plataforma corrente, paginado, escopado por `MarketingPlatform`). Commands — `ConnectIntegration`, `ReintegrateIntegration`, `DisconnectIntegration`, `RenameAdProfile`, `SetAllAdAccountsStatus`, `ToggleAdAccount` (fluxos de conexao/gestao de perfis e contas de anuncio).
- **Compartilhados:** `ListRecommendedApps` é o mesmo controller usado por outras telas (ver Dashboard `SPEC.md`); `RecommendedAppSchema` segue a forma compartilhada (`id`/`name`/`logoUrl`/`rating`/`ratingCount`/`description`/`installUrl`).
