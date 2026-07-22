# Agentic Coding — System Reference

> Como esse codebase é desenvolvido por humanos + agentes de IA
> trabalhando juntos, ponta-a-ponta: do raciocínio inicial à entrega
> do PR. Documento canônico, lido por todos que vão usar ou estender
> o sistema.

---

## 1. Propósito

Reduzir intervenção humana repetitiva em desenvolvimento de software
sem perder qualidade. Concretamente: transformar "feature request"
em "PR review-ready" com o mínimo possível de toques manuais,
mantendo o padrão arquitetural da monorepo (DDD, vertical slicing,
contract-first).

Quatro KPIs declarados:

| KPI | Direção | Significa |
|---|---|---|
| **Size** | ↑ | maiores blocos de trabalho antes de pedir intervenção (planos maiores, tasks maiores, mais arquivos por task) |
| **Attempts** | ↓ | menos iterações de fix-loop por task, menos retentativas, menos validate-plan failures |
| **Streak** | ↑ | mais tasks passando review na primeira tentativa, mais plans validando limpo |
| **Presence** | ↓ | menos `AskUserQuestion`, menos edits manuais no plano, menos escalations |

Não é "removendo humano". É "removendo trabalho que não exige humano". O humano fica na **decisão de produto** (`/brainstorm`), no **gate de aprovação** (após `/plan`, durante `/learnings`), e na **revisão final** (PR).

---

## 2. Princípios

### 2.1 Discipline na saída, criatividade no processo

`/brainstorm` é thought-partner, não estenógrafo. Pesquisa indústria
(WebSearch / WebFetch), levanta angles que o prompter não pediu, e
DESAFIA framings. O formato da spec é rígido pra que `/plan` consuma
deterministicamente, mas o processo conversacional é livre.

### 2.2 Spec é negócio; /plan é arquitetura

A spec descreve comportamento (User Stories + Decisions + Acceptance
Criteria) em linguagem de domínio. `/plan` lê a spec + consulta o
code-graph + lê os SKILL.md das skills candidatas + lê 1 sibling por
kind no contexto relevante, e deriva a lista de artefatos diretamente.
Single source of truth pra mapeamento: `/plan` Phase 1 (Explore).

### 2.3 Vertical slicing (Matt Pocock TDD)

Cada Task = uma observable behavior em RED→GREEN end-to-end. NUNCA:
"T1 entity, T2 repo, T3 usecase, T4 controller" (horizontal slicing
— testes desconectados do comportamento, falsa sensação de progresso).
SEMPRE: "T1 = Story 1 ponta-a-ponta, tocando todos os layers que ela
exige".

### 2.4 Phase 0 contract → Phase 1 behavior → Phase 2 QA

`/task-breakdown` impõe três phases:

- **Phase 0** (horizontal, serial): bounded-context + errors + enums
  + schemas + mocked controllers + SDK regen. Trava o contrato pra
  vertical slices fan-out sem coordenação.
- **Phase 1** (vertical, parallel where files disjoint): Tasks
  Behavior-shaped, cada uma um RED→GREEN.
- **Phase 2** (horizontal, serial): contract drift + E2E full + final
  review.

### 2.5 Implementer ≠ Reviewer

Quem escreve não revisa o que escreveu. `/build` dispatcha um sub-agent
implementer (backend-developer/sonnet, frontend-developer/sonnet, etc.)
para escrever; depois chama `scripts/review.ts --model haiku` (sessão
separada, modelo barato) para revisar. Em casos de judgment-heavy review,
o `code-reviewer` agent é dispatched separadamente.

### 2.6 /build owns git

Implementers modificam arquivos. **/build commita.** Sempre 1 commit
por Task, depois que o review passou. Implementer nunca chama `git
commit`. Mantém histórico limpo e revertable.

### 2.6b /build é orientado por `/goal`

`/build` não roda um pipeline linear de phases. Após pre-flight,
ele faz `/goal <condition>` onde a condition encoda TODOS os critérios
de completude (Tasks committed + tsc + lint + tests + e2e + review +
ACs + git clean). O evaluator (haiku, after each turn) checa a
condition; enquanto não satisfeita, Claude continua trabalhando com
a "reason" do evaluator como guidance. Ao satisfazer, o goal limpa
automático. **lint/tsc/tests não são "feitos no fim" — são parte da
condition desde o turn 2.**

