# Upstream-prep — des-marcação do core e fronteiras de stamping — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** O codm fica pronto para doar os cores + maquinário de teste ao template sem nenhum literal de produto/marca nos mecanismos — com poda de givens dirigida por manifesto e gates que provam a limpeza.

**Architecture:** Oito comportamentos sobre a spec Approved (`.specs/2026-08-11-upstream-prep-design.md`, v2 verificada): 3 des-marcações pontuais (env key, lane de outbox, OPERATOR_ID), a separação schema Go mecanismo×conteúdo, o contrato given→contexto no manifesto, spikes fora do diretório portável, o resíduo marca-legada, e a varredura de marca com o rail Go ampliado por último (ele é o gate do AC-1). Todos os endereços foram verificados contra a árvore em 2026-08-11 (wf_9144bb02) — linha citada = linha real.

**Tech Stack:** TypeScript, Bun, Go, sqlc, fx, Drizzle (contracts), template.config.ts

**Spec:** .specs/2026-08-11-upstream-prep-design.md
**Tasks:** 8
**Estimated minutes:** 175

---

## Task T1: A env key do agent sai do kernel (Decision 1)

**Files to write:**
- Modify: `packages/api/typescript/core/src/utils/Config.ts` — remove `CODM_AGENT_INACTIVITY_MS` do RawEnvSchema (linha 103)
- Create: `packages/api/typescript/src/agent/config/ProductEnvSchema.ts` — (ou o arquivo de product-env que o contexto agent já use, se existir — verificar `src/shared/config/ProductConfig.ts` citado no header do Config.ts:8 e seguir o padrão de lá)
- Modify: `template.config.ts` — linha 517: flip `schema: 'kernel'` → `schema: 'product'` na entry `CODM_AGENT_INACTIVITY_MS`
- Modify: `.env.example` — linha 42: a linha comentada acompanha a seção de produto
- Modify: `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts` — linha 152: a leitura passa a vir do product-config do contexto agent

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (config/schema de contexto)
**Depends on:** (none)

### Step T1.1 — RED

`grep -n "CODM_AGENT_INACTIVITY_MS" packages/api/typescript/core/src/utils/Config.ts` → 1 (kernel contaminado).

### Step T1.2 — Mover a key seguindo o padrão de ProductConfig

Ler `src/shared/config/ProductConfig.ts` (apontado por `Config.ts:8`) e mover a key para o
mecanismo de product-env do contexto agent conforme o padrão existente — NÃO inventar um
mecanismo novo se um já existe. O consumidor único em runtime (`ClaudeAgentRunner.ts:152`)
troca `Config.env.CODM_AGENT_INACTIVITY_MS` pela leitura do product-config.

### Step T1.3 — Gate

```bash
grep -c "CODM_AGENT_INACTIVITY_MS" packages/api/typescript/core/src/utils/Config.ts   # 0
grep -n "schema: 'product'" template.config.ts | grep -c INACTIVITY                    # (entry flipada — conferir a linha 517)
cd packages/api/typescript && bun test tests/architecture/env-model.test.ts tests/architecture/process-env.test.ts   # verdes (o trio da Decision 12)
bun test src/agent 2>&1 | tail -3   # testes do contexto agent verdes
```

### Step T1.4 — Commit

`git add` específico + commit `feat(config): CODM_AGENT_INACTIVITY_MS sai do kernel — product-env do agent (upstream-prep T1)`.

---

## Task T2: A lane de outbox vira parâmetro declarado (Decision 2)

**Files to write:**
- Modify: `packages/api/go/core/config/config.go` — `Service` (linha 47) ganha campo `OutboxSource` (e o par para a lane de integração, se o desenho pedir dois campos — decidir por UM campo por lane nomeada, não um mapa)
- Modify: `packages/api/go/core/services/outbox/outbox.go` — linha 41: a const `OutboxSource` morre; o valor flui da config
- Modify: `packages/api/go/core/module.go` — linha 35: `integrationOutboxSource` idem (usada na :220); o fio de DI entrega os valores do `Service` ao pacote outbox
- Modify: `packages/api/go/core/services/outbox/sqlite_outbox_dispatcher.go` — linha 68: recebe a lane em vez de ler const de pacote
- Modify: `packages/api/go/core/repositories/sqlite_domain_event_repository.go` — linhas 69 e 87: idem
- Modify: `packages/api/go/internal/channel/config.go` — linha 16: o literal `config.Service{...}` do serviço declara `OutboxSource: wire.OutboxSourcegateway` (e a integração conforme uso real)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (core Go)
**Depends on:** (none)

