# Driving the `codex` CLI — MEASURED

**Binary:** `codex-cli 0.150.0`, `win32-x64` (npm `@openai/codex`).
**Date:** 2026-08-27. **Raw captures:** `.specs/codedm/codex-smoke/raw/`.

Every claim below is either **MEASURED** (a capture in `raw/` shows it) or explicitly marked
**UNFALSIFIED** (structurally reachable, never observed). Nothing here is inferred from the vendor
docs alone — and §2.1 is a case where the docs were WRONG.

Model used for the live turns: `qwen3:4b` via `--oss --local-provider ollama`. The event grammar is
emitted by the CLI, not by the model, so a local model measures the transport faithfully. What a
local model CANNOT measure is flagged in §5.

---

## 1. Invocation

```
codex exec [OPTIONS] [PROMPT]          # alias: e
```

| Fact | Evidence |
|---|---|
| `--json` prints JSONL events to stdout | every `raw/s*.jsonl` |
| **`exec` has NO `-a/--ask-for-approval`** — that flag is top-level/interactive only | first run aborted with `error: unexpected argument '-a' found` |
| **`exec` reads stdin even when PROMPT is in argv** | run hung 3 min until killed; stderr `Reading additional input from stdin...` |
| stdin must be CLOSED to finish — with `< /dev/null` the same run ends in ~8s | `raw/s1-text.stderr.txt` |
| `Reading additional input from stdin...` prints UNCONDITIONALLY, even with stdin already at EOF | present in every stderr capture, including runs that completed |
| `--output-schema <FILE>` is NATIVE structured output | `raw/s3-schema.jsonl` |
| `-o/--output-last-message <FILE>` writes the final message | `s3-last.txt` held the exact JSON |
| `-C/--cd`, `--add-dir`, `-s/--sandbox`, `-m/--model`, `--skip-git-repo-check` accepted | `raw/help-exec.txt` |

`Reading additional input from stdin...` deserves its own line: it is NOT a liveness signal and NOT
a hang signal. A watchdog keying on it would be wrong in both directions.

## 2. Event grammar (stdout, `--json`)

One JSON object per line. Measured sequence of a successful turn (`raw/s1-text.jsonl`):

```
{"type":"thread.started","thread_id":"01a04541-3924-75f1-9f7e-221f3f57cee8"}
{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Model metadata ... not found ..."}}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_1","type":"reasoning","text":"..."}}
{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"PONG"}}
{"type":"turn.completed","usage":{...}}
```

1. **`thread_id` is the session id.** Arrives once, on the FIRST line, before anything else.
2. **An `item` of type `error` is NOT a failed turn.** The model-metadata warning arrives as
   `item.completed{item.type:"error"}` and the turn proceeds to `turn.completed` normally. Only a
   TOP-LEVEL `{"type":"error"}` + `turn.failed` ends a turn. Treating both alike would mark every
   run on a machine with a stale model cache as failed. MEASURED in all six captures.
3. **A failed turn duplicates its message**: top-level `{"type":"error","message":M}` is immediately
   followed by `{"type":"turn.failed","error":{"message":M}}` with the SAME M.
4. **`error.message` is sometimes double-encoded JSON.** The 400 from an unsupported model arrived
   as a JSON *string* containing a JSON object:
   `"message":"{\"type\":\"error\",\"status\":400,\"error\":{...}}"`. A consumer that renders it raw
   shows the operator a wall of escapes. UNFALSIFIED whether this holds for every API error.
5. **There is NO `stop_reason` anywhere.** claude's `AgentStopReason` has no counterpart: success is
   the ARRIVAL of `turn.completed`, failure the arrival of `turn.failed`.

### 2.1 `usage` — the vendor docs are INCOMPLETE

Documented (learn.chatgpt.com/docs/non-interactive-mode): four fields. MEASURED: **five**.

```
"usage":{"input_tokens":2050,"cached_input_tokens":0,
         "cache_write_input_tokens":0,          <-- NOT DOCUMENTED
         "output_tokens":122,"reasoning_output_tokens":0}
```

| codex | `AgentTurnUsage` |
|---|---|
| `input_tokens` | `inputTokens` |
| `cached_input_tokens` | `cacheReadInputTokens` |
| `cache_write_input_tokens` | `cacheCreationInputTokens` |
| `output_tokens` | `outputTokens` |
| `reasoning_output_tokens` | **NO HOME** |

