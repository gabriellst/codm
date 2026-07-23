# GOAL — Noite CodeDM: backend alinhado, Fase 10, Tauri shell, melhorias do template e branch go-domain — início ao fim

> Este documento é o CONTRATO do goal noturno (founder, 2026-07-23). O `/goal` da sessão aponta
> para cá; em divergência entre resumo e este doc, este doc vence.

## Contexto e fontes da verdade (LEIA antes de agir)
- Repos: codedm=/Users/work/Desktop/Projetos/pessoal/codedm (main) ·
  template=/Users/work/Desktop/Projetos/pessoal/template-fullstack (Fase E commita lá; fora dela,
  intocado salvo bug crítico justificado).
- Ler na ordem: codedm/HANDOFF.md → .specs/codedm/ROADMAP.md (revisado 23-jul; pode estar
  UNCOMMITTED na working tree) → .plans/2026-07-22-phase10-foundation-terminal-extraction.md
  (RATIFICADO, Fork D já DEFINITIVO; pode estar uncommitted) → .specs/codedm/BUILD-LOG.md →
  .specs/codedm/union-slots-spec.md → .specs/codedm/2026-07-23-go-core-adequation-plan.md →
  .specs/codedm/2026-07-22-go-template-conformity-audit.md →
  .specs/codedm/2026-07-23-fork-d2-spike.md →
  template/.specs/2026-07-22-codedm-bootstrap-retrospective.md (+ adendo).
- Estado DERIVADO de `git log` + BUILD-LOG, nunca presumido.

## Trabalho possivelmente em voo (COLHER antes de iniciar novo)
- **flat-events** (codedm): journal em
  /Users/work/.claude/projects/-Users-work-Desktop-Projetos-pessoal-berzerk-club--claude-worktrees-nutrition-ownerid-migration/e1572899-7c20-4b07-afc3-d19c3b956098/subagents/workflows/wf_7be7cd20-947/journal.jsonl.
  Commits + entrada no BUILD-LOG presentes → colher o resultado; BELOW-BAR → aplicar os findings
  (builder fable + 2 juízes opus, fix loop). Workflow morto no meio → completar o escopo
  manualmente: envelope pre-work no emit-wire-go (padrão do piloto message_received),
  classificação SWAP-NOW vs BLOCKED-por-value-set dos 18 eventos, swaps com WIRE-IDENTITY
  (JSON marshalado byte-idêntico vs golden pré-swap), end-state de internal/shared/events =
  channel_event.go + BLOCKED com header, redis Register fail-loud, idempotência dos sync handlers.
- **Spike D2: RESOLVIDO — D2-PASS nos 2 critérios. NÃO re-rodar.** Receita de API/gotchas/
  embedding: .specs/codedm/2026-07-23-fork-d2-spike.md (+ scripts em .specs/codedm/spike-d2/).
  A wave 0 da Fase B consome essa receita verbatim; fallback D1 DESCARTADO (zero shim nvm).

## Regras de processo (invioláveis)
1. UM committer por repo por vez; paralelismo real só entre repos ou via worktree isolada.
2. Fase substantiva = workflow: builder fable + 2 juízes opus adversariais (bar ≥90 sem critical)
   + fix loop ≤2; ainda BELOW-BAR após fix extra → PARKEAR com findings completos no BUILD-LOG e
   seguir o resto da noite.
3. WIRE-IDENTITY absoluta em swap de evento; disciplina verbatim no Go (diff mecânico);
   **pkg/openapi CONGELADO** (lote 7 = decisão de markers do founder, de manhã);
   **schema-handoff FORA do escopo** (hazard vivo das colunas medscall — founder decide);
   **tenancy FORA**.
4. --no-verify só com gates verificados à mão e justificados no commit; pathspec staging
   (nunca `git add -A`); BUILD-LOG sempre; commits convencionais; `git mv` preserva história.
5. Decisão genuína de founder emergindo no meio → registrar em
   .specs/codedm/OVERNIGHT-BLOCKED.md + BUILD-LOG, pular SÓ aquela fatia, continuar.
   NUNCA inventar.
6. Tudo local — zero push/fetch remoto.

