# SP2 — Conta e login OAuth (produto gratuito) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** Quem baixa o codm cria conta com GitHub/Google no browser, o app recebe a sessão via deep link `codm://` e guarda um device token no keychain; sem login os agentes não executam; a fatia cloud sobe por `docker compose` hoje e Railway amanhã.

**Architecture:** O better-auth volta do histórico (`f21be114^`) adaptado para social-only, montado num **perfil cloud** do mesmo `api-typescript` (`CODM_PROFILE=cloud` monta só auth+owner). O desktop troca um code one-time por um **device token** (hasheado no cloud, claro só no keychain); o console empurra o token ao daemon, que o cacheia em disco (0600) e **gateia o dispatcher**: sem sessão válida, nenhum turno inicia — offline tolerante, revogação derruba na primeira revalidação online.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, better-auth, TanStack Router/Query, Zod, Tauri v2 (Rust)

**Spec:** .specs/2026-08-06-sp2-conta-oauth-design.md
**Tasks:** 7
**Estimated minutes:** 260

**Ondas:** [T1, T5] → [T2, T4] → [T3] → [T6, T7]. T1/T5 não compartilham arquivo algum (api vs shell); T2/T4 idem (auth-controllers vs boot/docker/env).

**BASE:** main com o SP1 (PR #17) mergeado ou não — este plano não depende dele em código (o deep link e o updater são plugins independentes no shell); a única interseção é `Cargo.toml`/`lib.rs`, onde T5 ADICIONA linhas sem tocar as do updater.

---

## Task T1: GitHub e Google autenticam no perfil cloud

**Files to write:**
- Create: `packages/api/typescript/src/auth/services/Authentication/BetterAuth.ts` — ressuscitado de `f21be114^` e adaptado (social-only)
- Create: `packages/api/typescript/src/auth/services/Authentication/index.ts`
- Modify: `packages/api/typescript/src/auth/services/index.ts` — reexporta Authentication
- Modify: `packages/api/typescript/src/auth/registry.ts` — bindings do serviço (mock/integration/real)
- Modify: `packages/api/typescript/src/auth/index.ts` — monta o handler HTTP do better-auth em `/api/auth/*` quando o perfil é cloud
- Create: `packages/contracts/db/schema/` — tabelas do better-auth (`auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications`) via drizzle schema + `bun migrate:create`
- Test: `packages/api/typescript/src/auth/services/Authentication/BetterAuth.test.ts`

**Files to read:**
- `git show f21be114^:packages/api/typescript/src/auth/services/Authentication/BetterAuth.ts` — a fonte da ressurreição (decisão 3 do spec)
- `packages/api/typescript/src/auth/operator.ts` — o que o collapse deixou (o operator local NÃO muda nesta task)
- `.claude/skills/migrate/SKILL.md` — o rito de migração SQLite + espelho Go

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /service, /db-modelling, /migrate, /test
**Depends on:** (none)
**Consumes (frozen):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` já presentes no `.env` raiz (valores de dev reais); basePath **`/api/auth`** (os OAuth apps do founder JÁ apontam `http://localhost:3030/api/auth/callback/{google,github}` — mudar o caminho quebraria os consoles dele, proibido).
**Scope fence:** DONE elsewhere — o operator local (`operator.ts`, `OperatorMiddleware`) fica INTACTO: o daemon local continua operator-only; better-auth existe apenas para o perfil cloud (o mount condicional é da T4 — aqui o handler é exportado e testável, montado incondicionalmente NO TESTE). OUT — device tokens (T2), perfil/Docker (T4), qualquer coisa de frontend/shell.
**Gate:** `cd packages/api/typescript && bun test src/auth` verde; `bun x tsc -p tsconfig.build.json --noEmit` exit 0; `bun run --cwd packages/contracts db:check-go` verde (espelho Go em lockstep).

### Step T1.1 — Ressuscitar a fonte

```bash
bun cli service auth Authentication
git show f21be114^:packages/api/typescript/src/auth/services/Authentication/BetterAuth.ts > packages/api/typescript/src/auth/services/Authentication/BetterAuth.ts
git show f21be114^:packages/api/typescript/src/auth/services/index.ts | head -20   # ver o export antigo
```

### Step T1.2 — Adaptar (as DELTAS, exatas)

Sobre o arquivo ressuscitado:

1. **Social-only**: remover `emailAndPassword`, plugins de reset/e-mail e imports de `MailSender` (as telas de reset/signup morreram com o pivô — spec, decisão sobre v1 social-only). Manter `customSession` se o shape de sessão do template o usava.
2. **Adicionar** `socialProviders`:
```typescript
			socialProviders: {
				github: {
					clientId: Config.githubClientId,
					clientSecret: Config.githubClientSecret,
				},
				google: {
					clientId: Config.googleClientId,
					clientSecret: Config.googleClientSecret,
				},
			},
```
   com os quatro valores entrando pelo objeto de config da casa (mesmo caminho que o arquivo antigo usava para secrets — se era `process.env` direto, mantenha o idioma do arquivo).
3. `basePath: '/api/auth'` explícito (não confiar em default de versão).
4. `trustedOrigins`: `[Config.cloudUrl]` derivado de `CODM_CLOUD_URL` (default `http://localhost:3030` em dev).
5. O adapter drizzle aponta para as tabelas novas do Step T1.3 — conferir os nomes de tabela que o arquivo antigo esperava e alinhar schema↔adapter.

### Step T1.3 — Tabelas + migração (o rito completo do /migrate)

Adicionar ao schema Drizzle de `packages/contracts/db/schema/` as quatro tabelas do better-auth com os nomes/colunas que o adapter da versão instalada espera (`auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications` — conferir contra `node_modules/better-auth` da versão que o `bun install` resolver; o arquivo antigo de schema em `f21be114^:packages/contracts/...` é a referência de shape). Depois:

```bash
bun migrate:create
bun run --cwd packages/contracts db:sync-go
bun run --cwd packages/contracts db:check-go
bun migrate:dev   # aplica no data dir local — tabelas vazias no daemon local são inofensivas
```

### Step T1.4 — Teste que falsifica

`BetterAuth.test.ts` (TestBed `integration`): monta o handler numa rota de teste e assevera que (a) `GET /api/auth/ok` (health do better-auth) responde, (b) os dois providers aparecem em `GET /api/auth/...` de descoberta OU — mais robusto — que `auth.api.signInSocial({ provider: 'github' })` devolve uma URL de autorização contendo `github.com/login/oauth/authorize` e o client id do env, idem Google. O falsificador: remover o bloco `socialProviders` faz os dois casos falharem.

### Step T1.5 — Verificar, e commit

Run: gates do Task. Commit: `feat(auth): better-auth ressuscitado do collapse, social-only GitHub+Google (Task T1)`.

---

## Task T2: Um code one-time vira device token exatamente uma vez

**Files to write:**
- Create: `packages/api/typescript/src/auth/entities/DeviceToken.ts` (scaffold)
- Create: `packages/api/typescript/src/auth/repositories/DeviceTokenRepository/{DeviceTokenRepository,DrizzleDeviceTokenRepository,MockDeviceTokenRepository,index}.ts` (scaffold)
- Create: `packages/api/typescript/src/auth/usecases/{IssueDeviceCode,ExchangeDeviceCode,RevokeDevice,GetEntitlement}.ts` (scaffold)
- Create: `packages/api/typescript/src/auth/controllers/cloud/{DesktopCallback,ExchangeDeviceCode,GetEntitlement,RevokeDevice}.ts` (scaffold)
- Modify: `packages/api/typescript/src/auth/errors/index.ts` — `DEVICE_CODE_INVALID`, `DEVICE_TOKEN_INVALID`
- Modify: `packages/api/typescript/src/auth/{registry,index}.ts` + `controllers/index.ts` — wiring
- Create: migração `device_tokens` + `device_codes` (mesmo rito do T1.3)
- Test: `packages/api/typescript/src/auth/usecases/ExchangeDeviceCode.test.ts` (o outer test da task)

**Files to read:**
- `packages/api/typescript/src/agent/controllers/TestRunIssueTurn.ts` — shape de controller da casa
- `packages/api/typescript/src/thread/repositories/ConsumedMessageRepository/` — sibling de repositório

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /entity, /repository, /usecase, /controller, /schema, /errors, /migrate, /test
**Depends on:** T1
**Consumes (frozen):** a instância better-auth exportada pela T1 (`Authentication` service — `auth.api.getSession({ headers })` valida a sessão de cookie no DesktopCallback); basePath `/api/auth`; deep link **`codm://auth?code=`** (spec decisão 4/7). Rotas HTTP FIXADAS: `GET /v1/cloud/desktop-callback`, `POST /v1/cloud/devices/exchange`, `GET /v1/cloud/entitlement`, `POST /v1/cloud/devices/revoke`.
**Scope fence:** DONE elsewhere — better-auth e suas tabelas (T1). OUT — perfil/Docker (T4), SDK regen (T3), qualquer consumo frontend/daemon (T6/T7). O operator local segue intacto.
**Gate:** `cd packages/api/typescript && bun test src/auth` verde; `bun x tsc -p tsconfig.build.json --noEmit` exit 0; `db:check-go` verde.

### Step T2.1 — Scaffolds

```bash
bun cli entity auth DeviceToken --aggregate
bun cli repository auth DeviceToken
bun cli usecase auth IssueDeviceCode --internal
bun cli usecase auth ExchangeDeviceCode
bun cli usecase auth RevokeDevice
bun cli usecase auth GetEntitlement
bun cli controller auth DesktopCallback -m get -p /v1/cloud/desktop-callback
bun cli controller auth ExchangeDeviceCode -m post -p /v1/cloud/devices/exchange
bun cli controller auth GetEntitlement -m get -p /v1/cloud/entitlement
bun cli controller auth RevokeDevice -m post -p /v1/cloud/devices/revoke
```

(Se algum flag divergir do help real, ajuste ao verbo do `bun cli --help` — o scaffold cria a forma; o conteúdo vem dos steps seguintes.)

### Step T2.2 — O domínio, nos termos do spec (AC-2)

`DeviceToken` (aggregate): props `{ userId, tokenHash, label, createdAt, revokedAt? }`; `static issue(userId, label)` gera 32 bytes aleatórios → devolve `{ entity, plaintext }` — **o plaintext nunca é persistido**; `revoke()` idempotente-refuso (revogar revogado lança `DEVICE_TOKEN_INVALID`); `matches(plaintext)` compara `sha256(plaintext)` com `tokenHash`.

`device_codes` (tabela, sem entity — é um valor efêmero): `{ code (uuid), userId, expiresAt (2 min), consumedAt? }`. `IssueDeviceCode` cunha após o OAuth; `ExchangeDeviceCode` faz o consumo **atômico**:

```typescript
// DrizzleDeviceTokenRepository.consumeCode — UPDATE ... WHERE consumed_at IS NULL AND expires_at > now RETURNING
// exatamente-uma-vez SEM check-then-act: o segundo exchange do mesmo code atualiza zero linhas e
// o use case lança DEVICE_CODE_INVALID — mesmo padrão do claimNext do mailbox.
```

`GetEntitlement`: valida Bearer (busca por hash, não revogado) → `{ active: true, plan: 'free', userId }` — o plano é LITERAL `'free'` (pivô do founder; nenhuma tabela de planos).

### Step T2.3 — DesktopCallback (a ponte browser→app)

`GET /v1/cloud/desktop-callback`: lê a sessão better-auth do cookie (`auth.api.getSession({ headers })`); sem sessão → 401. Com sessão → `IssueDeviceCode` → responde **HTML mínimo** com `<meta http-equiv="refresh" content="0;url=codm://auth?code=…">` + texto "Volte ao codm". O `callbackURL` do fluxo social (T6) apontará para cá.

### Step T2.4 — O outer test (RED primeiro)

`ExchangeDeviceCode.test.ts` (integration): cunha um code via `IssueDeviceCode`, troca com sucesso (devolve plaintext + persiste HASH ≠ plaintext), **o segundo exchange do MESMO code falha com `DEVICE_CODE_INVALID`** (o falsificador de AC-2: trocar o consumo atômico por check-then-act não é detectável aqui, mas reuso passar é), code expirado falha, token emitido valida em `GetEntitlement` → `{ active: true, plan: 'free' }`, e após `RevokeDevice` o mesmo token → `DEVICE_TOKEN_INVALID`.

### Step T2.5 — Migração + gates + commit

Rito do T1.3 para as duas tabelas novas. Commit: `feat(auth): device tokens — code one-time, hash at rest, entitlement free (Task T2)`.

---

## Task T3: Contract Lock — SDK regen

**Files to write:**
- Regen: `packages/api/typescript/public/docs/openapi.json`
- Regen: `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T2
**Consumes (frozen):** os 4 controllers da T2 nas rotas fixadas.
**Scope fence:** regen puro — nenhuma edição manual em gerado; reverter qualquer `.mcp.json` que ganhe caminho absoluto de worktree (defeito conhecido do gerador, ver histórico 2026-08-06).
**Gate:** `bun tsc` 0 erros em todos os workspaces; `grep -rn "cloud/devices/exchange" packages/client/dist/typescript | head -1` encontra o hook/schema gerado.

### Step T3.1 — Regen + verificação + commit

```bash
bun sdk
git status --porcelain   # conferir .mcp.json — se mudou caminho absoluto, git checkout -- neles
git add packages/api/typescript/public/docs/openapi.json packages/client/dist/
git commit -m "chore(sdk): endpoints cloud de device/entitlement na SDK (Task T3)"
```

---

## Task T4: `CODM_PROFILE=cloud` monta só auth+owner e sobe por compose

**Files to write:**
- Modify: `packages/api/typescript/src/index.ts` — filtro de perfil sobre registries+controllers montados
- Modify: `packages/api/typescript/src/shared/index.ts` — aceita lista de registries filtrada (se o filtro não couber no index.ts sozinho)
- Create: `docker/cloud.Dockerfile`
- Create: `docker/cloud.compose.yml`
- Modify: `template.config.ts` — REPO.env ganha `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `CODM_CLOUD_URL`, `CODM_PROFILE` (consumers: api-typescript) + `STRIPE_SECRET_KEY`/`STRIPE_PUBLISHABLE_KEY` documentadas como estacionadas (consumers: nenhum ativo — comentário explica o pivô)
- Regen: `.env.example` (`bun env:generate`)
- Test: `packages/api/typescript/tests/architecture/cloud-profile.test.ts`

**Files to read:**
- `packages/api/typescript/src/shared/registry.ts` — ALL_REGISTRIES
- `packages/api/typescript/tests/architecture/wiring-completeness.test.ts` — molde de rail

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /bounded-context, /test
**Depends on:** T1
**Consumes (frozen):** o contexto auth da T1 (registry exportado); nomes de env EXATOS acima (já no `.env` do founder).
**Scope fence:** OUT — device tokens (T2 corre em paralelo; não toque em controllers/cloud), SDK, frontend, shell. O perfil default (daemon local) monta TUDO como hoje — zero mudança de comportamento sem `CODM_PROFILE`.
**Gate:** `bun test packages/api/typescript/tests/architecture/cloud-profile.test.ts` verde; `bun env:generate --check` verde; `docker compose -f docker/cloud.compose.yml config` valida; `bun tsc` limpo.

### Step T4.1 — O filtro de perfil

Em `src/index.ts`: `const CLOUD_CONTEXTS = new Set(['auth', 'owner', 'shared'])`; quando `process.env.CODM_PROFILE === 'cloud'`, a lista de registries aplicada e o mapa de controllers montados filtram por esses contextos (o `shared` fica — é o root/infra). Dispatcher de mailbox, gateway proxy e afins NÃO sobem no cloud (são registries de agent/thread — já caem no filtro).

### Step T4.2 — Rail `cloud-profile.test.ts`

Molde dos rails da casa: importa o filtro (exportá-lo puro de `src/index.ts` ou módulo próprio) e assevera que com perfil cloud (a) `auth`/`owner`/`shared` entram, (b) `agent`/`thread`/`issue`/`workspace`/`ui` NÃO entram — com fixture negativa (um contexto fake fora do set é rejeitado). O falsificador de AC-1: incluir `agent` no set faz o rail acusar.

### Step T4.3 — Docker

`cloud.Dockerfile`: multi-stage bun — `oven/bun` → `bun install --frozen-lockfile` → `bun build` do daemon (mesmo `scripts/build.ts` que o e2e usa para o bundle node) OU rodar por `bun src/index.ts` direto (mais simples, imagem única); env `CODM_PROFILE=cloud`, `CODM_DATA_DIR=/data`, volume `/data`, `EXPOSE 3030`. `cloud.compose.yml`: serviço único + volume nomeado + envs do `.env` raiz (`env_file: ../.env`). Railway consome o mesmo Dockerfile sem mudança (AC-1).

### Step T4.4 — Env registry + gates + commit

`template.config.ts` REPO.env conforme a regra da casa (consumo declarado); `bun env:generate`; gates; commit `feat(cloud): perfil cloud monta só auth+owner; compose+Dockerfile Railway-ready (Task T4)`.

---

## Task T5: `codm://` chega ao console

**Files to write:**
- Modify: `packages/app/tauri/src-tauri/Cargo.toml` — `tauri-plugin-deep-link = "2"`
- Create: `packages/app/tauri/config/deeplink.ts` — `{ scheme: 'codm' }` declarativo
- Modify: `packages/app/tauri/config/generate.ts` — renderiza `plugins.deep-link.desktop.schemes: ['codm']` na conf
- Modify: `packages/app/tauri/config/generate.test.ts` — rail DSK-09: conf carrega o scheme declarado
- Modify: `packages/app/tauri/src-tauri/src/lib.rs` — registra o plugin
- Modify: `packages/app/tauri/config/capabilities.ts` — capability `deepLink` → `['deep-link:default']` (o CONSOLE ouve o evento)
- Regen: `packages/app/tauri/src-tauri/tauri.conf.json` + `capabilities/default.json` (`bun desktop:generate`)

**Files to read:**
- `packages/app/tauri/config/updater.ts` + `generate.ts` — o padrão de config declarativa que o SP1 acabou de estabelecer

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /desktop-shell
**Depends on:** (none)
**Consumes (frozen):** scheme `codm` (spec decisão 7); a convenção conf-gerada (nunca editar tauri.conf.json à mão).
**Scope fence:** OUT — nenhum código react (T6 consome o evento), nenhum arquivo do updater do SP1 (se PR #17 ainda não mergeou, esta task NÃO pode assumir `config/updater.ts` presente — o rail novo é independente).
**Gate:** `bun test packages/app/tauri/config` verde (rails DSK incl. o novo); `bun packages/app/tauri/config/generate.ts --check` em sync; `cargo check` limpo em `src-tauri`.

### Step T5.1 — Config declarativa + generator + rail (RED no rail primeiro), plugin no Cargo/lib.rs, `bun desktop:generate`, gates, commit

Commit: `feat(desktop): deep link codm:// declarado na config e registrado no shell (Task T5)`.

---

## Task T6: Logar destrava o console sem restart

**Files to write:**
- Create: `packages/app/react/src/services/CloudSessionService/{CloudSessionService,TauriCloudSessionService,BrowserCloudSessionService,index}.ts`
- Modify: `packages/app/react/src/services/{index,registry ou providers}` — registra o serviço no container (mesmo padrão do SecretsService)
- Create: rota/tela de login (scaffold `bun cli route` + `bun cli component --recipe=section`)
- Create: `packages/app/react/src/routes/(app)/-hooks/useDeepLinkAuth.ts` — ouve o evento do plugin, extrai `code`, chama o hook SDK de exchange, guarda token, invalida sessão
- Modify: layout `(app)` — gate de login (padrão SupervisionGate: tela cheia quando deslogado)
- Modify: menu/conta — botão logout (revoke SDK + limpa keychain + daemon)
- i18n: `bun cli i18n cloudAuth --keys=...`

**Files to read:**
- `packages/app/react/src/services/SecretsService/*` — o padrão port/Tauri/Browser
- `packages/app/react/src/components/console/SupervisionGate.tsx` — o padrão de gate de tela

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /route, /component, /store, /desktop-shell
**Depends on:** T3, T5
**Consumes (frozen):** hooks/schemas GERADOS pela T3 (nomes exatos conforme a SDK regenerada — `useExchangeDeviceCode`/`useGetEntitlement`/`useRevokeDevice` ou equivalentes kubb; o worker DEVE ler `packages/client/dist/typescript` para os nomes reais antes de importar); evento do deep link do plugin T5 (`onOpenUrl` de `@tauri-apps/plugin-deep-link`); chave de keychain via `SecretsService` existente; endpoint local do daemon `POST /v1/session/cloud-token` (T7 — se T7 ainda não mergeou na hora do build, este push é try/catch tolerante).
**Scope fence:** DONE elsewhere — endpoints cloud (T2/T3), deep link shell (T5), gate do daemon (T7). OUT — qualquer edição no dispatcher/daemon.
**Gate:** `cd packages/app/react && bun x tsc --noEmit` 0 erros; `bun lint` limpo; `bun test packages/app/react` verde (casos do hook com evento simulado — molde `useThreadRealtime`).

### Step T6.1 — Scaffolds (route + section + i18n), Step T6.2 — CloudSessionService (login abre `${CODM_CLOUD_URL}/api/auth/sign-in/social?provider=github&callbackURL=/v1/cloud/desktop-callback` no browser do sistema via opener; token no keychain; `pushToDaemon(token)`), Step T6.3 — useDeepLinkAuth (exchange → persist → invalidate), Step T6.4 — gate de tela + logout, Step T6.5 — teste do hook com CustomEvent simulado, gates, commit.

Commit: `feat(console): login OAuth por deep link + gate de conta (Task T6)`.

---

## Task T7: Sem login os agentes param; offline não pune; revogado derruba

**Files to write:**
- Create: `packages/api/typescript/src/auth/services/CloudSession/{CloudSession,index}.ts` — lado LOCAL (daemon)
- Create: `packages/api/typescript/src/auth/controllers/SetCloudToken.ts` (scaffold) — `POST /v1/session/cloud-token`
- Modify: `packages/api/typescript/src/auth/{registry,index,controllers/index}.ts` — wiring
- Modify: `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts` — gate no claim
- Test: `packages/api/typescript/src/auth/services/CloudSession/CloudSession.test.ts`
- Test: `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.test.ts` — caso do gate

**Files to read:**
- `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts` — o tick/claim atual
- `packages/api/typescript/src/agent/services/ProviderDetector/` — sibling de service com seam de ambiente

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** /service, /controller, /test
**Depends on:** T3
**Consumes (frozen):** `GET /v1/cloud/entitlement` (Bearer) da T2 — chamado via fetch tipado contra `CODM_CLOUD_URL` atrás do serviço (`mock`/`integration` NUNCA abrem socket — regra S2S da casa: implementação por ambiente no registry); cache em `$CODM_DATA_DIR/cloud-session.json` com `chmod 0600`.
**Scope fence:** DONE elsewhere — endpoints cloud (T2), console (T6). OUT — better-auth, perfil, docker. NÃO tocar em `raiseStopForPoisoned`/heartbeat/lease — o gate é ANTES do claim, nunca sobre item já reivindicado.
**Gate:** `cd packages/api/typescript && bun test src/auth src/agent` verde; `bun x tsc -p tsconfig.build.json --noEmit` exit 0.

### Step T7.0 — Scaffolds

```bash
bun cli service auth CloudSession
bun cli controller auth SetCloudToken -m post -p /v1/session/cloud-token
```

### Step T7.1 — CloudSession (a política, pura e testável)

`CloudSession` service: estado `{ token?, lastValidatedAt?, revoked: boolean }` carregado do cache em disco; `setToken(t)` persiste (0600) e agenda revalidação; `isEntitled(): boolean` — **true se há token e não-revogado** (offline ⇒ último estado vale, indefinidamente — spec decisão 6); revalidação online (boot + intervalo de 1h): `GET /v1/cloud/entitlement` — 401/403 ⇒ marca `revoked`, limpa cache; erro de REDE ⇒ mantém estado (tolerância). Bindings por ambiente: `real` = fetch com `CODM_CLOUD_URL`; `integration`/`mock` = stub em memória controlável pelo teste (sem socket — regra S2S).

### Step T7.2 — O gate no dispatcher (a MENOR edição possível)

No `tick()`/claim do `DrizzleMailboxDispatcher`, antes de `claimNext`: `if (!this.cloudSession.isEntitled()) return` — **itens ficam na fila** (aguardando, nunca morrem, nunca gastam attempts — AC-4). Injetar `CloudSession` no construtor. Comentário no código: por que ANTES do claim (item reivindicado e abortado gastaria attempts — a lição do defer/contenção de 2026-08-05).

**Compat de dev**: sem `CODM_CLOUD_URL` configurada (instalação do founder pré-SP2 ou dev local), `isEntitled()` devolve `true` — o gate só arma quando o produto está configurado para exigir conta. Registrado como decisão de rollout no comentário e coberto por teste.

### Step T7.3 — Testes (RED primeiro)

`CloudSession.test.ts`: sem config ⇒ entitled (compat); com token válido ⇒ entitled; revalidação que devolve 401 ⇒ revoked + cache limpo; revalidação com erro de rede ⇒ estado mantido (AC-5, o falsificador: tratar erro de rede como 401 derruba este caso). Dispatcher test (molde dos casos de 2026-08-06, subclasse + drain): com sessão não-entitled, `claimNext` NUNCA é chamado e o item segue PENDENTE com attempts inalterado (AC-4); ao ficar entitled, o próximo drain o processa.

### Step T7.4 — SetCloudToken controller + gates + commit

Commit: `feat(agent): dispatcher gateia turnos pela sessão cloud — offline tolerante (Task T7)`.

---

## Final Validation

- [ ] `bun tsc` — limpo em todos os workspaces
- [ ] `bun lint` — limpo
- [ ] `cd packages/api/typescript && bun test` — verde (baseline atual + os casos novos de T1/T2/T4/T7)
- [ ] `bun test packages/app/tauri/config` + `generate --check` — rails DSK verdes com o novo DSK-09
- [ ] `docker compose -f docker/cloud.compose.yml config` — compose válido (o `up` real com OAuth de dev é verificação manual do founder: login GitHub/Google ponta a ponta)
- [ ] AC mapping:
  - AC-1 → `tests/architecture/cloud-profile.test.ts` (perfil monta só auth+owner) + `docker compose config`
  - AC-2 → `src/auth/usecases/ExchangeDeviceCode.test.ts` ("segundo exchange do MESMO code falha"; hash ≠ plaintext persistido)
  - AC-3 → teste do hook em T6 (deep link simulado destrava) — a metade visual é verificação manual
  - AC-4 → `DrizzleMailboxDispatcher.test.ts` caso do gate (item aguarda, attempts inalterado; retoma ao logar)
  - AC-5 → `CloudSession.test.ts` (rede ≠ revogação; 401 derruba)
  - AC-6 → caso de logout em T6 + `RevokeDevice` em T2
  - AC-7 → gates de tsc/lint + `bun env:generate --check`
- [ ] E2E: fora do escopo (fluxo depende de OAuth externo real; specs hermeticos não cobrem — verificação manual do founder documentada no PR)

## Notes

- **Ordem de merge com o PR #17 (SP1)**: T5 toca `Cargo.toml`/`lib.rs` que o SP1 também tocou — se #17 mergear primeiro (esperado), o branch deste plano rebasea trivialmente (adições disjuntas); a base do worktree deve ser a main PÓS-#17 se possível.
- **Worktree**: provisionar com `bun install` + `.env` copiado + `bun emit-openapi` (lições de 2026-08-06 — sem isso 3 rails dão falso negativo e o regen do T3 imprime título errado).
- **Credenciais**: já no `.env` raiz (Google/GitHub client id+secret, dev). O compose lê via `env_file`.
- **Não incluído por decisão do spec**: e-mail/senha, Stripe (chaves estacionadas), UI de conta além de login/logout, e2e do fluxo OAuth.
