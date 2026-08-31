# Integração Codex CLI — Design Spec

**Date:** 2026-08-28  
**Status:** Draft  
**Bounded Context:** `agent` (runner, detector, sessão) + `thread`/`ui` (seleção e `comingSoon`) + `contracts` (modelos, se necessário)  
**Kind:** feature  
**Story Points:** 13 — smoke gate com capturas reais, `CodexAgentRunner` + codec/accumulator próprios, fiação na factory, catálogo de modelos, superfície de produto (wizard/settings), e e2e mínimo; MCP pode empurrar para 21 conforme spike

## Context

O codm já modela três CLIs no wire (`ProviderKind`: `CLAUDE_CODE`, `CODEX`, `OPENCODE`), mas **só dirige o Claude** de ponta a ponta.

### O que já existe (Claude — referência)

| Camada | Onde | Papel |
|--------|------|-------|
| Wire | `packages/contracts/.../provider-kind.tsp` | `CODEX` já é membro do enum |
| Detecção | `ProviderDetector` + `PROVIDER_BINARIES` | `codex` é detectado (`--version`, `--help`, capability grep) |
| Runner | `ClaudeAgentRunner` | Uma classe por CLI — spawn, argv, drain, classificação de stop |
| Invocação | `buildArgs()` | `claude -p --input-format stream-json --output-format stream-json …` |
| Codec | `StreamJsonCodec` + `FrameDecoder` | JSONL **no formato Claude** (`system`/`assistant`/`user`/`result`) |
| Facts | `StreamJsonToTurnFactAccumulator` | Fold de frames → `AgentTurnFact` |
| Plataforma | `platformInvocation.ts` | Windows `.cmd` via `COMSPEC` |
| Factory | `DefaultAgentRunnerFactory` | `Map([[CLAUDE_CODE, claude]])` — única entrada |
| Sessão | `AgentSession` + `resumeDecision` | `--session-id` / `--resume`, invalidação por modelo/cwd/cursor |
| Modelos | `catalog/agent-models.ts` | `CODEX → []` (vazio de propósito) |
| Produto | `GetThreadSettings`, wizard, `AttachThread` | `comingSoon = !factory.supported`; threads legadas com `CODEX` existem mas não rodam turno |

A regra arquitetural que governa tudo isso (Fase 4.5, `.specs/codedm/2026-07-26-agent-abstraction-convergence.md`):

> **Uma classe por CLI.** O runner compartilhado com `if (provider)` morreu porque stream format é caminho de parsing diferente, não argv. O que é compartilhável é **utilitário** (`LineBuffer`, padrão spawn/drain), nunca herança com branch de identidade.

### O que o Codex oferece (medido localmente, `codex-cli 0.149.1`)

Invocação headless:

```bash
codex exec --json -C <workspace> [--add-dir …] [-m <model>] [--sandbox workspace-write] [PROMPT|-]
codex exec resume <thread_id> [PROMPT|-]   # continuação
```

Wire JSONL (`--json`) — **formato diferente do Claude**:

```jsonl
{"type":"thread.started","thread_id":"0199a213-…"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"…"}}
{"type":"turn.completed","usage":{"input_tokens":…,"output_tokens":…}}
```

Eventos documentados: `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.started|updated|completed`, `error`. Itens: `agent_message`, `reasoning`, `command_execution`, `file_change`, `mcp_tool_call`, `web_search`, `todo_list`, …

Outras diferenças relevantes:

- **Sem** `--input-format stream-json` / `--output-format stream-json` — é `codex exec --json`.
- **Sem** `--permission-mode auto` — sandbox explícito (`--sandbox workspace-write` + `--approve-for-me` ou equivalente headless).
- **Resume** é subcomando (`exec resume <id>`), não flag `--resume`.
- **Structured output** nativo: `--output-schema <arquivo.json>` (schema em disco) + resposta final em JSON — alinha com `outputSchema` do seam, mas o mecanismo difere do Claude (directive no stdin).
- **Git obrigatório** por padrão — `AttachThread` já aponta workspace com `.git`; runner precisa `--skip-git-repo-check` só se produto decidir suportar árvore sem git (fora de escopo inicial).
- **Auth**: `codex login` / `CODEX_API_KEY` — mesma classe de erro `AUTH_REQUIRED` que Claude.
- **MCP**: não há `--mcp-config` inline como no Claude. Servidores MCP entram via `~/.codex/config.toml` ou `codex mcp add`. **Spike obrigatório** antes de prometer paridade de tools (ver decisão 6).

