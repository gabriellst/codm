# HANDOFF — Integração Codex CLI no codm

**Salvo em:** 2026-08-28  
**Repo:** `01 - Projects/codm/` · branch `main` · tag **v0.6.2**  
**Objetivo:** segundo provider dirigível além do Claude (`ProviderKind.CODEX`)

---

## Onde paramos

| Fase | Status |
|------|--------|
| Spec de design | ✅ `.specs/2026-08-28-integracao-codex-design.md` |
| Smoke Fase 0 (capturas live) | ⚠️ **Parcial** — quota Codex esgotada até **13/09/2026 ~14:32** |
| Spike MCP live | ❌ Não rodou (quota) |
| `CodexAgentRunner` / decoder | ❌ Não iniciado |
| Factory / UI `comingSoon` | ❌ Não iniciado |

**Próxima ação recomendada (sem depender de quota):** implementar `CodexFrameDecoder` + testes contra fixtures em `.plans/codex-smoke/fixtures/` e `simple.jsonl`.

---

## Contexto rápido — como Claude funciona hoje

Referência a copiar (padrão **uma classe por CLI**, sem `if (provider)` no runner):

```
packages/api/typescript/src/agent/services/AgentRunner/ClaudeAgentRunner/ClaudeAgentRunner.ts
packages/api/typescript/src/agent/services/AgentRunnerFactory/DefaultAgentRunnerFactory.ts  → só CLAUDE_CODE
packages/api/typescript/src/agent/services/ProviderDetector/ProviderDetector.ts           → PROVIDER_BINARIES
packages/api/typescript/src/agent/services/StreamJsonCodec/                             → formato CLAUDE
```

- Spawn: `claude -p --input-format stream-json --output-format stream-json …`
- MCP inline: `--mcp-config` + `--allowedTools`
- Sessão: `--session-id` / `--resume`
- Factory: `Map([[ProviderKind.CLAUDE_CODE, claude]])`

`CODEX` já existe no enum e é **detectado** (`bin: codex`), mas:
- `DefaultAgentRunnerFactory.supported` = `[CLAUDE_CODE]` only
- `PROVIDER_MODELS[CODEX] = []` em `packages/api/typescript/src/catalog/agent-models.ts`
- UI mostra **Em breve** via `comingSoon = !factory.supported`

---

## Codex — o que é diferente

```bash
codex exec --json -C <workspace> [--sandbox workspace-write] [--approve-for-me] [PROMPT|-]
codex exec resume <thread_id> [PROMPT|-]
```

JSONL (`--json`), **não** o formato Claude:

```jsonl
{"type":"thread.started","thread_id":"…"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"…","type":"agent_message","text":"…"}}
{"type":"turn.completed","usage":{…}}
```

- `thread_id` → persistir em `AgentSession.agentSessionId`
- Turn-end: `turn.completed` / `turn.failed` (não `type: result`)
- MCP: via `~/.codex/config.toml` `[mcp_servers.*]` — **sem** `--mcp-config` inline
- Spike favorito: **`CODEX_HOME` efêmero** por run com `config.toml` gerado apontando pro router HTTP do daemon

Fonte upstream dos tipos: `https://github.com/openai/codex/blob/main/codex-rs/exec/src/exec_events.rs`

---

## Artefatos já criados

| Arquivo | Conteúdo |
|---------|----------|
| `.specs/2026-08-28-integracao-codex-design.md` | Spec completa (decisões, ACs, tasks T0–T9) |
| `.plans/codex-smoke/README.md` | Relatório smoke + spike MCP offline |
| `.plans/codex-smoke/simple.jsonl` | Captura **real** — falha por quota |
| `.plans/codex-smoke/simple.stderr` | stderr do mesmo run |
| `.plans/codex-smoke/fixtures/happy-turn.jsonl` | Fixture sintético (doc OpenAI) |
| `.plans/codex-smoke/fixtures/mcp-tool-call.jsonl` | Fixture sintético MCP |

---

## Setup local desta máquina (já feito)

