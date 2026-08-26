# SP1 — Release + auto-update do app desktop — Design Spec

**Date:** 2026-08-06
**Status:** Approved (deriva do roadmap aprovado `.specs/2026-08-06-produto-desktop-roadmap.md`; execução autorizada pelo founder: "faça a implementação do que falamos")
**Bounded Context:** desktop-shell (config + Rust) · CI · scripts de release
**Kind:** feature
**Story Points:** 13 — infra cross-cutting: plugin+config gerada+Rust, dois workflows de CI, script de manifest, chaves, docs; sem migração, sem contrato de fio.

## Context

O codm roda hoje por `bun desktop:dev` na máquina do founder — distribuição é recompilar na mão, e
o incidente de 2026-08-05 (daemon rodando binário de 15h atrás sem nenhum fix do dia) é a dor
medida. O shell Tauri v2 (`packages/app/tauri`) já produz bundle real (`bundle.active`, sidecars
`codm-daemon`/`codm-gateway` como `externalBin`), e as migrações idempotentes no boot dos dois
sidecars tornam o upgrade de dados automático por construção.

Convenção estrutural que governa esta implementação: **`tauri.conf.json` e
`capabilities/default.json` são GERADOS** por `packages/app/tauri/config/generate.ts` a partir da
config declarativa (`app.ts`, `capabilities.ts`, `window.ts`, `sidecars.ts`), com rail de drift
(`bun desktop:generate --check`, DSK-01..06 em `generate.test.ts`). O updater entra por essa via —
nunca por edição direta do JSON.

Decisões do roadmap que este spec herda prontas: canais **beta = main / stable = tags** (decisão
3); update do bundle inteiro, atomicamente, com migrações aditivas (decisão 4); **DMG direto, sem
App Store, sem assinatura Apple no beta** — Gatekeeper bypass documentado; Developer ID só no SP2
como gate de cobrança (decisão 7); crash reporting em dose mínima junto da primeira distribuição
(decisão 6).

## Problem

1. Não existe atualização: cada fix exige recompilar e relançar na mão, em cada máquina.
2. Não existe artefato instalável: um terceiro (ou uma segunda máquina do founder) não tem como
   rodar o codm sem o toolchain completo.
3. Um crash do shell em máquina alheia é invisível — não há captura nenhuma.

## Goal

Cada merge na main produz automaticamente um bundle beta que as máquinas do founder instalam e
atualizam sozinhas; uma tag `vX.Y.Z` promove ao canal stable. O app verifica o canal no boot,
baixa, verifica a assinatura minisign e relança — sem intervenção. Um crash do shell fica
registrado em disco para diagnóstico.

## Decisions

1. **O fluxo de update vive no Rust, no boot — sem superfície JS.** A Story 2 do roadmap pede
   update silencioso; um botão "verificar agora" no console seria invenção. Consequência dupla:
   nenhuma permissão de webview nova (capabilities intactas) e nenhum serviço react novo.
2. **Canal por arquivo, stable por default.** `$CODM_DATA_DIR/update-channel` contendo `beta`
   move a máquina para o canal beta; ausência = stable. Env `CODM_UPDATE_CHANNEL` sobrepõe (CI e
   testes). O canal escolhe o ENDPOINT em runtime via `updater_builder().endpoints(...)`; o
   default (stable) fica na conf gerada.
3. **GitHub Releases como transporte, manifest estático.** Stable: release `vX.Y.Z` +
   `latest.json` como asset, endpoint `releases/latest/download/latest.json` (o `latest` do GitHub
   ignora prereleases por natureza — é exatamente a semântica de stable). Beta: prerelease
   **rolante** com tag fixa `beta`, assets substituídos a cada merge, endpoint
   `releases/download/beta/latest.json`.
4. **Versionamento**: stable = a tag (workflow valida tag == versão da conf). Beta =
   `<versão-base>-beta.<run_number>` injetada no build via `--config` (semver crescente por merge,
   sem commit de bump).
