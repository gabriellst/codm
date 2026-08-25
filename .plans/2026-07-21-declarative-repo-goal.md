# GOAL PROMPT — Declarative Repo: executar até conclusão total

> Prompt de objetivo auto-suficiente. Use como instrução de continuação (mesma sessão, /loop ou
> sessão nova). Repo: `/Users/work/Desktop/Projetos/pessoal/template-fullstack`.

## Objetivo

Concluir TODAS as fases restantes de `.plans/2026-07-21-declarative-repo.md`, em sequência, até que
cada critério de conclusão abaixo esteja verde e commitado. Não parar em checkpoint intermediário:
ao fechar uma fase (gates verdes + commit próprio), iniciar a próxima imediatamente. Ao final,
rodar o crítico adversarial, corrigir achados, atualizar memória/plano e reportar com `result:`.

## Estado (2026-07-21, commits e36947c90…b39713c3c)

**FEITO:** F1a.1 env-registry (contrato workspace-first `consumers`, `.env.example` gerado, strip
derivado, rail ENV 6/6) · F1a.2 spine+CONTEXT_MAP declarado+R3 derivado (rail 7/7) · F1a.3 CMPL-02
importa o binding (24/24) · F1b batch 1: wiring-completeness (4/4) + `bun check:generated`.

## Fases restantes, em ordem

### F1b batch 2 — rails de coerência (independentes; paralelizáveis)
1. **i18n-coherence** (`tests/architecture/i18n-coherence.test.ts`): (a) estrutura de chaves
   `pt.json` == `en.json` (app react locales); (b) toda chave `t('…')`/`i18nPrefix` usada no app
   existe nos locales; (c) chave sem consumidor = console.warn (não fail). Fixture negativa.
2. **error-coherence**: para cada contexto da api-ts, os códigos das unions de `errors/index.ts`
   == chaves passadas a `registerErrorCodes` (extração por regex). Fixture negativa. (Tradução
   frontend: só warn se `errors.<code>` faltar nos locales — pode não existir padrão ainda; medir
   antes, gatear o que for real.)
3. **event-name-contract**: assert no `packages/contracts/codegen/emit-wire-ts.ts` (e go) — todo
   wire event name começa com `integration.` (o roteamento do outbox depende disso); + caso de
   teste no codegen.
4. **allowlist-liveness**: rail que valida TODA entry de allowlist/exemption contra a realidade —
   `slice-closure.allow.yaml` (hoje 100% stale: limpar as entries mortas), EXEMPTIONS dos
   discipline-tests, `POLICY_EXCEPTIONS`/`ANNOTATED_CYCLES` (já auto-gateados — não duplicar),
   exceções nomeadas do import-direction. Entry morta = FAIL nomeando-a.
5. **residue scan ampliado**: `product-residue.test.ts` passa a varrer `.claude/skills` +
   `examples/` (headers CONTEXT-ORIGIN/proveniência exempt). ANTES: corrigir os hits reais que vão
   acender (MULTI_STORE em skills storybook/store, etc. — corrigir, não exemptar).

### F1a.4 — taxonomia única (refactor review/tooling)
- `.claude/registry.yaml` ganha `scope:` por cc-bp; `CC_BP_SCOPE` (review.ts) morre — yaml é fonte.
- `scripts/lib/repo-model.ts` (novo): `detectLang` ÚNICO derivando de `REPO.workspaces`
  (lang é propriedade do workspace — CLAUDE.md §5); universo LANGS = langs dos workspaces;
  loaders do registry.yaml. review.ts + classify-edit-core.ts + graph classifier consomem —
  as cópias locais morrem (incl. a rota `.rs`→rust morta).
- `CLASSIFICATION_RULES` (review.ts) deriva de registry.yaml `components[*].patterns`.
- Variant-skills: `existsSync('.claude/skills/<skill>/<lang>/registry.yaml')` — listas duplicadas morrem.
- Gate: teste que compara review.ts/classify-edit outputs em amostra de paths (paridade pós-refactor).

