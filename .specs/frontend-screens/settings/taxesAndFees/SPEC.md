# Rota /app/settings/taxesAndFees — Configuracoes — Impostos e Taxas

## Visao Geral

A tela de Taxas e Tarifas e a area de configuracao onde o lojista define os parametros financeiros que alimentam os calculos de custo/lucro do dashboard: taxas de checkout, taxas do gateway de pagamento, taxa de frete medio e impostos. A pagina apresenta um titulo ("Taxas e Tarifas", subtitulo "Configure as taxas e tarifas da sua loja") e um seletor de quatro abas/sub-rotas — **Taxas de Checkout**, **Taxas de Gateway**, **Taxas de Frete** e **Impostos**. Cada aba e um cartao seletor (titulo + descricao) que, ao ser acionado, troca o painel de configuracao exibido. A aba ativa e refletida na URL via search param (`tab`), de modo que o painel renderiza o `Form` da configuracao correspondente.

Cada painel e uma Section que possui o seu proprio `Form` de configuracao com campos de valor (moeda/percentual) e um botao **Salvar** que persiste as configuracoes daquela regiao. O exemplo capturado do painel Frete mostra um cartao "Taxa de Frete Medio" / "Configure o valor medio do frete para seus pedidos" com um unico campo monetario (currency=BRL) e o botao Salvar — todas as abas seguem esse mesmo molde de cartao de configuracao + Form. A pagina nao busca listas paginadas; ela le um objeto unico de configuracoes da loja e grava por regiao.

## Inventario de Estados

| Arquivo HTML | Estado / Interacao | Citizen afetado |
|---|---|---|
| `app_settings_taxAndFee.html` | Estado base da rota: titulo + 4 cartoes seletores de aba (Checkout, Gateway, Frete, Impostos); painel de configuracao da aba ativa | `TaxAndFeeRouteShell`, `TaxFeeTabsNav`, `TabConfigPanel` |
| `app_settings_taxAndFee_checkout.html` | Snapshot que renderiza o painel da aba **Frete** ("Taxa de Frete Medio", input BRL, botao Salvar) — captura cruzada (toast: `app_settings_taxAndFee`) | `ShippingFeeSection` + `ShippingFeeForm` |
| `app_settings_taxAndFee_gateway.html` | Snapshot com a navbar expandida; conteudo principal capturado em outra rota (Minha Conta) — sem dados de gateway uteis (toast: `app_settings_taxAndFee_checkout`) | apenas `Navbar` (compartilhado) |
| `app_settings_taxAndFee_shipping.html` | Snapshot contaminado: conteudo do dashboard (toast: `app_settings_taxAndFee_gateway`) — sem dados de Frete uteis | apenas Route Shell compartilhada |
| `app_settings_taxAndFee_taxes.html` | Snapshot contaminado: conteudo do dashboard (toast: `app_settings_taxAndFee_shipping`) — sem dados de Impostos uteis | apenas Route Shell compartilhada |

> Nota de captura: os arquivos `_gateway`, `_shipping` e `_taxes` foram salvos com conteudo de outras rotas (dashboard / Minha Conta), confirmado pelos toasts de snapshot. A estrutura das abas Gateway, Frete e Impostos foi inferida do molde unico observado no painel Frete (`_checkout.html`), dos quatro rotulos de aba presentes no arquivo base e das dicas de campo do stub original. Veja Open Questions.

## UI Composition

### URL Contract

- **Path:** `/app/settings/taxesAndFees`
- **Breadcrumb:** `Configuracoes › Taxas e Tarifas`
- **Search params (Zod sketch):**
  - `tab` — `z.enum(['checkout','gateway','shipping','taxes']).default('checkout')` — seleciona qual painel de configuracao renderiza; controlado pelos cartoes seletores
- **Loader (if any):** nenhum loader bloqueante; as Sections consomem uma query unica `GetTaxFeeConfig`, e o painel ativo le seu sub-objeto
- **errorComponent:** `RouteError` (default)

