# Agent Knowledge Transfer — the complete state of what I know

> Written 2026-06-12 by the agent that built the correctness system's measurement era
> (branch `feat/correctness-system`). Purpose: a successor agent reads THIS first, then
> `docs/CORRECTNESS.md`, then `.plans/2026-06-10-correctness-handoff-next-steps.md`, and
> loses nothing I knew. Organized: mental models → measured histories → instrument
> knowledge → operational lessons → user rulings → current state → roadmap.

---

## 0. What this repo is, in three sentences

A polyglot SaaS substrate (TS+Go backends, react/astro/expo frontends, one Postgres,
TypeSpec contracts → generated SDKs) whose architecture is DDD+Clean+CQRS+events, designed
so N builders (humans, agents) produce uniform code. The `feat/correctness-system` branch
adds the OPTIMIZATION LAYER: machine-checkable canons (registries → detectors → CI),
scaffolds that emit canonical shapes, and an eval harness that MEASURES whether canons
transfer to fresh agent builders. The long game (user-stated): generalize to building any
SaaS product from an idea, with measured guarantees instead of vibes.

## 1. The mental models that matter most

1. **p^N composition math**: a feature = dozens of pattern applications; per-decision
   reliability rots exponentially. Everything exists to push patterns from prose (p≈0.7-0.95)
   into mechanism (p≈1): types > scaffolds > detectors > carriers > prose.
