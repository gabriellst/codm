# Rota /app/settings/account — Configuracoes — Minha Conta

## Visao Geral

Tela unica de configuracao da conta do usuario logado no BK Dash. E um destino de
"settings" acessivel a partir do menu de perfil no Header (avatar/iniciais "D"). O
papel da tela e permitir que o usuario visualize e edite seus proprios dados de
perfil (nome, e-mail, telefone, foto/avatar), ajuste preferencias de exibicao
(idioma, fuso horario) e gerencie credenciais de seguranca (alteracao de senha).
A tela reaproveita o controller `GetUserInfo` ja existente como fonte de identidade
(userId, name, picture) e e organizada em um unico `Form` de perfil mais blocos
auxiliares de preferencias e seguranca.

IMPORTANTE (ver Open Questions): o unico snapshot disponivel em `htmls/`
(`app_settings_myAccount.html`) NAO contem o conteudo da tela de Minha Conta — o DOM
capturado e a tela de Dashboard/Visao Geral (o toast de captura registra
`app_settings_taxAndFee_taxes`, e o termo `myAccount` aparece apenas como href do
link de navegacao). Portanto a composicao abaixo e uma proposta inferida a partir do
proposito da rota (perfil do usuario, reuso de `GetUserInfo`) e das convencoes de uma
tela de account-settings, e nao uma transcricao 1:1 do snapshot. Os identificadores e
o contrato de controllers devem ser revalidados quando um snapshot correto da rota
estiver disponivel.

## Inventario de Estados

| Arquivo HTML | Estado / Interacao | Citizen afetado |
|---|---|---|
| `app_settings_myAccount.html` | Snapshot base da rota — porem o DOM capturado corresponde a tela de Dashboard (KPIs, distribuicao de custos, banners), nao a Minha Conta. Util apenas para confirmar o Route Shell compartilhado (Navbar + Header) que envolve a rota. | `MyAccountRouteShell` (Navbar + Header compartilhados) |

## UI Composition

### URL Contract

- **Path:** `/app/settings/account`
- **Breadcrumb:** `Configuracoes` › `Minha Conta`
- **Search params (Zod sketch):**
  - `tab` — `z.enum(['perfil', 'preferencias', 'seguranca']).optional().default('perfil')` — secao ativa quando a tela for organizada em abas (opcional; ver Open Questions)
- **Loader (if any):** nenhum loader bloqueante; os dados sao buscados client-side via `GetMyAccount` na `ProfileFormSection`. `GetUserInfo` ja e carregado globalmente pelo Header.
- **errorComponent:** `RouteError` (padrao)

### ASCII Layout Map

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ [Navbar]  MyAccountRouteShell  (Header compartilhado no topo)               │
│ ┌───────────────────────────────────────────────────────────────────────┐ │
│ │ AccountHeaderSection (titulo "Minha Conta" + avatar + acao salvar)      │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────┐  ┌──────────────────────────────────┐ │
│ │ ProfileFormSection              │  │ SecuritySection                  │ │
│ │  ┌────────────────────────────┐ │  │  ┌─────────────────────────────┐ │ │
│ │  │ AvatarUploader (Component) │ │  │  │ ChangePasswordButton        │ │ │
│ │  └────────────────────────────┘ │  │  │ (Component, abre Dialog)    │ │ │
│ │  ProfileForm (Form, campos)     │  │  └─────────────────────────────┘ │ │
│ └─────────────────────────────────┘  │  DeleteAccountButton (Component) │ │
│ ┌─────────────────────────────────┐  └──────────────────────────────────┘ │
│ │ PreferencesSection              │                                        │
│ │  PreferencesForm (Form)         │                                        │
│ └─────────────────────────────────┘                                        │
└───────────────────────────────────────────────────────────────────────────┘

Overlays:
  ChangePasswordDialog (Dialog) ── abre no clique de "Alterar senha"
  DeleteAccountConfirmDialog (Dialog) ── abre no clique de "Excluir conta" (confirm-dialog)
