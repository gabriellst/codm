---
name: build
description: Execute an approved implementation plan autonomously via a /goal that encodes every completion criterion (Tasks committed, per-Task spec-compliance review, tsc/lint/test/e2e clean, aggregate code-quality at end, ACs covered, git clean) and let Claude work across turns until the haiku evaluator confirms the goal. Use AFTER /plan and BEFORE /pr.
argument-hint: <path to approved plan file> [--dry-run] [--max-turns N] [--worktree]
---

# /build — Plan Execution via `/goal` loop

`/build` translates a plan's completion criteria into a single
**goal condition** that Claude works toward across turns. After
each turn the evaluator (haiku) checks the condition; if not met,
Claude keeps working with the evaluator's reason as guidance for
the next turn. When met, the goal clears automatically.

Four non-negotiable principles:

1. **Agent team execution.** `/build` runs as an **orchestrator
   (opus)** dispatching **workers (sonnet)** in parallel within
   each wave, with **reviewers (haiku)** gating commits. The
   orchestrator never writes code; the workers never commit; the
   reviewers never modify code.

2. **Per-Task spec-compliance review + aggregate code-quality review.**
   After each Task: **spec-compliance** (`spec-compliance-reviewer`,
   haiku) gates the commit — does the diff match the plan's contract?
   no over/under-building? Code-quality review does NOT run per-Task —
   it runs **once at the end** as the aggregate `scripts/review.ts --pr`
   pass against the whole branch (cheaper, and the spec-compliance gate
   already keeps each Task honest about scope).

3. **Implementer ≠ reviewer.** Implementer is the per-Task `Agent:`
   from the plan (a worker on sonnet by default). Reviewer per Task
   is `spec-compliance-reviewer` (haiku); aggregate reviewer at the
   end is `scripts/review.ts --pr` (haiku). Never the same agent.

4. **`/build` owns git.** Workers modify files; `/build` commits
   them after spec-compliance returns `MATCH` — atomic, one commit
   per Task. This keeps the per-Task fix-loop clean (no commit
   history of failed fix attempts).

Continuous execution: do NOT check in with the user between Tasks.
Stop only on (a) a `BLOCKED` you cannot resolve, (b) `--max-turns`
hit, or (c) all Tasks complete.

## Agent Teams

`/build` is an **agent-team execution** model with three roles, each
mapped to a Claude model tier.

### Orchestrator (this session — opus)

The `/build` session is the orchestrator. It runs on **opus** —
recommended via Claude Code's session model setting; if the user
launched `/build` on a smaller model, the orchestrator simply
operates with less judgment per turn but the contract still holds.

The orchestrator's responsibilities:

- Parse the plan into a typed AST (Phase 1 pre-flight).
- Topo-sort Tasks into waves.
- Dispatch the wave's workers in **parallel** (one `Agent` call per
  Task in a single message). The worker is FRESH-CONTEXT — it sees
  only what you pass, not this session. So the dispatch prompt MUST
  carry the Task's handoff verbatim: its `**Consumes (frozen):**`
  exact identifiers, `**Scope fence:**` (DONE/OUT), `**Files to
  write/read:**`, `**Skills:**`, and `**Gate:**`. A worker handed a
  thin prompt re-derives shapes and drops the tail — the exact
  single-context failure the fan-out exists to avoid. If a Task's
  handoff fields are empty, that is a PLAN defect: send it back to
  `/plan`, don't dispatch a worker to guess.
- Read worker reports; route by status (DONE / DONE_WITH_CONCERNS /
  NEEDS_CONTEXT / BLOCKED).
- Dispatch the per-Task spec-compliance reviewer.
- After all Tasks committed: dispatch the aggregate code-quality
  review (`scripts/review.ts --pr`).