### 2.7 Audit log captura tudo

Toda invocação de tool (Bash, Edit, Agent, Skill, AskUserQuestion)
é registrada em `.claude/audit/<date>__<session>.jsonl` com parent
session linkage. `/learnings` lê esses logs pra computar KPIs e
detectar patterns.

### 2.8 Self-improving via /learnings

Semanalmente (ou após ~10 plans), `/learnings`:
1. Computa KPIs do window
2. Detecta patterns em 7 categorias (BPs violadas, path mismatches,
   spec ambiguity, DDD reversals, skill confusion, **conventions
   obsoletas** ⚡, friction nos comandos)
3. Propõe edits concretos (SKILL.md, AGENT.md, registry.yaml)
4. **User aprova cada proposta** (gate de safety)
5. Aplica + commita (1 commit por proposta, revertable)

A categoria 2.6 (conventions obsoletas) é a inversion check: "o que
achávamos certo que não é mais". Sem ela o KB infla. Mandatória.

---

## 3. O Pipeline (6 comandos human-facing)

```
┌──────────────┐
│ /brainstorm  │ idéia → spec (negócio)
│              │ Phases: 1A codebase context · 1B world research ·
│              │ 2 unforeseen angles · 3 questions 1-at-a-time ·
│              │ 4 propose 2+ approaches · 5 walk sections ·
│              │ 6 write file · 7 self-review (SR-1..SR-11) ·
│              │ 8 user approval · 9 handoff
│              │ Output: .specs/<date>-<slug>-design.md
└──────┬───────┘
       ▼
┌──────────────┐
│ /plan        │ spec → plan executável
│              │ Phase 1 Explore (graph + sibling reads + skill reads) ·
│              │ 2 File Structure (responsibility per file) ·
│              │ 3 Tasks (inlined code + sibling reference + TDD) ·
│              │ 4 Self-review (AC coverage + determinism check)
│              │ Output: .plans/<date>-<slug>.md
└──────┬───────┘
       ▼
┌──────────────┐
│ /build       │ plan → commits + tests green + lint clean + tsc clean
│              │ Step 1 pre-flight (validate-plan + parse-plan + waves) ·
│              │ Step 2 /goal <condition> ← Claude works across turns ·
│              │ Step 3 work toward goal (loop driven by haiku evaluator) ·
│              │ Step 4 /goal clear + handoff
│              │ Goal condition encodes 8 criteria:
│              │   tasks committed · tsc=0 · lint=0 · tests pass · e2e pass ·
│              │   review.ts --pr 0 critical · every AC mapped · git clean
│              │ Output: git commits + ALL gates green
└──────┬───────┘
       ▼
┌──────────────┐
│ /review      │ manual review on demand (humano ou pre-PR)
│ (optional)   │ wrapper: bun scripts/review.ts --model haiku --parallel 4
└──────┬───────┘
       ▼
┌──────────────┐
│ /pr          │ branch → GitHub PR
│              │ Phase 0 pre-flight · 1 derive title/body do spec+plan ·
│              │ 2 mcp__github__create_pull_request · 3 handoff
│              │ (asks: watch PR?) · 4 subscribe + autofix or stop
└──────────────┘

═══════════════ feedback loop ═══════════════

┌──────────────┐
│ /learnings   │ semanal/após-N-plans → KPI report + proposals
│              │ Phase 0 window · 1 compute 4 KPIs · 2 pattern detect ·
│              │ 3 propose edits · 4 user approve · 5 apply ·
│              │ 6 snapshot+commit · 7 report · 8 handoff
│              │ Output: docs/learnings/<date>-learnings.md +
│              │ edits em .claude/skills/** | agents/** | commands/**
└──────────────┘
```

---

## 4. Mecanismos

### 4.1 Slash commands (`.claude/commands/*.md`)

Markdown com frontmatter (name, description, argument-hint) e
instruções que Claude segue quando o user tipa `/<name>`. Não têm
modelo próprio — herdam da sessão do caller. Atuam como **interface**
pro user e como **orquestrador** que dispara skills/agents/scripts.

### 4.2 Skills (`.claude/skills/*/SKILL.md`)

