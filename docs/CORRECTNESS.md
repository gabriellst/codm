# CORRECTNESS — the optimization system behind the patterns

> How this repo keeps N builders (humans, interactive agents, headless agents) producing
> canon-true code as the codebase grows. Companion to `docs/BACKEND.md` / `docs/FRONTEND.md`
> (which say *what* the patterns are); this document says *how the patterns stay applied* —
> the entities, the feedback loop, and the artifacts it produces. Operational state lives in
> `.plans/` (current handoff: `2026-06-10-correctness-handoff-next-steps.md`).

---

## 1. The core idea

A feature is a **composition** of many small pattern applications. If a build touches N
decision points and each is applied correctly with probability p, the feature is fully
canon-true with probability ≈ pᴺ. At N in the dozens, even p = 0.97 rots: 0.97³⁰ ≈ 40%.
Two consequences drive everything here:

1. **Raise p mechanically wherever possible.** A pattern enforced by the compiler or a CI
   gate has p ≈ 1 forever and costs nothing per-build. A pattern that lives only in prose
   has whatever p a busy reader gives it.
2. **Contradictions are worse than gaps.** Builders (especially agents) learn by
   imitation. A doc that says one thing while an exemplar does another doesn't halve p —
   it *teaches the violation*. Contradiction-hunting is therefore a first-class activity,
   and "docs follow reality / reality follows canon" must converge to the same answer.

The optimization is explicitly a **fitting problem**: fit builders to the house patterns
without overfitting to any single task. Fit is *measured* (eval probes), the fixes are
*placed at the cheapest effective rung* (below), and breadth comes from coverage-driven
probe generation rather than iterating one scenario forever.

### The rung ladder

Every correctness concern is owned at exactly ONE rung — the strongest that can hold it:

| Rung | Mechanism | p | Examples in this repo |
|---|---|---|---|
| **1. Eliminate** | type system, codegen, scaffolds | ≈ 1.0 | `ValidEnvelope` makes a flat controller key a tsc error; typed i18n keys force locale entries; `bun cli` scaffolds emit the canonical shape (`--labels` writes the t() wiring + seeds the catalog) |
| **2. Detect** | mechanical walkers + typed lint rules + CI gates | ≈ 1.0 at merge | `route-closure` (registration drift), `local/component-props` (bp-20/bp-29 — the className doctrine, type-aware eslint), dynamic-`t()`-outside-`enums.*`, `slice-closure`, `registry-scan`, `import-direction` |
| **3. Document** | single-owner judgment rules | ~0.7–0.95, carrier-dependent | package `CLAUDE.md` sections, skill `SKILL.md`/`registry.yaml` patterns |
| **4. Measure** | eval probes + scoreboards | n/a (this rung measures the others) | `scripts/skill-evals/` |

**Escalation policy:** when a documented canon fails k ≥ 2 *valid* measured samples with
the canon present and read, it escalates — to a detector, a scaffold, or a type — never to
"rewrite the doc louder." Measured example: expo registration drift survived the written
canon at k=3 → became route-closure RC-01..04; the i18n catalog mis-namespacing survived a
rewritten doc → became the dynamic-`t()` rule.

---

## 2. Core entities

```
                      ┌────────────────────────────────────────────────┐
                      │              AXIS (.claude/atlas/axes.yaml)    │
                      │  one decision dimension · one owner · a rung   │
                      │  scenarios: = the verifier test matrix         │
                      └──────┬─────────────────────────┬───────────────┘
                     owner anchor                 measured by
                             │                         │
                ┌────────────▼───────────┐   ┌─────────▼─────────────────┐
                │  CANON (owner rule)    │   │  PROBE (tasks/*.yaml)     │
                │  skill registry rule / │   │  synthetic agent task     │
                │  package CLAUDE.md §   │   │  prompt + graders + judge │
                └───┬──────────┬─────────┘   └───────┬───────────────────┘
            carried by      escalates to            runs via
                │              │                     │
   ┌────────────▼───┐  ┌───────▼────────────┐  ┌─────▼──────────────────┐
   │ CARRIER        │  │ DETECTOR + BASELINE│  │ RUNNER + VALIDATOR     │
   │ package        │  │ scripts/detectors/ │  │ run.ts (worktree, act  │
   │ CLAUDE.md (the │  │ CI `bun detect`    │  │ preamble, resume,      │
   │ proven one) +  │  │ ratchet: old debt  │  │ suspect flag) +        │
   │ skills + hooks │  │ baselined, new     │  │ validate-task.ts (free │
   │ + EXEMPLARS    │  │ violations gate    │  │ real estate at HEAD)   │
   └────────────────┘  └────────────────────┘  └─────┬──────────────────┘
                                                     │ emits
                                          ┌──────────▼─────────────┐
                                          │ SCOREBOARD (JSONL)     │
                                          │ ts + pass + graders +  │
                                          │ docTreeHash (provenance)│
                                          └────────────────────────┘
```