- Decide re-dispatch / commit / escalate.
- Own git (commit after spec-compliance returns MATCH; no `git commit`
  by workers). **Stage the specific files for each Task — never `git add -A`/`git add .`**:
  with a parallel worker pool, broad staging bundles another Task's
  (or an external actor's) in-flight changes into the wrong commit.
  Before any regen step (`bun sdk` / `bun contracts` / `emit-openapi`),
  commit or discard first — never `git stash` across a regen, since the
  generators rewrite tracked files and the pop will conflict and silently
  drop applied edits.
- Surface every `bun tsc` / `bun lint` / `bun test` / `bun e2e` /
  `scripts/review.ts` output to the transcript so the haiku
  goal-evaluator can judge progress.
- **Completeness audit — dispatch EVERY Task, drop nothing (the #1
  measured failure).** Before declaring the build done, re-walk the
  plan's full Task list and confirm each Task was dispatched to a
  worker, returned, and gated — *including the LAST ones* (the e2e
  spec, the secondary commands like list-creation / archive / move).
  The measured failure mode at app scale is **tail-drop**: finishing
  the early waves and silently skipping or self-stubbing the final
  Tasks. A Task in the plan with no committed worker output is an
  incomplete build, not a done one — dispatch it. Never implement a
  "small remaining" Task yourself to save a round-trip; that is the
  tail-drop in disguise. The plan is the checklist; every line gets a
  fresh worker.

The orchestrator never edits files directly — every code write goes
through a worker dispatch.

### Workers (sonnet, parallel)

Workers are the four implementer agents already defined in
`.claude/agents/`, all declared `model: sonnet`:

| Agent | Handles Tasks involving |
|---|---|
| `backend-developer` | Controllers, entities, use cases, repositories, schemas, events, handlers, the SDK regen Contract Lock |
| `frontend-developer` | Routes, components, forms, stores, primitives, i18n keys |
| `database-architect` | Drizzle schema, migrations, table modeling |
| `qa-tester` | E2E tests (Playwright), test data fixtures |

A Task's `Agent:` field in the plan selects which worker runs it.
The worker inherits **sonnet** from its `AGENT.md` — `/build` does
NOT override the model per Task by default.

**Worker model overrides** (rare, opt-in only):

- A Task may explicitly set `Model: opus` when the work needs
  cross-cutting design judgment (broad refactor, ambiguous DDD
  boundary that `/plan` didn't fully resolve, or a Task that
  exceeded scope and needs replanning judgment from within the
  worker). The override must include a one-line rationale in the
  Task body (per the plan's `PR-25` rule).
- A Task may set `Model: haiku` for trivial mechanical changes
  (a single typed-string union edit, a barrel-only re-export). Cost
  optimization, not a quality concession.

If a worker returns `BLOCKED` for a reasoning gap (not a context
gap), the orchestrator may **bump that one re-dispatch to opus** as
a recovery action. The default for the next Task remains sonnet.

### Reviewers (haiku)

Both reviewers run on **haiku** — fast, cheap, focused on a single
question each. They run at different points in the loop:

| Agent | When it runs | Question it answers |
|---|---|---|
| `spec-compliance-reviewer` | **Per Task**, before commit | Does the diff match the plan's Task contract? No over- or under-building? |
| `scripts/review.ts --pr --model haiku` | **Once at the end**, after all Tasks committed | Does the code follow the codebase's BP registry across the whole branch? Zero critical findings? |

Across parallel Tasks in the same wave, the per-Task spec-compliance
reviewers can run in parallel since they operate on disjoint diffs.

The aggregate code-quality review at the end is cheaper than running
`scripts/review.ts --files` per Task and catches the same issues
(plus any cross-Task drift). The spec-compliance gate keeps each
Task within scope, so by the time the aggregate review runs the
diff is honest.

### Team budget per Task (typical)

- 1× worker dispatch (sonnet) — implements
- 1× spec-compliance review (haiku) — verifies spec match
- 0-2× worker re-dispatch (sonnet) — fixes if review flagged MISSING/EXTRA
- 1× orchestrator commit (opus, owns git, no model burn per commit)

Max 3 re-dispatch attempts before escalating to user.

### End-of-build aggregate cost

- 1× `scripts/review.ts --pr --model haiku` over the whole branch
- 0-N× worker re-dispatch (sonnet) if aggregate review flags critical
  — each fix is scoped to the file(s) cited.

## Worktree Isolation (when `--worktree`)

Adapted from `obra/superpowers:using-git-worktrees`. The principle:
**ensure work happens in an isolated workspace**. Detect existing
isolation first; create a worktree only if needed; never fight the
harness.

Worktree isolation is **opt-in** via the `--worktree` flag. Without
it, `/build` runs in the current directory and modifies files there.

### Step 0a — Detect existing isolation

Before creating anything, check if `/build` is already running in
an isolated worktree:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)

# Submodule guard — GIT_DIR != GIT_COMMON is also true in submodules.
# If this returns a path, we're in a submodule, not a worktree.
IN_SUBMODULE=$(git rev-parse --show-superproject-working-tree 2>/dev/null)
```

If `GIT_DIR != GIT_COMMON` **and** `IN_SUBMODULE` is empty → already
in a linked worktree. Skip to Step 0c (project setup). Do NOT create
another worktree.

Report:
- On a branch: *"Already in isolated worktree at `<path>` on branch `<name>`. Skipping creation."*
- Detached HEAD: *"Already in isolated worktree at `<path>` (detached HEAD). Branch will be assigned at PR time."*

If `GIT_DIR == GIT_COMMON` (or in submodule) → normal repo checkout.
Proceed to Step 0b.

### Step 0b — Create the worktree

We have no native worktree tool in this harness (no `EnterWorktree` /
`WorktreeCreate` etc. exposed to `/build`), so use `git worktree`
directly.

**Directory selection** (priority order):

1. **Existing project-local directory** — check for `.worktrees/`
   or `worktrees/`:
   ```bash
   ls -d .worktrees 2>/dev/null     # preferred (hidden)
   ls -d worktrees 2>/dev/null      # alternative
   ```
   If both exist, `.worktrees/` wins.

2. **No existing directory** — default to `.worktrees/` at the
   project root.

**Safety verification (mandatory for project-local directories):**

```bash
git check-ignore -q .worktrees 2>/dev/null
```

Exit 0 → ignored, safe to use.

Exit non-zero → **add to `.gitignore` first**, commit the change,
then proceed:

```bash
echo ".worktrees/" >> .gitignore
git add .gitignore
git commit -m "chore: gitignore .worktrees/"
```

This prevents accidentally committing worktree contents to the
repository.

**Create the worktree:**

```bash
SLUG=$(basename "$ARGUMENTS" .md | sed 's/^[0-9-]*-//')  # extract slug from plan filename
WT_PATH=".worktrees/$SLUG"
WT_BRANCH="build/$SLUG"

git worktree add "$WT_PATH" -b "$WT_BRANCH"
cd "$WT_PATH"
```

If the branch `build/<slug>` already exists (a previous `/build`
attempt), use it instead:

```bash
git worktree add "$WT_PATH" "$WT_BRANCH" 2>/dev/null \
  || git worktree add "$WT_PATH" -b "$WT_BRANCH"
```

**Sandbox fallback:** if `git worktree add` fails with a permission
error (sandbox denial), tell the user the sandbox blocked worktree
creation and proceed in the current directory instead. Set
`$WT_PATH = $(pwd)` so subsequent steps still work.

### Step 0c — Project setup inside the worktree

The worktree is a checkout with no `node_modules/`, no `.env`, and
a fresh state. Set it up by invoking `/install`:

```bash
# From inside the worktree
/install --skip-dev
```

`/install --skip-dev` runs the full bootstrap (`.env` copy, `bun
install`, docker-compose check, DB create-if-missing, migrations,
SDK regen) **without** starting `bun dev`. `/build` doesn't need
dev servers running — `bun test` (PGlite) and `bun tsc` / `bun lint`
work without them.

If `/install` fails at any step, **stop and surface the failure**.
Do not proceed with `/build`. The worktree stays in place for
inspection.

### Step 0d — Verify clean baseline

Run the affected test suite before starting any Tasks:

```bash
bun tsc      # should be clean
bun lint     # should be clean
bun test affected --base=dev    # should be all-green
```

If the baseline is dirty (pre-existing failures), report:

```
Worktree ready at <WT_PATH> but baseline has issues:
  tsc: <N> errors
  lint: <M> findings
  test: <K> failing tests

Proceed anyway? Pre-existing failures will be hard to distinguish
from regressions introduced by this build.
```

Ask the user before proceeding. **Don't auto-accept a dirty baseline.**

### Step 0e — Report and continue

Report:

```
Worktree ready at .worktrees/<slug> on branch build/<slug>.
Baseline: tsc ✓ · lint ✓ · test ✓ (<N> tests passed).
Proceeding to Step 1 — Pre-flight.
```

Then continue with Step 1 below.

### When NOT to use worktree isolation

- **The plan is tiny** (1-2 Tasks, no schema changes) — overhead of
  worktree creation outweighs the safety benefit.
- **You're already in a worktree** (Step 0a detected it) — skip.
- **The sandbox blocks `git worktree add`** — fall back to in-place
  (Step 0b sandbox fallback).
- **You need to test with the user's running `bun dev`** — the
  worktree gets its own checkout, so its dev server (if you start
  one) collides with the user's on the default ports. Either skip
  the worktree, or manually adjust the worktree's `.env` ports.

## When to Use

- An approved plan exists at `.plans/<slug>.md`.
- The plan passes `bun scripts/graph/cli/index.ts validate-plan`.
- You want to ship the plan with minimum further interaction.

## When NOT to Use

- Plan is draft or has `<placeholder>` text.
- `validate-plan` reports findings — fix the plan first.
- Change is trivial (one file, no Tasks worth of structure).
- You want fine-grained manual control over each step.

## Instructions

### Step 1 — Pre-flight (this turn, deterministic)

Refuse to set a goal against a corrupt plan. Run in order:

```bash
bun scripts/graph/cli/index.ts validate-plan "$ARGUMENTS"
```

Exit code ≠ 0 → **stop and report findings**. Do NOT set a goal.

```bash
bun scripts/graph/cli/index.ts parse-plan "$ARGUMENTS" --json \
  > /tmp/build-plan.json
```

Produces the typed PlanAST (`tasks[]` with `id`, `name`, `agent`,
`reviewer`, `skills`, `filesWrites`, `filesReads`, `dependsOn`,
`steps`, `status`, optional `model`).

Compute waves (topo-sort by `dependsOn`), skipping `status: done`
Tasks. Verify per-wave no two parallel Tasks have overlapping
`filesWrites`. Any check fails → **stop and report**, do not set
a goal.

Derive the **feature slug** from the plan filename
(`.plans/<date>-<slug>.md` → `<slug>`). Used in the e2e
condition.

Read the spec linked by the plan (`planAst.specPath`) to extract
the AC list and the per-Task AC coverage (from the plan's
`## Final Validation` AC mapping). Both feed the goal condition.

**Per-Task model resolution.** For every Task:

1. If the Task body has an explicit `Model:` field → use that value
   (honor the plan author's intent).
2. Otherwise → inherit from the worker agent's `AGENT.md` (sonnet
   for all four worker agents: `backend-developer`,
   `frontend-developer`, `database-architect`, `qa-tester`).

**No automatic derivation by file count or skill kind.** The team
contract is: orchestrator opus, workers sonnet, reviewers haiku.
Overrides are explicit choices in the plan, not heuristics applied
here. The previous heuristic (haiku for ≤2 files, opus for DDD
skills) was removed because it created unpredictable model mixes
across Tasks of similar shape and made cost projection impossible.

**Worktree (optional).** If `$ARGUMENTS` includes `--worktree`,
this Step 1 (Pre-flight) is preceded by **Step 0 — Worktree
Isolation** (the dedicated section above). Step 0 detects existing
isolation, creates the worktree if needed, runs `/install
--skip-dev` inside it, and verifies a clean baseline before
Pre-flight starts.

Without `--worktree`, Step 1 runs in the current directory and
`/build` modifies files in place.

If `$ARGUMENTS` includes `--dry-run`, print the goal condition that
would be set (and the wave breakdown + per-Task agent+model team
assignments), then exit without invoking `/goal`. Dry-run does NOT
create a worktree — even with `--worktree`, it just prints what
would happen.

### Step 2 — Set the goal (this turn)

Run `/goal` with a condition that encodes **every completion
criterion**:

```
/goal All of the following hold for the current branch:

(1) Every non-done Task in /tmp/build-plan.json has at least one
    commit on the current branch whose message references the
    Task ID. Verified by `git log --since=<build-start> --oneline`
    listing all expected Task IDs.

(2) `bun tsc` exits 0. Verified by the latest `bun tsc` output in
    this conversation showing "0 errors".

(3) `bun lint` exits 0. Verified by the latest `bun lint` output
    showing no findings.

(4) `bun test affected --base=dev` exits 0 with all affected tests
    passing.

(5) `bun e2e --grep "<slug>"` exits 0 with every spec test passing.

(6a) Every non-done Task's spec-compliance review returned MATCH.
     Verified by the transcript showing a MATCH line for each Task
     after its implementer's diff.

(6b) Final aggregate `bun scripts/review.ts --pr --base dev --model
     haiku --print` reports 0 critical findings — the single code-
     quality gate covering the whole branch.

(7) Every Acceptance Criterion from <plan>'s Final Validation block
    maps to a passing test path mentioned with a green result in
    this conversation. ACs: <AC-1, AC-2, ..., AC-N>.

(8) `git status` is clean (no uncommitted changes).

Stop after <max-turns> turns regardless of state if the user passes
--max-turns; default 100.
```

Substitute `<slug>`, the AC list, and `<plan>` from the parsed AST.

Setting the goal starts the loop automatically (next turn driven
by the evaluator).

### Step 3 — Work toward the goal (subsequent turns)

Each turn, follow this priority order to pick the next action:

**3.1 Pending Tasks exist?** → Dispatch the next wave's Tasks in
**parallel** (one `Agent` call per Task in a single message). Each
dispatch uses the Task's resolved model (explicit `Model:` field
OR the worker agent's AGENT.md default — sonnet for all four
workers).