Knowledge loadable via `Skill('<name>')`. Carregam conteúdo no
contexto do agente que invoca. Skills internas usadas pelo pipeline:

- `/task-breakdown` — invocada por /plan SOMENTE quando o plan cruza
  ≥3 bounded contexts ou produz ≥10 artefatos. Phase-Lane planner
  (phase 0/1/2/3, wave label, classification, feature-type calibration).
  Para plans menores, /plan inline as heuristicas.
- `/ddd-modeling` — escape hatch pra decisões DDD ambíguas (entity vs
  value-object, aggregate boundary, novo contexto vs estender).
- Composition patterns (CRUD, paginated read, background reaction,
  saga, dashboard, wizard, greenfield) vivem nos SKILL.md das skills
  centrais (`/usecase`, `/query`, `/handler`, `/event`, `/form`,
  `/bounded-context`). Não há catálogo centralizado — single source
  of truth por skill.

Mais 20+ skills de artifact (`/entity`, `/usecase`, `/controller`,
`/route`, `/component`, etc.) que os implementer agents invocam pra
seguir o canonical pattern.

### 4.3 Agents (`.claude/agents/<name>/AGENT.md`)

Sub-personas dispatched via `Agent` tool. Cada um declara:

- `model:` — modelo Claude default (opus | sonnet | haiku)
- `skills:` — quais skills esse agente sabe invocar
- `dependencies:` — outros agentes que precisa antes
- `outputs:` — kinds de artefato que produz

**Cost lever via model selection:**

| Agente | Default | Por quê |
|---|---|---|
| `software-architect` | opus | decisões irreversíveis, DDD boundaries |
| `backend-developer` | sonnet | TDD + lógica de domínio |
| `frontend-developer` | sonnet | mesmo |
| `database-architect` | sonnet | schema mal feito é caro |
| `qa-tester` | sonnet | lê código + sintetiza E2E |
| `product-owner` | sonnet | story refinement |
| `code-reviewer` | haiku | scope limitado, BPs determinísticos |
| `project-manager` | haiku | orquestração mecânica |

Override por Task: `/plan` pode declarar `**Model:** opus` ou
`**Reviewer-Model:** sonnet` em Tasks específicas (ex: migração
em tabela crítica).

### 4.4 Code-graph (`scripts/graph/cli/`)

Extrator estático que constrói um grafo do código: ~5800 nodes
(entities, usecases, controllers, schemas, ...), ~6900 edges. CLI:

```bash
bun scripts/graph/cli/index.ts build               # rebuild
bun scripts/graph/cli/index.ts file <path>         # node at path + blast radius
bun scripts/graph/cli/index.ts plan <spec>         # graph snapshot para /plan Phase 0
bun scripts/graph/cli/index.ts validate-plan <plan> # PR-18..PR-26 checks
bun scripts/graph/cli/index.ts parse-plan <plan>   # plan AST p/ /build
bun scripts/graph/cli/index.ts stats               # node/edge counts
```

O grafo é o **deterministic source of truth** sobre o codebase. Plans
referenciam paths que vêm do grafo, não da memória. Quando humano
escreve plan manualmente, **deve** rodar `graph file <sibling>` pra
herdar canonical path patterns (nested repositories, plural ui usecases,
route groups, etc.).

### 4.5 Review engine (`scripts/review.ts`)

Engine AI de review. Compila registry.yaml de cada skill em checklist
compacto, spawn `claude` CLI subprocesses em paralelo (LEAN_FLAGS
detached), retorna findings JSON. Defaults para o /review command:
`--model haiku --parallel 4 --print`. Aceita shortnames (haiku /
sonnet / opus) expandidos pros model IDs reais (claude-haiku-4-5...).

```bash
bun scripts/review.ts                              # diff atual
bun scripts/review.ts --staged                     # só staged
bun scripts/review.ts --pr --base dev              # diff vs origin/dev
bun scripts/review.ts --all --backend              # workspace audit
bun scripts/review.ts file1.ts file2.ts            # paths específicos
```

### 4.6 Audit log (`.claude/audit/<date>__<session>.jsonl`)

