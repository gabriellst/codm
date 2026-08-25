# Modelo padrão da thread, por provider — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** Cada conversa escolhe, por provider, qual modelo pedir ao CLI — no diálogo de ajustes e falando na própria conversa — e todo turno seguinte daquela thread (orquestrador e issues) roda no modelo escolhido.

**Architecture:** O eixo do modelo já existe inteiro do enum ao argv (`AgentModelId` → `RunOrchestratorTurn.model` → `ClaudeAgentRunner.CLAUDE_MODEL_ALIASES` → `--model`) e está desligado nas duas pontas. Esta mudança liga as duas: (a) um **catálogo declarado** em `packages/contracts` responde "quais modelos este provider oferece?" por lookup exaustivo, com um gate contra o enum; (b) a thread ganha um **mapa parcial** `provider → modelo` (coluna 0012), com `configureModel`/`modelFor` no agregado e as duas invariantes que impedem configuração órfã; (c) um comando `ConfigureModel` irmão do `ConfigurePrompt`, nas mesmas duas superfícies MCP e com a mesma confinação (middleware, sem guard no `handle()`); (d) o despachante — único ponto de resolução de turno — passa `thread.modelFor(provider)` nos dois caminhos; (e) o console renderiza o seletor na linha do provider que já existe, com o aviso de que trocar recomeça a sessão do CLI.

**Tech Stack:** TypeScript, Bun, Drizzle/SQLite, tsyringe, Zod, Kubb/MCP, React + Base UI

**Spec:** .specs/2026-08-06-modelo-por-thread-e-provider-design.md
**Tasks:** 6
**Estimated minutes:** 180

---

## Task T1 — Contract Lock: o catálogo provider → modelos, com gate

**Files to write:**
- Create: `packages/contracts/catalog/agent-models.ts` — `PROVIDER_MODELS: Readonly<Record<ProviderKind, readonly AgentModelId[]>>`, importando os enums **gerados** (`../generated/typescript/src/wire/enums`, como `db/schema/*.ts` faz)
- Create: `packages/contracts/catalog/index.ts` — barrel
- Create: `packages/contracts/catalog/agent-models.test.ts` — o GATE (decisão 2) com fixture negativa
- Modify: `packages/contracts/package.json` — export `"./catalog": "./catalog/index.ts"`; script `test` passa a rodar `bun test codegen/ catalog/`

**Files to read:**
- `packages/contracts/db/schema/thread.ts` — o precedente de módulo hand-authored em contracts que importa enum gerado
- `packages/contracts/generated/typescript/src/wire/enums/agent-model-id.ts`, `provider-kind.ts`

**Depends on:** (none)
**Scope fence:** OUT — nenhum membro novo em `AgentModelId` (decisão 14); nada em `packages/api` ou `packages/app`.
**Gate:** `bun run --cwd packages/contracts test`

### Steps

- [ ] T1.1 — Escrever `agent-models.test.ts` primeiro (RED): (a) todo membro de `AgentModelId` exceto `DEFAULT` aparece em **exatamente uma** lista; (b) `DEFAULT` aparece em **todas** as listas não-vazias; (c) nenhuma lista tem repetidos; (d) fixture negativa — um catálogo local com um membro órfão e outro com `DEFAULT` faltando reprovam pelas mesmas funções puras que os testes de (a)/(b) usam. Extrair a checagem numa função exportável (`auditProviderModels(catalog)`) para que a fixture negativa não seja uma reimplementação.
- [ ] T1.2 — `PROVIDER_MODELS`: `CLAUDE_CODE: [DEFAULT, OPUS, SONNET, HAIKU]`, `CODEX: []`, `OPENCODE: []`. Doc block explicando: por que a relação é declarada e não derivada de nome (CLAUDE.md regra 5), por que vazio significa "não há o que escolher" e por que isso é um eixo **separado** de `comingSoon`, e por que `DEFAULT` é compartilhado.
- [ ] T1.3 — Barrel + `package.json` (export subpath + script de teste).