### Step T2.1 — RED

`grep -n "wire.OutboxSourcegateway" packages/api/go/core/` → 2 hits no core (outbox.go:41 via const; conferir). Depois do fix: 0 no core, 1 no serviço.

### Step T2.2 — Implementar

Não conflar com `EventGroupIDDefault` (`"codm-gateway"` ≠ lane `"gateway"` — doc de config.go:57-59
precisa de ajuste de prosa junto). O tipo do campo é `wire.OutboxSource` (enum de contrato) — a
escolha continua type-safe, só muda QUEM escolhe.

### Step T2.3 — Gate

```bash
cd packages/api/go && grep -rn "OutboxSourcegateway\|OutboxSourceintegration" core/ | grep -v "_test" | wc -l   # 0 (fora de testes)
go build ./... && go test ./core/... 2>&1 | tail -3
go test ./internal/channel/... 2>&1 | tail -2   # o serviço declara e tudo segue verde
```

### Step T2.4 — Commit

---

## Task T3: OPERATOR_ID deixa de ser default de identidade no maquinário (Decision 3)

**Files to write:**
- Modify: `packages/api/typescript/tests/support/testing.ts` — linha 166: o fallback `?? OPERATOR_ID` do shell portável passa a ser responsabilidade da declaração do produto (o boot recebe o ownerId do manifesto/stamp; sem declaração → erro claro, não default de marca)
- Modify: `packages/api/typescript/tests/support/given/workspaces.ts` — linha 18: `overrides.ownerId ?? testBed.ownerId`
- Modify: `packages/api/typescript/tests/support/given/threads.ts` — linha 41: idem
- Modify: `packages/api/typescript/tests/support/given/channels.ts` — linha 48: idem
- Modify: `packages/api/typescript/tests/support/given/stops.ts` — linha 26: idem
- Modify: `packages/api/typescript/tests/support/given/issues.ts` — linha 24: idem
- Modify: `packages/api/typescript/tests/support/given/gateway.ts` — linha 69: idem

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (test machinery)
**Depends on:** (none)

### Step T3.1 — RED

`grep -rn "?? OPERATOR_ID" packages/api/typescript/tests/support/ | wc -l` → 7.

### Step T3.2 — Implementar

O contrato que `given/types.ts:2-5` já promete ("todo given lê testBed.ownerId") vira verdade.
`testing.ts` mantém o import de `@auth/operator` SÓ se o produto o declarar como ownerId do
boot — a decisão de identidade sobe para o chamador; o mecanismo não conhece o operador.

### Step T3.3 — Gate

```bash
grep -rn "?? OPERATOR_ID" packages/api/typescript/tests/support/ | wc -l   # 0
cd packages/api/typescript && bun test tests/ 2>&1 | tail -3               # suíte de support/architecture verde
bun test src/ 2>&1 | tail -3                                               # consumidores dos givens verdes
```

### Step T3.4 — Commit

---

## Task T4: Separação schema Go — mecanismo fica, conteúdo move (Decision 5)

**Files to write:**
- Move: `packages/api/go/core/db/sqlite/schema.sql` → `packages/api/go/internal/db/schema.sql` (git mv; conteúdo intacto)
- Move: `packages/api/go/core/db/sqlite/migrations/` → `packages/api/go/internal/db/migrations/`
- Move: `packages/api/go/core/db/sqlite/query/{channel,thread,issue,artifact,ui,workspace}.sql` → `packages/api/go/internal/db/query/` — EXCETO `outbox.sql`, `owner.sql` e os demais de contexto base, que ficam no core com um `schema` base próprio (ver Step T4.2)
- Split: `packages/api/go/core/db/sqlite/gen/` — regenerar via sqlc nos DOIS lados (core: base; internal: produto); `models.go` deixa de misturar
- Modify: `packages/api/go/core/db/sqlite/sqlc.yaml` + `//go:embed` — apontam para os paths novos; o guard de drift continua no core como PADRÃO parametrizado
- Modify: `packages/api/go/core/db/sqlite/store_test.go` — asserts só de tabelas base (o fixture de produto move junto com o conteúdo)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (core Go, sqlc)
**Depends on:** (none)

### Step T4.1 — RED

`grep -c "thread_threads\|gateway_channels\|issue_issues" packages/api/go/core/db/sqlite/schema.sql` → >0 (produto no core).

### Step T4.2 — A linha de corte, medida