After each implementer returns, handle by status:

| Status | Action |
|---|---|
| `DONE` | Proceed to spec-compliance review |
| `DONE_WITH_CONCERNS` | Read the concerns. If substantive (correctness / scope), patch and re-dispatch. If observational ("file is getting large"), log and proceed to review |
| `NEEDS_CONTEXT` | Provide the missing context, re-dispatch with same model |
| `BLOCKED` | (a) context problem → provide context + re-dispatch same worker on same model; (b) reasoning gap → bump THIS re-dispatch only to opus (worker default stays sonnet for next Tasks); (c) task too large → split and re-plan; (d) plan wrong → escalate to user |

**Never** ignore an escalation or retry the same model without
changes. If the implementer said `BLOCKED`, something must change.

**For each DONE / DONE_WITH_CONCERNS Task:**

**3.2 Spec-compliance review.** Dispatch `spec-compliance-reviewer`
agent (haiku). Pass:

- The Task section from `/tmp/build-plan.json` verbatim
- The Task's AC coverage list (from the plan's Final Validation)
- The diff: `git diff <task-base>..HEAD -- <Task.filesWrites>`

Reviewer returns `MATCH` or `MISSING:<list>` / `EXTRA:<list>`.

- `MATCH` → proceed to commit (no per-Task code-quality review)
- `CHANGES_REQUESTED` → re-dispatch the SAME implementer with the
  findings as context. Loop until `MATCH` (max 3 attempts; if still
  failing, surface in transcript so the evaluator can decide).