## Problem

1. **Produto mente pela metade.** O wizard e `DetectProviders` mostram Codex instalado, mas `AttachThread`/`RunOrchestratorTurn` recusam ou falham porque `AgentRunnerFactory.supported` só lista `CLAUDE_CODE`. Threads legadas com `providers: ['CODEX']` existem no founder machine.
2. **Reutilizar `FrameDecoder` do Claude é incorreto.** O corpus Claude (`type: result`, `message.content[]`, `parent_tool_use_id`) não aparece no Codex. Um `if (provider)` dentro do decoder viola Fase 4.5 e reproduz o defeito que matou o runner genérico.
3. **MCP é requisito de produto, não nice-to-have.** Orquestrador e issue work dependem de tools (`complete_issue`, `raise_stop`, `ConfigureModel`, …). Integração sem MCP entrega um binário que conversa mas não opera o domínio.
4. **Modelos são vocabulário do Codex, não do Claude.** `AgentModelId` hoje é `SONNET|OPUS|HAIKU` — nomes Claude. Oferecer seletor Codex exige membros novos no enum **e** entrada no catálogo (spec `2026-08-06-modelo-por-thread-e-provider-design.md` já prevê isso como edição de duas linhas depois que o runner existe).

## Goal

Um operador com `codex` instalado e autenticado consegue:

1. Escolher **Codex** no onboarding ou no wizard de attach (sem `Em breve`).
2. Mandar mensagem no canal e receber resposta com o mesmo fluxo de turno/sessão/issue que Claude.
3. Ver tools de domínio funcionando (MCP) — classificar issue, completar, pedir operador, etc.
4. Retomar sessão multi-turno via `thread_id` persistido em `AgentSession`.
5. (Fase 2 do catálogo) Escolher modelo Codex por thread, se o spike confirmar apelidos estáveis.

## Decisions

1. **Nova classe `CodexAgentRunner`, irmã de `ClaudeAgentRunner`.** Mesmo seam (`AgentRunner.run` → `AsyncIterable<AgentRuntimeEvent>`), mesma forma de injeção (`DefaultAgentRunnerFactory` ganha segundo parâmetro no construtor + entrada no `Map`). Zero branch `if (provider)` dentro de qualquer runner.

2. **Codec Codex separado — `CodexJsonCodec` + `CodexFrameDecoder` (+ `CodexToTurnFactAccumulator`).** Reutiliza `LineBuffer` e o padrão de drain (watchdog, `diedMidStream`, `settleWithin`, `platformInvocation`). **Não** estende `FrameDecoder` Claude. Turn-end estrutural = `turn.completed` ou `turn.failed`, não `type: result`.

3. **Smoke gate obrigatório (Fase 0) antes de merge.** Capturar corpus real em `packages/api/typescript/src/agent/services/CodexJsonCodec/__captures__/` (gitignored ou sanitizado):
   - turno simples (uma mensagem, resposta curta);
   - turno com `command_execution`;
   - turno com `mcp_tool_call` (nosso servidor);
   - `exec resume` com mesmo `thread_id`;
   - falha de auth (`codex logout` + run);
   - structured output com `--output-schema`.
   Sem corpus, nenhum decoder é mergeado — mesma regra que Fase 2 do goal original (`AC-1.3` stream-json).

4. **Argv canônico (sujeito a ajuste pós-captura):**

   ```ts
   // Novo turno
   [binary, 'exec', '--json', '-C', cwd, '--sandbox', 'workspace-write', '--approve-for-me', …]
   // Resume
   [binary, 'exec', 'resume', sessionId, …]
   // Prompt: última mensagem do turno como argumento OU stdin `codex exec --json - -C …` quando > limite
   ```

   Flags capability-gated como no Claude (`caps` do probe). Atualizar `PROVIDER_BINARIES[CODEX]` para apontar para `CodexAgentRunner.binary` quando o runner existir (mesmo padrão Claude: spec única, sem drift).

