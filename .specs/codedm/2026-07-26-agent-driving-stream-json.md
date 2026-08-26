# Driving CLI agents: stream-json over pipes (NOT a PTY)

> Finding from a read-only study of **nexu-io/open-design** (v0.16.1), a shipped product that drives
> **~26 agent CLIs** (claude, codex, opencode, cursor-agent, copilot, aider, amp, devin, …) through one
> generic pipeline. It resolves the three blockers that parked our terminal execution engine.
> Cross-ref: `OVERNIGHT-BLOCKED.md` § Fase B/Fase 10 (the per-session JSONL reply-extraction blocker).

## The mechanism

**Plain `child_process.spawn` with piped stdio. No PTY, no Agent SDK, no HTTP.** Claude runs in
**bidirectional headless stream-json**:

```
claude -p --input-format stream-json --output-format stream-json --verbose \
       [--include-partial-messages] [--model X] [--add-dir …] \
       [--session-id <uuid> | --resume <id>] \
       --permission-mode auto
```

```ts
spawn(invocation.command, invocation.args, {
  env, stdio: ['pipe', 'pipe', 'pipe'], cwd, shell: false,
  detached: process.platform !== 'win32',   // → process-group kill on cancel
})
```

- The prompt goes in as **one JSONL line on stdin**, and **stdin stays open** so more user messages can be
  streamed into the same live turn. (Also dodges `E2BIG`/`ENAMETOOLONG` on long prompts.)
- The reply is reconstructed **exclusively from parsed stdout JSONL** — `content_block_delta.text_delta`
  when `--include-partial-messages` is available, else the `assistant` wrapper's `content[].text`,
  de-duped per message-id. Mining *raw* stdout instead of the parsed stream yields empty extractions.
- **`grep -rn "claude/projects"` across the whole repo → zero hits.** They never read a transcript file.
- Multi-turn context = Claude's **native `--session-id` / `--resume`**; the UUID is minted and persisted
  by the daemon (SQLite `agent_sessions`, keyed by `(conversation_id, agent_id)` + `model` + `cwd` +
  `last_message_id`), with explicit resume-invalidation guards (`model_changed`, `cwd_changed`,
  `missing_cursor`, `conversation_advanced`). Re-sending a rendered transcript is only the fallback.
- `node-pty` IS a dependency — used **only** for a user-facing shell pane, **never** for an agent. That is
  the boundary to copy.
- Each CLI is a **data literal** (`RuntimeAgentDef`), not a class — one pipeline, 26 agents.

## Why this unblocks us