**3.3 Commit.** `/build` runs:

```bash
git add <Task.filesWrites>
git commit -m "feat(<ctx>): <Task.name> (Task <Task.id>)"
```

If the pre-commit hook fails on unrelated checks, **stop the turn
and surface to user**. Do not bypass autonomously (`--no-verify`
needs explicit user authorization).

> **No per-Task code-quality review.** Stage 2 of the old two-stage
> flow has been replaced by the aggregate `scripts/review.ts --pr`
> run once at the end (Step 3.5). Spec-compliance per Task keeps
> the diff honest about scope; aggregate review at the end audits
> the BP registry across the whole branch in one pass.

**3.4 Aggregate checks after all Tasks committed.**

After the last Task in the plan has been committed, run these gates
in order. Each must pass before the goal can clear.

1. **`bun tsc`** — full type check
2. **`bun lint`** — lint clean
3. **`bun test affected --base=dev`** — affected tests pass
4. **`bun e2e --grep "<slug>"`** — E2E covers the feature
5. **`bun scripts/review.ts --pr --base dev --model haiku --print`** —
   single aggregate code-quality pass covering the whole branch.
   This is goal criterion (6b) and the ONLY code-quality review in
   the loop.
6. **AC coverage** — every AC from the plan's Final Validation maps
   to a green test mentioned in the transcript.

