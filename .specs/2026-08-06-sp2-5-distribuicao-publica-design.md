# SP2.5 — Distribuição pública: R2 + landing com download real — Design Spec

**Date:** 2026-08-06
**Status:** Approved (founder resolveu as open questions e entregou credenciais em chat, 2026-08-06 — ver "Estado do provisionamento")
**Bounded Context:** cross-context: desktop-shell (updater) · CI/release · app-astro (landing)
**Kind:** feature
**Story Points:** 5 — mudanças contidas em consts declarativos + workflows + conteúdo da landing; nenhum bounded context novo; o risco mora na verificação ponta-a-ponta de um ciclo de update via R2.

## Context

O SP1 entregou o pipeline de release completo (workflows beta/stable, minisign, manifest
`latest.json`, canais por tag) publicando em **GitHub Releases do repo privado** — e o founder
decidiu manter o repo privado. Consequência dupla, documentada em `docs/RELEASE.md`: o download
anônimo **404** (landing sem função) e o **auto-updater do app instalado também 404** (os
endpoints em `packages/app/tauri/config/updater.ts` apontam para
`github.com/gabriellst/codm/releases/...`). Ou seja: hoje nenhum usuário externo consegue nem
baixar nem atualizar.

A landing Astro existe (`packages/app/astro`) com CTAs de download no Hero/Nav/ClosingCta, mas o
`downloadHref` é a *página* de releases do GitHub. A `PricingSection` está construída e
**desmontada** (comentário no próprio arquivo: "Built per D8 but NOT mounted... one-line
addition"). O conteúdo `_content/plans/plans.json` está **desatualizado em três pontos**: tiers
pagos (Community + Pro US$12) contrariando o pivô do plano único gratuito; a feature "Zero
telemetria, sem conta" contrariando o SP2 (login obrigatório para agentes) e o SP4 planejado
(telemetria); e canais Instagram/Telegram (matriz descartada por ora).

O founder está criando a conta Cloudflare agora — decisão de CDN tomada em chat (2026-08-06).

Peças que este spec consome: `config/updater.ts` (consts declarativos: `updateAsset` fixo,
`stableEndpoint`/`betaEndpoint`) + espelho em `src-tauri/src/updater.rs` gateado pelo rail DSK-07;
`scripts/release/make-manifest.ts`; `.github/workflows/release-{beta,stable}.yml`; build atual
apenas **macOS Apple Silicon**.

## Problem

1. Nenhum usuário externo consegue baixar o app (asset privado 404).
2. O auto-update de qualquer app já instalado quebraria fora da máquina do founder (mesmos 404).
3. A landing anuncia planos que não existem mais e promete "zero telemetria, sem conta" — falso
   pós-SP2.
4. Não há página de pricing montada dizendo a verdade simples: é grátis.

## Goal

Qualquer pessoa baixa o DMG direto da landing e o app instalado se auto-atualiza — com o repo
GitHub permanecendo privado. A landing diz a verdade do produto: um plano, grátis, com conta.

## Decisions

1. **Cloudflare R2 como origem pública de distribuição.** Egress zero (fator decisivo para um DMG
   de ~130MB e artefato de update de ~52MB), S3-compatível, free tier folgado. Bucket com paths
   estáveis: `stable/latest.json`, `stable/CODM_<versão>_aarch64.dmg` + alias fixo
   `stable/CODM-aarch64.dmg`, `beta/latest.json`, `beta/codm-aarch64.app.tar.gz`. A versão vive no
   manifest, nunca na URL (regra do SP1 preservada).
2. **URL pública `r2.dev` primeiro; domínio próprio depois.** O branding segue open question do
   roadmap; quando o domínio existir, pluga-se `releases.<domínio>` no bucket sem tocar no
   pipeline (troca de const + regen).
3. **CI faz upload para R2 após o build** (wrangler ou S3 API; 2-3 secrets novos no GitHub:
   account id + token R2). **GitHub Releases continua recebendo os artefatos como registro
   interno/backup** — o público nunca depende dele.
4. **Endpoints do updater trocam para as URLs R2** em `config/updater.ts`; o espelho
   `updater.rs` acompanha; DSK-07 continua fiscalizando o drift. Apps já instalados do canal
   antigo (só a máquina do founder) fazem uma última atualização manual.
5. **Landing: um botão de download honesto** — "Download para macOS (Apple Silicon)" com link
   direto ao DMG no R2. Sem detecção de SO teatral: só existe build macOS/arm64; outros SOs
   ganham "em breve". Instruções do Gatekeeper (botão direito → Abrir) visíveis junto ao botão,
   já que a assinatura Apple ficou adiada (decisão 8 do SP2).
6. **`plans.json` reescrito para o plano único gratuito** com copy verdadeira: conta via
   GitHub/Google obrigatória para os agentes, WhatsApp como canal, telemetria transparente com
   opt-out (SP4). Some o tier Pro; some "zero telemetria, sem conta"; somem Instagram/Telegram.
   **`PricingSection` é montada** na landing (a one-line prevista no próprio arquivo).
7. **Landing deployada no Cloudflare Pages** — mesma conta que o founder está criando; build
   estático Astro; zero infra nova.

## User Stories

- **Story 1:** Como visitante, quero baixar o app direto da landing, para instalar sem conta
  GitHub nem acesso ao repo.
  - Dado um navegador anônimo, quando clico "Download para macOS", então o DMG baixa do R2
    (AC-1).
- **Story 2:** Como usuário com o app instalado, quero que ele se atualize sozinho, para receber
  correções sem reinstalar.
  - Dado um app com endpoints R2 e uma versão nova publicada, quando o app checa update, então
    baixa, verifica a assinatura minisign e reinicia na nova versão (AC-2).
- **Story 3:** Como visitante avaliando o produto, quero ver o pricing real, para saber que é
  grátis com conta.
  - Dado a landing, quando rolo até pricing, então vejo um único plano "Grátis" com as features
    verdadeiras (AC-3).

## Acceptance Criteria

- [ ] AC-1: `curl -I` anônimo no DMG e no `latest.json` do R2 retorna 200; o botão da landing
      aponta para essas URLs; o repo GitHub segue privado.
- [ ] AC-2: um ciclo beta completo passa pelo R2 — workflow publica, `latest.json` re-apontado,
      app instalado detecta, baixa, valida assinatura e reinicia (verificação manual do founder,
      documentada no PR).
- [ ] AC-3: `plans.json` contém exatamente 1 plano (grátis) em pt+en com a copy corrigida;
      `PricingSection` renderiza na landing; nenhuma menção a "zero telemetria", "sem conta",
      Instagram ou Telegram sobra em `_content/`.
- [ ] AC-4: DSK-07 verde (endpoints ts/rs em lockstep); `bun tsc`/`bun lint`/rails verdes.
- [ ] AC-5: landing publicada no Cloudflare Pages respondendo em URL pública.

## Fora de escopo (explícito)

Builds Windows/Linux (open question do roadmap continua), domínio/branding definitivo, assinatura
Apple (decisão 8 do SP2 inalterada), qualquer mudança no fluxo de login/entitlement (SP2 fechado),
analytics da landing (SP4).

## Decisões fechadas no grilling (2026-08-06, founder em chat)

- **Retenção**: manter TODAS as versões anteriores no R2 (custo ~zero sem egress).
- **Nome do plano na landing**: **Community** (mesmo nome no console — spec SP3).
- **Bucket**: `codm-releases`.

## Estado do provisionamento (2026-08-06, noite)

- Credenciais entregues e guardadas: `.env` raiz (gitignorado) + GitHub Actions secrets
  (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`).
- Token verificado válido, **expira 2026-08-13** (curta duração) — antes do primeiro release via
  CI, criar token permanente no dashboard e atualizar o secret + `.env`.
- ~~Bloqueador R2~~ **RESOLVIDO (founder habilitou R2, 2026-08-06 noite)**: bucket
  `codm-releases` criado (ENAM), URL pública ativa e PROVADA com download anônimo HTTP 200:
  **`https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev`**. Esta é a base dos endpoints do
  updater e do botão da landing até existir domínio próprio.
- **Upload no CI: usar `wrangler` com `CLOUDFLARE_API_TOKEN`** (provado via REST; as chaves S3
  derivadas do token deram erro genérico no smoke — não depender delas no pipeline).
- **Dependência de merge**: os arquivos-alvo (updater.ts/rs, workflows, make-manifest) existem
  apenas no PR #17 (`feat/sp1-release-autoupdate`) — o plano do SP2.5 assume base = main
  pós-#17; mergear #17 antes do /build.
- ~~Secret TAURI_SIGNING_PRIVATE_KEY~~ **RESOLVIDO (2026-08-06 noite)**: setado via gh CLI a
  partir de `~/.tauri/codm-updater.key` (348 bytes). 5 secrets ativos no repo.