---

## Task T2 — A coluna: `model_by_provider` em `thread_threads` (migração 0012)

**Files to write:**
- Modify: `packages/contracts/db/schema/thread.ts` — coluna `modelByProvider` json, `.notNull()`, default `{}`, `$type<Partial<Record<ProviderKind, AgentModelId>>>()`, com o doc de por que NOT NULL DEFAULT '{}' (uma grafia só de "nada escolhido")
- Create: `packages/contracts/db/schema/migrations/0012_*.sql` + snapshot meta (via `bun migrate:create`)
- Modify: cópia `//go:embed` do gateway (via `bun run --cwd packages/contracts db:sync-go`)

**Files to read:**
- `packages/contracts/db/schema/migrations/0011_jittery_the_anarchist.sql` — o formato e o cuidado com backfill
- `packages/contracts/db/schema/thread.ts` — `providers`/`participants` como precedente de coluna json

**Depends on:** T1
**Scope fence:** OUT — nenhuma outra tabela, nenhum índice novo. **Não** editar o SQL gerado além de conferir; se drizzle-kit produzir table-rebuild em vez de `ALTER TABLE ADD COLUMN`, conferir que o backfill preserva as linhas existentes.
**Gate:** `bun run --cwd packages/contracts db:check-go && bun migrate:dev`

### Steps

- [ ] T2.1 — Coluna no schema Drizzle.
- [ ] T2.2 — `bun migrate:create`; ler o SQL emitido e confirmar `DEFAULT '{}'` + `NOT NULL`; se for rebuild, confirmar que o `INSERT ... SELECT` lista todas as colunas antigas e literal `'{}'` para a nova.
- [ ] T2.3 — `db:sync-go` e `db:check-go` verde.

---

## Task T3 — O agregado: `configureModel` / `modelFor`, duas invariantes, round-trip

**Files to write:**
- Modify: `packages/api/typescript/src/thread/entities/Thread.ts` — `modelByProvider` no `ThreadSchema` (com default `{}` em `create`/`revive`), `configureModel(provider, model)`, `modelFor(provider)`
- Modify: `packages/api/typescript/src/thread/errors/index.ts` — `PROVIDER_NOT_BOUND`, `MODEL_NOT_AVAILABLE` em `ThreadDomainErrors`
- Modify: `packages/api/typescript/src/thread/repositories/ThreadRepository/DrizzleThreadRepository.ts` — mapping nos dois sentidos
- Modify: `packages/api/typescript/src/thread/entities/Thread.test.ts` — unidade das duas invariantes + o colapso de `DEFAULT`
- Modify: `packages/api/typescript/src/thread/repositories/ThreadRepository/DrizzleThreadRepository.test.ts` — round-trip do mapa

**Files to read:**
- `packages/api/typescript/src/thread/entities/Thread.ts` — `configurePrompt` (o molde do colapso "blank ⇒ ausente") e `configureContextBuffer`
- `packages/api/typescript/src/thread/errors/index.ts` — a distinção domain × application, e por que `PROVIDER_COMING_SOON` é application
- `packages/api/typescript/src/thread/repositories/ThreadRepository/MockThreadRepository.ts`

**Depends on:** T2
**Scope fence:** OUT — controller, use case, despachante, console. **Não** adicionar evento de domínio (risco registrado na spec). `revive()` **reseta** o mapa (é escolha de wizard? não — o wizard não pergunta modelo; então o mapa SOBREVIVE, como `customPrompt`); documentar a escolha no método.
**Gate:** `cd packages/api/typescript && bun test src/thread/entities/Thread.test.ts src/thread/repositories && bun x tsc -p tsconfig.build.json --noEmit`

### Steps