If any of these fail, dispatch the responsible implementer to fix:

| State | Action |
|---|---|
| `bun tsc` failing | Identify failing files, dispatch responsible implementer agent (typically `backend-developer` / `frontend-developer` based on path) |
| `bun lint` failing | Same |
| `bun test affected` failing | Same |
| `bun e2e` failing | Read Playwright output, dispatch implementer or `qa-tester` |
| `scripts/review.ts --pr` showing critical | Identify cited files, dispatch the implementer whose Task owns those files |
| AC has no green test reference | Look at plan's Final Validation, find the expected test path, run it, surface result |

Always surface the latest `bun tsc` / `bun lint` / `bun test` /
`bun e2e` / `bun scripts/review.ts` output in the transcript after
running it. **The evaluator can only judge what Claude has surfaced.**

### Implementer dispatch template

```
<!-- audit: command=/build task="${task.id}" plan="${planPath}" -->

You are executing Task ${task.id} — ${task.name}.

Spec: ${planAst.specPath}
Plan section: ${planPath}#task-${task.id}

Behavior to deliver: ${task.name}
This is one observable behavior in an outer RED→GREEN cycle (Matt
Pocock vertical slicing). The outer test asserts behavior end-to-end;
inner cycles build the artifacts to make it pass.

Files you may write (exclusive scope):
${task.filesWrites.join('\n')}

Files you may read for context:
${task.filesReads.join('\n')}

Skills you may invoke: ${task.skills.join(', ')}

Steps (full content from plan — including Reference blocks):
${task.steps.map(s => `### Step ${s.id} — ${s.title}\n${s.body}`).join('\n\n')}

