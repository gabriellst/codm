---
name: review
description: Run AI-driven code review on changed/staged/PR/specific files via scripts/review.ts. Defaults to Haiku model for cost; --thorough or --model overrides. Outputs findings to stdout. Use as the primary review entry point for humans; /build calls scripts/review.ts directly under the hood.
argument-hint: [files...] | --staged | --pr [--base BRANCH] | --all [--frontend|--backend] [--context NAME] | [--model haiku|sonnet|opus] | [--thorough] | [--parallel N]
---

# /review — Code Review (registry-driven + AI)

Run `scripts/review.ts` on the appropriate file set and surface
findings. The script:

- Compiles each touched skill's `registry.yaml` into a compact
  checklist (BPs + patterns + cross-cutting rules).
- Spawns one `claude` CLI subprocess per file (or per skill-batch).
- Returns structured failures-only output: `severity`, `lines`,
  `problem`, `fix`.
- Optionally runs a cascade analysis to trace violations bottom-up
  through architectural layers.

`/review` is a thin wrapper. It does **not** dispatch the
`code-reviewer` Agent in the default path — `scripts/review.ts`
already is the AI reviewer, with its own model + parallelism. The
`code-reviewer` agent exists for rare cases needing judgment beyond
the script's output (see `.claude/agents/README.md`).

## When to Use

- After implementing one or more Tasks, before committing.
- During a PR — review what differs from the base branch.
- Auditing an entire workspace (`--all`).
- Manual sanity check before `/build` runs the same script
  internally.

## When NOT to Use

- Inside `/build` — `/build` calls `scripts/review.ts` directly per
  its dispatch sequence. Don't double-invoke `/review` from `/build`.
- For commit message review, code style only, or non-architectural
  concerns — use lint/format tools instead.
- For "is the spec right?" — that's `/spec-review`, not `/review`.

## Argument Forms

```
/review                              # changed files (git diff: HEAD + staged + untracked)
/review --staged                     # only staged files
/review --pr                         # files changed vs origin/dev
/review --pr --base main             # files changed vs custom base
/review --all                        # ALL .ts/.tsx in scope
/review --backend                    # restrict to packages/api/
/review --frontend                   # restrict to packages/app/
/review --context appointment        # restrict to a bounded context
/review path1.ts path2.ts            # specific files (no git inference)
```

Options:

```
--model haiku|sonnet|opus            # default: haiku (this command's default)
--thorough                           # alias: --model opus
--parallel N                         # default: 4 (this command's default)
--output DIR                         # write report files (default: stdout via --print)
--no-batch                           # one prompt per file (default: batched by skill)
--no-cascade                         # skip cascade analysis at the end
--dry-run                            # show what would be reviewed, do not invoke claude
```

## Defaults this command applies

`/review` defaults differ from `scripts/review.ts`'s raw defaults to
match the agentic system's cost/quality conventions:

| Flag        | scripts/review.ts default | /review default | Rationale |
|-------------|---------------------------|------------------|-----------|
| `--model`   | sonnet                    | **haiku**        | Per-Task review is the dominant cost lever; haiku is enough for registry-driven BPs and per-file semantic checks. |
| `--parallel`| 1                         | **4**            | Per-Task review touches 1–4 files typically; parallel 4 saturates without thrashing. |
| `--output`  | stdout                    | `--print` (stdout) | Interactive use; no disk pollution. |

These are auto-applied. Override at the prompt: `/review --model
sonnet --parallel 2`.

## Instructions

### Phase 0 — Argument normalization (silent)

Parse `$ARGUMENTS`. Determine the file selection mode:

- If positional file paths present → "files" mode, no git inference.
- Else if `--staged` → "staged" mode.
- Else if `--pr` → "pr" mode (use `--base` if present, else `dev`).
- Else if `--all` → "all" mode (combine with `--frontend` /
  `--backend` / `--context` if present).
- Else default → "diff" mode (changed files).

Resolve model: prefer `--model <value>`; else `--thorough` → opus;
else default to `haiku`.

Resolve parallel: prefer `--parallel <N>`; else default to `4`.

### Phase 1 — Invoke the script

Build the `bun scripts/review.ts` command line from the resolved
arguments and run it via `Bash`. Always pass `--print` unless the
user supplied `--output DIR`.

Typical invocation:

```bash
bun scripts/review.ts \
  --model haiku \
  --parallel 4 \
  --print \
  [mode flags] \
  [scope flags] \
  [file positionals]
```

Stream stdout back to the user as the script runs. The script
already formats markdown findings; do not reformat.

### Phase 2 — Summarize at the end

After the script exits, append a one-line summary to your reply:

```
Review complete: <N> files reviewed, <C> critical, <M> major, <m> minor.
Model: <model>. Parallel: <N>. Elapsed: <Xs>.
```

If `C > 0`, suggest the next step:

- Single-Task scope: re-dispatch the implementer with the critical
  findings as context.
- PR scope: list the implementer agents responsible per file (from
  recent commit authors or AGENT.md role) and propose targeted
  fixes.

If `C == 0 && M == 0`, suggest: "Ready to commit."

### Phase 3 — Handoff

Do not dispatch any Agent automatically. The human reading the
review decides the next step. The exception is when `/review` is
invoked **from inside another /build session** (the orchestrator
calls `scripts/review.ts` directly there, bypassing this command).

## Relevant Files

Read for context:
- `scripts/review.ts` — the engine. Source of truth for flags,
  output format, batch logic, cascade analysis.
- `.claude/skills/<each-touched-skill>/registry.yaml` — the BPs the
  script compiles into checklists.
- `.claude/agents/code-reviewer/AGENT.md` — the agent variant for
  judgment-heavy review (rarely dispatched).

Write only:
- (Optional) `--output DIR` — review report files when the user opts
  in.

Never write:
- Code changes. `/review` only reads + reports; never modifies.

## Anti-Patterns (do NOT do)

- ❌ Dispatching the `code-reviewer` Agent for routine review — call
  `scripts/review.ts` (which is itself the AI reviewer).
- ❌ Overriding `--model` to sonnet/opus for routine review without
  justification — Haiku is the cost-default for a reason.
- ❌ Running with `--parallel 1` on large file sets — wastes time.
- ❌ Ignoring critical findings and committing anyway.
- ❌ Reformatting the script's output — it's already structured.
- ❌ Auto-fixing inline. If the user wants fixes, they re-dispatch
  the implementer with findings as context (or use `/build`'s
  internal review loop).
- ❌ Writing review reports to disk by default — `--print` keeps
  the conversation tight.

## Examples

```
/review
  → bun scripts/review.ts --model haiku --parallel 4 --print
  Reviews uncommitted changes (HEAD diff + staged + untracked).

/review --pr
  → bun scripts/review.ts --model haiku --parallel 4 --print --pr
  Reviews everything changed vs origin/dev.

/review --backend --context appointment
  → bun scripts/review.ts --model haiku --parallel 4 --print --backend --context appointment
  Reviews only packages/api/src/appointment/** files among changed.

/review packages/api/src/appointment/entities/Appointment.ts
  → bun scripts/review.ts --model haiku --parallel 4 --print packages/api/src/appointment/entities/Appointment.ts
  Reviews exactly that one file.

/review --thorough --pr
  → bun scripts/review.ts --model opus --parallel 4 --print --pr
  Reviews the PR with opus (heavy review for risky branches).

/review --dry-run --pr
  → bun scripts/review.ts --dry-run --pr
  Lists which files would be reviewed, without invoking claude.
```

## Arguments

$ARGUMENTS