- [ ] T3.1 (RED) — Testes de entidade: grava; `DEFAULT` apaga a chave; `PROVIDER_NOT_BOUND`; `MODEL_NOT_AVAILABLE`; `modelFor` de provider sem escolha devolve `DEFAULT`; recusa não altera o mapa.
- [ ] T3.2 — Implementar no agregado, lendo `PROVIDER_MODELS` de `@codm/contracts/catalog`.
- [ ] T3.3 — Erros no union + mapeamento HTTP/i18n conforme a convenção do arquivo.
- [ ] T3.4 — Mapping do repositório + teste de round-trip (save → findById preserva; thread pré-existente com `{}` carrega).

---

## Task T4 — O comando e a porta: `ConfigureModel` nas duas superfícies + o read DTO

**Files to write:**
- Modify: `packages/api/typescript/src/thread/usecases/ConfigureThreadSettings.ts` — C16 `ConfigureModel` (+ Input/Output schemas)
- Create: `packages/api/typescript/src/thread/controllers/ConfigureModel.ts` — `PUT /threads/:threadId/model`, `mcpScopes = [system, orchestration]`, doc block registrando a confinação sem guard
- Modify: `packages/api/typescript/src/thread/controllers/index.ts` — export
- Modify: `packages/api/typescript/src/thread/usecases/index.ts` — export (se o barrel enumerar)
- Modify: `packages/api/typescript/src/thread/registry.ts` — se o contexto enumerar handlers/controllers
- Modify: `packages/api/typescript/src/thread/usecases/GetThreadSettings.ts` — `model` + `models` por entrada de provider
- Modify: `packages/api/typescript/src/thread/usecases/GetThreadSettings.test.ts`
- Create: `packages/api/typescript/src/thread/controllers/ConfigureModel.test.ts` — molde exato de `ConfigurePrompt.test.ts`
- Regen: `bun sdk` (openapi.json + client) e o snapshot dourado de `mcp-exposure`

**Files to read:**
- `packages/api/typescript/src/thread/controllers/ConfigurePrompt.ts` + `.test.ts` — o irmão, e o molde da suíte com cadeia composta à mão
- `packages/api/typescript/src/thread/controllers/ConfigureContextBuffer.ts` — a forma mais curta do controller de configuração
- `packages/api/typescript/tests/architecture/mcp-exposure.test.ts` + `__snapshots__`

**Depends on:** T3
**Scope fence:** OUT — despachante e prompt (T5), console (T6). **Não** escrever guard de ownership no `handle()` — o path é thread-shaped e o `AgentIdentityMiddleware` é a confinação; um guard redundante apagaria a propriedade. **Não** expor em `issue-handling`.
**Gate:** `cd packages/api/typescript && bun test src/thread && bun x tsc -p tsconfig.build.json --noEmit`, depois `bun sdk && bun tsc`

### Steps

- [ ] T4.1 (RED) — `ConfigureModel.test.ts`: console (sem token) grava; run `orchestration` da própria thread grava e o valor é lido de volta pelo repositório; `DEFAULT` apaga; thread A → thread B recusada com `FORBIDDEN` **pelo middleware** e B intacta; token revogado recusado e nada escrito.
- [ ] T4.2 — Use case + controller + exports + wiring.
- [ ] T4.3 — `GetThreadSettings` ganha `model` e `models` na entrada de provider que já existe; teste cobre provider com catálogo e provider com catálogo vazio.
- [ ] T4.4 — `bun sdk`; atualizar o snapshot dourado de exposição MCP e confirmar as duas direções da comparação.

---

## Task T5 — O turno pede o modelo: despachante + a situação no prompt

**Files to write:**
- Modify: `packages/api/typescript/src/agent/services/MailboxDispatcher/DrizzleMailboxDispatcher.ts` — `model: thread.modelFor(provider)` em `runThreadTurn` e em `runIssueWork`
- Modify: `packages/api/typescript/src/agent/agents/OrchestratorAgent/types.ts` — `OrchestratorInput` ganha `models` (catálogo do provider do turno) e o efetivo `model` já existente é reaproveitado
- Modify: `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.ts` — seção `modelChoice()`, entre `standingInstructions()` e `recurringPrompts()`
- Modify: `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts` — passa o catálogo do provider para o agente
- Modify: `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.test.ts`
- Modify/Create: teste de despacho provando AC-9 e AC-10

