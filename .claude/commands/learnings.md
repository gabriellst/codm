---
name: learnings
description: Digest audit log + review findings + git history to (1) compute 4 KPIs (Size↑, Attempts↓, Streak↑, Presence↓), (2) detect recurring patterns and outdated conventions, (3) propose concrete edits to SKILL.md / registry.yaml / agents/AGENT.md so the next pass becomes more autonomous. User approves each proposal before it lands. Run periodically (weekly or after N plans completed).
argument-hint: [--window 7d|30d|since-last] [--apply-all] [--dry-run]
---

# /learnings — Feedback Loop and KPI Tracker

The agentic system improves only if we **systematically harvest
lessons** from each session and bake them back into the skills,
registries, and agents. `/learnings` is the harvester.

Two intertwined goals:

1. **Move 4 KPIs in the right direction.**
   - **Size ↑** — larger blocks of work per session (longer plans,
     bigger Tasks, more files touched before human intervention).
   - **Attempts ↓** — fewer fix-loop iterations per Task, fewer
     re-dispatches.
   - **Streak ↑** — consecutive Tasks/plans passing first time.
   - **Presence ↓** — fewer user interventions per Task (fewer
     `AskUserQuestion` calls, fewer manual edits to /plan output,
     fewer escalations).

2. **Update the knowledge base.** Detect recurring patterns in
   problems, propose new conventions, and **also flag existing
   conventions that no longer hold** (things we thought were
   correct but turn out wrong). Apply with user approval.

## When to Use

- Weekly (or after every ~10 plans completed).
- After a noticeable regression (KPI degradation, multiple
  escalations on similar issues).
- After absorbing major lessons from validation runs (like our
  5-feature validation rounds).

## When NOT to Use

- Mid-session, while a `/build` is running.
- Without sufficient audit data — the first `/learnings` run after
  the audit hook landed needs at least a few sessions of data.
- For one-off fixes — those are direct edits, not lessons.

## Inputs

1. `.claude/audit/*.jsonl` — every tool call, agent dispatch,
   AskUserQuestion, with parent session linkage.
2. `.plans/*.md` — what was attempted; correlate with audit.
3. `.specs/*.md` — to understand intent.
4. `.claude/feedback/*.jsonl` (if present) — user corrections
   tagged during prior /plan Phase 2 acknowledgments.
5. Git log — commits, especially `fix(`, `revert`, and reworked
   files (file changed N times in window).
6. `.claude/metrics/<previous-date>.json` (if present) — KPI
   baseline for trend comparison.
7. `scripts/skill-evals/scoreboard/*.jsonl` — eval-harness score rows
   (task, mode, pass, failedGraders, docTreeHash). The offline loss
   function: per-task pass rates ARE the measured error rate proposals
   must move; a `failedGraders` entry carrying a pattern id (e.g.
   `schema#bp-07`) attributes a failure to the exact doc rule.

## Outputs

1. `docs/learnings/<YYYY-MM-DD>-learnings.md` — full report.
2. `.claude/metrics/<YYYY-MM-DD>.json` — KPI snapshot for next run.
3. Edits applied to `.claude/skills/<skill>/SKILL.md`,
   `.claude/skills/<skill>/registry.yaml`,
   `.claude/agents/<agent>/AGENT.md`, or
   `.claude/commands/<command>.md` (one commit per accepted proposal,
   or one batched commit if `--apply-all`).

## Instructions

### Phase 0 — Window selection (silent)

Resolve the time window:
- `--window 7d` (default if no arg)
- `--window 30d`
- `--window since-last` → start from the timestamp of the most
  recent `.claude/metrics/*.json`

Find all audit files in `.claude/audit/` whose date is within the
window. Find all plans in `.plans/` modified within the window.
Find all commits via `git log --since=...`.

If `--dry-run`, the rest of the phases produce a report without
applying edits.

### Phase 1 — Compute KPIs (silent)

#### KPI 1 — Size

Compute per-session and aggregate:

- `avgMinutesPerTask` — wall-clock time between first and last tool
  call attributed to a Task ID, averaged across Tasks. Source: audit
  log timestamps + audit markers (`<!-- audit: command=/build
  task="T<N>" -->`).
- `avgStepsPerTask` — from parsed plans (`parsePlan` exposes
  `task.steps.length`).
- `avgFilesPerTask` — from `task.filesWrites.length`.
- `avgPlanTasks` — Tasks per plan.
- `avgPlanMinutes` — sum of Task estimates per plan.

#### KPI 2 — Attempts

