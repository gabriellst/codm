# Autonomous Build Daemon — Design Spec

**Date:** 2026-05-27
**Status:** Draft
**Scope:** new tooling — a self-hosted daemon orchestrating the existing `/plan → /build` pipeline; GitHub Issues + a Projects v2 board as work queue; a repo-level autonomy policy; native branch-protection gating for auto-merge. No change to the build engine itself.
**Kind:** infrastructure / agentic tooling
**Story Points:** 13 — a new long-running process with GitHub integration (Issues + Projects v2 + branch protection), git worktree lifecycle management, headless Claude Code invocation, a policy/config layer, and a fail-safe circuit breaker. Low per-piece complexity, real integration and safety surface.

> This is **sub-project A** of a three-part program to make the repo self-evolving. A = durable runner + autonomy-policy gates (this spec). B = goal-generator (decides *what* to build). C = independent fitness function / oracle (makes auto-merge trustworthy). A is the foundation both the "supervised overnight runner" and the "fully autonomous loop" require; B and C get their own spec → plan → build cycles.

## Context

The repo already has a mature agentic pipeline expressed as Claude Code commands: `/brainstorm → /plan → /build → /pr → /review`. `/build` is itself an autonomous multi-agent orchestrator — it encodes a plan's completion criteria into a `/goal`, dispatches worker agents in parallel waves, gates every commit with a `spec-compliance-reviewer`, runs an aggregate `scripts/review.ts --pr` at the end, and loops across turns (without human check-in) until a haiku evaluator confirms the goal or it hits `BLOCKED`/`--max-turns`. Architecture is codified as machine-readable `registry.yaml` checklists per artifact type, and a deterministic CLI scaffolder (`bun cli`) emits boilerplate.

What is missing is everything *around* that engine that would let it run unattended:

- The engine runs inside an interactive laptop session, bounded by `--max-turns`. There is no durable trigger; `.github/workflows` is empty.
- All work originates from a human feature request routed through the `product-owner` agent — documented as the "only gateway to human input." Nothing pulls work autonomously.
- There is no policy layer deciding *where a human must sign* (plan approval, merge), so "supervised" vs "autonomous" cannot be expressed per project or per task.

The code already lives on GitHub: `gabriellst/template-fullstack` (private), default branch `v1.4`, `gh` authed with `repo` scope; `.github/workflows` is currently empty (no CI yet). The team plans sprints in ClickUp, but the agent loop's artifacts — branches, PRs, merges, status checks — are inherently GitHub, so the agent queue is modeled in GitHub (Issues + a Projects v2 board) rather than synced from a second system. ClickUp stays the human PM tool but is **not** read by the daemon.

## Problem

1. The build engine is excellent but tethered to a human-driven, single-session trigger. It cannot work an existing backlog overnight.
2. There is no way to express "this project may auto-merge" vs "this project always stops at a PR" — autonomy is all-or-nothing and implicit.
3. An unattended runner that fails carelessly is worse than none: a bad run could corrupt `main`, burn a whole night on a systemic fault (e.g. red `tsc` at HEAD), or silently drop work.

## Goal

A self-hosted daemon drains a GitHub queue of human-approved specs (issues labeled `agent:ready`), runs the existing `/plan → /build` pipeline in isolated git worktrees, and parks each result at a human gate whose position is set by a per-repo autonomy ceiling capped against a per-issue requested level. The daemon never touches the default branch on failure, surfaces every outcome back onto the issue/PR and its board card, and halts itself when something is systemically wrong. The result: a "supervised overnight runner" today, and the substrate for full autonomy once sub-projects B and C land — selectable per project via one config value.

## Decisions

### D1 — Entry contract: the daemon executes approved specs only
`/brainstorm` requires a human (the `product-owner` gateway). The daemon therefore does **not** brainstorm or invent intent. A GitHub issue is eligible only when its body's `Spec:` line resolves to a spec file in `.specs/*.md` with `Status: Approved`. That approved spec is the human authorization that legitimizes the whole run. Spec/goal generation is explicitly deferred to sub-project B.

### D2 — Runtime: self-hosted always-on daemon
A long-running Bun/TS process on a self-hosted box. It owns its own poll loop, queue cursor, secrets, and uptime. Chosen over GitHub Actions (no CI minutes ceiling on long `/build` runs; full control) and over the Claude Code harness scheduler (which only runs while a laptop session is alive).