```

### Component Tree

```text
MyAccountRouteShell                                          (Route Shell)
├─ Navbar                                                    (Component, shared — reuse)
├─ Header                                                    (Component, shared — reuse)
├─ AccountHeaderSection                                      (Section)
│  ├─ AccountTitle                                           (static UI)
│  └─ SaveProfileAction                                      (Component, action — submete ProfileForm)
├─ ProfileFormSection                                        (Section, owns GetMyAccount query)
│  ├─ AvatarUploader                                         (Component, mutation upload)
│  └─ ProfileForm                                            (Form Type A — UpdateProfile)
├─ PreferencesSection                                        (Section, consome GetMyAccount)
│  └─ PreferencesForm                                        (Form Type A — UpdatePreferences)
└─ SecuritySection                                           (Section)
   ├─ ChangePasswordButton                                   (Component, action — abre Dialog)
   └─ DeleteAccountButton                                    (Component, action — abre confirm Dialog)

Overlays:
├─ ChangePasswordDialog                                      (Dialog, route-local — contem ChangePasswordForm)
│  └─ ChangePasswordForm                                     (Form Type C — ChangePassword)
└─ DeleteAccountConfirmDialog                                (Dialog, reuse confirm-dialog primitive)
```

### Component Anatomy

**`AccountHeaderSection`** (Section)

```text
AccountHeaderSection
└─ div  [flex row items-center justify-between, p-4]
   ├─ AccountTitle: heading "Minha Conta"  [text-2xl font-bold]
   └─ SaveProfileAction: ref ao Component SaveProfileAction
```

States:
- skeleton: linha de titulo com `Skeleton` de largura media enquanto `GetMyAccount` carrega

**`SaveProfileAction`** (Component)

Mockup:

```text
╭──────────────────╮
│   [ Salvar ]     │
╰──────────────────╯
```

Slots:

```text
SaveProfileAction
└─ Button  [primitive: Button]  [variant="default"]
   └─ Label: "Salvar alteracoes"
```

Variants:
- `isSubmitting` → Button com `Spinner` interno e disabled  [primitive: Spinner]
- `!isDirty` → Button disabled

**`ProfileFormSection`** (Section)

```text
ProfileFormSection
└─ Card  [primitive: Card]  [flex col gap-4, p-6]
   ├─ Header: titulo "Perfil"
   ├─ AvatarUploader: ref ao Component AvatarUploader
   └─ Body: ref ao Form ProfileForm
```

States:
- skeleton: bloco `Skeleton` com avatar circular + 4 linhas de campo
- error: `DataError` inline quando `GetMyAccount` falha

**`AvatarUploader`** (Component)

Mockup:

```text
╭───────╮
│  (D)  │  Foto de perfil
╰───────╯  [ Alterar ]  [ Remover ]
```

Slots:

```text
AvatarUploader
└─ div  [flex row items-center gap-4]
   ├─ Avatar: imagem ou iniciais  [primitive: Avatar]
   ├─ Label: "Foto de perfil"  [text-sm text-muted-foreground]
   └─ Actions: [flex row gap-2]
      ├─ UploadButton: "Alterar"  [primitive: Button, variant="outline"]  (input file oculto)
      └─ RemoveButton: "Remover"  [primitive: Button, variant="ghost"]
```

ARIA: input file com `aria-label="Enviar foto de perfil"`

**`ProfileForm`** (Form Type A)

```text
ProfileForm
└─ form  [flex col gap-4]
   ├─ name: input texto  [primitive: Input]  (schema: name)
   ├─ email: input email  [primitive: Input]  (schema: email)
   ├─ phone: input texto  [primitive: Input]  (schema: phone)
   └─ company: input texto opcional  [primitive: Input]  (schema: company)