### ASCII Layout Map

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Navbar (shared) │ Header (shared)                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ TaxAndFeeRouteShell — "Taxas e Tarifas" + "Configure as taxas e tarifas..."   │
│ ┌────────────────────────────────────────────────────────────────────────┐   │
│ │ TaxFeeTabsNav (Component)                                                │   │
│ │  [ Taxas de Checkout ] [ Taxas de Gateway ] [ Taxas de Frete ] [Impostos]│   │
│ └────────────────────────────────────────────────────────────────────────┘   │
│ ┌────────────────────────────────────────────────────────────────────────┐   │
│ │ TabConfigPanel — renders 1 Section conforme ?tab                         │   │
│ │  ┌──────────────────────────────────────────────────────────────────┐   │   │
│ │  │ CheckoutFeeSection | GatewayFeeSection |                          │   │   │
│ │  │ ShippingFeeSection | TaxesSection                                 │   │   │
│ │  │   └─ <RegionConfigForm> (Form)  [ Salvar ]                        │   │   │
│ │  └──────────────────────────────────────────────────────────────────┘   │   │
│ └────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘

Overlays:
  (nenhum) — toda a edicao acontece inline no Form; nao ha Dialog/Drawer nesta rota
```

### Component Tree

```text
TaxAndFeeRouteShell                                          (Route Shell)
├─ Navbar                                                    (shared, reuse — nao redesenhar)
├─ Header                                                    (shared, reuse — nao redesenhar)
├─ TaxFeeTabsNav                                             (Component, le/grava ?tab)
└─ TabConfigPanel                                            (Component, switch por ?tab)
   ├─ CheckoutFeeSection                                     (Section, owns GetTaxFeeConfig)
   │  └─ CheckoutFeeForm                                     (Form, Type A)
   ├─ GatewayFeeSection                                      (Section)
   │  └─ GatewayFeeForm                                      (Form, Type A)
   ├─ ShippingFeeSection                                     (Section)
   │  └─ ShippingFeeForm                                     (Form, Type A)
   └─ TaxesSection                                           (Section)
      └─ TaxesForm                                           (Form, Type A)

Overlays:
  (nenhum)
```

### Component Anatomy

**`TaxFeeTabsNav`** (Component)

Mockup:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│ │▓Taxas de     │ │ Taxas de     │ │ Taxas de     │ │ Impostos     │     │
│ │▓Checkout   › │ │ Gateway    › │ │ Frete      › │ │            › │     │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

Slots:

```text
TaxFeeTabsNav
└─ Root  [flex row, gap-3, wrap]  (lista de cartoes seletores)
   └─ TabCard ×4: cartao clicavel  [primitive: Card, role="button"]
      ├─ Title: h3 do rotulo da aba  (ex.: "Taxas de Checkout")
      └─ Icon: chevron/seta  [lucide, size-4]
```

Variants:
- `tab === card.value` → cartao ativo com fundo destacado (`bg-emerald-500/10`, borda emerald), texto em alto contraste
- demais cartoes → estado neutro (texto `text-white/70`)

Notas: os rotulos sao h3 com chevron svg; nao ha `role="tablist"` no DOM — sao cartoes de navegacao que escrevem `?tab`. Poderia usar o primitive `Tabs`, mas o visual capturado e de cartoes; ver Reuse e OQ-2.

**`TabConfigPanel`** (Component)

Mockup:

```text
┌────────────────────────────────────────────────────────────────────────┐
│  (renderiza UMA Section conforme ?tab — ver Sections abaixo)             │
└────────────────────────────────────────────────────────────────────────┘
```

Slots:

```text
TabConfigPanel
└─ Root  [div, w-full]
   └─ ActiveSection: switch(tab) → Checkout|Gateway|Shipping|Taxes Section