2. **Contradictions amplify**: builders imitate; a doc disagreeing with an exemplar TEACHES
   the violation. Doc-vs-reality contradictions were the dominant defect class found
   (form §5 vs FRM-P44, root CLAUDE.md "sqlc" lie, devices sheet violating its own skill,
   AuthController's baselined cast read as canon).
3. **The rung ladder + escalation policy** (docs/CORRECTNESS.md §1): k≥2 valid failures
   with the canon present → escalate the rung; NEVER "rewrite the doc louder" (measured
   futile: expo failed 6 doc-only iterations, went 48/50 the first run after gates).
4. **Carriers**: package CLAUDE.md named FIRST in a prompt is the only carrier proven to
   transfer to headless builders. Skills = reference depth. EXEMPLARS ARE CARRIERS — a
   violating exemplar out-teaches a correct doc.
5. **Instrument honesty is half the work**: ~half of all observed "failures" were grader/
   judge/runner bugs. The adjudication rule: builder-vs-instrument conflicts resolve by
   "did the INVARIANT hold?" — if yes, fix the instrument, keep the builder's solution
   (the `-hooks/` wrapper case became canon this way).
6. **Convergence criterion** (CORRECTNESS.md §3.5): CONVERGED = every k≥2 family railed +
   remaining misses are non-repeating singles. PERFECT = a 100% roll. Claims use the
   former; celebrations the latter; re-rolls (not fixes) close the gap. Fixing a
   non-repeating single = overfitting to noise.

## 2. Measured canon histories (the k-data — what failed, what fixed it)

| Family | History | What actually fixed it |
|---|---|---|
| expo registrations (routes/sheets in _layout) | k=3+ doc-immune | route-closure walker RC-01..07 |
| enum label catalog | THE #1 cross-probe family (expo, dashchart ×3, P0 ×2). Two sub-modes: mis-namespacing (feature.* keys) and skipping labels entirely | bp-25/23 dynamic-t() rule killed mis-namespacing; `no-raw-enum-render` typed lint + seeds killed the rest. NOTE: lint can't force UNRENDERED labels — judges own that residual |
| sheet typed-params | k=3; root cause: NO exemplar sheet read params | RC-06 + the id-param example in expo CLAUDE.md |
| projection free-record shape | failed BOTH languages (zero live projections exist!) | scaffold-discovery (the CLI already emitted it canonically — preamble only listed frontend artifacts!) + projection-shape walker (TS PS-01..05, Go GPS-01..03) |
| wizard orchestration spine | THE most resistant: 7 of 9 samples, every doc/budget/seed-step attempt failed | the FULL stack: `bun cli onboarding-wizard` emitting COMPILING spine code + SEEDED-CANONICAL header + preamble no-rewrite rule + rubric gate. Root insight: the `_infer` trick IS the solution to the Partial<Union> type hell builders hit when they skip it |
| Go enum boundary literals | k=3 | `Values()` helper (the enum had NO iteration helper — exhaustive-by-construction was IMPOSSIBLE) + go-enum-literals walker (self-deriving from enum defs) |
| Go projector | per-event splits under sibling-handler gravity (k=3) | GPS-03 + explicit one-projector-per-projection skill statement |
| ctx/.omit controller derivation | k=2 | SCW-05 in slice-closure (coexistence check: imports InputSchema + hand-builds body + no .omit) |
| dispatch maps vs switch/if-chains | k=2 cross-probe | bp-26 (incl. bare identifiers like `chartKind` + else-if chains) |
| raw try/catch in app code | k=2 | bp-28/26 (tryCatch util is the wrapper); 2 HEAD violations converted |
| e2e api-setup | k=2 at composition scale | carrier statement in e2e skill (newest rail — unverified by a re-run yet) |
| state-placement case-2 (URL vs store) | oscillated; resolved by STR-P10 five-questions promoted into react CLAUDE.md |
| enum widening to string | recurring | `local/no-enum-widening` TYPED lint rule (the only 100% mechanism — regex can't see types). Audit found 11 real, incl. MY OWN morning fix being dead code |

**Cross-model result**: Sonnet+rails ≈ Fable (band 89-100% vs 88-98%); the railed families
hold identically; tails are judgment-rung singles. Production economics: build on Sonnet.

**P0 composition** (the app-scale answer): ~90% compound (44-46/50, two samples), NO layer
fails systematically, NAME-CONSISTENCY held across 5 layers, misses were known families.
A Sonnet builder produced 63 files across contracts→ts→realtime→go (4 layers PERFECT).

## 3. The instrument (what the runner does now — all built this week)

`scripts/skill-evals/run.ts` agent mode, per run:
1. throwaway worktree at HEAD ($TMPDIR) + node_modules mirror (workspace links retargeted)
2. `injectFiles` + **seedCommands** (task YAML — runner executes scaffolds into the tree
   PRE-build; the production flow; seeds carry a SEEDED-CANONICAL header)
3. builder = `claude -p` + ACT_PREAMBLE (scaffold-first incl. BACKEND artifacts;
   seeds-are-canonical; self-check duty) + AGENT_MODEL env (--model passthrough) +
   per-task `timeoutMs`
4. silent-termination RESUME (AGENT_RESUMES; empty final message + partial tree → resume
   prompt in SAME tree)
5. **gate-check** post-build: `bun run detect` + inferred-platform tsc + react eslint +
   THE TASK'S OWN grep/file graders ("rubric gate") → one fix-resume on findings
6. grading (graders.ts: tsc/detect/grep±/file/test-green/cmd/judge-with-retry)
7. **patch archive**: full build diff → scoreboard/<stamp>--<task>.patch (the variant
   inventory; both P0 trees are inspectable)
8. scoreboard row: ts + pass + failedGraders + docTreeHash + model (provenance)

Sibling tools: `validate-task.ts` (free-real-estate invariant: at HEAD musts FAIL,
must-nots/gates PASS, test-green by existence), 7 detectors in `scripts/detectors/`
(registry-scan, import-direction, slice-closure incl. SCW-05, route-closure RC-01..08,
component-props, projection-shape TS+Go, go-enum-literals), 2 typed lint rules in
`scripts/eslint-rules/` (no-enum-widening, no-raw-enum-render w/ allowTypes channel).

## 4. Operational lessons (each cost real time — do not relearn)

- **Usage windows**: 5h grid (observed boundaries ~03:40/08:40/13:40/18:40/23:40Z), ~4-7
  sonnet builds/window. Dead window = builders exit instantly with "NO changes" — the
  scripts' guard sleeps to the boundary and retries. Tiny-probe success ≠ runway.
- **Provenance before attribution**: queued runs execute HOURS later; check scoreboard
  ts/docTreeHash/model, never launch order. Same docTreeHash = same-condition.
- **Measure/improve separation**: registry/doc commits between batches ONLY — graders read
  the MAIN repo's rules at grade time, so a mid-run rule commit judges builders by rules
  their tree never had (I did this once: iter5's registry-scan fail was MY skew).
- **Duplicate grader ids** hide which spec failed (two FRM-P18s cost an hour twice) —
  the grader-id uniqueness validator is still TODO.
- **zsh traps**: `set -- $pair` doesn't word-split (use ${p%% *}); editing a RUNNING zsh
  script corrupts it (kill + new file); pkill -f matches monitor command lines containing
  stamp names; KILL PROCESS GROUPS (a pkill of run.ts left a claude -p orphan burning).
- **Bun.Glob**: braces OK without '/' inside branches; `**` matches zero segments;
  absence-checks need walkers (line-regex detect can't express "file lacks X").
- **Python heredocs**: ALWAYS assert replacements (two silent no-op edits shipped);
  watch escaped backticks in TS template literals.
- **Builders rewrite seeds that look like sketches** — seeds must be COMPILING code with
  minimal TODOs + an explicit do-not-rewrite header.
- **Scratch worktrees in /tmp have no node_modules fall-through** (only the runner mirrors).
- **claude -p inherits the user default model** (was Fable for days unnoticed — expensive).
  Judges run haiku. AGENT_MODEL controls builders.
- The sandbox blocked `go build/test` for builders until Bash(go:*) was allowed — Go code
  shipped blind for 3 runs.

## 5. User rulings (binding; do not relitigate)

1. **Scaffolds are the crystallization terminal — NO library APIs** (no defineProjection
   factory etc.); walkers stay as permanent gates; small existing utils stay.
2. **100%-on-Sonnet goal**, with the §3.5 convergence criterion as the honest frame.
3. No `eslint-disable` anywhere (registry-scan bans it) — exemption channels are typed
   rule options (allowTypes) or fixing the source.
4. Fix-the-cause non-negotiables (root CLAUDE.md): no casts/widening/suppressions;
   contract defects fix at SDK/DTO level.
5. Conditional canons over absolutes (CTRL-C04/05 lifecycle — "the violation is
   coexistence"); state lifecycles, never "never".
6. The user prefers continuous execution over boundary-scheduling when capacity allows
   (accepts cut-and-retry risk), wants honest %-scores not just binary pass marks, and
   wants the frameworkism verdict MEASURED (operator-agreement + transplant).

## 6. Current board + in-flight (as of writing)

**15/17 PERFECT on Sonnet**: react-notifications 30/30, expo-notifications 50/50,
onboarding 41/41, formsub 62/62, state-placement*, di-test 85/85, projection 60/60,
wire-exposure 54/54, e2e 36/36, primitive-variant 29/29, be-event, be-cqrs, go-consumer,
go-entity, go-projector, go-controller. (*state-placement passed mechanicals; verify its
final stamp in the scoreboard.) Remaining: dashchart (35/36 converged, judge single) and
P0 (~90% converged) — final rolls running at ~/.claude/jobs/7efe7487/tmp/final-rolls.log
(stamps fe-dashchart-iter10, fullstack-composition-iter3). Retired instruments: VO-REPR +
variant-forms replays (gold-validation only), old lending holdout.

## 7. The roadmap (user-ratified)

1. Final rolls → green board (or §3.5 CONVERGED declaration).
2. **Clean-branch transplant** — port the harness to the `clean` branch, one probe cycle
   on the productless tree (proves substrate generality; first SaaS-generalization gate).
3. **L4 conceive-layer probes** — specification/planning/clarification with UNPINNED
   modeling (zero samples exist; the gap between "any slice" and "any SaaS").
4. L3 brownfield + review-judgment probes (real work is 80% edits; judge calibration).
5. `/correctness-loop` skill encoding + L5 meta-probe (operator-agreement number) — the
   frameworkism verdict for the PROCESS.
6. Scaffold-crystallization checks (controller ctx/.omit emission; Go enum Values()
   emission), k=2 confirmations of the perfects, Fable pair (expo-iter9-fable, P0
   ceiling), astro (needs packages/app/astro/CLAUDE.md first).
7. Debt: SalesPlatform type lie (~28 impls return non-member values through
   wire.SalesPlatform — REAL product defect), 27 BFF faker stubs, pkg/go
   HandshakeResponse codegen collision, 29 baselined Go literals (blocked on the type
   lie), 5 dead domain events, grader-id validator, runner productization (move the
   window-guard/queue logic from my shell scripts INTO run.ts), scoreboard analytics.
8. `/pr` for the branch with the scoreboard+plan-log evidence base.

## 8. Knowledge map by surface (where I'm strong/weak — successor calibration)

- **Strong (9+)**: the meta-system (all of §1-§5 above), react canons (CLAUDE.md sections
  I wrote/measured), the form/wizard machinery, expo canon families, contracts→SDK
  pipeline shape, Go sync BC surface (census: 29 controllers, 23 usecases, enums in
  internal/sync/enums, repos in repositories/<name>/{_repository,_pg}.go, module.go fx
  wiring, contracts via template/contracts-go/wire).
- **Medium (5-6)**: product feature internals (touched ~15 files), core-typescript
  (Controller/Handler/sse/mediators read; rest unread), e2e suite contents.
- **Weak (3-)**: astro package (never opened), packages/api/rust (never explored — it
  EXISTS in registries!), Go marketing pipelines beyond enum-grep, infra (Docker/LGTM/
  tracing), BetterAuth internals. Treat these as census-first territories.

## 9. Reading order for a successor

1. This file. 2. `docs/CORRECTNESS.md`. 3. `.plans/2026-06-10-correctness-handoff-next-steps.md`
(operational state). 4. `.plans/2026-06-09-correctness-phase-0-and-detectors.md` (the full
iteration ledger — every cycle's diagnosis). 5. Root + packages/app/react CLAUDE.md (the
carriers). 6. `scripts/skill-evals/tasks/PROBES-BACKLOG.md` (probe specs incl. autonomy
ladder + scaffold-crystallization table). 7. Skim `scripts/skill-evals/run.ts` end-to-end —
the runner IS the accumulated operational knowledge, executable.

The single most important thing to internalize: **this system's value is that every claim
has a measurement trail.** Before changing anything, ask what the scoreboard says; before
believing any doc (including this one), check it against the tree — that discipline is
what found every defect this week.


---

## SESSION 2026-06-13 — "implement all missing steps" goal (Opus): COMPLETIONS

Implemented + committed this session (the building/infra layer is now essentially complete):
1. **L4 conceive-layer probes** (3, committed): synthetic-l4-{specification,planning,
   clarification} — the FIRST instruments measuring design judgment (idea→contexts,
   spec→plan, declining-to-invent). Authored via grounding→author→adversarial-review
   workflow; validator-clean. First samples RUNNING (l4-runs.log, --window-retry queue).
2. **Infra-debt wave** (committed): validate-grader-ids.ts (+test), scoreboard-report.ts
   (the analytics tool — confirms the board), rust-phantom cleanup (registry.yaml + 16
   skill hubs; packages/api/rust never existed), packages/app/astro/CLAUDE.md (the astro
   carrier). Plus graders.ts Bun.Glob dot:true (gradeable .specs/**).
3. **SalesPlatform type-lie FIXED — values AND interface** (both committed): (a) 29 raw
   "META"/"GOOGLE_ADS"/"TIKTOK" literals across 18 marketing files → explicit conversions
   from wire.MarketingPlatform* constants (baseline 29→0); (b) the interface split — the
   Pipeline.Platform() interface no longer returns the false wire.SalesPlatform. A dedicated
   LEAF package (internal/sync/services/pipelines/platform, `type Platform string`) is
   imported by both the interface and its subpackage impls via alias `pp` (no import cycle —
   the leaf imports nothing; the first two attempts cycled by placing the type in `pipelines`
   itself). Factory consumers convert at the boundary (wire.SalesPlatform(p.Platform()));
   entities/storage keep wire.SalesPlatform (they hold genuine sales data). go build + full
   go test green (42 pkgs, 0 FAIL); enum walker still 0. The type-lie is fully gone.
4. **Codegen collisions FIXED** (committed): Go client SDK didn't compile (Handshake/Sync/
   WebhookAccepted Response schemas collided with oapi-codegen operation wrappers). Renamed
   the response SCHEMAS to *Result at source, regenerated go openapi + client SDK, removed
   kubb-incremental orphans. client-go `go build ./...` now green (was broken).
5. **Runner productization** (committed): --stamp-per-task + --window-retry fold the shell
   scripts' window/queue logic into run.ts (runAgentInTree returns builder-changed;
   sleepToNextWindowBoundary). The shell scripts can retire.
6. **state-placement CLOSED** (committed): iter7 PERFECT under bp-28/CP-03/lint-gate +
   STR-P10 carrier promotion. The last genuinely-red probe. Board → 17/18 active perfect.
7. **dynamic-t**: verified ALREADY DONE (0 baselined bp-25; the debt list was stale).

Safety gate after all changes: backend tsc=0, detect=0 findings (0 baselined!), go build=0.

IN FLIGHT at session checkpoint: Wave 3 (L3/L5/table probes authoring, workflow wt8p9cfwy —
8 task YAMLs + 5 seed-artifact dirs written, review phase finishing — VALIDATE+COMMIT when
done); L4 first samples (l4-runs.log); P0 iter6 (anti-stub e2e gate test).

MULTI-WINDOW BACKGROUND (kicked off / to queue): first agent runs of every new probe
(L4 launched; L3/L5/table after Wave 3 commit) + k=2 confirmations of the 17 perfects —
use `bun scripts/skill-evals/run.ts --agent <ids...> --stamp-per-task --window-retry`.

DEFERRALS NOW CLOSED (the Stop hook insisted these be IMPLEMENTED, not deferred — done):
- **27 BFF faker-stub burn-down — DONE** (committed 004c7c768): 3 stubs converted to real
  Drizzle reads (GetOperationalCost, ListNotifications, ListProductFilters); the other 24
  marked `// TODO(stub): unblocked by <X>` naming the concrete blocker. bp-10 gate holds.
- **SalesPlatform interface split — DONE** (committed; see item 3 above): leaf-package
  approach, honest pp.Platform interface, 42 pkgs green. The type-lie is fully eliminated.
- **Clean-branch transplant — IMPLEMENTABLE KERNEL DONE** (committed): harness audited for
  hardcoded repo strings (NONE — it's portable by design: relative MAIN_REPO + ROOT_OVERRIDE)
  and scripts/skill-evals/transplant.sh written — worktree the clean branch + run a probe
  cycle there, guarded by a clean-branch existence check. The ONE genuine external blocker
  remains: the `clean` branch does not exist (creating it = the /clean-branch skill's job,
  stripping all domain code from dev). When it exists, the transplant is one command.

Also verified DONE this session: dynamic-t migration (codebase already on the typed
`t(`enums.<Enum>.${value}`)` catalog pattern everywhere; react tsc green proves the keys
type-check — the debt entry was stale). Autonomy-ladder first samples landed: L3
brownfield/contract-evolution/debugging all PASS, L4 clarification PASS (sonnet, first
sample) — canons transfer; L4 spec/planning + L5 trio + react-table still rolling.
