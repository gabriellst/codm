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
   followed by `{"type":"turn.failed","error":{"message":M}}` with the SAME M. **NOT MEASURED — no
   capture contains it.** This was observed live while measuring (the 400 from a model the account
   could not use) and the run was never saved as a `.jsonl`; `grep turn.failed raw/*.jsonl` finds
   nothing, and the only `"type":"error"` matches in the corpus are the NESTED item of point 2. The
   field names above are transcribed from that session, so they are a weaker claim than everything
   else on this page — which is why this line says so rather than letting the numbering imply
   otherwise. `CodexFrameDecoder` handles the shape and repeats the caveat at the two methods that
   do.
4. **`error.message` is sometimes double-encoded JSON.** The 400 from an unsupported model arrived
   as a JSON *string* containing a JSON object:
   `"message":"{\"type\":\"error\",\"status\":400,\"error\":{...}}"`. A consumer that renders it raw
   shows the operator a wall of escapes. UNFALSIFIED whether this holds for every API error.
5. **There is NO `stop_reason` anywhere.** claude's `AgentStopReason` has no counterpart: success is
   the ARRIVAL of `turn.completed`, failure the arrival of `turn.failed`.
6. **The final answer is not on the terminal event.** `turn.completed` carries `usage` and nothing
   else; the answer is the last `agent_message` item. A decoder therefore has to REMEMBER it, which
   is the one piece of state `CodexFrameDecoder` keeps beyond the thread id.

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
3. ~~**`AgentModelId` is a closed enum; codex's model list is served per-account and churns.**~~
   **CLOSED 2026-09-02 (founder): the member is a CODENAME, the version is not in the contract.**

   The measurement stands, and it is the whole argument: the account-served list changed wholesale
   between two logins on this machine (`gpt-5.3-codex`, `gpt-5.1-codex`, … → `gpt-5.6-terra`,
   `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4-mini`). Two conclusions were drawn from it in turn, and the
   first two were both wrong:

   - **Empty catalog** (the original): leaves the operator with NO choice on a CLI that has several,
     to avoid a failure the transport already reports loudly — a slug the account does not serve comes
     back as `not supported for your account`, a 400 on that turn (§5 point 3), never a silent
     substitution.
   - **Pin the three slugs as members** (`GPT_5_3_CODEX` / `GPT_5_2_CODEX` / `GPT_5_1_CODEX`):
     falsified within the week, on this same machine. `~/.codex/models_cache.json` (fetched
     2026-08-27) lists `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4-mini` and NOT ONE of the
     three — so the entire codex row had become three guaranteed 400s, bought with a contract edit, a
     migration (0027) and an SDK regen. The stale pin outlived even the operator's own
     `~/.codex/config.toml`, which still said `model = "gpt-5.3-codex"`.
   - **A member is a TIER CODENAME and the version floats** (the standing answer): `TERRA` is "the
     balanced codex model", `LUNA` "the fast one" — exactly what `SONNET`/`OPUS`/`HAIKU` have always
     been for claude, where nobody ever considered spelling `CLAUDE_4_5_SONNET` into the wire enum.
     `PROVIDER_MODELS[CODEX]` lists the two plus `DEFAULT` (the way back for whoever picked a tier the
     account stopped serving), and `CodexAgentRunner` renders `-m <slug>` through
     `CODEX_MODEL_ALIASES` — the ONE place a version is spelled anywhere in the repo. A vendor bumping
     `gpt-5.6-terra` to `gpt-5.7-terra` is now a one-line edit with no contract bump, no migration and
     no SDK regen; a vendor RETIRING a codename still costs a contract edit, which is correct, because
     that is the event that changes what the operator may choose. Migration 0028 carries the CHECK and
     normalizes any row left holding a retired member. `-m` sits outside the resume shape-narrowing
     because both help captures list it (`help-exec.txt:40`, `help-exec-resume.txt:41`).

   `gpt-5.5` (frontier) and `gpt-5.4-mini` are deliberately NOT offered: they carry no codename, so a
   member for either would put a version straight back into the contract.

   A rail replaced the prose: `agent-models.test.ts` fails on any `AgentModelId` member that is not
   letters-only, so the next versioned member is red before it reaches a migration.

   What this does NOT change: `comingSoon` and the catalog stay two axes. A build that cannot drive
   the codex binary still reports it `comingSoon` while serving the same catalog — the CLI's models are
   a fact about the CLI, not about this deployment's wiring.

## 7. Config-parse measurement (2026-08-31, Windows host, codex-cli 0.150.0)

The smokes above drive a MODEL to measure the event grammar. The MCP declaration needs no model:
`codex mcp list -c …` resolves the config and prints the server, so each shape costs nothing and is
settled by measurement rather than by analogy with claude. Full capture: `raw/config-parse-probe.txt`.

This closed §4's `UNFALSIFIED` note on the http transport — and found that BOTH branches of
`renderMcpOverrides` as first written were rejected outright:

| rendered | result |
|---|---|
| `env={CODM_RUN_TOKEN="tok"}` | resolves — `Env  CODM_RUN_TOKEN=*****` |
| `env={"CODM_RUN_TOKEN":"tok"}` | `Error: failed to load bootstrap configuration` — `invalid type: string …, expected a map` |
| `bearer_token_env_var="CODM_RUN_TOKEN"` | resolves — `Auth: Bearer token` |
| `bearer_token="tok"` | `Error: bearer_token is not supported for streamable_http` |

Two things follow that the spec previously got wrong:

1. **A JSON value does not degrade, it aborts.** `help-root.txt:46-52` — *"The `value` portion is
   parsed as TOML. If it fails to parse as TOML, the raw string is used as a literal."* The literal is
   then a string where the deserializer wants a map, so the whole config load fails and the run dies
   at startup. Not a tool-less run, not a 401.
2. **`bearer_token_env_var` takes a variable NAME.** So the token has to be in the environment of the
   codex process itself, which is what `AgentProcessSpec.env` exists for. Consequence worth naming:
   on the http path the run token is in NO argv, so it is not visible in `ps`.

## 8. Known issues, recorded rather than fixed

Stated here so they are found as known rather than rediscovered as new. Each is also noted at its
own site in the code.

1. **The run token is in argv on three of the four paths.** codex/stdio (`-c …env={…}`) and both
   claude paths (`--mcp-config <json>`) put an opaque, short-lived, `finally`-revoked token into a
   process argument, readable by any local process. This is a property of what the CLIs accept, not a
   defect introduced by either runner; codex/http is the one path that escapes it, and only because
   its config takes a variable name. If it ever needs closing, the fix is per-runner (a temp file, or
   a real env var) and belongs with a threat model, not with a rendering change.
2. **`renderPrompt` joins messages without role markers** (`CodexAgentRunner.ts`). Nearly unreachable
   while `sessionResume` probes true — after the first turn the transcript lives in the recorded
   session. Exposure is a first turn built from several messages.
3. **The stale-lock reclaim can produce two owners** (`core/db/sqlite/lock.go` and
   `core/src/db/drivers/DataDirLock.ts`, same shape on both sides). Two daemons that read the same
   dead holder can both remove-and-republish; the second stomps the first. Pre-existing, and narrower
   since the atomic publish landed — that fix closed the window that actually fired. Closing this one
   means a conditional rename, i.e. a different design than a lockfile.
4. **`reasoningOutputTokens` reports `0` for a field that is absent** (`CodexFrameDecoder.ts`), while
   the event declares it optional with the meaning "not reported". Harmless against 0.150.0, which
   always sends it; it would become silent under-billing on a build that stops.
