---
name: pr
description: Create a GitHub PR for the current branch with title and body derived from the spec + plan, plus a test plan derived from spec ACs and a brief audit summary. Use AFTER /build succeeds. The invocation IS the user's explicit consent — slash commands like this are the only path that creates PRs autonomously.
argument-hint: [plan-path] [--spec spec-path] [--base BRANCH] [--draft] [--no-watch] [--no-audit-summary]
---

# /pr — Pull Request Creation

Open a PR on `gabriellst/template-fullstack` for the current branch with:

- **Title** derived from the spec's title.
- **Summary** — 1–3 bullets distilled from spec Decisions.
- **Spec link** and **Plan link** (relative paths to the committed
  files in `.specs/` and `.plans/`).
- **Test plan** — one checkbox per spec Acceptance Criterion, with
  the test path that satisfies it (taken from the plan's Final
  Validation section).
- **Commits** — list with one-line summaries.
- **Audit summary** (optional, `--no-audit-summary` to omit) —
  sessions involved, sub-agent dispatches, review attempts.

The user typing `/pr` IS the explicit consent to create. Slash
command invocation is the ONE path that authorizes PR creation
without further confirmation (per the harness rule "DO NOT create a
pull request unless the user explicitly asks").

## When to Use

- After `/build` reports `Final Validation: PASS`.
- After manual completion of a plan when /build wasn't used.
- After hand-implementing a small change (skips the spec/plan
  references, uses commit summaries only).

## When NOT to Use

- Working tree is dirty — commit or stash first.
- Branch not pushed — push first.
- A PR already exists for this branch — push more commits to the
  existing PR; do not open a duplicate.
- Mid-build — wait for /build to finish or escalate first.

## Instructions

### Phase 0 — Pre-flight (silent)

Run all checks before touching the GitHub API. If any fails, stop
and report.

1. Working tree clean:
   ```bash
   git status --porcelain
   ```
   Expected: empty output. If not, stop.

2. Current branch is not `dev` or `main`:
   ```bash
   git rev-parse --abbrev-ref HEAD
   ```
   If `dev`/`main`, stop with "PRs are opened from feature branches".

3. Branch tracks a remote and is pushed:
   ```bash
   git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null
   git log --oneline @{u}..HEAD
   ```
   If no upstream → push first (`git push -u origin <branch>`).
   If commits ahead of upstream → push them.

4. Determine base branch:
   - `--base <name>` arg if provided.
   - Else `dev` (project default).

5. Verify no existing PR for this branch:
   ```
   mcp__github__list_pull_requests state=open head=<owner>:<branch>
   ```
   If found → stop and report the existing PR URL. The user can run
   `/build` again to push more commits onto that PR.

6. Resolve plan + spec paths:
   - If positional `<plan-path>` given → use it.
   - Else search `.plans/` for files modified in the branch's
     commits (`git log <base>..HEAD --name-only -- .plans/`).
     If exactly one → use it. If multiple → ask the user.
   - For the spec: read `**Spec:** <path>` from the plan, OR use
     `--spec <path>` override.
   - It's OK to have no spec/plan (small ad-hoc fix branch) —
     fall back to commit-summary-only mode and skip the AC mapping.

7. Read audit summary (unless `--no-audit-summary`):
   - Find `.claude/audit/*.jsonl` files modified during the branch's
     commit window. Count sessions, count Agent dispatches, count
     `AskUserQuestion` calls, count Tool errors.
   - This is best-effort — if no audit data, skip the section.

### Phase 1 — Derive title + body

#### Title

- Take the spec title (top `# <Title>` heading) and strip trailing
  decorations (e.g., `— Design Spec`).
- If no spec, derive from the branch name converted to title case.
- Keep ≤ 70 chars.

Example: `Appointment Notes — Design Spec` → `Appointment notes`

#### Body (markdown)

```markdown
## Summary

<2-4 bullets distilled from spec Decisions or — when there's no
spec — from the most recent commit subject lines.>

## Validation

- Spec-compliance review: all Tasks MATCH (no over- or under-building)
- Code-quality review: 0 critical findings (`bun scripts/review.ts --pr`)
- `bun tsc` · `bun lint` · `bun test affected` · `bun e2e --grep "<slug>"` all green

## Spec & Plan

- Spec: [.specs/<slug>-design.md](.specs/<slug>-design.md)
- Plan: [.plans/<slug>.md](.plans/<slug>.md)

## Commits

<git log --oneline <base>..HEAD>

## Test Plan

<One unchecked checkbox per Acceptance Criterion from the spec.
Pair each AC with the test path from the plan's Final Validation
block.>

- [ ] AC-1 — `packages/.../<file>.test.ts:"<name>"`
- [ ] AC-2 — `packages/e2e/tests/<slug>.spec.ts:"<name>"`
- [ ] ...

If no spec / no AC mapping: replace this section with a generic
"Verified locally" checkbox plus the commands the reviewer should
run (e.g., `bun tsc`, `bun lint`, `bun test affected`).

## Audit summary

<Only if --no-audit-summary not set AND audit data exists.>

- Sessions involved: <N>
- Sub-agents dispatched: <breakdown by agent type>
- AskUserQuestion calls: <N> (Presence proxy)
- Tool errors / escalations: <N>
- Spec-compliance fix-loop iterations: <N>
- Code-quality fix-loop iterations: <N>
- Implementer status distribution: DONE <a> · DONE_WITH_CONCERNS <b> · NEEDS_CONTEXT <c> · BLOCKED <d>

Audit logs: `.claude/audit/*.jsonl` (gitignored — local only).
```

Do NOT include the `claude.ai/code/session_...` marker — that
belongs in commit messages, not PR bodies.

### Phase 2 — Create PR

```
mcp__github__create_pull_request
  owner: gabriellst
  repo: monorepo
  base: <base-branch>
  head: <current-branch>
  title: <derived title>
  body: <derived markdown>
  draft: <true if --draft, else false>
```

Capture the returned PR URL.

### Phase 3 — Handoff + optional watch

Output to the user:

```
PR ready: <PR URL>
Title: <title>
Tasks/Commits: <N> commits, <M> ACs, base: <base-branch>

Want me to watch this PR for CI failures and review comments?
(yes — I'll subscribe via subscribe_pr_activity and autofix
where confident; ask before architectural changes.
no — I stop here.)
```

If the user says yes (and `--no-watch` was not set), call:

```
mcp__github__subscribe_pr_activity prNumber=<number>
```

If `--no-watch` was set, do NOT ask — close the loop silently.

### Phase 4 — Subscription handling (if subscribed)

PR activity events arrive wrapped in `<github-webhook-activity>`
tags. Per the harness rules:

- Investigate each event before acting.
- If the fix is unambiguous and small → push the fix, update
  status, no reply needed.
- If the fix is ambiguous, large, or architecturally significant →
  use `AskUserQuestion` before acting.
- If the event is duplicate / no action → skip silently.
- Stop the moment the user says stop → call
  `unsubscribe_pr_activity`.

Never use `Bash sleep` to wait for events — they arrive as wake-up
messages.

## Relevant Files

Read for context:
- `.specs/<slug>-design.md` — for title + Summary + ACs
- `.plans/<slug>.md` — for AC → test path mapping
- `.claude/audit/*.jsonl` — for audit summary (best-effort)
- Git log between `<base>` and `HEAD` — for commit list

Write:
- Nothing in the repo. /pr only reads + calls GitHub API.

Never write:
- Code changes (use /build or manual edits and commit, then /pr).
- Workarounds for failing Final Validation — fix the failures first.
- The PR body with `claude.ai/code/session_...` markers (commits
  carry those; PR descriptions do not).

## Anti-Patterns (do NOT do)

- ❌ Creating a PR while the working tree is dirty.
- ❌ Pushing `--force` to overwrite the upstream branch as part of
  /pr (this command never force-pushes).
- ❌ Opening a duplicate PR when one already exists for the branch —
  push commits onto the existing PR instead.
- ❌ Skipping the test plan section. Even on tiny PRs, list the
  manual verification command.
- ❌ Auto-subscribing to PR activity without asking.
- ❌ Including secrets, full audit logs, or any
  `claude.ai/code/session_...` URLs in the PR body.
- ❌ Modifying code from /pr — separate concerns: /build builds,
  /pr publishes. If a fix is needed, exit /pr, run /build (or edit
  manually), then re-invoke /pr.
- ❌ Posting unnecessary review replies after subscribing. The PR
  diff is the record of work; comment only when explaining why
  something can't be done or asking for direction.

## Arguments

$ARGUMENTS