Tabelas BASE (ficam com o core ou com o schema base do serviço — seguir a decisão de ownership
do schema: Drizzle/contracts é a fonte, o Go transcreve): `shared_outbox`, `owner_*`,
`_sqlite_migrations`. Tabelas de PRODUTO (movem): `gateway_*` (schema.sql:122-183),
`thread_*` (:305-369), `issue_*` (:187-220), `artifact_*`, `agent_*`, `workspace_*` (:371-380),
`owner_onboardings` (:246 é produto — check de steps de onboarding do codm). `ui.sql`: as queries
:10-14 (owner_owners) ficam; :16-80 (joins produto) movem. `workspace.sql` inteiro move (contexto
de produto). O arquivo gen do gateway chama-se `channel.sql.go` — atenção ao nome no split.

### Step T4.3 — Regenerar e religar

sqlc generate nos dois lados; embed/ledger apontados; consumidores (repos/stores dos contextos)
seguem compilando — os imports mudam de `core/db/sqlite/gen` para o gen do serviço onde for
produto.

### Step T4.4 — Gate

```bash
cd packages/api/go && grep -cE "thread_|gateway_|issue_|artifact_|agent_" core/db/sqlite/schema.sql 2>/dev/null || echo "SEM_SCHEMA_PRODUTO_NO_CORE"
go build ./... && go test ./... 2>&1 | tail -3       # AC-2: verde nos dois lados
go test ./core/... 2>&1 | tail -2
```

### Step T4.5 — Commit

---

## Task T5: O manifesto conhece os givens (Decision 6)

**Files to write:**
- Modify: `template.config.ts` — a relação given→contexto entra tipada (contexts.<ctx>.givens)
- Modify: `packages/api/typescript/tests/support/testing.ts` — catálogo derivado (imports/exports/`_testingSurface` :17-34/:191-209/:218-237 deixam de ser lista à mão OU ganham gate de paridade com o manifesto — preferir gate: derivação total só se o padrão do repo-model já suportar)
- Modify: `packages/api/typescript/testing.d.ts` — idem (raiz do pacote)
- Modify: `packages/api/typescript/tests/architecture/testing-dts.test.ts` — CATALOG (:32-51, 18 nomes) lê do manifesto
- Modify: `packages/api/typescript/tests/support/given/index.ts` — barrel (:23-33) derivado/gated
- Modify: `scripts/create-template/` — a poda de givens acompanha a poda de contextos no stamp

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (manifesto/repo-model, create-template)
**Depends on:** T3

**Consumes (frozen):** os nomes dos 16 givens + `GIVEN_MENTION_TAG` + `startIntegrationBackend` exatamente como estão no CATALOG atual (:32-51); a herança `testBed.ownerId` de T3.
**Gate:** `bun test tests/architecture/testing-dts.test.ts` verde · um stamp de teste (fixture do create-template) SEM thread/channel não contém givenThread/givenChannel no catálogo derivado · `bun run test:tooling` (equivalente codm) verde.

### Step T5.1 — RED

O CATALOG hardcoded diverge do manifesto por construção (não há manifesto ainda) — escrever
primeiro o teste da paridade manifesto↔catálogo e vê-lo falhar.

### Step T5.2 — Implementar (fonte no manifesto, 4 lugares derivados/gated)

### Step T5.3 — Gate (campo acima)

### Step T5.4 — Commit

---

## Task T6: Spikes de produto saem do diretório portável (Decision 10)

**Files to write:**
- Move/Modify: `packages/api/typescript/tests/support/cross-service.spike.test.ts` → `packages/api/typescript/tests/spikes/` (o spike usa SDK gerada + export Drizzle `channels` — não há literal a caçar; mover é o fix)
- Move/Modify: `packages/app/react/tests/support/integration-harness.spike.test.tsx` e `storybook.spike.test.tsx` → `packages/app/react/tests/spikes/` (ou fixtures base, se o mover quebrar o propósito do spike — decidir pelo mover, é o corte natural)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** (test layout)
**Depends on:** (none)

### Step T6.1 — Gate

```bash
ls packages/api/typescript/tests/support/*.spike.* packages/app/react/tests/support/*.spike.* 2>/dev/null | wc -l   # 0 (AC-6)
cd packages/api/typescript && bun test tests/ 2>&1 | tail -2   # spikes seguem rodando do novo lugar
```

### Step T6.2 — Commit

---

## Task T7: O resíduo marca-legada fecha (Decision 11)

**Files to write:**
- Modify: `packages/api/typescript/tests/support/ids.ts` — linha 2: comentário cita `LEGACY_BRAND_NAMESPACE`; a constante real é `ID_NAMESPACE` (`core/src/objects/Id.ts:11`)
- Modify: `packages/api/typescript/src/auth/objects/HashedIdParity.test.ts` — linha 10: idem
- Modify: o pattern do product-residue do codm — `(regex do detector de resíduo)` → `/bk[-_]?dash/i`, com fixture negativa provando que `marca-legada` agora reprova

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** (rails)
**Depends on:** (none)