**Files to read:**
- `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.ts` — `standingInstructions()`, o molde exato desta seção (situação sancionada + "nunca inferir" + o atraso)
- `packages/api/typescript/src/agent/enums/ResumeInvalidationReason.ts` — a razão que a seção precisa dizer em voz alta
- `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/buildArgs.test.ts` — onde provar `--model opus` / ausência

**Depends on:** T4
**Scope fence:** OUT — console. **Não** mexer em `AgentSession.resumeDecision` nem em nada da máquina de resume: a invalidação é o comportamento correto e a spec só pede que ela seja **dita**. **Não** dar à issue um eixo de modelo próprio.
**Gate:** `cd packages/api/typescript && bun test src/agent && bun x tsc -p tsconfig.build.json --noEmit`

### Steps

- [ ] T5.1 (RED) — Teste do despachante com thread configurada em `OPUS`: `RunOrchestratorTurn` e `RunIssueTurn` recebem `model: OPUS`; thread sem escolha ⇒ `DEFAULT`.
- [ ] T5.2 — Fiação nos dois métodos do despachante.
- [ ] T5.3 — Seção `modelChoice()` no prompt, nomeando a ferramenta por `toolNameOf(ConfigureModelController)`, listando os modelos do provider do turno, dizendo (a) só quando pedido em voz alta, (b) vale a partir da próxima mensagem, (c) a conversa recomeça no CLI, (d) não afirme o que não chamou. Renderiza só quando o catálogo do provider é não-vazio.
- [ ] T5.4 — Teste do prompt (símbolo derivado, lista presente, seção ausente quando catálogo vazio) + o argv (`--model opus` presente / ausente no padrão).

---

## Task T6 — O seletor no console

**Files to write:**
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx` — `Select` na linha do provider quando `models.length > 0`, mutação `useConfigureModel`, aviso de reinício sob a seção
- Modify: `packages/app/react/src/locales/pt.json` + `en.json` — `enums.AgentModelId.*`, `session.threadModel`, `session.threadModelHint`
- Modify: `.../ThreadSettingsDialog/index.test.tsx` — mocks + os três casos (seletor presente, seletor ausente com catálogo vazio, mutação disparada)
- Modify: `.../ThreadSettingsDialog/index.stories.tsx` — mock do DTO novo

**Files to read:**
- `packages/app/react/src/components/ui/select.tsx` — modo enum (`enum`, `i18nPrefix`, `values`)
- `packages/app/react/CLAUDE.md` — labels de enum só via catálogo i18n tipado; nada de literal em JSX
- o próprio `index.tsx` — a seção "Agentes desta conversa" e o padrão de autosave das pilhas de buffer

**Depends on:** T4 (SDK), T5 (nada bloqueia, mas o build fecha junto)
**Scope fence:** OUT — nenhuma seção nova no diálogo; nenhum `Record<AgentModelId, string>` de label em código (bp-23); nenhuma lista de modelos hardcoded no front — as opções vêm do DTO.
**Gate:** `bun tsc && bun lint && bun run test`

### Steps

- [ ] T6.1 — i18n (pt + en) para os quatro membros de `AgentModelId` e as duas chaves de `session`.
- [ ] T6.2 — `Select` na linha do provider + autosave + invalidação da query.
- [ ] T6.3 — Aviso de reinício, renderizado só quando há pelo menos um seletor.
- [ ] T6.4 — Testes e story.

---

## Close-out

- [ ] `bun tsc` / `bun lint` / `bun run test` verdes na raiz
- [ ] `bun run --cwd packages/contracts db:check-go` verde
- [ ] Todos os AC-1..AC-15 da spec cobertos por teste ou verificados
- [ ] Commit + PR (a issue termina com o PR de pé)