Hook em `.claude/hooks/audit-log.sh` registrado em `.claude/settings.json`
captura **todos** os eventos do Claude Code (UserPromptSubmit, PreToolUse,
PostToolUse, SubagentStop, Stop, SessionStart). Append-only JSONL. 1
arquivo por sessão. Gitignored. Audit markers via `<!-- audit: command=/build
task="T<N>" plan="<path>" -->` no prompt linkam parent↔child sessions.

`/learnings` lê esses logs pra computar Presence (AskUserQuestion
count), Attempts (re-dispatches), Streak (consecutive clean Tasks),
Size (durations).

### 4.7 Plan validator (validate-plan CLI)

Rules PR-1..PR-26 enforced. Crucial subset:

- **PR-18** — paths em `filesWrites` marcados modify devem existir
  no graph OU no disco
- **PR-19** — `depends_on` entre Tasks deve casar com graph upstream
- **PR-20** — Task.skills deve casar com skill da Domain Mapping
  (test files skipped)
- **PR-21** — modify Tasks devem cobrir transitive downstream
- **PR-26** — Tasks com steps mas sem filesWrites são rejeitadas
  (/build não conseguiria commitar)

Tasks marcadas `**Status:** Done` são puladas em todos os checks.

### 4.8 Registries (`.claude/registry.yaml` + `.claude/skills/*/registry.yaml`)

Index central + per-skill BPs / patterns / depends_on. Review.ts
compila esses YAMLs em checklists pros prompts da review.

---

## 5. Estados de cada artefato

### Spec
```
Draft → Approved → (consumed by /plan)
```
Status no frontmatter da spec. `/brainstorm` produz Draft; user
edita pra Approved. `/plan` exige Approved.

### Plan
```
Pending Tasks → /build executa → Done Tasks (status: done)
```
Tasks ganham `**Status:** Done` quando completadas. validate-plan
pula done; /build não dispatcha done.

### PR
```
Branch → /pr → PR open → CI/review activity → merge
```
`/pr` cria; subscribe_pr_activity (opcional) faz follow-up de CI
failures e review comments.

---

## 6. Fluxo concreto — "como eu uso isso?"

### Caso 1: Nova feature

```bash
# 1. Brainstorm — produz spec
/brainstorm "Médico escreve notas livres na consulta"
  → interaction: research industry patterns, unforeseen angles,
                 questions one at a time, walk sections
  → output: .specs/2026-05-13-appointment-notes-design.md (Draft)

# 2. Marca Approved manualmente (status no frontmatter)
sed -i 's/Status:.*Draft/Status:** Approved/' .specs/...

# 3. Plan — gera plano executável
/plan .specs/2026-05-13-appointment-notes-design.md
  → Phase 1 Explore (graph snapshot + sibling reads + skill reads)
  → Phase 2 File Structure (responsibility per file, surface to user)
  → Phase 3 Tasks (inlined code + TDD outer/inner cycles)
  → Phase 4 Self-review (PR-1..PR-N) + AC coverage check
  → output: .plans/2026-05-13-appointment-notes.md

# 4. Validate
bun scripts/graph/cli/index.ts validate-plan .plans/...
  → OK: passes PR-18..21

# 5. Build — executa o plano
/build .plans/2026-05-13-appointment-notes.md
  → Phase 0 pre-flight (validate + parse + waves + filesWrites disjoint)
  → For each wave: parallel implementer dispatches → review.ts (haiku)
                  → fix loop (max 3) → commit per Task
  → Final Validation: bun tsc / lint / test affected / e2e

# 6. PR — cria GitHub PR
/pr
  → derives title from spec
  → derives body: Summary + Spec link + Plan link + Commits +
                  Test Plan (AC → test path) + Audit summary
  → mcp__github__create_pull_request
  → asks: watch PR? subscribe to CI/review events?
```

### Caso 2: Bug fix isolado

```bash
# Pequenas mudanças NÃO precisam de spec/plan formal.
# Direto: edita, commita, /pr (que cai no fallback "no spec" mode).

git checkout -b fix/some-issue
# ... edits ...
/review                     # sanity check antes do commit
git commit -m "fix: ..."
git push -u origin fix/some-issue
/pr                         # PR sem spec/plan; usa commit summaries
```

### Caso 3: Refactor