5. **Mapeamento mínimo frame → domínio (v1):**

   | Evento Codex | `AgentFrame` / terminal |
   |--------------|-------------------------|
   | `thread.started` | `system_init` com `sessionId = thread_id` |
   | `item.*` + `agent_message` | `assistant_text` (concat por turno; `phase` se existir separa commentary vs final) |
   | `item.*` + `mcp_tool_call` | `tool_use` / `tool_result` (mapear nomes wire → `AgentToolName`) |
   | `item.*` + `command_execution` | `tool_use` sintético ou frame `activity` para UI (decidir no spike) |
   | `turn.completed` | terminal: `END_TURN`, usage, texto = último `agent_message` |
   | `turn.failed` / `error` | terminal com `isError: true` |
   | Desconhecidos | drop silencioso (mesma regra §4.3 rule 9) |

6. **MCP — spike com saída binária antes da implementação.** Hipóteses a testar em ordem:
   - **H1:** `codex exec -c 'mcp_servers.<key>.url="…"'` com bearer via env (`--bearer-token-env-var` pattern do `mcp add`);
   - **H2:** `CODEX_HOME` efêmero por run com `config.toml` gerado (servidor HTTP local + token no header);
   - **H3:** stdio entry nosso (`command` + `env: { CODM_RUN_TOKEN }`) se Codex aceitar stdio MCP no config efêmero.
   
   **Critério de sucesso do spike:** um turno headless chama pelo menos uma tool nossa (`ping` de teste) e o router vê o token. Se nenhuma hipótese fechar sem persistir credencial global, a spec escala para 21 SP e abre ADR.

7. **Modelos Codex — fase separada (não bloqueia v1 dirigível).** Primeira entrega roda com `DEFAULT` (omitir `-m`). Segunda entrega adiciona membros ao `AgentModelId` (ex.: `O3`, `GPT5_CODEX` — **nomes finais só após `--help` + captura**) e preenche `PROVIDER_MODELS[CODEX]`. Nunca reutilizar `OPUS`/`SONNET` para Codex.

8. **`AgentSession.agentSessionId` guarda `thread_id` do Codex** (já é vendor-neutral). `resumeDecision` e invalidações existentes aplicam sem mudança de schema.

9. **E2E:** `E2eStubAgentRunner` continua sem spawn real. Adicionar coluna `integration` opcional com capturas canned (como Claude) OU teste de `buildArgs` + decoder puro. Playwright não passa a depender de API key OpenAI no CI — hermético por padrão.

10. **Superfície de produto:** `comingSoon` deriva de `factory.supported` — ao registrar Codex, wizard e settings atualizam sozinhos. Remover copy "Em breve" nos testes/stories que fixam `comingSoon: true` para CODEX. Onboarding: Codex passa a ser selecionável quando `DETECTED` **e** `supported`.

## User Stories

- **US-1:** Como operador com Codex instalado, quero escolher Codex ao attachar uma conversa, para rodar agentes OpenAI no mesmo produto.
- **US-2:** Como operador, quero mandar mensagem no WhatsApp e o turno Codex responder com a mesma confiabilidade de sessão/resume que Claude.
- **US-3:** Como operador, quero que o agente Codex abra/completes issues via MCP, para o fluxo orquestrador → issue work não regredir.
- **US-4:** Como operador com thread legada `CODEX`, quero que conversas antigas voltem a funcionar sem reattach manual.
- **US-5:** (Fase 2) Como operador, quero escolher o modelo Codex nos ajustes da thread, como já faço com Claude.

## Acceptance Criteria

### Fase 0 — Smoke (bloqueante)

- [ ] AC-0.1: Corpus JSONL real commitado (ou em pasta de capturas referenciada pelo README do runner) com ≥4 cenários listados na decisão 3.
- [ ] AC-0.2: Spike MCP documentado em `.plans/` ou seção "MCP spike result" nesta spec — hipótese vencedora ou ADR se bloqueado.

### Fase 1 — Runner + factory

- [ ] AC-1.1: `CodexAgentRunner` implementa `run` + `shutdown`; testes com fake process (mesmo padrão `ClaudeAgentRunner.test.ts`).
- [ ] AC-1.2: `CodexAgentRunner.buildArgs` é função pura testada — novo turno, resume, model, `extraDirs`, sandbox.
- [ ] AC-1.3: `DefaultAgentRunnerFactory.supported` inclui `CODEX`; `for(CODEX)` devolve `CodexAgentRunner`.
- [ ] AC-1.4: `PROVIDER_BINARIES[CODEX] === CodexAgentRunner.binary`.
- [ ] AC-1.5: `RunOrchestratorTurn` + `RunIssueTurn` completam turno com provider `CODEX` em teste de integração (stub MCP ou captura).

### Fase 2 — MCP

