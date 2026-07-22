# HANDOFF — CodeDM (2026-07-22, fim da sessão de bootstrap)

> Para retomar com contexto zerado. Fonte da verdade fina: `.specs/codedm/BUILD-LOG.md` (ledger
> fase a fase com decisões da noite) + os specs citados abaixo. Memória do assistente:
> `codedm-initiative` no auto-memory.

## O produto
**CodeDM** — "DM your codebase": conecta canais de mensagem (WhatsApp; IG/Telegram futuros) a
agentes de terminal (claude-code/codex/opencode) rodando na máquina do operador. Single-operator,
local-first. Modelagem original do founder: `.specs/codedm/ddd-modeling-codedm.md`; screenshots de
design (macOS desktop, monocromático) em `.specs/codedm/ui-findings/` + `~/Downloads/codedm-design-and-modelling/`.

## Estado do repo (main @ ecb65b22)
- Nascido do template-fullstack v1.9 (stamp + strip billing/quota/notifications/auth + operador
  constante `OPERATOR_ID`), scope `@codedm`, PGlite file-backed como modo real do daemon TS
  (CODEDM_DATA_DIR), contrato TypeSpec congelado (18 enums + 16 eventos + emendas do channel).
- **Backend TS**: contexts workspace/thread/issue/artifact/terminal/ui; saga inbound→dedup(UNIQUE)→
  classificação→sessão→issue viva; SSE ListenEvents; bridge Redis Go↔TS PROVADA (flat-envelope
  reconciliado). E2e Playwright: 5 specs pass + 2 skips honestos (precisam de stub runner com modos
  de falha).
- **Gateway Go**: `packages/api/go` = **porte VERBATIM completo do medscall channel** (300 arquivos,
  cp+sed module `template/api-go`) + classificação/retarget (enums→aliases wire documentados) +
  integração (nx, emit-openapi do cmd/openapi verbatim, SDK regenerada dos 37 controllers).
  Auditoria mecânica: 255/264 diffs = só rename/retarget; 9 = retargets documentados (§C.1 do
  `.specs/codedm/channel-wire-classification.md`). Testes pg gateados por CHANNEL_TEST_DATABASE_URL.
- **Console react**: 15 telas (T01-T15), design system monocromático próprio (styleguide em
  /app/styleguide), UI round-1 do founder fechada (8 findings; gate i18n no-hardcoded-jsx-text VIVO).
- **Expo REMOVIDO** (tauri será o desktop). **Astro**: workflow da landing (HTML do founder
  `~/Downloads/CodeDM Landing.dc.html`, three.js island, i18n, blog, planos) — checar estado:
  `git log packages/app/astro` + run wf_da4f7f46-bce (estava na fase de juízes).
- Dev: `bun stack:up` + `bun migrate:dev` ANTES do gateway; daemon seam p/ UI:
  `CODEDM_E2E=true CODEDM_DATA_DIR=/tmp/x PORT=3030 bun x nx run api-typescript:dev` + ingress de
  teste POST /v1/_test/gateway (ver BUILD-LOG).

## O QUE ESTAVA SENDO FEITO (pausado pelo founder)
**Pairing WhatsApp** — 3 tentativas, 2 críticas estruturais do founder:
1. ~~Proxy TS (ConnectChannel em /ui chamando gateway server-side)~~ — **ERRADO** (crítica: "muito
   edge-casey; o medscall não cria endpoint /ui pro channel").
2. **CORRETO (regra ratificada)**: o console consome o **client do GATEWAY na SDK diretamente**
   (como o medscall: `@medscall/monorepo-sdk/channel/app` — ver packages/app/src/routes/(app)/channel
   no medscall). Zero endpoint TS no caminho do canal. Base URL pública VITE_*; apikey verbatim
   bypass-quando-unset (local); CORS via CHANNEL_ALLOWED_ORIGINS (verbatim, example já é 5173).
3. Estado: wip PARKED `ecb65b22` (limpeza dos restos do proxy pela metade — PairingQrCache e
   ConsumeChannelPairingQr deletados, ConnectChannel/GetChannelPairingStatus TS mid-edit — TERMINAR
   a remoção). Workflow parado: wf_cc8f6bb9-5f4 (prompt tem as regras completas; retomável ou
   relançável).

## CRÍTICAS DO FOUNDER (regras permanentes — internalizar)
1. **Porte é DETERMINÍSTICO**: cp verbatim + sed + classificar depois. Nunca porte interpretativo
   arquivo-a-arquivo por agente (pego incompleto 2x: remotes/groups; controllers/entities).
2. **Consumo faz parte do porte**: portar um serviço inclui portar COMO ele é consumido.
3. **Union slots**: spec RATIFICADA `.specs/codedm/union-slots-spec.md` — declaração única no
   contrato com owner do manifest, formas no serviço dono, estampagem no binding gerado, união
   completa em TODO openapi emissor (Go SSE + TS ListenEvents via schemas gerados), rail
   union-parity (3 checks). IMPLEMENTAÇÃO PENDENTE (ordem no §5 da spec).
4. i18n via gate (vivo); estados vazios honestos; endpoint inventado = critical; BUILD-LOG sempre.
5. Dois workflows nunca commitam juntos no repo (index race); --no-verify só com gates verificados
   à mão e justificados no commit message.

## FILA (ordem do founder, ROADMAP.md)
1. Astro landing fechar (workflow em voo ao pausar).
2. **Union-slots implementação** (spec §5) — ratificada, pronta pra executar.
3. **Pairing direct-SDK** (regras acima; terminar a limpeza parkeada primeiro).
4. **Fase 10 foundation runner** — extração do ClaudeCliTerminalLLMRunner da branch
   whatscode/foundation (~/Desktop/Projetos/whatscode-ref, branch em FETCH_HEAD). Plano:
   `.plans/2026-07-22-phase10-foundation-terminal-extraction.md`. **4 FORKS AGUARDAM O FOUNDER**:
   A (A1 recomendado: alargar o seam pro motor completo) · B (issueId como identidade) · C (fundir
   no TerminalSessionRegistry) · D REVISADO (Bun.Terminal nativo bun≥1.3.5 + spike PGlite dentro de
   bun --compile — run-under-Node de-riskado mas possivelmente desnecessário) + emendas
   (StopKind+=AUTH_REQUIRED etc.).
5. Tauri (fase 11): app/{react,tauri}, seam lib/native (isTauri; @tauri-apps/* proibido fora),
   sidecars daemon+gateway, DB-as-mediator desktop = SQLite WAL (ROADMAP) — depois testar app real,
   polimento, melhorias do template, e por fim o porte do domínio pra Go (Windows importa;
   drizzle→sqlc como pull de schema).
6. Decisão pendente menor: histórico do repo carrega ~290MB de blobs pré-gitignore (squash
   fresh-start opcional quando estabilizar).

## Contexto irmãos/template
Template v1.9 @cdc63a281+ (5 bugs reais corrigidos por esta iniciativa: .nx no stamp, gates
manifest-derived, codegen arrays/digit-enums, regra /.git engolindo .gitignore, retrospectiva com
TODOs em `.specs/2026-07-22-codedm-bootstrap-retrospective.md`). Medscall: sync train adotado
(local, commit não pushado 34ad98f8) + plano de reestruturação em artefatos/planos/. Pulse
(~/Projetos/pessoal/pulse): probe P2 arquivado.
