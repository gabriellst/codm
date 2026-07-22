# Correctness system — handoff & next steps (2026-06-10)

> Self-contained resume point for the correctness/eval program on branch
> `feat/correctness-system`. Full history: `.plans/2026-06-09-correctness-phase-0-and-detectors.md`.
> Protocols and provenance rules at the bottom — read them before launching anything.

## State snapshot

| Track | Status |
|---|---|
| react notifications probe | **CONVERGED k=2** — iter6 29/29 idiom-true + iter7b perfect 29/29 raw (1/1 at 100%) |
| backend parity (this-session) | **DELIVERED** — gold re-validation 7/7 at 100%; agent probes `be-event` 9/9 + `be-cqrs` 10/10 (both 100% first-try); HEAD gates green (detect ×5, backend tsc, 1166/1166 tests) |
| expo notifications probe | best valid 43/50 (iter5b full-length; iter7 resumed-valid). Registrations now gated (route-closure); residuals: catalog namespacing (bp-25/23 gate landed), sheet params (RC-06 gate landed) — **iter8 is the confirmation run** |
| probe backlog | **ALL 11 AUTHORED** + adversarially reviewed; 15/15 synthetics pass `validate-task.ts` at HEAD. Only 4 probes have agent runs so far |
| gates shipped this session | route-closure (RC-01..07), component-props (CP-01/02, zero baseline, 11 HEAD violations fixed), dynamic-t()-outside-enums (react bp-25 / expo bp-23, 5 baselined), `cmd` grader kind, free-real-estate validator, runner resume-on-silent-termination |

## In-flight automation (check before launching anything)

- Background task `buurm32hy`: sleeps to ~22:45Z 2026-06-10, then runs **expo iter8** followed by
  **fe-onboarding-iter1** (`synthetic-react-onboarding-composed-form`, first P1 probe run), both
  `AGENT_RESUMES=2`. If this session died, verify via
  `scripts/skill-evals/scoreboard/{expo-notif-iter8,fe-onboarding-iter1}.jsonl` (ts + docTreeHash)
  and the suspect flag in the runner output before treating either as a valid sample.

## Run queue — FULLY SCHEDULED 2026-06-10 (goal: run all remaining probes; astro excluded)

Two background tasks execute everything on the 5h boundary grid (22:40/03:40/08:40/13:40/18:40 Z):