## Fase A — Fechar o alinhamento backend (codedm)
- Colher/fechar flat-events (acima) até verde-equivalente.
- Commitar os docs pendentes da working tree: ROADMAP.md revisado, ratificação dos forks no
  .plans, spike D2 (.specs/codedm/2026-07-23-fork-d2-spike.md + spike-d2/), este próprio goal doc
  e qualquer resíduo intencional.
- Se sobrar tempo APÓS as Fases B/C/E/F: consolidação de projectors 22→3 e consumer XREADGROUP
  real no redis_mediator (referência: template core). Senão, listar como pendência no report.

## Fase B — Fase 10: foundation runner (codedm, waves 0-6 do plano)
Executar o .plans com os forks RATIFICADOS (founder, 23-jul), literalmente:
- **A1**: seam alargado para o shape completo do engine whatscode (SessionMap/Store, write-queue,
  transcript-JSONL tail + resume, ClaudeBootSequence, união de 9 eventos) — cascata em
  RunTerminalSession/SSE/saga-6b mapeada conforme o plano.
- **Sessão por issue**: issueId é a identidade; chatId → mapeamento issue/thread.
- **ADOTAR o AgentStreamRegistry inteiro** (não o fold): re-chaveado por issueId, absorvendo o
  guard single-active-per-issue (invariante); TerminalSessionRegistry superseded.
- **D2 DEFINITIVO** (spike PASSOU): Bun.Terminal nativo conforme a receita do spike doc — zero
  run-under-Node, zero shim nvm.
- **Emendas (wave 0)**: StopKind += AUTH_REQUIRED (+ admissibilidade em StopResolution);
  idle_evicted domínio-only (sem wire); action_detected só frame SSE. Regen ts+go;
  check:generated verde. Toda emenda com linha `AMENDMENT:` no commit.
- Fonte read-only: whatscode-ref @ FETCH_HEAD via `git show` (78 arquivos; adaptação de imports
  conforme a seção do plano). Waves 1-6 na ordem de dependência do plano.
- Gates (matriz Step 5 do plano) + **smoke REAL**: runner extraído contra
  /Applications/cmux.app/Contents/Resources/bin/claude em dir scratch — transcript tail + frames +
  teardown limpo; skip HONESTO documentado se bloqueado.
- e2e: baseline 5 pass/2 skip NÃO regride (os 2 skips podem virar pass se o stub runner com modos
  de falha entrar naturalmente — não forçar).

## Fase C — Tauri shell / Fase 11 (worktree isolada do codedm, paralela à B)
- Worktree isolada (`git worktree add …`); merge no main ao FINAL, conflitos de root config
  resolvidos manualmente.