- `avgFixLoopIterations` — per Task, how many times the implementer
  was re-dispatched after a failed review. Detect via repeated audit
  markers with `attempt=` suffix.
- `avgTestRunsBeforeGreen` — count `bun test` invocations per Task
  before a final green result.
- `escalationsPerTask` — count of "stop and report" / "escalate"
  patterns in audit + `Stop` events with non-success.
- `validatePlanFindingsPerPlan` — initial findings reported by
  `validate-plan` before fixes.

#### KPI 3 — Streak

- `tasksFirstPassRate` — fraction of Tasks where the review loop
  exited with `critical == 0` on the FIRST attempt.
- `plansCleanFirstValidate` — fraction of plans that passed
  `validate-plan` on the first run.
- `consecutiveCleanTasks` — current streak; max-streak in window.

#### KPI 4 — Presence

- `askUserQuestionsPerSession` — `AskUserQuestion` tool call count
  divided by session count.
- `manualPlanEditsPerPlan` — files in `.plans/` with multiple
  commits within their lifetime (proxy for human edits after /plan
  generated them).
- `phase2CorrectionsPerPlan` — count of "Reviewer-Model" or
  "Model" override fields or other corrections introduced after
  /plan's initial output.
- `userInitiatedFixesPerPlan` — commits authored by user (not by an
  agent) that fix something the agent had committed.

#### Output

A KPI table:

```
| KPI                              | This window | Previous | Trend  |
|----------------------------------|-------------|----------|--------|
| Size — avgMinutesPerTask         | …           | …        | ↑ ↓ →  |
| Size — avgStepsPerTask           | …           | …        | …      |
| Attempts — avgFixLoopIterations  | …           | …        | …      |
| Streak — tasksFirstPassRate      | …           | …        | …      |
| Presence — askUserQuestionsPerSession | …       | …        | …      |
| ...                              |             |          |        |
```

Trend arrows:
- ↑ = increased (good if KPI is "↑" target, bad if "↓" target)
- ↓ = decreased
- → = within ±5%

### Phase 2 — Pattern detection

Scan inputs for recurring problems. Use these categories:

#### 2.1 — Frequently violated BPs

Group review findings by BP code. If the same BP fires across **3+
Tasks** in the window, it's a pattern. Possible interpretations:

- The BP is correct but not prominent enough → propose moving to
  `when: always` in `registry.yaml`, or adding a more concrete
  example in `SKILL.md`.
- The BP is overly strict → propose adding a `when: conditional`
  predicate, or downgrading severity.
- Implementer agents don't read the BP before writing → propose
  adding the BP excerpt to the implementer's prompt template.

#### 2.2 — Frequent path mismatches

Detect via:
- `validate-plan` findings of `PR-18` ("path not resolvable")
- Implementer commits with paths that don't match the plan's
  `filesWrites`
- Repeated `graph file <X>` lookups that returned no match

If recurring → propose updating `.claude/commands/plan.md` Phase 1
"CRITICAL paths must come from the graph" with the specific path
patterns that confused (e.g., nested `<Name>Repository/` folder,
plural `appointments/`, route groups `(app)/`).

#### 2.3 — Spec ambiguity

Detect via:
- Plans where Phase 2 (Mapping Validation) had user corrections
  beyond a threshold (e.g., > 30% of the artifact list reshuffled).
- Tasks re-dispatched because the implementer asked for clarification.

