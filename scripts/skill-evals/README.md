# skill-evals — doc-tree eval harness

Rung 4 of the correctness system: the L1–L5 KPI loop. Detectors (rungs 1–3) catch mechanical
violations; this harness measures whether the **doc tree** (`.claude/skills`, registries, `docs/`)
actually steers an agent to a correct implementation. Each task pins a real feature (distilled
from a `.specs/` doc) with a `goldRef` (human solution), a `baseRef` (starting point), a `prompt`,
and `graders` (tsc / detect / grep-must / grep-must-not / file-exists / test-green / judge) that
pass on gold and fail on the known failure modes. Every run appends `ScoreRow`s (with a
`docTreeHash` of the main repo's doc tree) to `scoreboard/<stamp>.jsonl`, so doc edits are
measurable over time.

## Modes

- **Gold mode** (`bun scripts/skill-evals/run.ts --gold [ids... | --all-train]`) — worktrees each
  task's `goldRef` under `$TMPDIR` and grades it. Gold must score **100%**: a failing grader on
  gold is a grader bug → exit 1. Run this after authoring or editing any task.
- **Agent mode** (`--agent <ids...>`) — worktrees `baseRef` (empty → HEAD), runs the eval agent
  headless in the tree (`claude -p` with SCOPED permissions: acceptEdits + a Bash allowlist of
  build/inspect commands — never a blanket permission bypass; `AGENT_TIMEOUT_MS` caps runaways),
  then grades whatever the tree contains. This is the actual KPI measurement.

## The judge grader (L3/L5)

`{kind: judge, spec: <rubric>}` spawns a read-only headless `claude -p` (haiku) inside the graded
tree; it inspects files and must end with `VERDICT: PASS` or `VERDICT: FAIL — reason`. Use it for
composition judgments mechanical greps can't express (citizen placement, DTO-not-entity,
registration wiring, tx threading). Timeout or a missing verdict grades as fail.

## The loop (how a measurement becomes a doc improvement)

1. `--agent` run on tasks tagged with the axis under study → ScoreRows.
2. A failing grader carrying a pattern id (`id: query#QRY-01`) attributes the miss to a doc rule;
   a failing judge names the composition error.
3. Diagnose: the same failure across samples = wrong/ambiguous OWNER rule (fix it — one variable
   per experiment); scattered failures = task/prompt noise (fix the task spec instead).
4. Re-run the same tasks; the scoreboard delta is the experiment's verdict. `/learnings` consumes
   the scoreboard and enforces this protocol (eval gate, rule-rung review, ablation sweep).

Synthetic probes (`synthetic-*`, tier holdout, empty refs) exist for cheap loop turns: small
features whose discriminating question is a single axis decision (e.g. WHERE a single-entity
read lives; WHO persists a domain event).

## The feature loop (P1 — generator/verifier split)

For FEATURE-scale turns (no gold tree exists), circularity is broken by splitting roles:

1. A spec (.specs/, brainstorm-shaped: Context/Problem/Goal/**Decisions**/ACs) owns every
   design judgment — neither verifier nor builder invents.
2. A **verifier agent** derives red acceptance tests + the task graders FROM THE SPEC ALONE
   (it studies house test conventions, never an implementation). Artifacts live under
   `features/<id>/` — outside packages/, so red tests never enter the branch's suites.
3. The task's `inject:` list seeds those tests into the eval worktree at their real package
   paths before the **builder agent** runs (house TDD: builder sees red tests + spec).
4. Graders = the verifier's test-green + AC-mapped mechanical greps + detectors + judge.
   Failure attribution: test/judge fails → build or docs; a grader wrong at gold/HEAD →
   instrument bug (fix the grader); spec ambiguity discovered → fix the spec, re-verify.
5. A PASSING feature-loop run validates the pipeline; the real fix then lands on the branch
   through the normal flow (tests move to their package home, green, committed).

First instance: `features/pause-slice/` (spec .specs/2026-06-10-billing-pause-slice-wiring.md)
— a real dead slice from the triage ledger, so the loop turn and the debt burn-down are the
same work.

## Scenario matrix + coverage-driven generation (P2/P4)

- **Scenario matrix**: axes in `.claude/atlas/axes.yaml` carry a `scenarios:` list — the
  MANDATORY acceptance scenarios for any feature touching that axis. The verifier's test
  matrix = the union of the feature's axes' scenarios. Coverage is enumerable, not improvised.
- **Coverage report** (`bun scripts/skill-evals/feature-loop/coverage.ts`): per axis — how
  many tasks force it, agent runs, pass rate. UNCOVERED axes are the feature GENERATOR's
  queue: the next invented feature is designed to force exactly those decisions (P2's
  coupon-aggregate spec was generated from the CLASS-BASE/VALIDATION-PLACEMENT/OPTIONALITY/
  TELL-DONT-ASK gap cluster).
- **Stage attribution** (record it with every failing feature-loop row): verifier can't
  derive a test from an AC → SPEC stage; builder violates a registry rule (grader carries
  the pattern id) → DOCS stage; tests red but idioms clean → BUILD stage; grader wrong
  against gold/HEAD evidence → INSTRUMENT stage. One fix per stage per iteration.

## Adding a task

Drop a YAML file in `tasks/` (one task, a list, or `tasks:`) with `id, tier (train|holdout),
title, sourceSpec, goldRef, baseRef, prompt, axes[], graders[{kind, spec, id?}], notes?`.
Detect graders run the MAIN repo's `scripts/detectors/*` with `ROOT_OVERRIDE=<tree>` (files from
the graded tree, rules/baseline/allowlist from current doctrine). Then verify: gold must pass 100%.

## The holdout rule

`tier: holdout` tasks are never looked at while editing docs. The moment you fix the doc tree
*against* a failing holdout task, it is burned: retag it `train` and author a replacement holdout.
