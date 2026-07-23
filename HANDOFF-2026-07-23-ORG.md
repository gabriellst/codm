# HANDOFF — Organização TS/Astro/Tauri (23-jul, halt por usage limit; retomar com Opus)

> Contexto amplo: HANDOFF.md + .specs/codedm/OVERNIGHT-REPORT.md (noite) +
> .specs/codedm/2026-07-23-ts-organization-audit.md (contrato dos lotes).
> Regras: 1 committer por repo; workflows builder+juízes (bar ≥90); wire-identity sagrada.

## Estado ao halt

**MAIN (`6877dc0a`)** — ts-fixnow: TODOS os lotes commitados, **JUÍZES NÃO RODARAM**:
- `1d96d18f` Lote 0 — superfície de união PRÉ-MATERIALIZADA em
  `packages/contracts/generated/typescript/src/wire/events` (ratificação do founder:
  materialização NUNCA no controller; ListenEvents = composição pura).
- `45b15d00` A (comportamento silencioso: boolean-query bug, catch bare, uuid guard, entryId) ·
  `7643eef9` B (error vocab + seam console) · `2d2316f7` C (schema-reuse — wire DEVE ser
  idêntico) · `6afcebcb` D (testFakePty fora do build) · `c2b011c7` E (ForwardRequest→core) ·
  `553a119b` F (purge morto) · `6877dc0a` G (barrels + CONTEXT_MAP edges).
- **RETOMAR COM**: rodada de juízes sobre e5ce116b..6877dc0a — fidelity (REWRITEs/SANCTIONED
  intocados, wire idêntico no Lote C via diff do openapi, mutation-test do teste de boolean e do
  rail context-map) + integração (gates full: tsc, bun test, tooling, sdk 2×, e2e 5/2-skip,
  proxy smoke, go intocado desde e5ce116b). Script reutilizável:
  workflows/scripts/ts-fixnow-batches-wf_ae84bd3c-0d7.js (fase Judge).

**BRANCH `astro-tauri-org`** (worktree .claude/worktrees/astro-tauri-org):
- `eb2ca87b` Lote 1 — landing vertical slice em pages/_landing (componentes+content-def+
  conteúdo+layout colocalizados). `decabeb6` Lote 2 — shell tauri gerado do contrato
  REPO.desktop (declarativo, zero inline).
- `754b4513` **WIP PARKED mid-Lote-3** — contrato nativo + DI ~80% pronto: contract/ com 6
  portas, platforms/{tauri,browser}/services/* completos, NativeProvider+teste, useFolderPicker.
  FALTA: (a) **RENAME RATIFICADO: DialogService→FilePickerService** (contract/dialog.ts,
  services Tauri/BrowserDialogService, hook — colisão com chat do produto + primitivo Dialog);
  (b) terminar index.ts/wiring + lint rule no novo path (provar que morde); (c) fluxo
  AddWorkspace usando a porta (botão escolher-pasta + fallback browser) + capability
  dialog:allow-open derivada no contrato desktop; (d) gates da branch; (e) juízes.
  Script: workflows/scripts/astro-tauri-org-wf_9144386a-bd6.js (Lote 3 + judges).
- Depois: MERGE no main (conflitos esperados só em BUILD-LOG) + gates consolidados.

## Fila pós-retomada (ordem)
1. Juízes do ts-fixnow no main → fixes se BELOW-BAR.
2. Terminar Lote 3 na branch (rename FilePickerService primeiro) → juízes → merge → gates full.
3. Decisões do founder pendentes: train Go error-codes (~54 códigos invisíveis) ·
   NEW_ISSUE double-mint · 9 SDK ops mortas · lote 7 pkg/openapi markers · schema-handoff ·
   go-domain (adiado) · validação do JSONL residual (5min, fora do Claude Code).

## Workflows mortos no halt (não retomar às cegas — estado já colhido acima)
wst427hea/wf_ae84bd3c-0d7 (ts-fixnow, morto na fase Judge) ·
wiz50hqd6/wf_9144386a-bd6 (astro-tauri, morto mid-Lote-3 → WIP 754b4513).