```bash
# Refactors com design choices → /brainstorm "minimal" (foco só em
# Decisions + Anchors + Out of Scope), depois /plan normal.
# Refactors triviais (rename, mover arquivo): pule /brainstorm e
# /plan, edite direto e commit.

/brainstorm "refactor: extrair PricingService"
  → spec curta (1-2 decisões + anchors + out-of-scope)
  → /plan derive os artefatos via Phase 1 Explore como sempre
```

### Caso 4: Semanal — feedback loop

```bash
/learnings --window 7d
  → Phase 1 KPIs computados (vs último snapshot)
  → Phase 2 patterns detectados (7 categorias)
  → Phase 3 proposals geradas
  → Phase 4 user aprova cada uma
  → Phase 5 edits aplicados (1 commit por proposal)
  → Phase 7 report em docs/learnings/<date>-learnings.md

# Próxima sessão de /brainstorm ou /plan herda o KB atualizado.
# Métrica esperada: Size↑, Attempts↓, Streak↑, Presence↓.
```

---

## 7. Como estender

### Adicionar uma skill nova

1. `.claude/skills/<new-skill>/SKILL.md` com WHAT/WHEN/WHEN NOT/WHERE
   + Pattern e BPs em sibling `registry.yaml`
2. Adicionar entrada no `.claude/registry.yaml` global
3. (Opcional) Mencionar a skill nos AGENT.md de agentes que a usam
4. Se for um novo tipo de composition pattern, adicionar como seção
   no SKILL.md da skill central (ex: novo pattern de "wizard" vai em
   `form/SKILL.md`). Não criar catálogo separado.

### Adicionar um agent novo

1. `.claude/agents/<name>/AGENT.md` com frontmatter:
   ```yaml
   name: <name>
   description: ...
   role: <name>
   model: opus | sonnet | haiku
   skills: [...]
   dependencies: [...]
   outputs: [...]
   ```
2. Atualizar `.claude/agents/README.md` com tier + rationale
3. /build automaticamente pode dispatchar quando uma Task no plano
   tem `**Agent:** <name>`

### Adicionar um slash command

1. `.claude/commands/<name>.md` com frontmatter + instruções
2. Claude Code auto-descobre na próxima sessão
3. (Recomendado) Cross-reference no `AGENTIC_CODING.md` (este doc)
   se for parte do pipeline canônico

### Modificar o graph extractor

Em `scripts/graph/`. Adicionar novo kind de node, novo edge type,
nova adapter de linguagem (atualmente TS + Go channel).

---

## 8. Anti-patterns do sistema (consolidado)

| Onde | Anti-pattern |
|---|---|
| /brainstorm | Stenography (aceitar framing sem desafiar) |
| /brainstorm | Skipping Phase 1B web research em features com padrões conhecidos |
| /brainstorm | Forçar 2-3 approaches quando reality tem mais (ou só uma) |
| Spec | Nomear architectural artifacts (entity, usecase, event) nas Decisions |
| /plan | Horizontal slicing (1 Task per artifact) ← anti-pattern do Matt Pocock |
| /plan | Nomear Tasks por artefato em vez de por behavior |
| /plan | Treating Phase 1 (Domain Mapping) como mecânico |
| /plan | Skipping Phase 2 user validation |
| /plan | Path from memory ao invés de `graph file <sibling>` |
| Plan Format | Prose no Name column do Domain Mapping (use AC column) |
| /task-breakdown | Horizontal Tasks (todas as entities, depois todos os repos…) |
| /build | Implementer commitando (build owns git) |
| /build | Bypassar pre-commit hook sem autorização explícita |
| /build | Auto-fix inline (sempre re-dispatch implementer com findings) |
| /build | Parallelizar Tasks com filesWrites overlapping |
| /review | Auto-fix (sempre re-dispatch implementer) |
| /review | Override do haiku sem justificativa |
| /pr | Auto-subscribe sem perguntar |
| /pr | PR body com claude.ai/code/session URLs (vão em commit msg só) |
| /pr | Modificar código de dentro do /pr |
| /learnings | Auto-apply sem approval gate |
| /learnings | Single-incident pattern (threshold 3+) |
| /learnings | Só ADD; nunca RETIRE (inversion check 2.6 é mandatória) |
| /learnings | Editar product code (knowledge base only) |