### D3 — Work source: GitHub Issues + a Projects v2 board
The agent queue is modeled entirely in GitHub — one system for the whole loop (issue → branch → PR → merge → issue close). The daemon polls open issues by label, drives a Projects v2 board for the human kanban view, and invokes Claude Code headless (`claude -p "/plan …"` then `claude -p "/build …"`) — it adds no new execution engine. ClickUp was evaluated and dropped from the loop: it would be a second integration to auth and sync, and every terminal artifact (PR, merge, status check) is GitHub-native anyway. See §GitHub Model.

### D4 — Autonomy policy: repo ceiling + per-task request
`.claude/autonomy.yaml` in each repo declares the **maximum** autonomy allowed for that repo. A GitHub issue requests a level via its `agent:autonomy:*` label. The effective level is `min(repo ceiling, issue request)`. Three levels:

| Level | Pipeline the daemon runs | Terminal state |
|---|---|---|
| `plan-only` | `/plan` only → PR containing just the plan | `Agent Review` (human does the rest) |
| `supervised` | `/plan → /build` → PR with plan + diff | `Agent Review` (human reviews & merges) |
| `full` | `/plan → /build`; if all gates green → auto-merge | `Done` |

The human gate moves from "everything after the plan" (`plan-only`) → "merge" (`supervised`) → "nothing" (`full`). This single knob is what lets some projects run fully autonomous and others stay controlled.

### D5 — Failure handling: quarantine + circuit breaker
On any failure (`BLOCKED`, `--max-turns`, red `tsc`/`test`, failed review):
- The worktree is abandoned — the default branch is never touched.
- The issue is relabeled `agent:needs-human` (→ "Needs Human" board column), with the failure log and the last evaluator reason posted as an issue comment.
- The daemon continues to the next issue.
- A consecutive-failure counter advances; on **N consecutive failures** (default 3, configurable) the daemon trips a **circuit breaker** and halts entirely, on the assumption that something systemic is wrong.

### D6 — Preflight gate: green HEAD before every task
Before planning, the daemon asserts `bun tsc && bun test` are green at HEAD in a fresh worktree. A red HEAD is a systemic fault → trip the circuit breaker immediately rather than building on a broken base.

### D7 — Isolation & locking
One issue at a time per repo (sequential), each in its own git worktree branched off the default branch. The atomic claim — relabeling the issue `agent:ready → agent:working` and self-assigning the daemon's bot user — is the lock that prevents a second tick (or a human) from grabbing the same issue. The daemon re-reads the issue's labels/assignee after claiming to confirm it won the race before proceeding. Parallel execution is out of scope for A.

### D8 — Native merge gating for `full` mode
`full` mode does not self-attest that gates passed. Instead, the daemon relies on **GitHub branch protection** on the default branch (`v1.4`) with required status checks (a `.github/workflows` CI running `bun tsc && bun lint && bun test`, plus `scripts/review.ts --pr`), and calls `gh pr merge --auto --squash`. GitHub merges the PR **only** when every required check is green. This moves the trust boundary from the daemon's own judgment to a server-side gate it cannot bypass — and pre-builds part of sub-project C. Standing up that CI workflow is a prerequisite of `full` mode (not of `plan-only`/`supervised`).

## GitHub Model

The whole queue is GitHub-native: **issues** carry the work, **labels** carry state + autonomy, a **Projects v2 board** gives the English kanban view, and the **PR↔issue link** closes the loop. No custom fields, no second system.

### The issue (what a human files)
A human creates an issue and adds it to the board. The body carries one required machine-readable line:
```
Spec: .specs/2026-05-27-autonomous-build-daemon-design.md
```
Plus a free-form description. The daemon parses `Spec:`; if it's missing, unresolved, or the target spec is not `Status: Approved`, the issue is skipped and commented ("missing approved spec") — never silently dropped.

### Labels (English, all owned by you)
| Label | Set by | Meaning |
|---|---|---|
| `agent:ready` | human | **the only label the daemon polls** — the CLAIM queue |
| `agent:working` | daemon | claimed; worktree + pipeline running (the lock, + daemon self-assigns) |
| `agent:review` | daemon | plan-only/supervised result: PR open, awaiting human |
| `agent:needs-human` | daemon | quarantine — run failed; failure log posted as a comment |
| `agent:autonomy:plan-only` \| `:supervised` \| `:full` | human | the issue's requested autonomy level (capped by repo ceiling) |