```

Variants:
- `tab='checkout'` → `CheckoutFeeSection`
- `tab='gateway'` → `GatewayFeeSection`
- `tab='shipping'` → `ShippingFeeSection`
- `tab='taxes'` → `TaxesSection`

**`CheckoutFeeSection`** (Section)

```text
CheckoutFeeSection
└─ Card  [primitive: Card]  [flex col, gap-4, p-6]
   ├─ Header: titulo "Taxas de Checkout" + descricao  [Label + p text-muted]
   └─ Body: CheckoutFeeForm  (Form Type A)
```

States:
- skeleton: bloco `Skeleton` com os campos + botao
- error: `DataError` inline
- empty: nunca vazio — campos sempre tem valor (zero renderizado)

**`CheckoutFeeForm`** (Form, Type A)

```text
CheckoutFeeForm
└─ Form  [TanStack Form]  [flex col, gap-4]
   ├─ platform: plataforma de checkout              [primitive: Select]
   ├─ plan: plano contratado                        [primitive: Select]
   ├─ checkoutFeePercent: percentual da tarifa      [primitive: InputGroup, sufixo %]
   └─ Action: botao "Salvar"  [primitive: Button, type="submit"]
```

**`GatewayFeeSection`** (Section)

```text
GatewayFeeSection
└─ Card  [primitive: Card]  [flex col, gap-4, p-6]
   ├─ Header: titulo "Taxas de Gateway" + descricao
   └─ Body: GatewayFeeForm  (Form Type A)
```

States: skeleton/erro/empty como em CheckoutFeeSection.

**`GatewayFeeForm`** (Form, Type A)

```text
GatewayFeeForm
└─ Form  [TanStack Form]  [flex col, gap-4]
   ├─ platform: plataforma/gateway                  [primitive: Select]
   ├─ paymentMethod: metodo de pagamento            [primitive: Select]
   ├─ gatewayFeePercent: percentual cobrado         [primitive: InputGroup, sufixo %]
   ├─ gatewayFeeFixed: tarifa fixa por transacao    [primitive: InputGroup, currency BRL]
   └─ Action: botao "Salvar"  [primitive: Button, type="submit"]
```

**`ShippingFeeSection`** (Section)

```text
ShippingFeeSection
└─ Card  [primitive: Card]  [flex col, gap-4, p-6]
   ├─ Header: titulo "Taxa de Frete Medio" + descricao "Configure o valor medio do frete para seus pedidos"
   └─ Body: ShippingFeeForm  (Form Type A)
```

States: skeleton/erro/empty como em CheckoutFeeSection.

**`ShippingFeeForm`** (Form, Type A)

```text
ShippingFeeForm
└─ Form  [TanStack Form]  [flex col, gap-4]
   ├─ averageShippingFee: valor medio do frete por moeda  [primitive: InputGroup, currency BRL]
   │     (capturado em _checkout.html: input value + botao currency="BRL")
   └─ Action: botao "Salvar"  [primitive: Button, type="submit"]
```

**`TaxesSection`** (Section)

```text
TaxesSection
└─ Card  [primitive: Card]  [flex col, gap-4, p-6]
   ├─ Header: titulo "Impostos" + descricao
   └─ Body: TaxesForm  (Form Type A)
```

States: skeleton/erro/empty como em CheckoutFeeSection.

**`TaxesForm`** (Form, Type A)

```text
TaxesForm
└─ Form  [TanStack Form]  [flex col, gap-4]
   ├─ taxType: tipo de imposto (regime)             [primitive: Select / RadioGroup]
   ├─ taxPercent: aliquota de imposto sobre vendas  [primitive: InputGroup, sufixo %]
   ├─ marketingTaxes: incidir imposto sobre marketing  [primitive: Switch]
   └─ Action: botao "Salvar"  [primitive: Button, type="submit"]