- [ ] AC-2.1: Turno orquestrador Codex invoca ≥1 tool MCP nossa (teste integração com router real + token).
- [ ] AC-2.2: Token revogado no `finally` do runner após término (paridade Claude).

### Fase 3 — Produto

- [ ] AC-3.1: `GetAttachThreadWizard` marca Codex `available: true` quando detectado (sem `comingSoon`).
- [ ] AC-3.2: `AttachThread` aceita `[CODEX]` quando detectado **e** suportado.
- [ ] AC-3.3: `UndrivableProviderReads` atualizado — thread CODEX deixa de ser caso "legado morto" quando runner existe.

### Fase 4 — Modelos (opcional nesta entrega)

- [ ] AC-4.1: Novos membros `AgentModelId` + `PROVIDER_MODELS[CODEX]` + gate `agent-models.test.ts`.
- [ ] AC-4.2: `ConfigureModel` + seletor no `ThreadSettingsDialog` para Codex.

### Qualidade

- [ ] AC-Q.1: `bun tsc`, `bun lint`, `bun run test` verdes.
- [ ] AC-Q.2: `tests/architecture/pty-isolation.test.ts` e rails de provider-identity continuam verdes (zero `provider ===` em `AgentRunner/`).
- [ ] AC-Q.3: Windows: `resolveInvocation` cobre `codex.cmd` se npm global instalar batch script (mesmo padrão Claude).

## Implementation Plan (tasks)

| # | Task | Depende de |
|---|------|------------|
| T0 | Rodar capturas `codex exec --json` + documentar argv estável | — |
| T0b | Spike MCP (H1→H3) | T0 |
| T1 | `CodexFrameDecoder` + testes contra capturas | T0 |
| T2 | `CodexToTurnFactAccumulator` | T1 |
| T3 | `CodexAgentRunner` (spawn, drain, classifyStop, auth hints) | T1–T2 |
| T4 | Factory + `PROVIDER_BINARIES` + registry DI | T3 |
| T5 | Fiação MCP no runner | T0b, T3 |
| T6 | Testes integração `RunOrchestratorTurn` / `RunIssueTurn` | T4–T5 |
| T7 | Ajustes BFF/wizard/settings + stories | T4 |
| T8 | Catálogo de modelos Codex (se escopo) | T4 |
| T9 | E2E/demo opcional com Codex real (só local, não CI) | T6 |

## Riscos

| Risco | Mitigação |
|-------|-----------|
| MCP sem flag inline — maior incerteza | Spike T0b antes de T5; ADR se precisar config persistente |
| Formato JSONL evolui entre versões Codex | Capturas versionadas; decoder tolerante (ignora unknown); pin de versão mínima no README |
| Custo/latência API OpenAI em dev | Testes herméticos; smoke manual documentado; sem key no CI |
| Sandbox bloqueia tools de arquivo | `--sandbox workspace-write` + `--approve-for-me`; medir na captura |
| Duplicação de lógica drain entre runners | Extrair util compartilhado **só** se terceiro runner pedir — não antecipar |
| `AgentModelId` poluído com nomes ambíguos | Fase separada; prefixo semântico claro no enum |

## Fora de escopo (v1)

- `OPENCODE` (mesmo padrão, outra spec).
- Suporte a workspace sem `.git` (`--skip-git-repo-check`).
- Codex Cloud / `codex cloud` remoto.
- Paridade pixel-a-pixel do thinking indicator com verbos Codex (reutiliza infra existente se frames mapearem).

## Referências

- `packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts`
- `.specs/codedm/2026-07-26-agent-driving-stream-json.md`
- `.specs/codedm/2026-07-26-agent-abstraction-convergence.md` (regra uma-classe-por-CLI)
- `.specs/2026-08-06-modelo-por-thread-e-provider-design.md` (catálogo de modelos)
- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [exec_events.rs](https://github.com/openai/codex/blob/main/codex-rs/exec/src/exec_events.rs) (formato JSONL)

## Próximo passo imediato

~~Rodar **T0 + T0b** nesta máquina~~ — **T0 parcial (28/08):** captura real só de falha por quota Codex até 13/09. Ver `.plans/codex-smoke/README.md` + fixtures sintéticos em `.plans/codex-smoke/fixtures/`.

**Agora (sem quota):** implementar decoder contra fixtures + `simple.jsonl`.  
**Depois (quota):** regravar capturas felizes + spike MCP com `CODEX_HOME` efêmero.
