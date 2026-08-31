# Codex smoke — Fase 0 (28/08/2026)

## Status: **turno simples + resume + MCP + structured output medidos**

Uma captura anterior de `codex exec` autenticado retornou:

```
You've hit your usage limit … try again at Sep 13th, 2026 2:32 PM.
```

Em 28/08 a quota voltou a responder. Foram gravados um turno feliz (`simple-ok.jsonl`), o resume do mesmo thread (`resume.jsonl`), uma chamada MCP HTTP autenticada (`mcp-ping.jsonl`) e structured output nativo (`structured-output.jsonl`).

## O que foi confirmado (live)

| Cenário | Arquivo | Resultado |
|---------|---------|-----------|
| Turno mínimo | `simple.jsonl` | `thread.started` → `turn.started` → `error` → `turn.failed` |
| Turno feliz | `simple-ok.jsonl` | resposta exata `pong` + `turn.completed` |
| Resume | `resume.jsonl` | mesmo `thread_id` + resposta exata `pong-again` |
| MCP HTTP | `mcp-ping.jsonl` | bearer via env → `codm.ping` → `CODM-MCP-PONG` |
| Structured output | `structured-output.jsonl` | `--output-schema` → `{"answer":"pong"}` em `agent_message.text` |
| `thread_id` | `01a0486e-4f9f-7db2-a83c-5b94e046f699` | Formato UUID; candidato a `AgentSession.agentSessionId` |
| stderr | `simple.stderr` | Progresso humano (não parsear como frames) |

### Formato de falha (medido)

```jsonl
{"type":"thread.started","thread_id":"01a0486e-4f9f-7db2-a83c-5b94e046f699"}
{"type":"turn.started"}
{"type":"error","message":"You've hit your usage limit…"}
{"type":"turn.failed","error":{"message":"You've hit your usage limit…"}}
```

**Implicação para o runner:** `turn.failed` + `error` devem mapear para stop transport (não `COMPLETED` vazio). Auth/quota ≠ `AUTH_REQUIRED` do Claude — classificar como `SERVER_ERROR` com mensagem do CLI, a menos que `doctor`/stderr indique login.

## Wire vocabulary (fonte: upstream `exec_events.rs`)

Eventos top-level: `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.started`, `item.updated`, `item.completed`, `error`.

Itens (`item.type`): `agent_message`, `reasoning`, `command_execution`, `file_change`, `mcp_tool_call`, `collab_tool_call`, `web_search`, `todo_list`, `error`.

`turn.completed` carrega `usage`: `input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_output_tokens`, …

Fixtures **sintéticos** (doc oficial, não medidos nesta máquina): `fixtures/happy-turn.jsonl`, `fixtures/mcp-tool-call.jsonl`.

## Spike MCP — resultado live

### O que o Claude faz

`--mcp-config '{"mcpServers":{"codm":{…}}}'` + `--allowedTools` por run, token no header.

### O que o Codex faz

- MCP em `~/.codex/config.toml` sob `[mcp_servers.<name>]`.
- `codex mcp add <name> --url <URL>` ou comando stdio.
- `codex exec` aceita `-c key=value` (TOML) para override pontual.
- Docs: servidor MCP `required = true` que falha ao init → `exec` sai com erro.

### Hipóteses (prioridade)

| ID | Abordagem | Viabilidade |
|----|-----------|-------------|
| H2 | `CODEX_HOME` efêmero por run | Desnecessária: H1 isola a configuração sem mover o auth |
| **H1 — vencedora** | `codex exec -c 'mcp_servers.codm.url="…"' -c 'mcp_servers.codm.bearer_token_env_var="CODM_RUN_TOKEN"'` | Validada live; bearer chegou e `ping` completou |
| H3 | stdio: `command` + `env.CODM_RUN_TOKEN` no TOML efêmero | Alta se HTTP falhar; espelha Claude stdio path |

O helper `packages/api/typescript/scripts/codex-mcp-smoke-server.ts` usa o mesmo SDK/transport HTTP da porta real, exige bearer e expõe `ping`. A captura prova descoberta, autorização e execução pelo Codex. O daemon completo não iniciou por uma falha preexistente de DI em `LibSqlCommandQueue`, anterior à porta MCP.

### Naming MCP

Claude usa `mcp__codm__<tool>` (`packages/api/typescript/src/agent/mcp/wire.ts`). Codex `McpToolCallItem` expõe `server` + `tool` separados — o decoder precisa **recompor** ou mapear para o mesmo `AgentToolName` interno.

## Argv medido

```bash
codex exec --json \
  -C "$WORKSPACE" \
  --approve-for-me \
  [-m MODEL] \
  [PROMPT|-]

# resume
codex exec resume "$THREAD_ID" [PROMPT|-]
```

O probe de Codex usa `exec --help`: `--config` habilita `mcpConfig` e o texto do subcomando `resume` habilita `sessionResume`. O runner emite `exec resume`, nunca `--resume`.

## Próximos passos

1. Repetir `mcp-ping` contra o daemon completo quando o pipeline Bun voltar a emitir metadata DI para os jobs do core.