```

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| TaxAndFeeRouteShell | RouteShell | — | reads: [tab] | — | — | create-route-local | `app/src/routes/(app)/settings/taxesAndFees/index.tsx` | /route |
| Navbar | Component (shared) | — | — | useSidebarStore | — | reuse | `@/components/Navbar/` | (reuse) |
| Header | Component (shared) | — | — | — | — | reuse | `@/components/Header/` | (reuse) |
| TaxFeeTabsNav | Component | — | reads: [tab], writes: [tab] | — | — | create-route-local | `.../taxAndFee/-components/TaxFeeTabsNav/` | /component |
| TabConfigPanel | Component | — | reads: [tab] | — | — | create-route-local | `.../taxAndFee/-components/TabConfigPanel/` | /component |
| CheckoutFeeSection | Section | `useGetTaxFeeConfig()` | reads: [tab] | — | — | create-route-local | `.../taxAndFee/-components/CheckoutFeeSection/` | /component |
| CheckoutFeeForm | Form | props from CheckoutFeeSection + `useUpdateCheckoutFees()` | — | — | TanStack Form | create-route-local | `.../taxAndFee/-components/CheckoutFeeSection/CheckoutFeeForm.tsx` | /form |
| GatewayFeeSection | Section | `useGetTaxFeeConfig()` | reads: [tab] | — | — | create-route-local | `.../taxAndFee/-components/GatewayFeeSection/` | /component |
| GatewayFeeForm | Form | props from GatewayFeeSection + `useUpdateGatewayFees()` | — | — | TanStack Form | create-route-local | `.../taxAndFee/-components/GatewayFeeSection/GatewayFeeForm.tsx` | /form |
| ShippingFeeSection | Section | `useGetTaxFeeConfig()` | reads: [tab] | — | — | create-route-local | `.../taxAndFee/-components/ShippingFeeSection/` | /component |
| ShippingFeeForm | Form | props from ShippingFeeSection + `useUpdateShippingFees()` | — | — | TanStack Form | create-route-local | `.../taxAndFee/-components/ShippingFeeSection/ShippingFeeForm.tsx` | /form |
| TaxesSection | Section | `useGetTaxFeeConfig()` | reads: [tab] | — | — | create-route-local | `.../taxAndFee/-components/TaxesSection/` | /component |
| TaxesForm | Form | props from TaxesSection + `useUpdateTaxes()` | — | — | TanStack Form | create-route-local | `.../taxAndFee/-components/TaxesSection/TaxesForm.tsx` | /form |

**Per-node notes:**

- **TaxFeeTabsNav:** ARIA: cada cartao `role="button" aria-pressed={tab===value}`; idealmente envolver em `role="tablist"`/`role="tab"` se migrar para o primitive `Tabs`. Rationale: navegacao de aba acoplada a esta rota; escreve `?tab`.
- **TabConfigPanel:** apenas seleciona qual Section montar; nao busca dados. Rationale: switch puro sobre `?tab`.
- **CheckoutFeeSection / GatewayFeeSection / ShippingFeeSection / TaxesSection:** Skeleton: `Skeleton` cobrindo os campos + botao. Empty: nunca (campos numericos sempre tem valor padrao). Error: `DataError` inline. As quatro Sections compartilham a mesma query unica `GetTaxFeeConfig` e cada uma le seu sub-objeto. Rationale: cada aba e a raiz de dados (sole data root) da sua regiao de configuracao e orquestra titulo + descricao + Form — por isso Section, mesmo com poucos sub-componentes.
- **CheckoutFeeForm / GatewayFeeForm / ShippingFeeForm / TaxesForm:** validators a partir do schema do comando SDK correspondente. O botao "Salvar" (`type="submit"`) confirmado no `_checkout.html`. Rationale: domain-coupled a configuracoes financeiras da loja.

### Reuse Summary

- **Reuse (no work):** `Navbar` (`@/components/Navbar/`), `Header` (`@/components/Header/`); primitives `Card`, `InputGroup`, `Input`, `Select`, `RadioGroup`, `Switch`, `Button`, `Skeleton`, `Label` (`@/components/ui/`); `DataError` (`@/components/DataError`).
- **Promote to shared:** nenhum (os Forms sao especificos de configuracao financeira; sem segundo consumidor hoje).
- **Create new shared:** nenhum.
- **Create route-local:** `TaxFeeTabsNav`, `TabConfigPanel`, `CheckoutFeeSection` + `CheckoutFeeForm`, `GatewayFeeSection` + `GatewayFeeForm`, `ShippingFeeSection` + `ShippingFeeForm`, `TaxesSection` + `TaxesForm` — todos acoplados ao dominio de Taxas e Tarifas e usados somente nesta rota.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | TaxAndFeeRouteShell | `routes/(app)/settings/taxesAndFees/index.tsx` | define search param `tab` (enum) |
| 2 | /component | TaxFeeTabsNav | `.../taxAndFee/-components/TaxFeeTabsNav/` | le/grava `?tab`; cartoes seletores |
| 3 | /component | TabConfigPanel | `.../taxAndFee/-components/TabConfigPanel/` | switch por `?tab` |
| 4 | /component | CheckoutFeeSection | `.../taxAndFee/-components/CheckoutFeeSection/` | owns GetTaxFeeConfig |
| 5 | /component | GatewayFeeSection | `.../taxAndFee/-components/GatewayFeeSection/` | |
| 6 | /component | ShippingFeeSection | `.../taxAndFee/-components/ShippingFeeSection/` | |
| 7 | /component | TaxesSection | `.../taxAndFee/-components/TaxesSection/` | |
| 8 | /form | CheckoutFeeForm | inside CheckoutFeeSection | submit → UpdateCheckoutFees |
| 9 | /form | GatewayFeeForm | inside GatewayFeeSection | submit → UpdateGatewayFees |
| 10 | /form | ShippingFeeForm | inside ShippingFeeSection | submit → UpdateShippingFees |
| 11 | /form | TaxesForm | inside TaxesSection | submit → UpdateTaxes |

### Open Questions

- OQ-1. Os snapshots `_gateway`, `_shipping` e `_taxes` foram capturados em rotas erradas (dashboard / Minha Conta), confirmado pelos toasts. Os campos dos Forms de Checkout, Gateway e Impostos foram inferidos do molde do painel Frete (`_checkout.html`) somado as dicas do stub original (taxType, marketingTaxes, plataforma, plano, metodo, taxa fixa) — precisa de confirmacao dos campos reais de cada aba.
- OQ-2. As abas sao cartoes h3 + chevron (sem `role="tablist"`). Confirmar se deve migrar para o primitive `Tabs` ou manter como cartoes seletores que escrevem `?tab`.
- OQ-3. Decidir entre **uma** query unica `GetTaxFeeConfig` (sub-objeto por regiao, proposta atual) versus quatro queries independentes por aba. A proposta atual favorece a query unica para evitar refetch ao trocar de aba.

## Controller Contract

> Consome os schemas de [`_schema-fundamentals.md`](../../_schema-fundamentals.md)
> (`Money`, `Currency`, enum `GatewayFeeKind`, `GatewayFeeSchema`).
> Aplica os principios: **um controller por preocupacao** e **dados, nao apresentacao**
> (sem `label`, `tooltip`, `editable` nem strings pre-formatadas — o frontend deriva rotulo,
> formatacao de moeda/percentual e o texto de "atualizado ha…" a partir de enums + `updatedAt`).
> Valores monetarios usam `Money`; percentuais sao `number` em fracao (o frontend formata `%`).

### Queries

| Controller | Metodo + Path | Componente(s) consumidor(es) | Quando carrega |
|---|---|---|---|
| `GetTaxFeeConfig` (novo) | `GET /ui/bkdash/tax-fee-config` | CheckoutFeeSection, GatewayFeeSection, ShippingFeeSection, TaxesSection | No mount da rota (query unica compartilhada pelas 4 Sections; aba ativa le seu sub-objeto e pre-preenche o Form) |

### Commands

| Controller | Metodo + Path | Componente | Payload (campos — sem apresentacao) |
|---|---|---|---|
| `UpdateCheckoutFees` (novo) | `PUT /ui/bkdash/tax-fee-config/checkout` | CheckoutFeeForm | `platform` (string), `plan` (string), `feePercent` (number, fracao) |
| `UpdateGatewayFees` (novo) | `PUT /ui/bkdash/tax-fee-config/gateway` | GatewayFeeForm | `platform` (string), `paymentMethod` (string), `fee` (`Record<GatewayFeeKind, number>` — `variable` em fracao, `fixed` em Money) |
| `UpdateShippingFees` (novo) | `PUT /ui/bkdash/tax-fee-config/shipping` | ShippingFeeForm | `averageShippingFee` (Money), `currency` (`Currency`) |
| `UpdateTaxes` (novo) | `PUT /ui/bkdash/tax-fee-config/taxes` | TaxesForm | `taxType` (string), `taxPercent` (number, fracao), `marketingTaxes` (boolean) |

### Response Schemas (sketch)

```ts
import {
  Money, Currency, GatewayFeeKind,
} from '@ui/schemas' // ver _schema-fundamentals.md