### Step T7.1 — RED do falseador

Fixture com `LEGACY_BRAND_X` passa no pattern atual (prova do buraco) e reprova no novo.

### Step T7.2 — Gate

`grep -rn "LEGACY_BRAND" packages/api/typescript/ | wc -l` → 0 · rail verde com fixture nova.

### Step T7.3 — Commit

---

## Task T8: Varredura de marca + rail Go ampliado — o gate do AC-1 (Decision 4)

**Files to write:**
- Modify: `packages/api/typescript/core/src/utils/Config.ts` — chaves :31 (+valor `'~/.codm/data'`), :53, :87, :91 derivadas do scope do manifesto; prosa :27,:58,:84,:131,:156-157,:161-162,:169,:180; `.superRefine()` :182 usa a chave derivada
- Modify: `packages/api/typescript/core/src/db/drivers/DataDirLock.ts` — erro :22-24, subpath :41 (⚠ mexe nos exports do package — conferir package.json exports junto), :53, comentários :14,:35-37,:82-83
- Modify: `packages/api/typescript/core/src/db/drivers/LibsqlDriver.ts` — :86 (prefixos temp), :97 (comentário)
- Modify: Go — `core/db/sqlite/store.go` :6-7,:44 (`codm.db` → derivado),:81,:319 (dir default); `core/db/sqlite/lock.go` :29-31 (erro); `core/module.go` :280; `core/types/controller.go` :22; `core/errors/codes.go` :10; `core/http_router.go` :102; `core/config/config_test.go` :33,:40
- Modify: `packages/api/go/core/vocabulary_test.go` — regex :29 amplia para `codm` minúsculo (tratando falsos-positivos: `chan` do Go, identifiers sqlc); re-falsear nos dois estados
- Modify: rail TS equivalente (o vocabulário do core TS) — mesma ampliação simétrica

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (core, rails)
**Depends on:** T1, T2, T4

**Consumes (frozen):** o scope do manifesto como fonte dos prefixos (em codm o valor derivado CONTINUA `CODM_`/`codm` — runtime idêntico; o que muda é o mecanismo não soletrar a marca); os endereços acima, verificados em 2026-08-11.
**Gate:** `go test ./core/...` com o vocabulary ampliado VERDE · o mesmo teste com uma fixture `codm` plantada REPROVA (falseador dos dois estados) · `bun test` core TS verde · grep do AC-1 (fora de env declaradas no manifesto e do lado produto) = 0.

### Step T8.1 — RED

Rodar o vocabulary ampliado ANTES da varredura: deve listar exatamente os pontos do inventário
(≈8 no Go) — se listar mais, o inventário estava incompleto (atualizar a spec); se menos, o
regex está fraco.

### Step T8.2 — Varredura consciente (não sed cego) + re-falseio

### Step T8.3 — Gate (campo acima)

### Step T8.4 — Commit

---

## Final Validation

- [ ] Bateria completa do codm verde (equivalente `test:tooling` + `go test ./...` + `bun test` das duas pontas)
- [ ] AC mapping:
  - AC-1 → T8 gates (vocabulary ampliado verde + falseador reprova + grep 0)
  - AC-2 → T4.4 (`go test ./...` verde nos dois lados; schema do core sem tabela de produto)
  - AC-3 → T5 gate (paridade manifesto↔catálogo; stamp de teste poda)
  - AC-6 → T6.1 (zero spikes em tests/support)
  - AC-4 e AC-5 → fase de PICKS no template (fora deste plano; docs/UPSTREAM.md nasce lá com o mapa da Decision 8)
- [ ] Nenhum comportamento de runtime do codm mudou (prefixos derivados continuam CODM_/codm em execução)

## Notes

- Ordem de ondas: T1/T2/T4/T6/T7 paralelos (escritas disjuntas) → T3 → T5 (mesmo arquivo testing.ts) → T8 por último (é o gate; medir DEPOIS que T1/T2/T4 removeram os pontos deles).
- O worktree é `feat/upstream-prep` — NUNCA operar git no checkout principal do codm (3+ sessões ativas).
- A série de picks NÃO está congelada num commit-alvo: aguardar o sinal da sessão codm sobre o schema Env sem Contract Lock antes do dry-run.
- `packages/api/go/public/docs/openapi.json` agora é commitado (ac277eed) — worktree fresco não precisa de setup.