```bash
cd "01 - Projects/codm"
# .env com secrets; OAuth AINDA VAZIO (desktop:dev trava no login)
# Redis 6380, Postgres 5436 (medscall ocupa 6379/5432)
docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.local.yml up -d redis postgres postgres-init
bun migrate:deploy:cloud
```

- `codex-cli 0.149.1` instalado, `~/.codex/auth.json` presente
- Quota API: bloqueada até 13/09 — `codex exec` retorna `turn.failed` com mensagem de limite

---

## Plano de implementação (da spec)

### Se quota ainda bloqueada → começar aqui

1. **`CodexFrameDecoder`** em `packages/api/typescript/src/agent/services/CodexJsonCodec/`
   - Reutilizar `LineBuffer` de `StreamJsonCodec`
   - **Não** estender `FrameDecoder` Claude
   - Testes: `fixtures/happy-turn.jsonl`, `mcp-tool-call.jsonl`, `simple.jsonl`

2. **`CodexToTurnFactAccumulator`** — fold para `AgentTurnFact`

3. **`CodexAgentRunner`** — espelhar estrutura `ClaudeAgentRunner`:
   - `static buildArgs()` puro
   - `static readonly binary: ProviderBinarySpec`
   - `run()` com mesmo padrão spawn/drain/watchdog/`platformInvocation`
   - Argv: `exec --json -C …` / `exec resume <id> …`

4. **`DefaultAgentRunnerFactory`** — adicionar `CodexAgentRunner` ao `Map`

5. **`PROVIDER_BINARIES[CODEX]`** → `CodexAgentRunner.binary` (corrigir capability flags: não é `--resume`, é subcomando `exec resume`)

### Quando quota liberar

```bash
CAPDIR=".plans/codex-smoke"
codex exec --json --skip-git-repo-check -C "$(pwd)" --sandbox read-only \
  "Reply with exactly: pong" | tee "$CAPDIR/simple-ok.jsonl"

# após obter thread_id do ok:
codex exec resume <THREAD_ID> "say hi again" --json … | tee "$CAPDIR/resume.jsonl"

# MCP spike H2:
TMP=$(mktemp -d)
# gerar $TMP/config.toml com [mcp_servers.codm] url=http://127.0.0.1:3030/mcp
CODEX_HOME=$TMP codex exec --json …  # daemon rodando
```

### Depois do runner básico

- T5: MCP com `CODEX_HOME` efêmero
- T6: testes `RunOrchestratorTurn` / `RunIssueTurn`
- T7: wizard/settings (remove `comingSoon` automaticamente via `factory.supported`)
- T8: `AgentModelId` + catálogo Codex (fase 2)

---

## Regras do repo (não violar)

1. **Uma classe por CLI** — zero `if (provider)` em `AgentRunner/`
2. Runner não carrega `provider` no `AgentRunRequest`
3. MCP token opaco — runner só revoga no `finally`
4. `buildArgs` puro + testável sem processo real
5. Testes do runner: fake process (ver `ClaudeAgentRunner.test.ts`)
6. Rodar `bun tsc`, `bun lint`, `bun run test` antes de declarar pronto

---

## Comandos úteis

```bash
cd "/Users/g7/Desktop/job/psb/01 - Projects/codm"
bun tsc
bun lint
bun run test
codex doctor
codex exec --help
codex mcp list
```

---

## Links PSB (vault)

- Nota projeto: `01 - Projects/CODM.md`
- Dashboard: `02 - Areas/Projects Dashboard.md`

---

## Prompt sugerido pro Codex continuar

```
Leia .plans/HANDOFF-codex-integration.md e .specs/2026-08-28-integracao-codex-design.md.

Implemente CodexFrameDecoder + testes contra .plans/codex-smoke/fixtures/ e simple.jsonl.
Siga o padrão ClaudeAgentRunner (uma classe por CLI). Não reutilize FrameDecoder do Claude.

Se quota Codex estiver liberada, regrave capturas em .plans/codex-smoke/ antes do runner.
Depois: CodexAgentRunner, factory, PROVIDER_BINARIES.
```