// Region-local: tarifa do gateway aberta por GatewayFeeKind (variable/fixed) (#2/#3).
// variable = fracao da transacao; fixed = Money por transacao. Nao usa GatewayFeeSchema
// (Segmented<Metric>) porque aqui sao parametros de config, nao KPIs com delta.
export const GatewayFeeConfigSchema = z.record(GatewayFeeKind, z.number()) // { variable, fixed }

// GET /ui/bkdash/tax-fee-config — objeto unico de configuracoes; cada regiao = sub-objeto
export const GetTaxFeeConfigOutputSchema = z.object({
  // aba "Taxas de Checkout"
  checkout: z.object({
    platform: z.string(),                 // plataforma de checkout (enum derivado no frontend)
    plan: z.string(),                     // plano contratado
    feePercent: z.number(),               // tarifa de checkout (fracao)
  }),
  // aba "Taxas de Gateway" — variable/fixed via GatewayFeeKind (#2)
  gateway: z.object({
    platform: z.string(),                 // gateway selecionado
    paymentMethod: z.string(),            // metodo de pagamento
    fee: GatewayFeeConfigSchema,          // { variable: fracao, fixed: Money }
  }),
  // aba "Taxas de Frete" (capturada em _checkout.html)
  shipping: z.object({
    averageShippingFee: Money,            // valor medio do frete
    currency: Currency,                   // moeda do valor
  }),
  // aba "Impostos"
  taxes: z.object({
    taxType: z.string(),                  // regime/tipo de imposto
    taxPercent: z.number(),               // aliquota sobre vendas (fracao)
    marketingTaxes: z.boolean(),          // incidir imposto sobre marketing
  }),
  updatedAt: z.date().nullable(),         // dado bruto; frontend formata "atualizado ha…"
});
```

### Reaproveitamento de Controllers

- **Existentes (reutilizar):** nenhum dos controllers existentes (`GetDashboard`, `ListOrders`, `GetUserInfo`, `ListNotifications`, `GetOnboarding`, `SaveOnboardingState`, `CompleteOnboarding`, `ListenEvents`) cobre configuracoes financeiras da loja; nenhum reutilizado para os dados desta rota. (`Navbar`/`Header` compartilhados continuam usando `GetUserInfo`/`ListNotifications` como em toda a area (app).)
- **Novos (criar):** `GetTaxFeeConfig` (query unica), `UpdateCheckoutFees`, `UpdateGatewayFees`, `UpdateShippingFees`, `UpdateTaxes` (comandos por regiao).
- **Compartilhados:** `Money`, `Currency` e o enum `GatewayFeeKind` vem de `@ui/schemas` (`_schema-fundamentals.md`); apenas `GatewayFeeConfigSchema` (parametros de config sem delta) e definido localmente nesta rota.