| Our blocker (PTY engine) | How stream-json removes it |
|---|---|
| Per-session JSONL absent in claude 2.x cmux → reply extraction fails | Reply comes from stdout JSONL frames; no filesystem side-channel at all |
| TUI marker parsing for turn-end (brittle across builds) | Structural `stop_reason`, guarded by `parent_tool_use_id == null` (a `Task` sub-agent's `end_turn` must not end the run) and `stopReason !== 'tool_use'`; then `stdin.end()`. Backstop: inactivity watchdog |
| Auto-accepting the trust prompt by writing into the PTY | `--permission-mode auto`; headless `-p` with no TTY never shows a prompt. Zero keystroke-injection code in their repo |

**Net gain, not just parity:** the stream carries `tool_use` (with `input`), `tool_input_delta`,
`tool_result`, `thinking_delta`, `usage` as *structured* frames — strictly richer than scraping a TUI.
Real "Claude is editing `foo.ts`" affordances become possible.

**What is genuinely lost:** the rendered TUI chrome (spinners, box drawing, `/`-commands) and the ability
to answer an interactive mid-turn prompt — `bypassPermissions` makes the latter moot, which is a
deliberate authority trade to make consciously. Token-level streaming needs `--include-partial-messages`;
without it you still get complete per-message text, just chunkier.

## Migration recipe for our engine (TS, mechanical)

1. Move the prompt from argv → stdin as `{"type":"user","message":{"role":"user","content":[{"type":"text","text":…}]}}\n`.
2. Add `--input-format stream-json --output-format stream-json --verbose`.
3. Add `--permission-mode auto` → **delete** the trust-prompt auto-accept.
4. Write a line-buffered JSONL parser (~150 LOC) → **delete** the TUI marker parser.
5. Emit turn-end from `stop_reason` with the two guards → **delete** turn-end scraping.
6. Persist `{sessionId, model, cwd, lastMessageId}` per conversation; pass `--session-id`/`--resume` →
   **delete** all `~/.claude/projects` reading.
7. Kill by **process group** (`detached: true` + `process.kill(-pgid, sig)`) — Claude's MCP/tool
   subprocesses outlive the direct child.
8. Keep `Bun.Terminal`/PTY **only** for a user-facing shell pane, if we ever want one.

Their streaming-to-UI layer (for reference): SSE, explicitly not WebSocket — `POST /api/runs` → `202
{runId}` → `GET /api/runs/:id/events`, bounded in-memory ring + append-only `events.jsonl`, with
`Last-Event-ID`/`?after=` replay.

## Architectural implication

A pipe + JSON-lines protocol is **trivially portable to any language** — unlike a TUI parser. The terminal
engine was judged "resists a Go port" *because of the PTY/TUI/JSONL coupling*. That reasoning does not
survive this finding: if the engine ever needs to move to Go, `os/exec` + a JSONL scanner is a
straightforward port. This does not by itself argue for revisiting the 2-sidecar decision — it just means
the door is no longer welded shut.

---

## Adendo (founder, 26-jul): NÓS também declaramos tools — via MCP

O claude não fica restrito às tools dele + às do repo: aceita **servidores MCP nossos**
(`--mcp-config`, com `--allowedTools`/`--disallowedTools` para escopo). O open-design faz exatamente
isso (`apps/daemon/src/mcp-config.ts`: injeta os servidores configurados "so the agent surfaces their
tools to the model", tanto no mapa `mcpServers` do Claude Code quanto no `mcpServers` do ACP, com
storage em `<dataDir>/mcp-config.json`). **CodeDM não tem MCP hoje — é lacuna, não limitação.**

### Por que isso é estrutural, não um extra

**1. Mata a assimetria de tools entre CodeDM e o fork clínico.** A objeção "no fork clínico o servidor executa
as tools, no CodeDM o CLI executa sozinho" deixa de valer: com um servidor MCP nosso, o agent chama e
**o nosso daemon executa** — a mesma forma. `tools` volta a ser conceito de domínio compartilhável,
não detalhe de backend.

**2. Troca INFERÊNCIA por DECLARAÇÃO — é o ganho grande.** Hoje o desenho deduz o que aconteceu lendo
a saída do agent. Com tools nossas, o agent **declara** com payload tipado:

| Inferir (frágil) | Declarar (tipado) |
|---|---|
| deduzir do `stop_reason` que a issue terminou | `complete_issue(summary)` |
| parsear texto atrás de "preciso de aprovação" | `raise_stop(kind, detail)` — `StopKind` já é enum do wire |
| raspar output atrás de arquivo gerado | `record_artifact(kind, name, ref)` |
| heurística para detectar pedido de esclarecimento | `ask_operator(question)` |

Isso ataca de frente a fatia PARKED da materialização de issue: ela dependia de "o engine de terminal
produzir os eventos de execução". Com MCP, **o próprio agent emite o fato de domínio** — sem parser,
sem heurística. Os eventos de integração congelados (`issue.opened`/`completed`/`stop_raised`) passam
a ter uma origem explícita e tipada.

**3. Simetria com os agents internos.** Uma tool MCP é uma função com schema de entrada e saída — a
MESMA forma do `Agent` (inputSchema/outputSchema). Um agent interno pode ser **exposto como tool** ao
agent externo (ex.: o claude chama `classify_issue` quando não sabe onde encaixar algo). Uma
abstração, dois pontos de uso.

### Consequências para o goal

- `ProviderDef` ganha as capacidades de tool (`mcpConfigFlag`, `allowedToolsFlag`) como **dado**, nunca
  como branch no runner — providers sem MCP simplesmente não declaram.
- Nasce um servidor MCP do CodeDM (in-process ou stdio) expondo as tools de domínio acima, com os
  schemas Zod já existentes.
- O caminho de `AgentTurnFact` deixa de ser majoritariamente inferência sobre frames e passa a ser
  **majoritariamente chamada de tool** — os frames viram observabilidade/UI, não a fonte de verdade
  do domínio.
- Escopo por agent: `ClassifyIssueAgent` roda sem tools; `IssueWorkAgent` roda com o conjunto completo.