- **Axis** — a cross-cutting decision dimension (STATE-PLACEMENT, WIRE-EXPOSURE,
  FORM-COMPOSE…). Exactly one **owner anchor** (a skill rule id or doc heading — resolution
  is drift-tested by `atlas-anchors.test.ts`), a **rung**, and `scenarios:` that double as
  the verifier matrix when probes are authored. Coverage is computed per axis
  (`feature-loop/coverage.ts`) — uncovered axes are the probe-generation queue.
- **Canon** — the single normative statement of a pattern. Stated as a *lifecycle as needed*,
  never an absolute that over-fires (e.g. an inline controller body is canon *until* its
  use case exists; the violation is coexistence).
- **Carrier** — where a canon lives so builders actually load it. Measured result: the
  package `CLAUDE.md`, named first in a task prompt's read list, is the carrier that
  transfers (a 4-consecutive-fail family flipped green when its canon moved there); skills
  hold the reference depth; the classify-edit hook nudges at edit time; **exemplars are
  load-bearing carriers too** — agents imitate live code, so an exemplar that violates the
  canon teaches the violation (the `devices` sheet had to be fixed before the dismissal
  canon could land).
- **Detector** — a mechanical walker with per-finding severity, `ROOT_OVERRIDE` (so eval
  worktrees are walkable), and a **baseline ratchet**: pre-existing debt is keyed and
  frozen; new findings gate. Detectors are also probe graders (`kind: detect`).
- **Probe** — a synthetic, agent-only task measuring whether canons transfer to a fresh
  builder. Anatomy: a prompt that names the carrier first and pins paths; **idiom-level
  graders** (never invented names; real repo utilities are fair game); exactly one
  **judge** whose rubric ends with *scope notes* naming legitimate-exception traps; and
  `notes:` documenting the free-real-estate verification.
- **Runner + validator + scoreboard** — the instrument. The runner executes the builder in
  a throwaway worktree (act preamble, resume-on-silent-termination, suspect-sample flag);
  the validator proves a probe measures only new work (at HEAD: every grep-must empty,
  every gate green); the scoreboard line carries `ts` + `docTreeHash` so provenance is
  checkable before any before/after claim.

---

## 3. The optimization loop

```
 run probe ──► scoreboard ──► diagnose (transcript forensics, not guesses)
    ▲                              │
    │              ┌───────────────┼───────────────────┐
    │        consistent fail   instrument bug      real defect in product/docs
    │        (k≥2 valid)       (grader/judge/runner)   (found BY the probe)
    │              │               │                   │
    │        fix at the rung   fix the instrument   fix at the source
    │        (doc → detect →   (idiom-level spec,   (contract, exemplar,
    │         scaffold → type)  scope note, resume)  doc-vs-reality)
    │              │               │                   │
    └──────────────┴───────────────┴───────────────────┘
                       one variable per iteration, then re-measure
```

Strategies that make the loop honest and convergent:

1. **One-variable iteration + attribution protocol.** Fails consistent across valid
   samples → the owner doc/rung. Scattered fails → variance, no action. k=1 deltas are
   noise. Truncated/suspect samples are never canon evidence.