"Done" is not a label — the issue **auto-closes** when its PR merges (`Closes #N`).

### Projects v2 board (the kanban view, replaces ClickUp's)
A single-select "Status" field with columns mapped from the labels above:
`Ready for Agent` → `Agent Working` → `Agent Review` → `Needs Human` → `Done` (closed). The daemon moves cards by setting labels (a board automation, or a direct Projects API call) — humans get the same at-a-glance triage ClickUp gave, fully in English.

### Eligibility query (each tick)
```
gh issue list --state open --label agent:ready \
   --json number,title,body,labels --jq 'sort by priority label'
→ first issue whose `Spec:` line resolves to a Status:Approved spec
→ effective autonomy = min(repo .claude/autonomy.yaml ceiling, issue's agent:autonomy:* label)
```

### Lifecycle (label/PR transitions are the loop's heartbeat)
```
agent:ready ──claim (relabel + self-assign)──▶ agent:working
   agent:working ──plan+build ok, level≠full──▶ agent:review     (PR ready-for-review; human merges → issue closes)
   agent:working ──plan+build ok, level=full──▶ gh pr merge --auto  (GitHub merges when checks green → issue auto-closes)
   agent:working ──failure──────────────────▶ agent:needs-human  (quarantine + comment)
```
The PR opens as a **draft** linked `Closes #N` at the start of BUILD, so progress is visible live; it's marked ready-for-review (or auto-merged) only at the GATE step.

## The Loop (one tick)

```
1. CLAIM    → `gh issue list --label agent:ready`; relabel first issue → agent:working + self-assign;
              re-read to confirm the claim won the race
2. PREFLIGHT→ fresh worktree off default branch; assert `bun tsc && bun test` GREEN at HEAD
              (red HEAD → trip circuit breaker, do not proceed)
3. RESOLVE  → effective autonomy = min(repo ceiling, issue's agent:autonomy:* label)
4. PLAN     → headless `claude -p "/plan <linked-spec>"` → plan file committed; open DRAFT PR (Closes #N)
5. BUILD    → if level ≠ plan-only: `claude -p "/build <plan>"` → goal-loop runs to DONE/BLOCKED
6. GATE     → if level=full: `gh pr merge --auto --squash` (GitHub merges when required checks pass).
              Else → mark PR ready-for-review, relabel issue agent:review.
7. REPORT   → post run summary as a PR comment (Run ID + log link); update board card
8. CLEANUP  → tear down worktree; advance/reset failure counter; loop
```

## Components

| Component | Responsibility | Key interface |
|---|---|---|
| **Daemon core** | poll loop, sequential dispatch, circuit breaker | `tick()`, `run()` |
| **WorkSource (GitHub adapter)** | claim/relabel/comment + board card moves via `gh`/Octokit | `claim(): Issue \| null`, `relabel(issue, label)`, `comment(issue, body)`, `moveCard(issue, column)` |
| **Autonomy resolver** | read `.claude/autonomy.yaml` + issue's `agent:autonomy:*` label → effective level | `resolve(repo, issue): Level` |
| **Workspace manager** | fresh worktree per issue, preflight green check, teardown | `prepare(): Worktree`, `preflight(): Result`, `cleanup(wt)` |
| **Pipeline driver** | invoke headless Claude Code for `/plan` and `/build`; capture status + logs | `plan(spec)`, `build(plan): DONE \| BLOCKED` |
| **Gate executor** | open draft PR (`Closes #N`); on `full` → `gh pr merge --auto`; else mark ready-for-review | `openDraftPr(wt, issue)`, `finalize(pr, level)` |
| **Reporter** | run log, PR comment, audit jsonl, daily digest | `report(run)` |
| **Circuit breaker** | consecutive-failure counter; halt + notify on trip | `record(result)`, `tripped(): bool` |

A thin `WorkSource` interface is kept (single GitHub implementation) only so the daemon is testable against a mock — not as a speculative plugin system.

## User Stories

- **As a repo owner**, I declare an autonomy ceiling in `.claude/autonomy.yaml` so the daemon can never exceed the control level I'm comfortable with for that project.
- **As an engineer**, I open a GitHub issue labeled `agent:ready` with a `Spec:` line and an `agent:autonomy:*` label, then find a ready-for-review PR (or merged change) the next morning.
- **As an engineer**, when a run fails I find the issue in the `Needs Human` column with the failure log and the evaluator's last reason on it, so I can decide whether to fix the spec or take it over.
- **As a team**, agent issues flow through their own board columns and agent PRs link back to their issue, so overnight bot output is triaged at a glance and separate from human work.
- **As an operator**, if the daemon fails N issues in a row it stops itself and notifies me, so a systemic fault doesn't burn the night or the budget.

