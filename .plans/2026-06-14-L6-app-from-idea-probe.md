# L6 — Autonomous App-from-Idea Probe (THE GOAL — "we won't stop until we have it")

> **Goal.** A probe where the input is a one-line idea ("build a ClickUp clone" / "a Twitch clone")
> and the system runs the ENTIRE pipeline autonomously — brainstorm → DDD model → contract-lock →
> plan (PR-28 handoffs) → build (multi-agent, handoff-dispatched) → e2e — graded **stage by stage**,
> passing "without failing too much." This is the capstone of the autonomy ladder (L6, above L5).
>
> **Why it's the capstone.** A whole app is the ONLY thing that forces the multi-agent handoff
> pipeline at scale (hundreds of files, 5+ BCs — miles past the single-context capacity ceiling). A
> passing scoped-app-clone is therefore the first real proof the handoff machinery (built 2026-06-14)
> holds end to end. It is the experiment that validates everything else.
>
> **Foundation already proven (2026-06-14).** The full loop is closed at SLICE scale:
> `synthetic-fullstack-handoff` = a fresh agent EXECUTES a handoff (27/28); `synthetic-fullstack-plan`
> = the system WRITES a load-bearing handoff (8/8 PASS). L6 = chain those two across a whole app.

## The hard problem: the oracle (and its solution — stage-gating)

"Build a Notion clone" has no gold reference — huge solution space, no single right BC set, no one
e2e that proves "it's Notion." Grading the end-state holistically gives mush. **Solution: grade each
PIPELINE STAGE against its own oracle, and emit a STAGE VECTOR (where did autonomy break?), not a
binary.** "Without failing too much" = aggregate threshold + no stage catastrophically broken.

### Stage-gated grader map (≈70% reuses existing graders)

| Stage | Graded | Oracle | Status |
|---|---|---|---|
| brainstorm → spec | 6 enforced sections; names the core capabilities | per-app capability rubric | reuse spec graders + judge |
| **DDD → bounded contexts** | **right BCs; no god-context; no per-table sprawl; cohesion** | **gold BC set + decomposition judge** | **NEW — the novel grader** |
| contract lock | enums/events frozen before BC build | mechanical (Phase-0 commit/order) | reuse |
| plan | PR-28 handoffs; contract-lock-first waves | `validate-plan` | DONE (PR-28 shipped) |
| build | tsc green tree-wide; detectors clean; per-citizen canons | existing detector+tsc+canon suite, tree-wide | reuse |
| e2e | core flows exist + pass; anti-stub | existing e2e graders | reuse |

## The novel grader: bounded-context decomposition quality ("metrify BC creation")

Per app, author a frozen **"definition of the core"**: must-have BCs + must-work flows. Grade the
agent's modeling on: precision/recall of its BCs vs the gold set (named OR clearly equivalent);
anti-god-context (one BC owning everything = fail); anti-fragmentation (a BC per table = fail);
cohesion (each BC owns a real invariant). **Grade soundness, not exact match** — "is this a sound DDD
carve-up for this app" via a sonnet judge with the gold set in the rubric is more robust than
"did it pick my exact 5 BCs." This judge is the heart of L6.

## The scoped-app ladder (crawl → walk → run)

**Do NOT start with Notion** — debug the harness on a small app that runs in ~1h, not the
hours-and-huge-token cost of a full clone. Probe #1 must be the SMALLEST app that still exercises the
FULL pipeline + non-trivial BC-decomposition decisions.

- **App #1 (MVP harness): mini-Kanban (scoped ClickUp/Trello).** ~3 BCs, ~20 artifacts. Real
  decomposition decisions (lists as VOs on Board vs own BC; Card as its own aggregate), CQRS
  (BoardView projection), realtime (card moves seen across sessions), e2e (create → move → other
  session sees it). Gold rubric in `seeds/l6-mini-kanban/GOLD.md`.
- **App #2+: ClickUp / Notion / Twitch clones** — once the harness + stage vector are proven on #1.

## The big lift: a full-pipeline runner mode

The current runner runs ONE builder. L6 needs the orchestrator-that-fans-out — essentially `/build`'s
agent-team model (orchestrator opus + parallel sonnet workers + haiku reviewers) run AS an eval, over
a plan the same run produced. The eval agent needs subagent-dispatch (Agent/Task) tools. This is the
meaningful engineering — productizing `/build` as a runnable eval mode.