```

States:
- cada campo usa `Field` para label + mensagem de erro  [primitive: Field, Label]

**`PreferencesSection`** (Section)

```text
PreferencesSection
└─ Card  [primitive: Card]  [flex col gap-4, p-6]
   ├─ Header: titulo "Preferencias"
   └─ Body: ref ao Form PreferencesForm
```

**`PreferencesForm`** (Form Type A)

```text
PreferencesForm
└─ form  [flex col gap-4]
   ├─ language: seletor de idioma  [primitive: Select]  (schema: language)
   ├─ timezone: seletor de fuso  [primitive: Select]  (schema: timezone)
   └─ emailNotifications: toggle de notificacoes por e-mail  [primitive: Switch]  (schema: emailNotifications)
```

**`SecuritySection`** (Section)

```text
SecuritySection
└─ Card  [primitive: Card]  [flex col gap-3, p-6]
   ├─ Header: titulo "Seguranca"
   ├─ ChangePasswordButton: ref ao Component
   └─ DeleteAccountButton: ref ao Component
```

**`ChangePasswordButton`** (Component)

Mockup:

```text
╭─────────────────────────╮
│  [ Alterar senha ]      │
╰─────────────────────────╯
```

Slots:

```text
ChangePasswordButton
└─ Button  [primitive: Button, variant="outline"]
   └─ Label: "Alterar senha"  (aria-haspopup="dialog")
```

**`DeleteAccountButton`** (Component)

Mockup:

```text
╭─────────────────────────╮
│  [ Excluir conta ]      │
╰─────────────────────────╯
```

Slots:

```text
DeleteAccountButton
└─ Button  [primitive: Button, variant="destructive"]
   └─ Label: "Excluir conta"  (aria-haspopup="dialog")
```

**`ChangePasswordDialog`** (Dialog)

Mockup:

```text
╔══════════════════════════════════════════╗
║ Alterar senha                        [×]  ║
╠══════════════════════════════════════════╣
║ Senha atual      [____________________]   ║
║ Nova senha       [____________________]   ║
║ Confirmar senha  [____________________]   ║
╠══════════════════════════════════════════╣
║                 [ Cancelar ] [ Salvar ]   ║
╚══════════════════════════════════════════╝
```

Slots:

```text
ChangePasswordDialog
└─ Dialog  [primitive: Dialog]
   ├─ DialogHeader: titulo "Alterar senha" + close
   ├─ DialogBody: ref ao Form ChangePasswordForm
   └─ DialogFooter: [ Cancelar ] [ Salvar ]  [primitive: Button ×2]
```

**`ChangePasswordForm`** (Form Type C)

```text
ChangePasswordForm
└─ form  [flex col gap-4]
   ├─ currentPassword: input password  [primitive: Input]  (schema: currentPassword)
   ├─ newPassword: input password  [primitive: Input]  (schema: newPassword)
   └─ confirmPassword: input password  [primitive: Input]  (schema: confirmPassword)
```

**`DeleteAccountConfirmDialog`** (Dialog)

Mockup:

```text
╔══════════════════════════════════════════╗
║ Excluir conta?                            ║
╠══════════════════════════════════════════╣
║ Esta acao e irreversivel. Todos os seus   ║
║ dados serao removidos permanentemente.    ║
╠══════════════════════════════════════════╣
║              [ Cancelar ] [ Excluir ]     ║
╚══════════════════════════════════════════╝
```

Slots:

```text
DeleteAccountConfirmDialog
└─ ConfirmDialog  [primitive: confirm-dialog]
   ├─ Title: "Excluir conta?"
   ├─ Description: aviso de irreversibilidade
   └─ Footer: [ Cancelar ] [ Excluir ]  (acao destrutiva)