### F1a.5 residual — create-template 100% derivado
- `Workspace` ganha `nxProject`; `BACKEND_PROJECT`/`FRONTEND_PROJECT` derivam. Smoke `--help` + um
  stamping dry-run em tmp (`--yes --skip-install`) com verificação da árvore resultante.

### F1a.6 — DI registry declarativo
- Helper `expandBindings` no core (`{ token, mock, real, integration? }` → 3 envs; `mock: null` =
  ausência declarada). Codemod nos 7 registries. Divergências existentes viram declarações
  explícitas. Gates: tsc + full suite + rails.

### F2 — example pipeline
1. **Granularidade de patch**: `scripts/skill-evals/run.ts` — um `.patch` por (stamp,task)
   (hoje re-runs concatenam; blocker da promoção).
2. **`bun examples:promote`**: task PERFECT no docTreeHash atual → aplica patch em worktree
   scratch → extrai arquivos dos globs dos graders → gera candidato `examples/pairs/<task-id>/`
   (WANT.md = prompt da task + proveniência; GOT/ com headers stamp+docTreeHash+model; NOTES.md
   auto-rascunhado). Sai FILA DE CANDIDATOS — promoção final é aprovação em lote do usuário
   (decisão 1). NÃO promover automaticamente.
3. **Skills → exemplos**: campo `examples:` no registry.yaml das skills (paths p/ `examples/`);
   gate valida path existe. Migrar canonical_snippets stale (HD-14) para refs onde houver exemplo.
4. **Harvest Go do fork clínico**: fonte `<fork-clinico>/monorepo/
   packages/channel` (291 arquivos, pin estável). 2-3 arquivos exemplares POR citizen (entities,
   projections, projectors, handlers internal vs integration, usecases, controllers incl. oneOf,
   events, services, SSE) → `examples/go/<citizen>/` verbatim com header CONTEXT-ORIGIN
   (repo@commit + data) — estáticos (decisão 2). Ligar às 16 skills Go via `examples:`.

### Fecho
- Crítico adversarial (workflow, 3 lentes: staleness, wiring, fresh-clone) sobre TODO o trabalho
  da iniciativa; corrigir achados reais; re-rodar gates.
- Atualizar `.plans/2026-07-21-declarative-repo.md` (Status: Done + realidade), memória
  (`detemplate-reorg-status` ou nova), e reportar com `result:`.

## Regras de execução (invioláveis)

1. **CLAUDE.md Non-Negotiable §5** em tudo: contrato antes de código; linguagem first-class no
   workspace; consumo = relação declarada; if de edge-case sobre convenção = erro de MODELAGEM.
2. Cada fase: gates reproduzidos (não assumidos) + commit próprio. Gates mínimos:
   `tsc -p tsconfig.json` (TESTES INCLUÍDOS) = 0 · full suite 0 fail · rails verdes · eslint 0 ·
   `bun env:generate --check` · `bun check:generated` quando tocar codegen/SDK.
3. Rail novo = molde `console-discipline` (scan + assert + mensagem que ensina + fixture negativa).
4. Canon novo = gate no MESMO commit.
5. F3 (fork clínico-as-child) NÃO está no escopo — só o harvest read-only de exemplos Go.
6. Deleções em massa: pedir autorização explícita do usuário (classifier); `git rm` (reversível).
7. Commits com `--no-verify` SÓ com gates reproduzidos manualmente (hook flaky em diffs grandes).

## Gotchas operacionais (aprendidos; não redescobrir)

zsh não faz word-split de `$VAR` (usar xargs) · `drizzle:generate` é interativo em rename de schema
(evitar; squash não pergunta) · nx cache mascara quebra pós-regen (`--skip-nx-cache` ou tocar
consumer) · `tsconfig.build` EXCLUI testes (sempre `tsc -p tsconfig.json`) · perl com `@`/`$` em
strings = interpolação acidental (usar python para edits com esses chars) · subagent Fable estoura
quota em batch grande (sessão Opus/Fable-main ok) · agente half-died deixa edit parcial: reverter e
refazer · `import { X } from` inserido por sed pode cair DENTRO de import multilinha (usar Edit).
