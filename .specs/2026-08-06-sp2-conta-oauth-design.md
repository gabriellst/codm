# SP2 — Conta e login OAuth (produto gratuito, plano único) — Design Spec

**Date:** 2026-08-06
**Status:** Approved (aprovação do founder em chat: "Faça o plano", 2026-08-06)
**Bounded Context:** cross-context: auth (ressuscitado do collapse) · owner · desktop-shell · console react
**Kind:** feature
**Story Points:** 13 — ressurreição+adaptação do better-auth, perfil cloud novo no boot, fluxo device-token cross-superfície (cloud→browser→deep link→keychain→daemon), gate no dispatcher, Dockerfile/compose; sem Stripe (cortado pelo pivô), sem migração de dados existentes.

## Context

O roadmap (`.specs/2026-08-06-produto-desktop-roadmap.md`) previa o SP2 como "identidade + licença
+ controle de uso". Durante o grilling deste spec o founder **pivotou o modelo comercial: o produto
será gratuito, com um único plano** ("Desisti de colocar preço, vai ser 0,00 de graça um plano
apenas"). O SP2 reduz-se à metade de identidade — que continua obrigatória, porque o founder também
decidiu que **sem login os agentes param e o console pede conta**. As chaves de Stripe (modo teste)
já entregues ficam estacionadas no `.env` raiz para um futuro replanejamento; nenhum código de
cobrança entra neste SP.

O codm removeu o better-auth no nascimento do fork (`f21be114 collapse(auth): single constant
operator, drop better-auth boundary` — `src/auth/operator.ts` e `GetSession.ts` documentam o
colapso para um operador único local). O código do template v1.9 com better-auth completo é
**recuperável do histórico** (`f21be114^`) — a implementação é ressurreição+adaptação, não
reescrita. O boot atual monta contextos via `ALL_REGISTRIES` num root BoundedContext
(`src/index.ts`), o que torna um **perfil cloud** montando um subconjunto uma extensão natural da
arquitetura existente.

Peças já prontas que este spec consome: o seam de secrets do desktop-shell (keychain) para guardar
o token; o SP1 (PR #17) para distribuir o app que fará login; os OAuth apps de dev **já criados**
pelo founder (Google + GitHub, callbacks `http://localhost:3030/api/auth/callback/{google,github}`)
com client IDs/secrets no `.env`.

## Problem

1. Não existe identidade de usuário final: o app roda para quem tiver o binário, sem conta, sem
   noção de "quem é este usuário" — o que bloqueia qualquer controle de uso futuro (SP3) e
   qualquer monetização futura.
2. Não existe superfície cloud nenhuma: nada para autenticar contra, nada deployável.

## Goal

Quem baixa o codm cria conta com GitHub ou Google no browser do sistema, o app recebe a sessão via
deep link e guarda um token de dispositivo no keychain; a partir daí o uso é livre (plano único
gratuito). Sem login, o console abre normalmente mas pede conta e os agentes não executam. A fatia
cloud sobe com um `docker compose up` hoje e num Railway amanhã, do mesmo Dockerfile.

## Decisions

1. **Gratuito, plano único, sem Stripe** (founder, neste grilling). Nenhum contexto `billing`,
   nenhum webhook, nenhuma tela de checkout. As chaves de teste ficam no `.env`, inertes,
   documentadas como estacionadas. "Entitlement" reduz-se a **"tem conta e o token é válido"**.
2. **Perfil cloud no mesmo `api-typescript`** — entrypoint/env `CODM_PROFILE=cloud` montando
   apenas `auth` (ressuscitado) + `owner`. O daemon local nunca monta o auth cloud; o cloud nunca
   monta agent/thread/issue/channel. Um Dockerfile, SQLite em volume (driver libsql que já existe;
   zero infra nova), compose local primeiro — Railway depois, como o founder pediu.
3. **better-auth ressuscitado de `f21be114^`** e adaptado: providers sociais GitHub + Google,
   montado em **`/api/auth`** (caminho default — os callbacks dos OAuth apps já criados apontam
   para ele; mudar custaria editar os dois consoles).
4. **Fluxo desktop = código one-time → device token** (o padrão Claude desktop, roadmap decisão
   5): o app abre o browser do sistema em `<cloud>/api/auth/...` → OAuth completa → página de
   sucesso do cloud redireciona `codm://auth?code=<one-time>` → o app troca o código por um
   **device token** de longa duração (`POST /v1/cloud/devices/exchange`), guardado **hasheado** no
   banco cloud e em claro apenas no keychain da máquina (seam de secrets existente). Logout =
   revogação do token + limpeza do keychain.
5. **Sem login, agentes param; console pede conta** (founder, neste grilling). O gate vive no
   **dispatcher local** (o mesmo `runTurn` que já governa turnos): sem token válido em cache,
   nenhum turno novo inicia — o bot silencia no WhatsApp; o console abre com os dados locais
   intactos e um banner/tela de login. Dados nunca ficam reféns.
6. **Validação de sessão tolerante a offline**: o daemon revalida o token contra o cloud quando
   online (boot + periodicamente); offline, o cache do keychain vale indefinidamente — a graça
   por *pagamento* morreu com o pivô, e punir usuário gratuito offline seria hostil sem motivo.
   Um token revogado derruba na próxima revalidação online.
7. **Deep link `codm://`** — casa com o identifier `app.codm.desktop` já registrado no shell.
8. **Sem assinatura Apple por ora** (founder, 2026-08-06: "vamos fazer isso só depois, por
   enquanto download sem a licença funciona"). O download público segue o caminho do beta —
   DMG sem Developer ID + bypass do Gatekeeper documentado. Quando o founder decidir comprar a
   conta (US$99/ano), a ligação é operacional: 5 secrets no GitHub + ~12 linhas no
   release-stable.yml, sem mudança no auto-update (minisign independe da Apple).
9. **Env registry**: as chaves novas (`GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`,
   `CODM_CLOUD_URL`, `CODM_PROFILE`) entram declaradas no registry de env conforme a regra da
   casa (consumo é relação declarada); as `STRIPE_*` entram como estacionadas/documentadas.

## User Stories

- **Story 1:** Como pessoa que baixou o codm, quero criar conta com GitHub ou Google e sair
  usando, para não ter cadastro com senha nem cartão.
  - Dado o app sem login, quando clico "Entrar com GitHub", então o browser do sistema abre, eu
    autorizo, o app recebe `codm://auth?code=…`, troca pelo device token e o console destrava
    (AC-2, AC-3).
- **Story 2:** Como founder, quero que sem login os agentes não executem, para que toda instalação
  ativa corresponda a uma conta (fundação do SP3 e de qualquer monetização futura).
  - Dado um app deslogado, quando uma mensagem chega no WhatsApp pareado, então nenhum turno
    inicia e o item aguarda; ao logar, o processamento retoma (AC-4).
- **Story 3:** Como usuário offline, quero que meu login em cache continue valendo, para o app não
  me punir por estar sem internet (AC-5).
- **Story 4:** Como founder, quero subir a fatia cloud com `docker compose up` hoje e no Railway
  depois, do mesmo Dockerfile (AC-1).

## Acceptance Criteria

- [ ] AC-1: `CODM_PROFILE=cloud` sobe um processo que monta APENAS auth+owner (nenhuma rota de
      agent/thread/issue responde); `docker compose -f docker/cloud.compose.yml up` deixa o
      better-auth respondendo em `/api/auth/*` com os providers GitHub e Google configurados por
      env; o mesmo Dockerfile é deployável no Railway sem mudança.
- [ ] AC-2: o fluxo completo login → `codm://auth?code` → `POST /v1/cloud/devices/exchange` troca
      o código one-time por device token exatamente uma vez (reuso do código falha), o token é
      persistido HASHEADO no cloud e em claro só no keychain local.
- [ ] AC-3: console deslogado mostra a tela/banner de login; após o deep link, destrava sem
      restart.
- [ ] AC-4: sem token válido em cache, o dispatcher não inicia turno novo (item fica aguardando,
      não morre); com login, o processamento retoma. Coberto por teste do gate no dispatcher.
- [ ] AC-5: com token em cache e cloud inalcançável, o app funciona normalmente; um token
      REVOGADO no cloud derruba a sessão na primeira revalidação online. Cobertos por testes da
      política de revalidação.
- [ ] AC-6: logout revoga o token no cloud e limpa o keychain; o app volta ao estado da AC-3.
- [ ] AC-7: `bun tsc`/`bun lint`/suíte verdes; env registry com as chaves novas declaradas e as
      `STRIPE_*` documentadas como estacionadas.

## Fora de escopo (explícito)

Stripe/cobrança/planos pagos (pivô do founder — chaves estacionadas), controle/medição de uso
(SP3), sync de dados de domínio (roadmap decisão 1), UI de conta elaborada (v1 = tela de login +
menu com e-mail/logout), assinatura Apple (ver Open Question), multi-conta por máquina.

## Open Questions

- **Branding/domínio** seguem abertos (Railway gera URL própria; OAuth apps de produção serão
  criados quando o domínio existir — os de dev cobrem todo o desenvolvimento).
- O roadmap precisa de emenda refletindo o pivô (SP2 sem billing; SP3 re-motivado como controle de
  abuso do plano gratuito) — fazer na aprovação deste spec.

## Emenda de 2026-08-07 (deploy)

Decisão do founder: **compose aposentado — deploy é Railway-only**, direto do
`docker/cloud.Dockerfile`. O `VOLUME` saiu do Dockerfile (o builder da Railway o rejeita; volume é
attachado no serviço com mount path `/data`), o `docker/cloud.compose.yml` foi removido, e
`CODM_PROFILE` passou a `consumers: ['apiTs'], schema: 'raw'` — classe declarada nova no env
registry para boot flags lidos como `process.env` cru fora dos Zod schemas (fecha o gap que fazia
a chave mentir um consumer 'compose'). Operação Railway documentada no próprio Dockerfile
(mount, RAILWAY_RUN_UID, target port).