```

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| MyAccountRouteShell | RouteShell | — | reads: [tab] | — | — | create-route-local | `app/src/routes/(app)/settings/account/index.tsx` | /route |
| Navbar | Component | shared | — | useSidebarStore | — | reuse | `app/src/components/Navbar/` | (reuse) |
| Header | Component | useGetUserInfo() | — | — | — | reuse | `app/src/components/Header/` | (reuse) |
| AccountHeaderSection | Section | props from ProfileFormSection | — | — | — | create-route-local | `app/src/routes/(app)/settings/account/-components/AccountHeaderSection/` | /component |
| SaveProfileAction | Component | — | — | — | — | create-route-local | `.../-components/AccountHeaderSection/SaveProfileAction/` | /component |
| ProfileFormSection | Section | useGetMyAccount() | — | — | — | create-route-local | `.../-components/ProfileFormSection/` | /component |
| AvatarUploader | Component | useUploadAvatar() (mutation) | — | — | [previewUrl] | create-new-shared | `app/src/components/AvatarUploader/` | /component |
| ProfileForm | Form | useUpdateProfile() (mutation) | — | — | TanStack Form | create-route-local | `.../-components/ProfileFormSection/ProfileForm/` | /form |
| PreferencesSection | Section | props from ProfileFormSection (GetMyAccount) | — | — | — | create-route-local | `.../-components/PreferencesSection/` | /component |
| PreferencesForm | Form | useUpdatePreferences() (mutation) | — | — | TanStack Form | create-route-local | `.../-components/PreferencesSection/PreferencesForm/` | /form |
| SecuritySection | Section | — | — | — | — | create-route-local | `.../-components/SecuritySection/` | /component |
| ChangePasswordButton | Component | — | — | useDialogStore | — | create-route-local | `.../-components/SecuritySection/ChangePasswordButton/` | /component |
| DeleteAccountButton | Component | — | — | useDialogStore | — | create-route-local | `.../-components/SecuritySection/DeleteAccountButton/` | /component |
| ChangePasswordDialog | Dialog | useChangePassword() (mutation) | — | useDialogStore | — | create-route-local | `.../-components/ChangePasswordDialog/` | /component |
| ChangePasswordForm | Form | via ChangePasswordDialog mutation | — | — | TanStack Form | create-route-local | `.../-components/ChangePasswordDialog/ChangePasswordForm/` | /form |
| DeleteAccountConfirmDialog | Dialog | useDeleteAccount() (mutation) | — | useDialogStore | — | reuse | `app/src/components/ui/confirm-dialog.tsx` | (reuse) |

**Per-node notes:**

- **MyAccountRouteShell:** Navbar e Header sao compartilhados (`reuse`) e nao tem suas internas redesenhadas aqui — sao apenas referenciados no Route Shell.
- **ProfileFormSection:** e a raiz de dados da regiao de conta — possui a query `GetMyAccount` e repassa o slice de preferencias para `PreferencesSection`. Skeleton: avatar + 4 linhas. Empty: nunca vazio (sempre ha um usuario logado). Error: `DataError` inline. Rationale: orquestra ≥3 sub-componentes (AvatarUploader + ProfileForm + dados para PreferencesSection) e e a unica raiz de dados.
- **AvatarUploader:** `create-new-shared` porque um uploader de avatar com props genericas (valor atual, callback de upload/remocao) e candidato a ser reutilizado em outras telas de entidade com foto (ex.: configuracoes de loja, perfil de colaborador).
- **AccountHeaderSection:** classificada como Section por ser raiz da regiao de cabecalho que coordena titulo + acao de salvar ligada ao estado do `ProfileForm`. Caso fique apenas com titulo + 1 botao, rebaixar para UI estatica no Route Shell (ver OQ-3).
- **ChangePasswordButton / DeleteAccountButton:** ARIA `aria-haspopup="dialog"`; ambos abrem dialogs via `useDialogStore.show(...)`.
- **DeleteAccountConfirmDialog:** reusa o primitive `confirm-dialog`; nao requer arquivo novo, apenas a chamada `useDialogStore.show(<ConfirmDialog .../>)` com a mutation `useDeleteAccount`.

### Reuse Summary

- **Reuse (no work):** `Navbar` (`app/src/components/Navbar/`), `Header` (`app/src/components/Header/`), `DeleteAccountConfirmDialog` via primitive `confirm-dialog` (`app/src/components/ui/confirm-dialog.tsx`). Primitives usados: `Card`, `Button`, `Input`, `Select`, `Switch`, `Avatar`, `Field`, `Label`, `Dialog`, `Spinner`, `Skeleton` — todos em `app/src/components/ui/`.
- **Promote to shared:** nenhum no momento.
- **Create new shared:** `AvatarUploader` — props genericas (`value`, `onUpload`, `onRemove`, `fallbackInitials`); consumidores futuros: tela de configuracoes de loja e perfil de colaborador.
- **Create route-local:** `AccountHeaderSection`, `SaveProfileAction`, `ProfileFormSection`, `ProfileForm`, `PreferencesSection`, `PreferencesForm`, `SecuritySection`, `ChangePasswordButton`, `DeleteAccountButton`, `ChangePasswordDialog`, `ChangePasswordForm` — acoplados ao dominio de conta do usuario.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | MyAccountRouteShell | `app/src/routes/(app)/settings/account/index.tsx` | define URL contract + layout |
| 2 | /component (new shared) | AvatarUploader | `app/src/components/AvatarUploader/` | props genericas; reuso futuro |
| 3 | /component | ProfileFormSection | `.../-components/ProfileFormSection/` | raiz de dados (GetMyAccount) |
| 4 | /component | AccountHeaderSection | `.../-components/AccountHeaderSection/` | titulo + acao salvar |
| 5 | /component | SaveProfileAction | `.../-components/AccountHeaderSection/SaveProfileAction/` | submete ProfileForm |
| 6 | /component | PreferencesSection | `.../-components/PreferencesSection/` | consome slice de GetMyAccount |
| 7 | /component | SecuritySection | `.../-components/SecuritySection/` | |
| 8 | /component | ChangePasswordButton | `.../-components/SecuritySection/ChangePasswordButton/` | abre Dialog |
| 9 | /component | DeleteAccountButton | `.../-components/SecuritySection/DeleteAccountButton/` | abre confirm Dialog |
| 10 | /component | ChangePasswordDialog | `.../-components/ChangePasswordDialog/` | usa useDialogStore |
| 11 | /form | ProfileForm | `.../ProfileFormSection/ProfileForm/` | UpdateProfile schema |
| 12 | /form | PreferencesForm | `.../PreferencesSection/PreferencesForm/` | UpdatePreferences schema |
| 13 | /form | ChangePasswordForm | `.../ChangePasswordDialog/ChangePasswordForm/` | ChangePassword schema |

### Open Questions

- OQ-1. O snapshot `app_settings_myAccount.html` nao contem a tela de Minha Conta — o DOM e o do Dashboard (toast de captura `app_settings_taxAndFee_taxes`). Toda a composicao acima e inferida do proposito da rota. Necessario recapturar um snapshot correto da rota `/app/settings/account` para validar campos, layout e quais blocos (preferencias, seguranca, exclusao de conta) realmente existem.
- OQ-2. A tela usa abas (`tab` search param) ou todos os blocos empilhados em coluna unica? Proposto: coluna unica sem abas; remover o search param `tab` se nao houver navegacao por aba.
- OQ-3. `AccountHeaderSection` deve permanecer Section ou ser rebaixada a UI estatica no Route Shell? Depende de quantos sub-componentes coordena de fato (regra Section-vs-Component).
- OQ-4. Existe upload de avatar e exclusao de conta nesta tela, ou apenas edicao de dados basicos? Define se `AvatarUploader`, `DeleteAccountButton` e `DeleteAccountConfirmDialog` permanecem.

## Controller Contract

> Consome os schemas de [`_schema-fundamentals.md`](../../_schema-fundamentals.md)
> (`Currency`). Esta tela é de **conta/preferências** e não expõe KPIs/custos
> monetários, portanto a maioria das formas é **screen-local**.
> Aplica os princípios: **um controller por preocupação** e **dados, não apresentação**
> (sem `tooltip`, `label`, `editable`, `href` nem textos formatados — o frontend deriva
> rótulos, máscaras e visibilidade a partir de enums + i18n).

### Queries

| Controller | Método + Path | Componente(s) consumidor(es) | Quando carrega |
|---|---|---|---|
| `GetUserInfo` (existente) | GET `/ui/bkdash/user/info` | Header (avatar/nome) | Carregado globalmente pelo Header em toda tela `(app)` |
| `GetMyAccount` (novo) | GET `/ui/bkdash/account` | ProfileFormSection (repassa o slice de preferências para PreferencesSection) | No mount da rota, dentro de ProfileFormSection |

### Commands

| Controller | Método + Path | Componente | Payload (campos — sem apresentação) |
|---|---|---|---|
| `UpdateProfile` (novo) | PUT `/ui/bkdash/account/profile` | ProfileForm (via SaveProfileAction) | `name`, `email`, `phone?`, `company?` |
| `UpdatePreferences` (novo) | PUT `/ui/bkdash/account/preferences` | PreferencesForm | `language` (`Language`), `timezone`, `emailNotifications` (boolean) |
| `UploadAvatar` (novo) | POST `/ui/bkdash/account/avatar` | AvatarUploader | `file` (multipart) — retorna `pictureUrl` |
| `ChangePassword` (novo) | POST `/ui/bkdash/account/password` | ChangePasswordForm (em ChangePasswordDialog) | `currentPassword`, `newPassword`, `confirmPassword` |
| `DeleteAccount` (novo) | DELETE `/ui/bkdash/account` | DeleteAccountConfirmDialog | — (sem payload; usa `userId` do ctx) |

### Response Schemas (sketch)

```ts
import { Currency } from '@ui/schemas' // ver _schema-fundamentals.md