`reasoning_output_tokens` has no field in `AgentTurnUsage`. On a reasoning model it can dominate the
turn's cost, so dropping it under-bills systematically. That is a gap in a SHARED contract type, not
a runner detail — see §6.

## 3. Session resume

```
codex exec resume [OPTIONS] [SESSION_ID] [PROMPT]     # or --last
```

MEASURED (`raw/s4-resume.jsonl`):

- **`thread_id` is STABLE**: resuming `01a04541-…-221f3f57cee8` re-emitted the identical id.
- **Context is genuinely replayed**: `input_tokens` went 2050 → 4100 on the resumed turn.
- **`resume` accepts a STRICTLY NARROWER flag set than `exec`.**

| flag | `exec` | `exec resume` |
|---|---|---|
| `--json` `--output-schema` `-o` `-m` `-c` `--skip-git-repo-check` | yes | yes |
| `-s/--sandbox` | yes | **no** |
| `-C/--cd` | yes | **no** |
| `--add-dir` | yes | **no** |
| `--oss` `--local-provider` | yes | **no** |

This is the sharpest divergence from claude, where `--resume` is one more flag on an otherwise
identical argv. Here **resume is a different argv shape**, and sandbox + cwd are NOT re-expressible
on it — they come from the recorded session.

## 4. MCP

There is **no `--mcp-config`**. Servers live in `~/.codex/config.toml` under `mcp_servers` (managed
by `codex mcp add`). Per-run injection goes through inline TOML override:

```
-c 'mcp_servers.<key>.command="node"'
-c 'mcp_servers.<key>.args=["/path/server.js","--probe"]'
-c 'mcp_servers.<key>.env={CODM_RUN_TOKEN="tok-abc123"}'
```

**MEASURED to actually spawn** (`raw/s5-mcp.jsonl` plus the probe's own `mcp-proof.json`):

```json
{ "argv": ["--probe"], "token": "tok-abc123", "at": "2026-08-27T22:11:33.067Z" }
```

Args AND env reach the child, `~/.codex/config.toml` is untouched, and the run token can ride in
`env` exactly as the stdio branch of `renderMcpConfig` already does for claude.

- `codex mcp add` also supports HTTP servers (`--url`, `--bearer-token-env-var`), so the http branch
  of `AgentMcpInvocation` has a counterpart. UNFALSIFIED via inline `-c`.
- **MCP connects during process boot, before the turn resolves.** An auth-failed run still logged
  `rmcp::transport::worker` errors. The run token is live from spawn, not from first tool call — so
  `revoke()` in the runner's `finally` remains the correct discipline.

## 5. Cancellation

MEASURED (`raw/s6-cancel.jsonl`): SIGKILL 25s into a turn left **3 complete lines**
(`thread.started`, the warning item, `turn.started`), a trailing newline, and **no terminal event at
all** — neither `turn.completed` nor `turn.failed`.

The runner therefore cannot rely on a terminal frame to close a cancelled run; the result must be
synthesized from "no terminal event + exit code". The same conclusion claude reached for its
watchdog path, arrived at by a different route.

### What a LOCAL model could not measure

`item.started` / `item.updated` were never observed — only `item.completed`. Likewise the item
variants `command_execution`, `file_change`, `mcp_tool_call`, `web_search`, `todo_list` never
appeared: `qwen3:4b` declined to call any tool (`raw/s2-tool.jsonl` — it answered "the functions
available to me do not include any tools for reading local files"). Those shapes are **UNFALSIFIED**
and must be marked as such wherever the decoder handles them. Measuring them needs a quota-bearing
account or a stronger local model.

## 6. Open questions for design

1. **`reasoning_output_tokens` has no home in `AgentTurnUsage`** (§2.1). Add a fifth bucket to the
   shared type, or accept systematic under-counting on reasoning models?
2. **`capabilityFlags` assumes "capability == flag in `--help`"** — true for claude, FALSE for codex,
   whose MCP is a config key and whose resume is a subcommand. Probing `--help` for `--mcp-config` /
   `--resume` (what `PROVIDER_BINARIES[CODEX]` does today) reports both capabilities as ABSENT on a
   CLI that has both.
3. **`AgentModelId` is a closed enum; codex's model list is served per-account and churns.**
   Measured: the list changed wholesale between two logins on this machine (`gpt-5.3-codex`,
   `gpt-5.1-codex`, … → `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4-mini`). Pinning a slug
   into a cross-language enum would ship stale. `PROVIDER_MODELS[CODEX] = [DEFAULT]` is the honest
   catalog entry and passes all three `auditProviderModels` gates.