2. **Instrument repair is first-class.** Roughly half of all observed "failures" were the
   instrument: grader regexes blind to equivalent spellings (`showDialog(` aliases, the
   SDK's own zod schema, enum-derived tuples), a judge contradicting the task's own notes,
   substring collisions (`Notificati·onError·Icon`), silently-killed builders. Each gets
   fixed *and* generalized (alias-tolerant specs, judge scope notes, suspect flag, resume).
3. **Generator/verifier split.** The spec states decisions; graders are derived
   independently from the spec (adversarial reviewers attack winnability and
   name-invention); the free-real-estate validator gates authoring before any run spends
   tokens.
4. **Provenance discipline.** Same `docTreeHash` = same-condition samples, not a
   before/after. Background runs execute hours after launch; check the scoreboard, not the
   launch order.
5. **Anti-overfit breadth.** Convergence on one probe family proves that family only. The
   coverage tool turns uncovered axes into the authoring queue
   (`tasks/PROBES-BACKLOG.md`), and cross-cutting axes (naming, error vocabulary) ride as
   graders on every probe instead of getting their own.
6. **Contradiction hunting as a side effect.** Every loop activity — probing, authoring,
   gating — keeps surfacing doc-vs-reality contradictions, and they get fixed at the
   source (skill §5 teaching raw `.def.options[0]` while the registry mandates the union
   helpers; root CLAUDE.md claiming sqlc where none exists; an exemplar violating its own
   canon).

---

## 3.5 The convergence criterion (adopted 2026-06-12)

A probe is **CONVERGED** when:
1. every family that failed k≥2 has a live rail (gate, scaffold, seed or carrier), AND
2. its remaining misses are **non-repeating singles** — no grader fails twice in a row,
   no family recurs across consecutive valid samples.

A probe is **PERFECT** when a valid sample passes 100% of graders. Perfect implies
converged; converged probes reach perfect by re-rolls, not by further fixes — at ~98-99%
per-grader reliability, a 50-grader probe rolls perfect roughly every 2-3 attempts, and
"fixing" a non-repeating single is overfitting to noise. Program claims use CONVERGED;
scoreboard celebrations use PERFECT. The distinction keeps the loop honest in both
directions: no premature victory (families still open ≠ converged) and no noise-chasing
(tails ≠ defects).

## 4. Artifacts the optimization produces

| Artifact | Where | Role |
|---|---|---|
| CI gates | `bun detect` → `.github/workflows/correctness.yml` | rung-2 guarantees on every merge: registry-scan, import-direction, slice-closure, route-closure, component-props (route shells) |
| Typed lint rules | `scripts/eslint-rules/` → `bun lint` | rung-2 where the question needs the CHECKER, not a regex: `local/component-props` (className doctrine), `local/no-enum-widening`, `local/no-hardcoded-jsx-text` |
| Edit-time nudges | `.claude/hooks/classify-edit-core.ts` (+ registries) | the same mechanical rules, surfaced while writing |
| Scaffolds | `bun cli` recipes (`docs/CLI.md`) | rung-1: the canonical shape is emitted, not remembered ("if you wrote it, the CLI should write it") |
| Probe suite | `scripts/skill-evals/tasks/*.yaml` | the measurement battery (15 synthetics; every axis covered) |
| Scoreboards | `scripts/skill-evals/scoreboard/*.jsonl` | the evidence record (provenance-stamped) |
| Baselines | `scripts/detectors/*.baseline.json` | debt ratchets — old violations frozen and ticketed, new ones gate |
| Plan log + handoff | `.plans/2026-06-09-…` / `…-handoff-next-steps.md` | the auditable iteration history + resume point |
| Product fixes | commits on the branch | found BY the loop: loose wire DTOs, dead registrations, locale drift, a last-write-wins mediator, stub reads, 11 ComponentProps violations, … |

That last row is the strongest validity signal: a loop that were merely gaming its own
score would not keep producing source-level product fixes and *stricter* instruments while
scores rise.

---

## 5. How it changes the building process

For any builder (human, interactive agent, headless agent), building a feature now runs on
rails, cheapest rung first:

1. **Scaffold first** — `bun cli` emits the canonical artifact shape (route shells,
   store-driven dialogs, typed label wiring, onboarding steps). What's emitted can't be
   mis-remembered.
2. **Carriers are auto-loaded** — the package `CLAUDE.md` states the short, binding canons
   for that workspace; skills hold the depth; exemplars agree with both (and are repaired
   when they don't).
3. **Types refuse early** — envelope constraints, typed i18n keys, enum-keyed maps: a class
   of violations cannot compile.
4. **Edit hooks nudge** — mechanical rules fire while the diff is being written.
5. **Gates refuse at merge** — `bun detect` + tsc + tests in CI; new violations cannot land,
   pre-existing debt is ratcheted, never silently grandfathered into new code.
6. **Probes watch the system itself** — when the repo's docs, scaffolds, or gates degrade
   (a new pattern undocumented, a contradiction introduced), the next probe run shows it as
   a measured regression — the eval loop is the regression net *for the correctness system*,
   the same way tests are the regression net for the code.

The net effect: correctness cost is front-loaded into reusable rails instead of being paid
per-review, per-builder, forever — and every failure the system observes is converted, at
the appropriate rung, into a mechanism that prevents its recurrence.
