---
name: prime
description: Prime the current session with project context. Reads orientation docs, inspects current branch + recent commits, surfaces in-flight specs/plans/handoffs, and reports a tight summary so the next instructions can be acted on without re-discovery.
argument-hint: (none)
---

# /prime — Project Context Loader

Build an initial mental model of the template monorepo for this
session. Run early in any session where you need to be productive
quickly without asking the user "where are we?".

**Announce at start:** "I'm priming the session with project context."

## When to Use

- Starting a fresh session on this repo (first message of the day).
- Picking up a worktree someone else (or your past self) started.
- Before running any agentic command (`/brainstorm`, `/plan`, `/build`)
  when you don't already have a clear picture of recent work.

## When NOT to Use

- Mid-session, when context is already loaded.
- For specific lookups — use `Read` / `Grep` / `bun scripts/graph/cli`
  directly when the question is narrow.
- Inside a worker dispatch from `/build` — workers get focused per-Task
  context, not a project-wide prime.

## Process

Run all data collection in **parallel** where possible. Output ONE
report at the end. Do not narrate each step.

### Step 1 — Repo inventory

```bash
ls
ls packages/
ls packages/api/src/         # TS bounded contexts
ls packages/app/src/routes/  # frontend routes
ls packages/channel/internal/ 2>/dev/null  # Go bounded contexts (if present)
```

### Step 2 — Orientation files

Read in this order (skip any that don't exist):

- `CLAUDE.md` — project conventions, DDD rules, event architecture
- `README.md` (root) — high-level project description
- `docs/AGENTIC_CODING.md` — the agentic pipeline reference
- `PRD.md` — product requirements (if defined)
- `SYSTEM.md` — design system (if defined)
- `package.json` — top-level scripts (what `bun dev` / `bun build` etc. actually do)

### Step 3 — Git state

```bash
git status --short
git rev-parse --abbrev-ref HEAD                 # current branch
git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null  # upstream
git log --oneline -n 15                         # last 15 commits
git log --oneline --since="7 days ago" | wc -l  # commits this week
```

If in a worktree (`git rev-parse --git-dir` ≠ `git rev-parse
--git-common-dir`), note the worktree path and isolation status.

### Step 4 — In-flight work surface

```bash
ls -t .specs/ 2>/dev/null | head -5         # latest specs
ls -t .plans/ 2>/dev/null | head -5         # latest plans
ls -t docs/handoff/ 2>/dev/null | head -3       # latest handoff notes
ls -t docs/learnings/ 2>/dev/null | head -3     # latest learnings reports
```

Read the **most recent handoff doc** (if any) — it's usually the
fastest path to "what was this session about?".

### Step 5 — Available commands and skills

```bash
ls .claude/commands/   # custom slash commands
ls .claude/skills/     # skill names (each has SKILL.md)
ls .claude/agents/     # agent names + per-agent AGENT.md
```

Note: skill descriptions also appear in your tool registry. Don't
need to read every SKILL.md — just know which exist.

### Step 6 — Report

Output one structured summary. Format:

```markdown
## Project — template monorepo

**Stack:** TypeScript (Bun) + React (Vite/TanStack) + Go (channel)
+ Drizzle + tsyringe. Nx for task graph. Monorepo with five
workspaces: `packages/{api,app,channel,client,e2e}`.

**Bounded contexts (TS api):** <list from ls>
**Frontend routes:** <list from ls>

## Where we are

**Branch:** `<branch-name>` — <X commits ahead of upstream> /
<Y uncommitted changes> / [in worktree at `<path>`].

**Recent commits (last 15):**
<git log --oneline -n 15>

**This week:** <N> commits.

## In-flight work

**Latest specs:** <3 most recent files from .specs/>
**Latest plans:** <3 most recent from .plans/>
**Latest handoff:** `docs/handoff/<file>` — <one-line summary from
its first paragraph>

## Available pipeline

- `/brainstorm <idea>` — turn an idea into a design spec
- `/plan <spec>` — turn a spec into an implementation plan
- `/build <plan>` — execute the plan (orchestrator opus, workers
  sonnet, reviewers haiku)
- `/pr` — open a GitHub PR after /build
- `/learnings` — feedback loop on the pipeline itself
- `/install` — bootstrap the environment (worktree-aware)

## Suggested next step

<based on git state + in-flight work, suggest ONE concrete next
action — e.g., "continue the appointment-notes plan via /build",
or "the export-agenda-csv spec is approved but never built —
ready for /plan", or "no specs in flight; ask the user what to
work on".>
```

## Constraints

- **Read-only.** `/prime` writes nothing. Pure inspection + report.
- **Token-efficient.** Don't dump full file contents in the report.
  Cite paths, summarize in your own words.
- **No invented context.** If a doc doesn't exist (e.g., no
  `PRD.md`), say so explicitly rather than making up product
  details.
- **No external calls.** No `WebSearch` / `WebFetch` — `/prime` is
  about THIS repo, not industry.

## Anti-Patterns (do NOT do)

- ❌ **Skipping the report.** The whole point is the structured
  summary. Don't just read files silently and end with "ok ready".
- ❌ **Reading every SKILL.md / AGENT.md.** Inventory only — those
  are read on demand by `/plan` and `/build`.
- ❌ **Running `bun install` / `bun dev` / migrations.** That's
  `/install`'s job. `/prime` is inspection only.
- ❌ **Re-priming mid-session.** If the session already has context
  loaded, running `/prime` again is just token burn.
- ❌ **Inventing the "Suggested next step".** Base it on observable
  state (branch name, latest spec/plan, handoff doc). If genuinely
  unclear, say "no obvious next step; ask the user".