---

## 9. Estado atual

### Implementado
- 6 slash commands: `/brainstorm` `/plan` `/build` `/review` `/learnings` `/pr`
- 2 internal pipeline skills: `/task-breakdown` (threshold-gated) `/ddd-modeling`
- ~30+ artifact skills (entity, usecase, controller, etc.)
- 8 agents com model selection
- Code-graph CLI: build, file, plan, validate-plan, parse-plan, stats, ...
- Review engine (`scripts/review.ts`) com haiku default
- Audit log hook (coletando desde a primeira sessão de bootstrap)
- SDK split (channel/api gerados separadamente, ciclo quebrado)
- 25+ lições absorvidas em 5 rodadas de validation
- 2 plans executáveis (1 já executado: bootstrap; 1 ready: appointment-notes)

### Deferido (não-bloqueante; quando fizer sentido)
- **Agent CAPABILITIES manifest refinement** — formalizar
  `allowed_tools`, `max_tool_calls`, `escalation_when` nos AGENT.md.
  Quando: ao adicionar agentes novos OU quando /learnings sinalizar
  drift.
- **Tier 3 batch judge** — review cross-Task de uma wave inteira.
  Quando: depois de rodar /build em produção e identificar coherence
  issues que Tier 1+2 não pegam.
- **`bun cli audit` / `bun cli doctor`** — CLIs pra query agregada
  de audit logs e environment sanity check.
- **`/install` + `/prime`** — comandos de bootstrap pra onboarding
  de novos devs. Quando: 2º humano contributing.
- **Execução real de /build** — primeiro experimento agentico.
  Quando: ambiente arrumado (SDK channel bootstrap automatizado,
  pre-commit hook usando nx affected).

### Próximos passos naturais
1. Rodar `/brainstorm` numa feature pequena pra validar end-to-end
2. Rodar `/build --dry-run` num plan gerado pra validar Phase 0
3. Primeiro execução real de `/build` em algo controlado (1-Task plan)
4. Primeiro `/learnings` quando houver ~10 sessões de audit data
5. Primeiro `/pr` automatizado

---

## 10. Referências

| Documento | O que é |
|---|---|
| `.claude/commands/brainstorm.md` | Spec creation (process: research + thought-partner) |
| `.claude/commands/plan.md` | Plan creation (12 phases, vertical slicing) |
| `.claude/commands/build.md` | Plan execution (dispatch + review loop + commit) |
| `.claude/commands/review.md` | Manual review wrapper |
| `.claude/commands/learnings.md` | Feedback loop + KPIs |
| `.claude/commands/pr.md` | GitHub PR creation |
| `.claude/skills/task-breakdown/SKILL.md` | Phase-Lane planner (threshold-gated) |
| `.claude/skills/ddd-modeling/SKILL.md` | DDD heuristics (escape hatch) |
| `.claude/skills/<artifact>/SKILL.md` | Per-artifact canonical structure + composition patterns |
| `.claude/agents/README.md` | Agent catalog + model selection table |
| `.claude/agents/<name>/AGENT.md` | Per-agent capability manifest |
| `scripts/graph/cli/index.ts` | Code-graph extractor + plan validator |
| `scripts/review.ts` | AI review engine |
| `.claude/hooks/audit-log.sh` | Audit hook (registered in settings.json) |
| `.specs/` | Approved business specs |
| `.plans/` | Executable plans |
| `docs/learnings/` | /learnings reports (historical) |
| `CLAUDE.md` | Project conventions + event architecture |
| `docs/BACKEND.md` `docs/FRONTEND.md` | Architecture guides |

---

## 11. Filosofia (1 parágrafo)

O objetivo não é "agente que faz tudo sozinho". É **um sistema onde
humanos e agentes têm papéis bem definidos, complementares, e
mensurados**. O humano decide produto e arquitetura macro; o agente
faz o trabalho repetitivo de implementação; um terceiro agente
(barato) revisa; e um loop semanal (/learnings) absorve as lições
de volta no sistema. KPIs (Size↑, Attempts↓, Streak↑, Presence↓)
são o termômetro. Se o sistema funciona, mais features são entregues
por menos atenção humana, sem perder qualidade — e o sistema fica
mais autônomo a cada rodada.