// Enum screen-LOCAL — idioma da UI (não é parte dos fundamentais financeiros).
export const Language = z.enum(['pt-BR', 'en-US', 'es-ES'])

// GetMyAccount — agrupado por região: profile / preferences / security.
// Só dados: visibilidade de "Alterar senha", máscara de telefone, rótulos e
// tooltips são DERIVADOS no frontend (princípios #1/#8).
export const GetMyAccountOutputSchema = z.object({
  profile: z.object({
    userId: z.string(),
    name: z.string(),
    email: z.string().email(),
    phone: z.string().nullable(),
    company: z.string().nullable(),
    pictureUrl: z.string().url().nullable(), // avatar atual (dado externo real)
  }),
  preferences: z.object({
    language: Language,
    currency: Currency,                      // moeda preferida (enum compartilhado)
    timezone: z.string(),                    // ex.: "America/Sao_Paulo"
    emailNotifications: z.boolean(),
  }),
  security: z.object({
    hasPassword: z.boolean(),                // frontend decide esconder "Alterar senha" (login social)
    lastPasswordChangeAt: z.date().nullable(),
    twoFactorEnabled: z.boolean(),
  }),
})
```

### Reaproveitamento de Controllers

- **Existentes (reutilizar):** `GetUserInfo` (GET `/user/info`) — já fornece identidade básica (`userId`, `name`, `picture`) consumida pelo Header; reaproveitado para popular avatar/nome enquanto `GetMyAccount` carrega os dados completos do formulário.
- **Novos (criar):** query `GetMyAccount` (perfil + preferências + segurança); commands `UpdateProfile`, `UpdatePreferences`, `UploadAvatar`, `ChangePassword`, `DeleteAccount`.
- **Compartilhados:** apenas o enum `Currency` vem de `_schema-fundamentals.md`; não há KPIs/custos monetários nesta tela, logo nenhum `MetricSchema`/`CostBreakdownSchema`/`Segmented` se aplica e nenhum controller financeiro é compartilhado.