## Acceptance Criteria

1. An issue labeled `agent:ready` with a valid approved `Spec:` line is claimed (relabeled `agent:working` + self-assigned) within one poll interval; a second tick re-reads and does not re-claim it.
2. An issue whose `Spec:` line is missing/unresolved/not `Approved` is skipped and commented, never claimed.
3. Effective autonomy equals `min(repo ceiling, issue's agent:autonomy:* label)`; a `full` issue in a `supervised`-ceiling repo runs as `supervised` (stops at `agent:review`).
4. `plan-only` produces a PR containing only the committed plan and relabels the issue `agent:review`; no `/build` runs.
5. `supervised` produces a PR with plan + diff, relabels `agent:review`, marks the PR ready-for-review, and does **not** merge.
6. `full` calls `gh pr merge --auto`; GitHub merges **only** when every required branch-protection check is green (tsc, lint, test, `scripts/review.ts --pr`); the issue auto-closes on merge. If checks fail, the PR stays open and the issue falls back to `agent:review`.
7. On any failure the worktree is abandoned with no commit to the default branch; the issue is relabeled `agent:needs-human` with the failure log + last evaluator reason posted as a comment.
8. A red `bun tsc`/`bun test` at HEAD during preflight trips the circuit breaker without running any issue.
9. After N consecutive failures the daemon halts and emits a notification; it does not claim further issues until restarted.
10. Every completed run posts a PR comment with the `Run ID` and archives a run log retrievable by `Run ID`.

## Out of Scope (deferred / YAGNI)

- **Goal generation** — inventing *what* to build (sub-project B). The daemon only executes approved specs.
- **Independent fitness function / oracle** — the deeper trust mechanism for auto-merge (sub-project C). `full` mode here relies on the existing gates.
- **Parallel issue execution** — sequential only in A.
- **Re-queue on human PR change-requests** — feeding `Changes requested` reviews back to the agent; a later hook.
- **Production observability → backlog feedback loop** — closing the loop from telemetry (part of B/C).
- **Non-GitHub work sources** — the `WorkSource` interface exists for testing, not multi-source support.
- **ClickUp ↔ GitHub sync** — ClickUp stays the human PM tool but is deliberately *not* wired to the agent loop.

## Risks & Migration

- **Oracle ceiling (the core risk of `full` mode).** Auto-merge is only as safe as the required checks; until sub-project C exists, those checks are tsc/lint/test + `scripts/review.ts --pr` — strong but not a true independent oracle. `full` should be enabled only on low-stakes repos. Mitigation: default `.claude/autonomy.yaml` ceiling to `supervised`; `full` is opt-in and gated on branch protection being configured.
- **Unattended Claude Code auth & cost.** Headless runs need a non-interactive credential and can be expensive on long `/build` loops. Mitigation: `--max-turns` cap per run; circuit breaker bounds runaway nights; budget alerting in the Reporter.
- **GitHub label as a lock is eventually-consistent.** A race between two ticks (or tick vs. human) could double-claim. Mitigation: sequential single-worker daemon in A; claim relabels + self-assigns, then re-reads the issue to confirm it won before proceeding.
- **Worktree drift / disk.** Abandoned worktrees accumulate. Mitigation: Workspace manager cleans up on both success and failure paths; periodic GC.
- **Setup migration.** Requires creating ~6 labels, a Projects v2 board with a Status field, and branch protection + a CI workflow on `v1.4` (the latter only for `full`). Mitigation: additive, scriptable one-time setup (`gh label create`, `gh project`, `gh api` for branch protection); no existing config altered.

## Open Questions

1. **Headless auth mechanism** — API key vs. a dedicated Claude Code service credential on the box? (Affects the Pipeline driver.)
2. **Notification channel for circuit-breaker trips** — a GitHub issue opened on a sentinel repo, email, or a chat webhook?
3. **`--max-turns` default per run** — what bounds a single `/build` before it's considered stuck and quarantined?
4. **Does the daemon live in this repo** (`packages/` or `scripts/`) **or as a separate ops repo?** It orchestrates *across* repos eventually, which argues for standalone.