5. **Chaves minisign do Tauri**: par gerado uma vez; a PÚBLICA vai na config declarativa
   (`config/updater.ts` → conf gerada); a PRIVADA nunca entra no repo — fica em
   `~/.tauri/codm-updater.key` na máquina do founder e como secret `TAURI_SIGNING_PRIVATE_KEY` no
   GitHub. Todo artefato de update é assinado; o cliente recusa assinatura inválida (comportamento
   nativo do plugin).
6. **Crash reporting dose mínima = panic hook em disco.** O hook do shell grava
   `$CODM_DATA_DIR/crashes/shell-<timestamp>.log` (payload do panic + backtrace), mantendo os
   últimos 20. Sentry/telemetria remota fica para o SP4 (exige DSN/conta — externo). CP-1 do
   roadmap ("crash gera report visível ao founder") é satisfeito pelo arquivo local nesta fase.
7. **macOS/arm64 apenas** nesta fase (runner `macos-14`). Windows/Linux seguem Open Question do
   roadmap.

   > Superado em 2026-08-25 — ver .specs/2026-08-25-windows-linux-build-design.md (manifesto multi-plataforma, matrix de 3 SOs).
8. **`createUpdaterArtifacts: true`** na bundle config gerada — o `tauri build` passa a emitir
   `.app.tar.gz` + `.sig` além do DMG.

## User Stories

- **Story 1:** Como founder, quero que um merge na main chegue às minhas máquinas sozinho, para
  nunca mais rodar binário de 15 horas atrás.
  - Dado um merge na main, quando o CI publica o beta rolante, então o app em canal beta baixa,
    verifica a assinatura e relança na próxima abertura/check (AC-2, AC-4).
- **Story 2:** Como assinante futuro, quero instalar um DMG baixado e receber atualizações do
  stable, sem saber o que é um binário.
  - Dado uma tag `vX.Y.Z` publicada, quando o app em canal stable checa, então atualiza para ela;
    prereleases beta nunca o alcançam (AC-3).
- **Story 3:** Como founder diagnosticando um crash, quero o panic registrado em disco com
  backtrace (AC-5).

## Acceptance Criteria

- [ ] AC-1: `bun desktop:generate` emite `plugins.updater` (pubkey + endpoint stable) e
      `bundle.createUpdaterArtifacts: true` na conf; `bun desktop:generate --check` passa (zero
      drift) e os rails DSK continuam verdes.
- [ ] AC-2: com `CODM_UPDATE_CHANNEL=beta` (ou arquivo `update-channel`), o endpoint consultado é
      o do beta rolante; sem nada, o do stable — decidido em runtime no Rust.
- [ ] AC-3: o workflow stable dispara em tag `v*`, valida tag == versão da conf, builda, assina e
      publica release com DMG + `.app.tar.gz` + `.sig` + `latest.json`; o workflow beta dispara em
      push na main e substitui os assets da prerelease `beta` com versão `-beta.<run>` crescente.
- [ ] AC-4: `scripts/release/make-manifest.ts` produz um `latest.json` válido para o plugin
      (version, pub_date, platforms.darwin-aarch64.{url,signature}) a partir dos artefatos do
      build — coberto por teste unitário do script.

      > Superado em 2026-08-25 — ver .specs/2026-08-25-windows-linux-build-design.md (manifesto multi-plataforma, matrix de 3 SOs).
- [ ] AC-5: um panic do shell produz `crashes/shell-*.log` com o payload e mantém no máximo 20
      arquivos — coberto por teste da função de escrita/rotação.
- [ ] AC-6: `cargo check` do shell limpo; `bun tsc` e `bun lint` limpos; `test:tooling` (rails
      DSK) verde; um `tauri build` local produz DMG + artefatos de update assinados.
- [ ] AC-7: `docs/RELEASE.md` documenta: cortar stable (tag), como o beta flui da main, gestão das
      chaves (backup da privada + secret no GitHub), troca de canal por máquina, e o texto do
      bypass do Gatekeeper para a página de download (decisão 7 do roadmap).

## Fora de escopo (explícito)

Assinatura/notarização Apple (SP2), Windows/Linux, rollout percentual e minVersion forçado (SP4),
telemetria remota de crash (SP4), UI de update no console (decisão 1), auto-update dos sidecars
fora do bundle (o bundle É a unidade de update — decisão 4 do roadmap).
