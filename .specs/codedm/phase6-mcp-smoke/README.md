# FASE 6 — AC-6.1 smoke: a REAL `claude` calling OUR MCP door

`SOURCE: measured` — run against the installed binary (`claude 2.1.220`), not derived from the spec.
§8 rule 8-bis(1) was followed literally: attempted for real, in an independent child process, with a
timeout, before any degradation was considered. **It succeeded on the first attempt — AC-6.1 is
cumprida normalmente, not PARKED.**

## What was run

```
cd packages/api/typescript
CODEDM_DATA_DIR=<scratch> API_PORT=<free-port> NODE_ENV=development bun scripts/phase6-mcp-smoke.ts
```

Script: `packages/api/typescript/scripts/phase6-mcp-smoke.ts` (lives there, not here, for the same
reason `phase3-smoke.ts` does — it imports `reflect-metadata` / `@codedm/core-typescript` / the
`@agent`/`@issue`/`@shared` path aliases, which resolve only from inside that package). Raw transcript
and machine-readable report: `raw/smoke.jsonl` (10 lines, the untouched stdout of the child `claude`
process) and `raw/report.json`.

The script boots the REAL daemon in-process (same composition root as `src/index.ts`, `CODEDM_E2E`
**unset** — nothing stubbed), seeds one real `Issue` row directly via `IssueRepository` (the
`given*`-helper pattern, never a use case), mints a run token via the SAME `RunTokenService` singleton
the router verifies against (legitimate: the claim under test is "does a real `claude`, given this MCP
config, call this tool with this spelling", not "does our own agent orchestration decide to"), then
spawns the real `claude` binary in bidirectional headless stream-json with `--mcp-config` pointed at
`http://127.0.0.1:<port>/v1/mcp/issue-handling` and `--allowedTools mcp__codedm__TransitionIssueStatus`,
instructed to call that tool and mark the issue COMPLETED. The child ran with a scrubbed env (no
`CLAUDE`/`ANTHROPIC`/`CMUX` vars) so the nested-invocation guard did not fire.

## Result — `verdict: OK`

| # | frame | what it shows |
|---|---|---|
| 3 | `assistant` / `tool_use` | `ToolSearch({"query":"select:mcp__codedm__TransitionIssueStatus","max_results":1})` — see finding below |
| 4 | `user` / `tool_result` | `[{"type":"tool_reference","tool_name":"mcp__codedm__TransitionIssueStatus"}]` |
| 6 | `assistant` / `tool_use` | **`name: "mcp__codedm__TransitionIssueStatus"`** — THE MEASURED SPELLING, `input: {threadId, issueId, data:{status:"COMPLETED", summary:"…"}}` |
| 7 | `user` / `tool_result` | `{"data":{"issueId":"…","status":"COMPLETED"}}` |
| 8 | `assistant` / text | `DONE` |
| 9 | `result` | `is_error: false`, `subtype: "success"`, `stop_reason: "end_turn"`, `permission_denials: []`, `num_turns: 3` |

After the run, `IssueRepository.findById(issueId)` (same process, direct read) returned
`status: "COMPLETED"` — the real write, through the real router → real generated tool → real
`TransitionIssueStatusController` → real `DeclareIssueComplete` use case → outbox →
`PublishAgentIntegrationEvents` → `MaterializeIssueFromExecution` → `CompleteIssue`, landed.

## The two things ONLY the real CLI could answer (§8 rule 8-bis) — BOTH measured

1. **The literal `tool` spelling in the raw `tool_use` frame:** `mcp__codedm__TransitionIssueStatus`.
   This is **exactly** `WIRE(C) = mcp__${MCP_SERVER_KEY}__${OP(C)}` as `agent/mcp/wire.ts` already
   computes it (`MCP_SERVER_KEY = 'codedm'`, `OP(TransitionIssueStatusController) =
   'TransitionIssueStatus'`) — the guessed convention was **correct**, no edit needed.
2. **The `--allowedTools` string that made the call work:** `mcp__codedm__TransitionIssueStatus` — a
   single value, which is exactly `SCOPE_OPS(s).map(WIRE).join(',')` restricted to the one operation
   this smoke declared (AC-6.5's comma-joined derivation, at n=1).

Both match the goal's standing prediction. `agent/mcp/wire.ts` is unchanged.

## An UNPLANNED finding, recorded because it is real and it is new: `claude 2.1.220` DEFERS MCP tools behind its own `ToolSearch`

Frame 3 is not one of ours: before calling `mcp__codedm__TransitionIssueStatus`, the model called the
CLI's **built-in** `ToolSearch` tool with `{"query": "select:mcp__codedm__TransitionIssueStatus"}` and
only received the tool's identity back (`tool_reference`) — it did not have the schema in its initial
tool list. This was not anticipated by
`.specs/codedm/2026-07-26-agent-driving-stream-json.md` or by the Fase-6 amendment, and is worth
carrying forward:

- It did not block anything here: `--permission-mode auto` auto-approved `ToolSearch` (a read-only
  introspection tool) with zero entries in `permission_denials`, and the model went on to call our
  tool by the exact name `ToolSearch` had just confirmed.
- It means an agent prompt that lists tool names (`IssueWorkPromptBuilder`, §4.8) is talking to a model
  that may need to **search** for a tool before invoking it, rather than seeing it directly in its
  initial tool list — on this CLI build, with this many configured MCP servers in the ambient
  environment. Whether that generalizes to a `IssueWorkAgent` run with the production `--mcp-config`
  (one server, six tools, no other ambient MCP servers competing for the deferred-tool budget) is
  **not measured here** and would need its own probe. Filed as an observation for whoever next touches
  `IssueWorkPromptBuilder` or the runner's tool-count assumptions — **not acted on in this smoke**,
  per the instruction to touch nothing beyond the four findings this round was scoped to.

## Falsifier posture (§8 rule 8-bis)

This is a **measured success**, not a spec-derived substitute — no `SOURCE: spec-derived
(ATTEMPT-FAILED)` stamp applies. The raw JSONL is committed verbatim (`raw/smoke.jsonl`), so the frame
numbering and literal bytes above can be checked directly rather than taken on faith.