## Phased build plan (the goal tracker — update CURRENT STATUS each session)

- **P0 — Design + scoped-app + gold rubric** (this doc + `seeds/l6-mini-kanban/GOLD.md`).
- **P1 — BC-decomposition grader** — the novel measurement (judge + gold set; optionally a mechanical
  BC-folder parser comparing `packages/api/typescript/src/<ctx>/` to the gold set).
- **P2 — Stage-gating harness** — graders gain a `stage:` tag; the scoreboard reports a per-stage
  sub-score vector; the runner aggregates + thresholds.
- **P3 — Full-pipeline runner mode** — the eval agent runs brainstorm→model→lock→plan→build with
  subagent dispatch (productize `/build`).
- **P4 — The L6 task YAML** for mini-Kanban — prompt = "build <scoped app>", stage-gated graders,
  gold rubric, generous budget.
- **P5 — Run, stage-vector, diagnose, iterate** — feed failures into the rung-ladder improvement loop.
- **P6 — Scale to ClickUp/Notion/Twitch.**

## Risks (honest)

- **Cost** — one run = hours + large tokens. L6 is a PERIODIC FRONTIER probe (the ceiling-raiser),
  not high-frequency. Start scoped to keep harness-debugging cheap.
- **Oracle subjectivity** — gold BC set encodes one opinion; grade soundness over exact match.
- **Non-determinism at scale** — two runs differ; k≥2 measures pipeline RELIABILITY ("consistently
  clears the bar"), not convergence to one output.
- **Runner extension (P3)** — the largest unknown; the full-pipeline-with-subagents mode is real work.

## P3 finding (2026-06-14) — eval agent lacks dispatch, but Option A is CONFIRMED viable

`AGENT_ALLOWED_TOOLS` in `scripts/skill-evals/run.ts` grants only scoped Bash + Write/Edit/Read — no
`Task`/`Agent` — so the runner is single-context today. Two ways forward:
- **Option A (grant the tool) — DERISKED ✓ CONFIRMED.** Add `Task` (+ worker file-edit tools) to
  `AGENT_ALLOWED_TOOLS` for L6 probes + give the eval agent the `/build` orchestration prompt → one
  headless eval agent becomes the orchestrator that fans out worker subagents. **Proven 2026-06-14:**
  a headless `claude -p --permission-mode acceptEdits --allowedTools 'Task,Write,Edit,Read,Bash'`
  dispatched a general-purpose subagent that successfully WROTE a file — **in a `$TMPDIR` worktree**
  (where real eval trees live). Caveat learned: subagent writes are blocked under any `.claude/` path
  (sensitive-path guard) — irrelevant since worktrees are `$TMPDIR`, NOT `.claude/`. No dangerous
  `bypassPermissions` needed (and it's classifier-blocked anyway); plain `acceptEdits` + `Task` in the
  allowlist suffices.
- **Option B (runner orchestrates):** chained `claude -p` per stage — fallback, not needed now.

**P3 decision: Option A.** Implement = (1) add `Task` + the worker write tools to a dedicated L6
allowlist in run.ts (gated to L6 probes); (2) ACT_PREAMBLE variant = the `/build` orchestrator prompt
(topo-sort Tasks → dispatch workers per wave → gate). The worktree is already `$TMPDIR`, so writes work.

## ClickUp (app #2) status

- iter1 16/18 → **iter2 18/18 PASS** (2026-06-15). The richer scale (3 contexts: workspace/task/
  collaboration + TWO projections + status workflow + assignment) builds fully green from one line.
  iter1's two misses both closed by GENERAL rails that now harden any app: `model#` (over-modeled
  List as a SpaceList aggregate) → ddd-modeling value-object-vs-aggregate rule; `e2e#` (getByTestId)
  → e2e skill principle 9 (role/label/text, never testid).
- **k=2 did NOT confirm — iter3 = 16/18.** Failed `model#` (List over-modeled as aggregate AGAIN +
  Task anemic) and `cqrs#` (two BFF views read one shared table, no projector classes — CQRS pattern
  shortcut). KEY FINDING: the misses are real build flaws, not judge variance. model# has now failed
  iter1 + iter3 (passed iter2) = a REPEATING family despite the doc rail → the VO-vs-aggregate canon
  is **modeling JUDGMENT with irreducible variance**; a document rail nudges but doesn't determinize
  it (~2/3 reliable). The MECHANICALLY-railed stages (lock/build/flow/e2e) are reliable across all 3
  runs; the JUDGMENT stages (model#/cqrs#) vary. So autonomous app-build is reliable at the railed
  layers, variable at the decomposition-judgment layer — the honest edge. ESCALATION (rung ladder):
  cqrs# projection-shortcut → SCAFFOLD projections+projectors (eliminate rung, fixable); model#
  VO-vs-aggregate → either accept as measured judgment-variance (+ lean on the L3 review gate) or a
  stronger rail. Decision pending.

## MODEL SPLIT — judgment→opus, build→sonnet (the fix for judgment variance, 2026-06-15)

The k=2 finding (judgment stages ~2/3 reliable on all-sonnet) led to enforcing the production /build
architecture in the eval: the orchestrator (opus) OWNS all modeling/decomposition/projection judgment
and freezes it into per-Task handoffs; dispatched workers (sonnet) only EXECUTE. ClickUp evidence:
- sonnet orchestrator: iter1 16/18 (model#✗), iter2 18/18, iter3 16/18 (model#✗ cqrs#✗) → judgment ~2/3
- **opus orchestrator: iter4 18/18 (model#✓ cqrs#✓)** → the exact two stages sonnet varied on, opus got right.
**CONFIRMED at k=2: iter4 18/18 + iter5 18/18 under the opus orchestrator** (model#+cqrs# pass both).
ClickUp (app #2, richer) is CONVERGED under the model split — judgment variance FIXED by routing the
model+plan phase to opus. The gate "ClickUp wires" is MET → clear to start Notion. Tradeoff: opus
orchestrator ~2× wall-clock (it's a fraction of the work — workers stay sonnet — so cost is contained,
latency real).
GENERAL rail: in the ORCHESTRATOR_PREAMBLE → hardens every app build; matters MORE as apps get richer
(Kanban converged on all-sonnet; ClickUp needed opus; Notion's recursion will need it most). NEXT:
iter5 confirms → ClickUp CONVERGED under the model split → Notion (with opus-judgment in place).

## FUTURE GOALS (user-set 2026-06-15) — the next three, after ClickUp wires (converges)

Gated on ClickUp reaching a green stage vector + k≥2. Then, in order:

1. **Notion test** — the hardest *modeling* probe yet: a scoped Notion clone whose core is a
   **recursively nested block tree** (a Page contains Blocks; a Block can contain Blocks). This
   stresses decomposition in a genuinely new way — a self-referential aggregate / tree, not a flat
   hierarchy. Scope: workspace → pages (nested) → typed blocks (text/heading/list/toggle) with
   block edits + realtime. The recursion is the novel challenge the BC-decomposition + handoff
   machinery hasn't faced. (App #3 in the P6 ladder.)
2. **Clean branch** — create the `clean` branch via `/clean-branch` (rebase from dev, strip ALL
   domain code → generic boilerplate; it does NOT exist yet). Then run the L6 probes (Kanban/
   ClickUp/Notion) on it to measure **substrate-generality** — how much the agent leaned on the
   e-commerce exemplars. This is the held-out validation set / overfit detector. `transplant.sh`
   (`scripts/skill-evals/`) is already written and waiting on this branch.
3. **`/correctness-loop` command** — the autonomous self-improvement orchestrator: run a probe
   batch → read the scoreboard → diagnose recurring failures → WRITE the rail (detector/scaffold/
   carrier) → validate → re-measure → commit → repeat, with the guardrails (the clean branch as
   overfit-detector, grader-immutability, §3.5 anti-noise). This removes the human (me) from the
   improvement loop — the `l5-learnings-meta` capability made operational. It DEPENDS on #2 (the
   clean branch is its honesty check) and exercises #1 (Notion as a frontier probe it can run).

## CURRENT STATUS (update every session)

- 2026-06-14: Goal set. Foundation proven (handoff 27/28 + plan 8/8 → full loop closed at slice
  scale). **P0 DONE** (design doc + `seeds/l6-mini-kanban/GOLD.md`). **P3 DERISKED ✓** — Option A
  confirmed: headless `claude -p` + `Task` in the allowlist dispatches a writing subagent in a
  `$TMPDIR` worktree. The biggest unknown is resolved; L6 is feasible.
  NEXT (in priority): **P3 build** — the L6 orchestrator mode in run.ts (Task allowlist + `/build`
  preamble, gated to L6 probes); **P1** — BC-decomposition grader (self-contained, build in
  parallel); then **P2** stage-gating, **P4** the mini-Kanban L6 task YAML, **P5** first run.
- 2026-06-15: **P3 BUILT** — `extraTools` field (types.ts) + threaded through spawnBuilder +
  `ORCHESTRATOR_PREAMBLE` (the /build agent-team prompt) in run.ts; harness tests green. **P1 BUILT**
  — the BC-decomposition grader is the `model#bc-decomposition` sonnet judge (gold-rubric soundness,
  anti-god-context/anti-sprawl/invariants). **P2** done lightweight via stage-prefixed grader ids
  (model#/lock#/build#/e2e#/flows# = the stage vector; no harness change needed). **P4 BUILT** —
  `synthetic-l6-mini-kanban.yaml` (14 graders, extraTools [Task], 3h budget), validator-clean.
  **P5 LAUNCHED** — first orchestrated app-from-idea run. The probe now EXISTS and is RUNNING.
- 2026-06-15: **P5 GRADED — FIRST MEASUREMENT IN. The probe WORKS.** `l6-mini-kanban-iter1` = **11/14**
  (verdict FAIL, 3 stages). Stage vector:
  - `lock#` ✅✅ — CardMoved + boardId frozen, both-lang bindings regenerated (contract-lock-first held).
  - `build#` ✅×8 — tsc green (backend+react+e2e) AND all 6 detectors clean. **A whole app, built from
    one line, that type-checks and is architecturally canon-clean.**
  - `model#bc-decomposition` ✗ — single `kanban` god-context owns Board+Card (should split board/card,
    lists as VO). The decomposition trap, realized.
  - `e2e#realtime-move` ✗ — SSE connection set up but the move-via-API-and-assert-no-reload assertion
    is absent (dropped tail).
  - `flows#core-coverage` ✗ — 3/5 e2e: no list-creation endpoint (boards have 0 lists), no ArchiveBoard
    endpoint (archive guard unreachable via API).
  **Diagnosis → next iteration (the improvement loop):** (1) `model#` → strengthen the decomposition
  rail (ddd-modeling skill / prompt: Board and Card are SEPARATE contexts, never one `kanban`); (2)
  `e2e#`+`flows#` → the tail-drop (realtime assertion + 2 missing commands) — the orchestrator should
  dispatch a dedicated "finish the commands + realtime e2e" worker, or scaffold them. The CODE-QUALITY
  + CONTRACT stages are SOLID; the breaks are modeling JUDGMENT + tail COMPLETENESS.
  NEXT: iter2 with the model# + tail fixes → drive toward a green-enough stage vector.
- 2026-06-15: **GOAL ACHIEVED — L6 iter3 = 16/16 PASS, a FULLY GREEN autonomous app-from-idea build.**
  Trajectory: iter1 11/14 → iter2 13/14 → iter3 **16/16**. A fresh agent took "build a Kanban app"
  and produced a complete, type-clean, architecturally-canon-clean app: sound BC decomposition
  (board/card separate), contract-locked-first (CardMoved + boardId), tsc green (backend+react+e2e),
  all 6 detectors clean, the create dialog, realtime, AND a REAL e2e spec (10 active assertions, 0
  stubbed). Each fix this loop was a GENERAL rail, not a probe patch: ddd-modeling decomposition
  (invariant>entity-count), ORCHESTRATOR_PREAMBLE per-Task dispatch + /build completeness audit,
  e2e skill principle 8 (author specs complete when unrunnable). The app-from-idea pipeline works.
  REMAINING (own sessions): k≥2 confirmation of 16/16; then scale to ClickUp/Notion/Twitch (P6) and
  the clean-branch transplant (substrate-generality). The MVP harness + the loop are proven.
- 2026-06-15: **k=2 CONFIRMED — iter4 also 16/16 PASS.** Two independent full app builds (iter3 +
  iter4), both fully green, both sonnet, fresh worktrees. Decomposition held all three runs
  (iter2/3/4 split board/card). So 16/16 is NOT a lucky roll — the pipeline **reliably** builds a
  canon-clean app from a one-line idea. By §3.5 (pass repeats across k≥2 valid samples) **L6 mini-
  Kanban is CONVERGED.** The autonomous app-from-idea capability is a measured, reliable result, not
  a one-off. NEXT (own sessions): P6 scale (ClickUp/Notion/Twitch) + clean-branch transplant.