- Escopo: packages/app/{react,tauri}; seam lib/native (interface pickFolder/notify/badge/secrets/
  autostart; impls tauri.ts + browser.ts; seleção isTauri()); REGRA: @tauri-apps/* proibido fora
  de lib/native (lint rule + skill desktop-shell nova, flat); **EXPO REMOVIDO por completo**
  (pacote + skills + refs + WORKSPACES do template.config.ts + env registry via
  `bun env:generate`); sidecars daemon TS + gateway Go via externalBin com bootstrap
  health-check; direção tauri→react por build config (devUrl/frontendDist + nx dependsOn
  build-spa).
- Transporte desktop INTERINO = **HTTP local** (menor delta; ROADMAP autoriza — SQLite-WAL é
  assunto da branch go-domain). Documentar como reversível.
- Aceite: `tauri dev` (ou target equivalente) abre o console react renderizando; sidecars sobem
  com health-check verde; build de produção do shell compila (assinatura/updater FORA do escopo);
  lint do seam ativo; zero referências vivas ao expo; gates do repo verdes pós-merge.

## Fase E — Melhoria do template (PARALELO — repo template-fullstack, committer próprio)
- TODOs MECÂNICOS da retrospectiva na ordem de prioridade do doc (rail event-liveness, preflight
  SKIP-STALE nos evals, StampSelection.contexts, fresh-install gate, gate de branch/SHA no
  source-map, sanitize-map centralizado, promote --at-base); TODO que exigir decisão de founder →
  parkear no OVERNIGHT-REPORT, não inventar.
- Documentar a ORQUESTRAÇÃO DE AGENTES como doc do template (fases-workflow com builder+juízes
  adversariais, grade-loops com bar/critical, triagem de findings, BUILD-LOG como artefato,
  wire-identity/mutation-proof como padrões de gate) — esta própria noite como estudo de caso.
- Gates do template por lote (tsc, test:tooling, suites do create-template); workflow com juízes;
  commits convencionais.

## Fase F — Branch go-domain (codedm; SÓ após A+B+C mergeados e verdes no main)
- Criar branch `go-domain` a partir do main completo. **O PORTE DOS CONTEXTOS NÃO ENTRA**
  (gate: teste de fogo + GO do founder). Entram as FUNDAÇÕES:
- **.specs/codedm/go-domain-design.md** com as direções RATIFICADAS (founder, 23-jul): domínio
  todo em Go + SQLite; contextos PRÓPRIOS distintos do channel; **ExternalMediator de SQL**
  (Postgres | SQLite atrás de uma interface — outbox como transporte, dedup UNIQUE já provado =
  exactly-once; menos sidecars: Redis eliminado, alvo final = binário único); **schema segue no
  Drizzle em contracts; sqlc faz PULL pós-migration**. E as decisões ABERTAS para o grill do
  founder: dialeto pg→sqlite (pgSchema/pgEnum não existem em SQLite — prefixo+CHECK vs
  dual-dialect), notify (LISTEN/NOTIFY vs polling/WAL), semântica de consumer-groups em claims de
  outbox rows, migração de dados PGlite→SQLite.
- **PoC do pipeline** (na branch, escopo mínimo provável): 1 tabela Drizzle (dialeto sqlite,
  isolada na branch — NÃO tocar o schema pg real) → migration aplicada num .db scratch →
  sqlc generate → código Go tipado COMPILANDO + 1 query round-trip testada. Commitar com o
  BUILD-LOG da branch.
- **Esqueleto do SqlExternalMediator**: interface Go + as duas estratégias documentadas (stubs
  compiláveis, sem wiring em produção).
- Aceite: branch existe com spec + PoC verde + esqueleto compilando; main INTOCADO pela Fase F.

## Fase D — Fechamento
- Gates FULL no codedm main: root tsc · bun test (api-ts) · go build/vet/test nos DOIS módulos
  (api-go + `go -C core`) · contracts suite · test:tooling · bun sdk 2x (idempotente) · e2e ·
  boot smoke TS e Go · proxy smoke (gateway down → GATEWAY_UNAVAILABLE 502). Template: gates das
  mudanças da Fase E.
- BUILD-LOG por fase; ROADMAP.md refletindo o estado real de manhã;
  **.specs/codedm/OVERNIGHT-REPORT.md**: commits por fase, desvios justificados, PARKED com
  findings, decisões aguardando o founder (lote 7 markers · schema-handoff · transporte
  definitivo · fase dona do dual-write/UoW · teste de fogo · decisões abertas do
  go-domain-design).
- `git status` limpo nos repos tocados (artefatos .astro gerados podem ficar).

## Critérios de conclusão (o avaliador verifica TODOS)
1. flat-events colhido e verde-equivalente; docs pendentes commitados.
2. Fase 10 completa: waves 0-6 commitadas honrando os forks literalmente; check:generated verde;
   smoke real executado (ou skip honesto documentado); e2e sem regressão.
3. Tauri: worktree mergeada no main; app abre em tauri dev com sidecars health-checked; expo
   removido; seam + lint + skill entregues; transporte interino documentado.
4. Template: TODOs mecânicos commitados ou parkeados com justificativa; doc de orquestração
   existe e está referenciado; gates verdes.
5. Branch go-domain criada com design spec + PoC drizzle→sqlc verde + esqueleto do mediator
   compilando; main intocado pela Fase F.
6. Gates da Fase D todos verdes; OVERNIGHT-REPORT.md escrito; BUILD-LOG/ROADMAP atualizados;
   git limpo.
7. Zero escopo proibido tocado: pkg/openapi, schema-handoff, tenancy, porte dos contextos Go,
   push remoto.