If recurring → propose updating `.claude/commands/brainstorm.md`:
- Strengthen specific Spec Format sections (e.g., "Decisions need
  irreversibility test").
- Add an Unforeseen Angles category specific to the recurring
  ambiguity.

#### 2.4 — DDD modeling reversals

Detect via:
- `Phase 2 (File Structure)` corrections in /plan that change `kind`
  (entity → value-object, usecase → query, etc.).
- Tasks rejected during Stage 1 (spec-compliance) review because the
  artifact kind doesn't match the spec's intent.

If recurring → propose updating `.claude/skills/ddd-modeling/SKILL.md`
with a new decision rule for the specific confusion pair. Or update
the affected artifact skill's `WHEN NOT to use` section.

#### 2.5 — Skill confusion

Detect via:
- Implementer asked which skill applies, or invoked the wrong skill.
- A skill's `bad_practices` keep firing in similar ways.

If recurring → propose updating the confused skill's `WHEN NOT to
use` section with the sibling skill that's frequently confused.

#### 2.6 — Outdated conventions ("we thought we were right")

This is the **inversion check**. Look for:

- Recent commits that REVERT a previously-shipped convention.
- BPs that haven't fired in N+ sessions (possible candidates for
  retirement — maybe the underlying issue was addressed structurally).
- Patterns marked `when: always` that have exceptions appearing in
  practice.
- Spec/plan/build phases that no one uses or that always get skipped.

Propose: edit the affected SKILL.md to mark a section as
**superseded** or **deprecated**, with the new replacement. Do NOT
just delete — leave the old guidance with a `> Deprecated since
<date>: <reason>` callout so the reasoning trail is preserved.

#### 2.7 — Friction in commands themselves

Detect via:
- `/plan` phases that consistently take longer than estimated.
- `/build` waves that fail consistently.
- `/review` invocations with high re-dispatch rate.

Propose: tighten the relevant command's instructions; add explicit
checklists; or split a phase into smaller phases.

#### 2.8 — Spec-compliance review failures (over/under-building)

Detect via:
- `/build` Stage 1 (spec-compliance) review returning
  `CHANGES_REQUESTED` with `MISSING:` or `EXTRA:` items.
- Patterns in EXTRA findings: same kind of scope creep recurring
  across Tasks (e.g., implementers consistently add `--json` flags,
  or consistently add defensive `?.` chains the spec didn't ask for).

If recurring `EXTRA` → the implementer prompt template needs the
"no scope creep" rule strengthened, OR the artifact skill's
"WHEN NOT to use" section needs the over-built feature called out.

If recurring `MISSING` → the plan's Task description is too thin
for the implementer to know what's required. Propose tightening the
relevant `/plan` Phase 3 template OR the implementer's dispatch
template in `/build`.

#### 2.9 — NEEDS_CONTEXT frequency per skill (thin SKILL.md detection)

Detect via:
- Implementers returning `NEEDS_CONTEXT` repeatedly when the Task
  involves a specific skill.
- Per skill, count `NEEDS_CONTEXT` rate. If > 1 per N Tasks involving
  that skill, the skill's SKILL.md is too thin for autonomous
  implementation.

Propose thickening the skill's SKILL.md: add a more complete example,
clarify the canonical_snippet, address the specific questions
implementers asked.

#### 2.10 — Model-tier override patterns

Detect via:
- Tasks with explicit `Model:` overrides that diverge from the
  pre-flight heuristic in /build Step 1.
- Tasks where the heuristic chose haiku/sonnet but the
  implementer was BLOCKED and re-dispatched at a higher tier.

If recurring → propose updating the heuristic in
`.claude/commands/build.md` Step 1 (the tier derivation rule).
E.g., "skills involving `/test` with cross-context fixtures →
sonnet" might need to become "→ opus".

### Phase 3 — Propose updates

For each pattern detected, produce a `Proposal`:

```ts
type Proposal = {
  id: string                    // 'P-001', 'P-002', ...
  patternId: string             // e.g., '2.1 — frequently violated BP'
  evidence: string[]            // 3+ concrete examples with citations
  affectedFiles: string[]       // file paths to edit
  proposedDiff: string          // patch-like description of the edit
  rationale: string             // 2-3 sentences linking pattern → fix
  kpiImpact: string             // which KPI moves; expected magnitude
  reversible: 'easy' | 'hard'   // 'hard' = adds new file or kills convention
}
```

Output a table of proposals, sorted by `kpiImpact` (highest first).

**Eval gate (mandatory for any proposal editing a skill/registry/CLAUDE.md):**
one proposal = one variable. Before presenting, run the affected-axis tasks in
gold mode as a sanity floor (`bun scripts/skill-evals/run.ts --gold <ids>`);
after the edit lands, the NEXT agent-mode run's delta on those tasks is the
proposal's verdict — record `evalDelta` in the report and REVERT if the
affected-axis pass rate regressed. Proposals with no plausible scoreboard/axis
attribution must say `kpiImpact: unmeasurable — judgment change` rather than
implying a measured win.

**Rule-rung review (each run):** for every frequently-violated rule in the
proposals, ask "can it move UP the ladder?" (type / scaffold / detector — see
.claude/atlas/axes.yaml rungs). A proposal that ELIMINATES a rule always
outranks one that rewords it.

**Ablation sweep (quarterly, or when the doc corpus grew >10% in the window):**
pick the 5 least-cited registry patterns (zero audit-log mentions, review
findings, or eval-grader references in the window) and propose deleting each;
validate the deletion the same way — if eval pass rates don't move, the rule
was dead weight. The doc corpus SHRINKING is a health metric, not a loss.

### Phase 4 — User approval gate (interactive)

Present each `Proposal` to the user in chat. For each, the user
chooses:

- **accept** → apply the diff in the next phase.
- **reject** → record reason; do not apply.
- **defer** → keep in `.claude/feedback/deferred.jsonl` for next
  run; do not apply.
- **modify** → user supplies a refined version; apply that.

If `--apply-all` is set, skip this gate and apply every proposal.
Use sparingly — the approval gate is the human-in-the-loop on
self-modification.

### Phase 5 — Apply accepted (silent unless errors)

For each `accepted` or `modified` proposal:
- Apply the diff via `Edit` (one file at a time).
- After applying, re-run any affected validators
  (`bun scripts/graph/cli/index.ts validate-plan` for plan format
  changes, `bun test scripts/graph/tests/` for parser changes).
- If a validator regresses, **revert that proposal's edits and
  surface the regression in the report**. Do not block other
  proposals.

### Phase 6 — Snapshot + commit

- Write `.claude/metrics/<YYYY-MM-DD>.json` with current KPI values
  (for next `/learnings` run trend comparison).
- Commit pattern:
  - If proposals applied across multiple distinct files →
    one commit per proposal with message
    `learnings(<scope>): <one-line rationale>` so each is
    revertable.
  - If `--apply-all` → still one commit per proposal (don't batch
    unrelated changes).

### Phase 7 — Report

Write `docs/learnings/<YYYY-MM-DD>-learnings.md`:

```markdown
# Learnings — <YYYY-MM-DD>

## Window
<start> to <end> ; <N> sessions ; <M> plans ; <K> Tasks

## KPI Table
<the table from Phase 1>

## Patterns Detected
<sorted by kpiImpact>
### Pattern <id> — <category>
- Evidence: …
- Proposal: <id>
- Status: accepted / rejected / deferred / modified
- Files touched: …

## Proposals
### P-001 — <one-line>
- Pattern: <id>
- Files: <list>
- Rationale: <…>
- KPI impact: <which KPIs, expected direction>
- Status: <…>
- Commit SHA: <…> (if accepted)

## Trend Notes
<commentary on KPI movements, any concerning regressions>

## Next-Run Watch List
<patterns that didn't yet meet the 3+ threshold but are emerging>
```

### Phase 8 — Handoff

After writing the report, output:

```
Learnings complete: docs/learnings/<date>-learnings.md
KPIs snapshot: .claude/metrics/<date>.json
Proposals: <accepted>/<total> applied across <N> commits.

Run /learnings again after the next ~10 plans complete.
```

Do **not** automatically re-run validation or other commands —
let the user inspect the report.

## Relevant Files

Read for context:
- `.claude/audit/*.jsonl` — primary input
- `.plans/*.md` — primary input
- `.specs/*.md` — context only
- `.claude/feedback/*.jsonl` (if present) — user corrections cache
- `.claude/metrics/*.json` (if present) — KPI baseline
- Every `.claude/skills/*/SKILL.md` and `registry.yaml` — to know
  what's editable
- `.claude/agents/*/AGENT.md` — to know what's editable
- `.claude/commands/*.md` — to know what's editable

Write:
- `docs/learnings/<YYYY-MM-DD>-learnings.md` — always
- `.claude/metrics/<YYYY-MM-DD>.json` — always
- `.claude/skills/**` / `.claude/agents/**` / `.claude/commands/**` —
  only on accepted proposals
- `.claude/feedback/deferred.jsonl` — only on deferred proposals

Never write:
- Source code (`packages/api/src/**`, `packages/app/src/**`, etc.) —
  `/learnings` is a meta-tool; it improves the KNOWLEDGE base, not
  the product code.
- Plans or specs already committed — those are historical record.

## Anti-Patterns (do NOT do)

- ❌ **Auto-applying without the approval gate.** The user's chance
  to override is the safety net. `--apply-all` exists but should be
  the exception, not the rule.
- ❌ **Treating every one-off problem as a pattern.** Require the
  3+ threshold (or domain-judged "this will recur"). Single
  incidents are not learnings.
- ❌ **Adding more rules without checking which existing rules are
  retired.** The system bloats fast if `/learnings` only adds.
  Phase 2.6 (inversion check) is mandatory.
- ❌ **Editing product code from `/learnings`.** Knowledge base only.
- ❌ **Skipping the trend comparison.** A single KPI value in
  isolation is meaningless; the trend is the signal.
- ❌ **Conflating KPIs.** Each proposal should be tagged with which
  KPI it moves and in which direction. "Improves quality" without
  a specific KPI is too vague to track.
- ❌ **Batching unrelated proposals into one commit.** Each proposal
  is its own commit so it's individually revertable if it backfires
  in the next window.

## Arguments

$ARGUMENTS