Constraints:
- Strict TDD. Failing test FIRST. No exceptions.
- Do NOT commit. /build owns git.
- Do NOT touch any path outside filesWrites (exclusive scope).
- Implement EXACTLY what the steps describe — no extra flags,
  defensive code, "while I was here" refactors, or scope creep.
  The spec-compliance reviewer will catch over-building before commit.
- For cross-context async behaviors, the outer test is a flow
  test in packages/api/tests/flows/ using testBed.pipe(...).run().
  See .claude/skills/test/SKILL.md → "Flow Tests".

If something is genuinely ambiguous after reading the plan, do NOT
guess — return status NEEDS_CONTEXT with the specific question.

When done, report one of these statuses verbatim as the first line:

DONE
DONE_WITH_CONCERNS
NEEDS_CONTEXT
BLOCKED

Followed by:
- Final test output (X pass, Y fail)
- List of paths actually modified (must equal filesWrites)
- For DONE_WITH_CONCERNS: the concerns
- For NEEDS_CONTEXT: the specific questions
- For BLOCKED: what's blocking and what changed
- Any deviation from the plan (and why)
```

### Step 4 — Goal achieved (auto-clear + handoff)

When the evaluator returns yes:

- Goal clears automatically; "achieved" entry lands in the transcript.
- **Defensively** run `/goal clear` (no-op if already cleared, but
  guarantees the session goal is reset).
- Report summary:
  ```
  Build complete.
  Plan: <plan-path>
  Tasks committed: <N>
  Validation: tsc ✓ · lint ✓ · test ✓ · e2e ✓ · spec (per Task) ✓ · quality (aggregate) ✓ · ACs ✓
  Branch commits ahead of origin: <K>.

  Next: /pr (creates PR; opt-in /pr --no-watch to skip subscribe).
  ```
- Do NOT invoke `/pr` automatically — PR creation is user-initiated.

If the goal hits `Stop after N turns` instead of the positive condition:

- Run `/goal clear`.
- Report what's STILL not satisfied (the evaluator's last reason).
- Suggest manual fixes or `/build` again with `--max-turns` higher.

## Relevant Files

Read for context (in this order):

- `/tmp/build-plan.json` — parsed PlanAST from Step 1
- `$ARGUMENTS` — the plan being executed
- `planAst.specPath` — the spec, for AC list extraction
- `.claude/agents/<each-agent>/AGENT.md` — model defaults + role
- `.claude/agents/spec-compliance-reviewer/AGENT.md` — per-Task reviewer protocol
- `.claude/skills/test/SKILL.md` — flow test harness for cross-context Tasks

Write only:

- The files in each Task's `filesWrites` (via implementer sub-agents — `/build` itself doesn't `Write`).
- Git commits (one per Task that passes the spec-compliance review).

Never write:

- Code outside any Task's `filesWrites`.
- Commits when the spec-compliance review has open findings.
- Files when `--dry-run` is set.

## How completion criteria are enforced

| Criterion | Where it's checked |
|---|---|
| Tasks committed | Goal condition (1); evaluator reads git log |
| `bun tsc` clean | Goal condition (2); /build runs after each Task batch |
| `bun lint` clean | Goal condition (3); /build runs after each Task batch |
| `bun test affected` | Goal condition (4); /build runs after each Task batch |
| `bun e2e` (slug) | Goal condition (5); /build runs after all Tasks done |
| Spec-compliance MATCH | Goal condition (6a); /build dispatches `spec-compliance-reviewer` per Task before commit |
| `review.ts --pr` aggregate code-quality | Goal condition (6b); /build runs ONCE after all Tasks done — the sole code-quality gate |
| AC coverage | Goal condition (7); /build verifies plan's Final Validation block |
| Working tree clean | Goal condition (8); evaluator reads `git status` |

The evaluator (haiku) returns NO until **every** criterion holds.
`/build` cannot quietly skip any of them — the goal mechanism is
the safety net.

## Anti-Patterns (do NOT do)

- ❌ Setting the goal BEFORE pre-flight succeeds — corrupt plan corrupts the whole loop.
- ❌ Implementer running `git commit` — `/build` owns git.
- ❌ **Skipping per-Task spec-compliance review.** It's the only gate before commit; without it, over/under-building goes straight into git history and aggregate review at the end ends up rewriting work that should never have been committed.
- ❌ **Running `scripts/review.ts --files` per Task.** This is the old Stage 2; it's been removed. The aggregate `scripts/review.ts --pr` at the end is the single code-quality pass.
- ❌ **Accepting spec-compliance with "close enough" findings.** MISSING/EXTRA = not done; re-dispatch.
- ❌ Letting the implementer self-review replace actual review. The spec-compliance review + aggregate code-quality + self-checks all matter.
- ❌ Bypassing the pre-commit hook (`--no-verify`) without explicit user authorization for the specific commit batch.
- ❌ Auto-fixing review findings inline — always re-dispatch the implementer with findings as context.
- ❌ Hiding test/lint/tsc/review output from the transcript — the evaluator only sees what Claude surfaces.
- ❌ Continuing after `/goal` hits the turn budget without surfacing what's still failing.
- ❌ **Pausing to check in with the user between Tasks.** Continuous execution. Stop only on unresolvable BLOCKED, `--max-turns`, or completion.
- ❌ Invoking `/pr` automatically — PR creation is user-initiated.
- ❌ Letting the goal persist after `/build` finishes — always `/goal clear` defensively.
- ❌ Editing the plan to make the goal easier (e.g. shrinking `Files to write` to skip work). Fix the spec/plan upstream, not the running goal.
- ❌ Dispatching multiple implementers in parallel WITHIN A SINGLE TASK. Parallel works ACROSS Tasks in the same wave (because pre-flight enforced non-overlapping `filesWrites`), never within one Task.
- ❌ **Auto-deriving Task model from file count or skill kind.** The team contract is orchestrator-opus / workers-sonnet / reviewers-haiku. Per-Task overrides require an explicit `Model:` field in the plan with a one-line rationale.
- ❌ **Orchestrator writing files directly.** Every code write goes through a worker dispatch. If you find yourself reaching for `Edit` or `Write` from `/build`, you're skipping the team contract.
- ❌ **Worker running `git commit`.** Workers modify files; `/build` (orchestrator) commits after the per-Task spec-compliance review returns MATCH.
- ❌ **Creating a worktree when Step 0a detected we're already in one.** Nested worktrees create phantom state. Skip creation and proceed.
- ❌ **`git worktree add` without verifying `.worktrees/` is gitignored.** Pollutes `git status` and risks committing worktree contents to the repo. Step 0b enforces the `git check-ignore` gate.
- ❌ **Proceeding with a dirty baseline (Step 0d failing) without asking the user.** Pre-existing failures get conflated with regressions; debugging becomes guesswork.
- ❌ **Skipping `/install` inside a fresh worktree.** The worktree is a clean checkout — no `node_modules/`, no `.env`. `bun test` will fail on import errors before any plan code runs.

## Plan

$ARGUMENTS
