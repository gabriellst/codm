# HANDOFF — Organização TS/Astro/Tauri (23-jul) — CONCLUÍDA

> Contexto amplo: HANDOFF.md + .specs/codedm/OVERNIGHT-REPORT.md (noite) +
> .specs/codedm/2026-07-23-ts-organization-audit.md (contrato dos lotes TS).
> Retomada foi feita com Opus após halt por usage-limit.

## Estado FINAL (main @ 2cc4a645)

**TS org (lotes 0-G)** — commitada `1d96d18f..6877dc0a` + juízes adversariais GREEN 97
(`427dd02d`). Verificado independentemente: materialização de união na camada wire dos contracts
(`contracts/generated/typescript/src/wire/events`, NUNCA no controller); ListenEvents declarativo
densidade medscall; boolean-query bug com teste mutation-proven; schema-reuse wire-idêntico;
CONTEXT_MAP table-read edges mutation-enforced; REWRITEs/SANCTIONED intactos. Gates full verdes.

**Astro / Tauri / Seam nativo** — branch astro-tauri-org mergeada no main (`2cc4a645`), Lote 3
GREEN 94, worktree removida:
- Astro landing = vertical slice em `packages/app/astro/src/pages/_landing/` (componentes +
  content-def + conteúdo + layout colocalizados; rotas cascas finas; Nav/Footer/BaseLayout
  compartilhados fora do slice).
- Tauri global/parametrizado: contrato `REPO.desktop` em template.config → `scripts/desktop/generate.ts`
  emite tauri.conf + capabilities (deriva de services), zero inline; drift-check no tooling.
- Seam nativo = contrato de abstração + DI: react só conhece 6 PORTAS via `NativeProvider`
  (`lib/native/contract/*`); services concretos por plataforma em `lib/native/platforms/{tauri,browser}/services/*`;
  `@tauri-apps/*` confinado por lint rule (provada mordendo); code-split provado (touchpoints tauri
  num chunk async). **FilePickerService** (rename de DialogService — founder) dirige o fluxo
  AddWorkspace via file picker nativo, fallback browser; caminho expo documentado na skill
  desktop-shell (candidato a upstream no template).

**Gates consolidados pós-merge (todos verdes, 2cc4a645)**: api-ts test · astro build+check ·
react build+lint · tooling · env-check · sdk 2× idempotente · e2e 5 pass/2 skip.

## Pendente — DECISÕES DO FOUNDER (nada mais é autônomo)
1. **train Go error-codes** — ~54 códigos do gateway invisíveis ao gate (renderizam UNKNOWN_ERROR
   no console); pré-requisito: Lote B já trocou errors.ts pro union ERROR_CODES.
2. **NEW_ISSUE double-mint** — classifier computa título LLM e descarta; saga re-minta mecânico.
   Emenda de `message.classified` (carregar key/title) OU deletar o minting morto.
3. **9 SDK ops mortas** — strip vs manter como seam de template.
4. **lote 7 pkg/openapi** — mover pra core + decisão de markers x-* vs x-tpl-* + default→4XX.
5. **schema-handoff** — hazard das colunas medscall; destrava os 2 BLOCKED (remote_created/updated)
   + reconnect-on-boot + UoW real.
6. **go-domain (Fase F ADIADA)** — branch `go-domain` @ 6e563db9 preservada (worktree
   .claude/worktrees/go-domain): já tem o design doc das fundações; falta PoC drizzle→sqlc +
   esqueleto SqlExternalMediator. Retomar quando o founder der GO.
7. **validação do JSONL residual** (fase 10) — rodar o smoke fora de uma sessão Claude Code (5min).
8. **teste de fogo** — precisa de rustup para o tauri dev.

## Worktrees
- `go-domain` @ 6e563db9 — PRESERVADA (Fase F adiada, tem design doc).
- tauri-shell e astro-tauri-org — removidas (mergeadas no main).