- **`buurm32hy`** (W2, 22:45Z): expo-notif-iter8 + fe-onboarding-iter1
- **`bu2jrr1i8`** (probe-chain.sh, W3–W6):
  - W3 03:45Z: react-state-placement, be-projection-digest, VO-REPR replays ×2 (agent mode —
    instrument-risk flagged: old baseRefs; failures classify per the replay protocol, the
    axis is also covered by wire-exposure's entity#vo-repr grader)
  - W4 08:45Z: expo-form-state-subscribe, be-wire-exposure
  - W5 13:45Z: react-dashboard-chart, be-di-test-mode, go-consumer-slice
  - W6 18:45Z: e2e-notifications-flow, react-primitive-variant

If the session dies, the chain dies with it — re-run `~/.claude/jobs/7efe7487/tmp/probe-chain.sh`
(it skips to the next boundary automatically) after checking which scoreboards already exist.
Diagnose each batch on landing: suspect flag first, transcript forensics on fails, one-variable
fixes at the right rung, k=2 before convergence claims.

Deferred (excluded from the goal): `synthetic-astro-landing-section` — **create
`packages/app/astro/CLAUDE.md` first** (the proven canon carrier; without it the probe
measures an unfair condition).

Per run: read the scoreboard + runner output (suspect flag!), transcript forensics on fails
(`~/.claude/projects/-private-var-folders-...-skill-eval-*-tree/*.jsonl`), one-variable fix at
the right rung, k=2 clean samples before declaring an axis converged.

## BUDGET MODE (2026-06-11 ~01:30Z — user low on weekly limit)

- **All remaining builders run on SONNET** (AGENT_MODEL knob; model stamped per scoreboard
  row; judges already haiku; fable-era rows say model:'default'). Rationale: cheaper AND a
  more sensitive instrument — Sonnet failures localize what still lives on the document rung.
- Live schedule: Sonnet W3-remainder batch running (projection-digest under resume,
  VO-REPR ×2, state-placement iter2 = the controlled pair vs Fable's 53/54); chain v3
  W4–W6 all-Sonnet (08:45/13:45/18:45Z); **P0 composition flipped to Sonnet** at the
  vacated W7 slot (23:45Z, task b4bu7b8yl, 3h budget, 4 resumes).
- **DEFERRED to next week (Fable spend)**: expo iter9 (k=2 confirmation — must match
  iter8's model/conditions) and the P0 Fable-ceiling sample. Re-arm one-liners live in
  this file's history; orphan-kill lesson: kill process GROUPS (a pkill of run.ts left a
  claude -p child burning for 11 min).

## SESSION 2026-06-12 STATE (context-limit handoff refresh)

**Board: 13 of 17 PERFECT on Sonnet** incl. expo-notifications 50/50 (the origin probe).
P0 composition stable ~90% (44-46/50, two samples, rotating singles; e2e#api-setup was its
only k=2 family — carrier rail shipped). Convergence criterion ADOPTED (CORRECTNESS.md
§3.5): CONVERGED = railed families + non-repeating singles; PERFECT = a 100% roll.

**Runner stack (all live)**: seedCommands (scaffold seeding pre-build) + per-task
timeoutMs + gate-check = detect + platform tsc + react eslint + THE TASK'S OWN
grep/file graders (rubric gate) + fix-resume + dead-window retry + patch archiving.

**In flight at handoff**: convergence trio (onboarding iter9 / dashchart iter9 / formsub
iter7) under the full stack — log at ~/.claude/jobs/7efe7487/tmp/conv-trio.log; scoreboards
fe-onboarding-iter9 / fe-dashchart-iter9 / expo-formsub-iter7.

**The 4 non-perfect probes and their exact state**:
- onboarding: 37/41 best; spine seed RETAINED at iter8; remaining = builder ADDS
  violating parallels (rubric gate now feeds those to fix-resume — iter9 measures).
- dashchart: oscillates 31-35/36; catalog family intermittent (builders label via
  feature-namespace static keys — render-block lint can't force unrendered labels).
  If iter9 still drops catalog: seed enums.ChartType keys via a seedCommand.
- formsub: 57/62 after sheet seed (registration fixed); FRM-P04 (.and( search-schema
  composition) k=4 — candidate: extend sheet seed w/ typed searchSchema shell.
- P0: converged by criterion; PERFECT needs rolls.

**THE SAAS-GENERALIZATION ROADMAP (user-ratified 2026-06-12)** — the path from
"builds any spec'd slice" (measured: 90-100% on invented domains) to "builds any SaaS
from an idea":
1. Finish the two rolls (dashchart PERFECT stamp, P0 PERFECT roll).
2. **Clean-branch transplant** — port the correctness harness to the clean branch and run
   one probe cycle on the productless tree: proves the substrate is product-agnostic.
3. **L4 probes** (the conceive layer — currently ZERO samples): specification (idea →
   bounded contexts, "question every aggregate"), planning (spec → contract-lock-first
   plan), clarification (declining-to-invent). Prompts STOP pinning the modeling.
4. L3 brownfield + review-judgment (real SaaS work is 80% edits).
5. Then the claim is measurable: idea → contexts → slices → green board, end to end.

**Next phase queue (user-ratified order)**: scaffold-crystallization checks (controller
ctx/.omit emission; Go enum Values() emission), the /correctness-loop skill encoding +
L5 meta-probe + clean-branch transplant (the frameworkism verdict, ~3-4 days), k=2
confirmations of the 13 perfects, Fable pair (expo iter9-fable, P0 ceiling), L3/L4
probes, debt (SalesPlatform type lie ~28 impls, BFF stubs, HandshakeResponse), /pr.
NOT wanted (user ruling): library-API crystallization — scaffolds are terminal.

## Pre-work / carrier gaps

- `packages/app/astro/CLAUDE.md` does not exist — create before the astro probe (mirror the
  react/expo structure; astro skill variants exist for component/primitive/route).
- P1/P2 table numbering in PROBES-BACKLOG.md collides (cosmetic; sourceSpec pins differ).

## Debt burn-downs (gates created these; ratchet down)

- **5 baselined dynamic-t() sites** (react bp-25): CostDistributionSection,
  FunnelStageColumn, OrderTableSection, ProductFilterMenu, ProductListSection — migrate keys
  to `enums.<EnumName>.*` lock-step in BOTH locale files, update call sites, then
  `bun scripts/detectors/registry-scan.ts --update-baseline` to ratchet 237 → 232.
- **packages/client/dist/go/pkg/go/client.gen.go**: pre-existing duplicate `HandshakeResponse`
  declaration — go build fails for that package; codegen collision (two ops sharing a name?).
- **27 BFF faker stubs** (`src/ui/usecases/`) — bp-10 gate exists; burn down to real Drizzle.
- **5 dead domain events** baselined in slice-closure.
- **29 Go enum literals → a STRUCTURAL DEFECT discovered (2026-06-11)**: the marketing
  pipelines implement `Platform() wire.SalesPlatform` returning "GOOGLE_ADS"/"META"/
  "TIKTOK" — values that are NOT SalesPlatform members (it has only SHOPIFY/NUVEM_SHOP).
  Go string-enums do not validate, so a type lie compiles. ~28 implementations + repo
  callers. Proper fix is an interface change (Platform() should be MarketingPlatform or a
  platform union from contracts) — dedicated block, NOT a literal swap. Literals stay
  baselined until then; the walker message generalized.
- Deferred applyList: PRIMITIVES-A11Y expo scenarios; expo snippet re-tokenization;
  e2e specs into registry-scan + bp-e2e-13; variant-forms replay graders → idiom-level
  (partially superseded by the onboarding probe — consider retiring the replay to
  gold-validation-only permanently).

## Protocols (hard-won; do not relearn)

- **Provenance before attribution**: scoreboard JSONL carries `ts` + `docTreeHash` — same hash
  = same-condition samples, not a before/after. Queued background runs execute HOURS later.
- **Window cadence**: ~2 full builds per 5h window; tiny-probe success ≠ runway (token-bucket
  refill); timed launches just past the boundary; the runner's suspect flag is the arbiter;
  resume (AGENT_RESUMES) converts most silent cuts into valid samples.
- **Carrier**: package CLAUDE.md named FIRST in the task prompt's read list is the proven
  canon carrier for headless builders. Skills alone do not transfer reliably.
- **Rung escalation**: a family failing k≥2 valid samples with the canon present and read
  escalates (doc → detect/scaffold/type) — never just rewrite the doc louder.
- **Instrument honesty**: graders are idiom-level (real repo utils OK, invented names never);
  every new synthetic must pass `bun scripts/skill-evals/validate-task.ts <id>` before its
  first agent run; judge rubrics end with scope notes naming legitimate-exception traps.
- **Conditional canons**: state the lifecycle, not "never" (e.g. CTRL-C04/C05 — inline
  z.object body is canon pre-use-case; the violation is coexistence).
- **Consistency discipline (2026-06-11)**: builders SCAFFOLD FIRST (bun cli) and SELF-CHECK
  (bun run detect + fix before finishing) — both injected by the runner's ACT_PREAMBLE so
  every probe and model gets the identical protocol. MEASURE/IMPROVE phase separation:
  canon/doc/grader commits land only BETWEEN batches, never while one runs — consecutive
  runs in a batch must share a docTreeHash; improvements queue up and land at the batch
  boundary. Residual scatter on judgment-rung canons is expected — escalate only k≥2
  consistent families.

## Key artifacts

- Tasks + backlog: `scripts/skill-evals/tasks/` (15 synthetics, PROBES-BACKLOG.md)
- Runner/graders/validator: `scripts/skill-evals/{run,graders,validate-task}.ts`
- Detectors: `scripts/detectors/{registry-scan,import-direction,slice-closure,route-closure,component-props}.ts`
- Scoreboards: `scripts/skill-evals/scoreboard/*.jsonl`
- Coverage: `bun scripts/skill-evals/feature-loop/coverage.ts`
- Axes: `.claude/atlas/axes.yaml` (incl. new FORM-COMPOSE / FORM-SUBSCRIBE)
- Memory: `skill-evals-provenance-and-canon-carrier` (user-level, persists across sessions)

## Endgame

When the run queue is green (every probe ≥1 valid run, P1 axes at k=2), the scoreboard is the
evidence base for `/pr` of `feat/correctness-system` (base lineage: feat/bk-dash-app-screens).
