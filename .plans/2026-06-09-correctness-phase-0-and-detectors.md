# Plan — Correctness Phase 0 (de-bias) + Phase 1 (detectors)

> Spec: `.specs/2026-06-09-correctness-rung-system-design.md`
> Evidence: `.specs/2026-06-08-pattern-cohesion-atlas-design.md` (§3 verified contradictions)
> Branch: `feat/correctness-system`. Meta-work — executed directly with the spec's
> meta-verification gates, not via /plan→/build (Decision 3).

## Phase 0 — De-bias (one PR, this branch)

Every fix lists: file(s) → edit → verification assertion. All assertions run together at the
end (`F-V`), plus YAML parse of every edited registry.

| # | Fix | Files | Edit | Assertion |
|---|---|---|---|---|
| F1 | route prescribes banned `z.nativeEnum` (RTE-P02/P06) | `route/registry.yaml`, `route/react/registry.yaml` (lines ~79, ~117) | `z.nativeEnum(X)` → `z.enum(X)` in both snippets, both files | `grep -rn nativeEnum .claude/skills/route/` → 0 |
| F2 | global detector blind spot | `.claude/registry.yaml` cc-bp-16 (~483) | add `z.nativeEnum(` to `wrong:` examples so the global pass flags it on ANY artifact | cc-bp-16 block contains nativeEnum |
| F3 | usecase SKILL teaches forbidden cast | `usecase/typescript/SKILL.md` (~247-253) | `(transaction \|\| this.db) as DrizzleClient` → port-typed narrowing `tx ?? this.db` (repository bp-11 canon); align surrounding prose | `grep -n "as DrizzleClient" …usecase/typescript/SKILL.md` → 0 |
| F4 | form FRM-01 dead `@sdk` specifier | `form/registry.yaml` (~13) | `'@sdk'` → `'@template/client-typescript/typescript'` | `grep -rn "from '@sdk'" .claude/skills/form/` → 0 |
| F5 | CLAUDE.md dead SDK specifier | `CLAUDE.md` (~252) | `'@template/monorepo-sdk/app'` → `'@template/client-typescript/typescript'` | `grep -n monorepo-sdk CLAUDE.md` → 0 |
| F6 | fictional `addEvent` (event canon: use-case-born, Decision 1) | `entity/typescript/registry.yaml` (~315 + pattern ENT-P15), `entity/typescript/SKILL.md` (any addEvent refs), `entity/SKILL.md` (hub) | rewrite raise-mechanism to "entity raises nothing in TS; the use case constructs the event after `repo.save(entity)` and persists via `domainEventRepository.save(event, tx)`"; hub gains a TS↔Go divergence note (Go: `AddDomainEvent`/`PullDomainEvents`, intentional) | `grep -rn addEvent .claude/skills/entity/typescript/` → 0; hub mentions divergence |
| F7 | UC-P10 `.input()` on primitive VOs (schema bp-07 violation) | `usecase/typescript/registry.yaml` (~147) | `CPFSchema.input()` / `EmailSchema.input()` → bare `CPFSchema` / `EmailSchema`; note the discriminator (.input() only on z.object composites) | UC-P10 block has no `.input()` on a primitive VO |
| F8 | CTRL-C12 wrong error union + duplicate ID | `controller/typescript/registry.yaml` (lines ~54 and ~111 — two blocks share the ID) | refine cast `as ApplicationErrors` → `as InterfaceErrors`; rename the second colliding block to the next free `CTRL-C##` | one `id: CTRL-C12`; refine snippet casts InterfaceErrors |
| F9 | legacy dialog pattern taught by hub/flat files (store bp-18 canon) | `component/registry.yaml` + `component/react/registry.yaml` (CMP-P13/P14 ~254-280), `form/registry.yaml` (FRM-P11/P12 ~219-250) | local `useState` + `open/onOpenChange` + manual reset → `useDialogStore.show()/hide()` idiom (keep the entity-gate `{entity && …}`) | no `onOpenChange` in those pattern blocks |
| F10 | hardcoded date locale in snippets (package rule: never hardcode) | `route/registry.yaml` + `route/react/registry.yaml` (~384), `component/registry.yaml` (~604-606) + `component/react/registry.yaml` (~678-680) | `format(date, 'dd/MM/yyyy', { locale: ptBR })` → `const locale = useLocale()` + `date.toLocaleDateString(locale)` (per packages/app/react/CLAUDE.md) | `grep -rn "locale: ptBR" .claude/skills/{route,component}/registry.yaml …react/registry.yaml` → 0 (expo variant intentionally untouched — no useLocale there yet; Phase 3) |
| F11 | errors skill stale `app/web` paths | `errors/typescript/registry.yaml` (~87), `errors/typescript/SKILL.md` (~213-218) | `packages/app/web/` → `packages/app/react/` | `grep -rn "app/web" .claude/skills/errors/` → 0 |

**F-V (gate):** run all assertions; YAML-parse every edited registry with the same parser
`scripts/review.ts` uses; `bun scripts/review.ts --help` (or equivalent dry load) succeeds.

**Commits:** ① `docs(specs): correctness rung-system design + pattern-cohesion audit`
(both specs + this plan) ② `fix(skills): phase 0 de-bias — align contradicting rules to canon`
(F1–F11, body lists each fix).

## Phase 1 — Detector sprint (next PR, branched off after Phase 0 merges)

| # | Deliverable | Notes |
|---|---|---|
| D1 | `scripts/detectors/ast-grep-pack/` compiled from registry `wrong:` patterns | start with the mechanical subset: `z.nativeEnum(`, `fetch(` in app code, `locale: ptBR`/hardcoded BCP-47 literals, hex colors in components, `message:` inside `.refine(`, `.input()` on known-primitive VO schemas. Each rule carries `source: <skill>#<id>` |
| D2 | import-direction lint | controller↛repository impl, component↛raw fetch/backend imports, context↛context entity imports, usecase↛`mediator.publish`, app↛non-SDK API access. eslint boundaries or dependency-cruiser — pick during build |
| D3 | slice-closure walker (`scripts/detectors/slice-closure.ts`) | orphan events (raised/declared, no subscriber), projection without projector, controller/handler/projector not barrel-registered |
| D4 | wiring | edit hook (in-loop, <2s budget) + `bun lint` aggregation + CI gate |
| D5 | fixture self-tests | per detector: one must-fire fixture, one must-not-fire fixture; run in `bun run test` |

**Gate:** detectors run across HEAD → zero unexplained findings (true hits → tickets;
false positives → fix rule before merge).

## Status

- [x] F1–F11 edited (2026-06-09) — plus two discovered-en-route: react FRM-01 `@sdk` dup, FRM-P09 `onOpenChange(false)`, and the second duplicate ID pair CTRL-C10
- [x] F-V gate green — 11 registries parse, all wrong-pattern grep assertions at 0
- [x] Phase 0 committed (2 commits)
- [x] Phase 2 type-level eliminations (725dbe055): z.nativeEnum gone from the z surface (TS2339);
  .input() object-only (TS2551 + fail-fast throw); Controller ValidEnvelope constraint — found
  and fixed 9 latent flat-envelope controller bugs (no requestBody → void SDK hooks, 400s) +
  SDK regen; `bun cli` now WIRES barrels idempotently (controllers/handlers/projectors +13 types).
- [x] Phase 3 consolidation (811621aaf): .claude/atlas/axes.yaml routing table (axis → owner →
  rung); labels purge; onError canon; CQRS cross-refs; handler→projector re-frame + handler bp-08;
  middleware bp-08 / service bp-05; errors layer→union table; QRY-P18 composition-first BFF recipe
  promoted from user-memory; cc-bp-16/20/21; FRM-P45 de-collision; 16 rust dangles removed.
- [x] Phase 4 eval harness: scripts/skill-evals (types/graders/run + 14 tests), 7 replay + 3
  holdout tasks, gold-smoke validated (2/2 tasks at 100% after one wrong-goldRef fix — the smoke
  caught it, as designed). Agent mode scaffolded, marked experimental.
- [x] Detector v1.1: scope:self flag (entity bp-12/13 tagged — context-misfire FP class closed);
  loadUniversalRules now loads ALL mechanical cross_cutting rules (cc-bp-16/20/21 were inert —
  z.nativeEnum/DrizzleClient-leak/naming now fire universally, hook + scan); -components/**/*.ts
  helper files now route to component; SCW-03 enums check requires non-empty exports (FP gone).
  Baseline ratcheted 214 → 200 (−26 descoped/fixed, +12 newly-visible REAL debt incl.
  GetFxRates/SetActiveStore cc-bp-20 leaks and a hardcoded-ptBR chart canvas).
- [x] Phase 1 D1–D5 (2026-06-09) — shape changed for the better during recon: the registry→detector
  engine ALREADY existed (`classify-edit.ts`); we extracted it to `classify-edit-core.ts` (hook
  parity-tested byte-identical), built `scripts/detectors/{registry-scan,import-direction,slice-closure}.ts`
  on top, gap-filled registries (cc-bp-04/16/20 detect, fetch-ban bp-21/12/32, schema bp-07), and
  wired `bun detect` + lint-staged self-tests. 97 tests / 225 assertions green.

## Phase 1 results (HEAD calibration)

- `bun detect` (registry-scan + import-direction): **green** — 0 fresh findings; 214 pre-existing
  findings snapshotted in `scripts/detectors/registry-scan.baseline.json` (ratchet: fix debt →
  `bun detect:baseline`); import-direction 0 findings with 3 sanctioned suppressions.
- `bun detect:slice`: 67 findings (11 errors) — **all real**; gate this script in CI only after the
  tickets below are resolved.

## Triage — true violations found by the detectors at HEAD (ticket list)

1. **Mediator last-write-wins** (`core/src/services/Mediator/EventEmitter2Mediator.ts:25-30`):
   `register()` REPLACES the prior subscriber for an event name. With it, the 5 SCW-04 collisions
   (billing.subscription.*) silently drop a handler each. Fix: true multicast.
2. **Dead event slices (SCW-01a ×6)**: `IntegrationActiveToggledEvent` (declared, tested, never
   raised); `SubscriptionPausedEvent` (TWO subscribers but `Subscription.pause()` raises nothing —
   whole paused slice dead); `PasswordChanged/PasswordReset/PasswordResetRequested` (better-auth
   owns flows, events never wired); `IntegrationHandshakeFailedEvent` (domain variant orphaned).
3. **Published, zero consumers (SCW-01c ×5 warn)**: order.overridden, cart.linked_to_order,
   campaign_product_binding_*, store.member_invited — each claims an Analytics consumer that
   doesn't exist in TS or Go.
4. **Real-mode ExternalMediator is in-process EventEmitter2** — TS↔Go integration events cannot
   cross processes at HEAD (architectural; RedisExternalMediator exists but isn't bound).
5. **CQRS reads in write context (usecase#bp-01 ×5)**: GetGoal, GetGoalProgress, … in
   `analytics/usecases/` — belong in `ui/usecases/`.
6. **Refined use-case InputSchema (usecase#bp-07)**: `UpdateGoal` `.refine()` breaks downstream
   controller `.omit()` composition (Zod v4 throws).
7. **`SetActiveStore.ts:41`** resolves `DrizzleClient as any` in a write-context use case.
8. **`ChangeExternalSubscription.ts`** publishes via mediator directly (documented C57 deviation) —
   refactor to outbox via a billing domain event.
9. **`useListProductsStub.ts`** raw fetch — delete when products controller + `bun sdk` land.
10. **Cast debt baseline**: 86 `as any/never/unknown` + rest of the 214 baseline — ratchet down.

## The live loop (2026-06-10)

All remaining goal gaps closed (commit e9b9c9e54): 7/7 replay tasks gold-validated, atlas
anchor drift guard, .github/workflows/correctness.yml CI gate, /learnings wired to the
scoreboard (eval gate + rule-rung review + ablation sweep), mediator multicast fix (ticket #1 —
slice errors 11→6), Go validation-placement decision documented, judge grader (L3/L5),
agent mode hardened (scoped permissions, no bypass).

**Loop iterations (synthetic probes, agent mode):**
- Iter 1 — `synthetic-store-visualization-event` (EVENT-EMISSION): **FAIL 7/9** — agent declared
  the event perfectly, never wired the raise. Mechanical grader (usecase#UC-C05) + judge
  converged. Diagnosis: event registry had NO raising pattern; EVT-C01 still carried the
  audit-flagged "published via InternalMediator" text. Fix: EVT-C01/C02 corrected + EVT-C10
  ("raising = the use case persists the event", when: always). One variable.
- Iter 2 — same task, post-fix docs: **PASS 9/9** (`agent-iter2.jsonl`). The agent declared AND
  raised the event (domainEventRepository injected, save(event, tx) after entity save — judge
  confirmed). First measured doc improvement: the EVT-C10 fix demonstrably changed agent
  behavior. Caveat: n=1 per arm — structural failure + targeted fix make noise unlikely, but
  the protocol calls for k≥3 before treating deltas as settled.
- S1 iter 1 — `synthetic-order-detail-read` (CQRS-SIDE): **FAIL 8/10** — placement + layering
  PASSED (read correctly in ui/usecases, sales untouched), but the agent built a faker stub
  with no NOT_FOUND path. Root cause: 27 of the ui BFF queries are unmarked faker stubs (incl.
  ListOrders) — live code taught the anti-pattern. Fix: query bp-10 (real source ⇒ Drizzle;
  stubs need a TODO(stub) marker; mechanical detect; 27 stubs baselined as explicit debt).
- S1 iter 2 — post-bp-10 docs: **9/10, judge PASS** — the agent wrote a REAL Drizzle query with
  a typed NOT_FOUND path (behavior change measured). The residual grep failure was GRADER
  over-strictness (demanded literal `BaseApplicationErrors`; the agent used the ui context's
  type-compatible `ApplicationErrors` union) — instrument fixed, not the tree: the loop debugs
  its own graders too.

**Loop verdict:** 4 agent-mode runs, 2 one-variable doc experiments, 1 fully validated
improvement (fail→fix→100%), 1 measured behavior change + 1 instrument fix, and 2 systemic
discoveries (the event-raise checklist gap; the 27-stub BFF read layer). The loop is
operational: scoreboards in scripts/skill-evals/scoreboard/, protocol in the README +
/learnings (eval gate). Next standing loop turns: re-run probes at k≥3 for confidence,
then burn down the 27-stub debt one query at a time with bp-10 as the gate.

## The feature loop — P1 (2026-06-10)

Generator/verifier split at FEATURE scale (no gold tree), template in
scripts/skill-evals/README.md + features/pause-slice/:
- Spec (.specs/2026-06-10-billing-pause-slice-wiring.md) owns all design decisions — wired
  the dead pause slice (triage ticket #2): PAUSED transition end-to-end, dispatcher-owned
  persistence, DELETION of the canon-violating SubscriptionPausedHandler.
- Verifier agent derived red acceptance tests + 10 AC-mapped graders from the spec alone
  (red-proof at HEAD: enum guard, mapper rejection, no-op pause — each red for the
  spec-correct reason). New `inject:` runner primitive seeds red tests into the eval
  worktree so they never enter the branch's suites.
- Builder agent (spec + red tests + corrected docs): **PASS 10/10 first try** —
  multi-file slice (enum, mapper, dispatcher applyPaused same-tx, handler deletion,
  barrel) (`feature-pause-iter1.jsonl`).
- The real fix then landed on the branch through the same spec (ticket #2 closed).

## P2/P3/P4 (2026-06-10, continued)

- **P4** — `scenarios:` on 6 axes in axes.yaml (the verifier's mandatory test matrix);
  coverage.ts reports per-axis eval coverage (13 uncovered at first run → the generator queue).
- **P2 COMPLETE** — the full invented-feature cycle ran with ZERO human-authored artifacts:
  coverage.ts found the CLASS-BASE/VALIDATION-PLACEMENT/OPTIONALITY/TELL-DONT-ASK gap cluster
  → spec-agent (15 decisions, 16 ACs, zero open questions) → verifier-agent (18 graders, two
  red test files, every P4 scenario mapped or justified-n/a, schema-error-surface probed live)
  → builder-agent **PASS 18/18 FIRST TRY** (`p2-coupon-iter1.jsonl`): entity + enum + errors
  + 2 use cases with use-case-born events + controllers + MIGRATION. Stage attribution: no
  stage failed. NOTE the landing rule this established: replay/ledger features land on the
  branch after a passing turn (pause slice); coverage-SYNTHESIZED features do NOT auto-land
  (product scope is a user decision) — they remain validated eval instruments.
- **P3 iter 1** — `holdout-lending-loan-aggregate` (full foreign-domain BC, agent mode):
  **9/10 canon graders PASS first try** (enum/error vocab/outbox-same-tx/controller
  derivation/layer boundaries — a whole bounded context). The single failure was
  INSTRUMENT-attributed and PROVEN so: the slice-closure grader exits 1 on HEAD itself
  (5 pre-existing ticketed dead events). Fix: slice-closure gained the same baseline
  ratchet as registry-scan (5 keys baselined; new errors still gate) — and with the gate
  usable, slice-closure JOINED `bun detect` and the CI workflow (the plan's original
  "enable after tickets land" delivered early via ratchet). Bonus instrument find: two
  literal NUL bytes in slice-closure.ts (composite-key separator written as raw bytes)
  made the file invisible to text tools — re-encoded as backslash-u0000 escapes.
  Re-run under the fixed instrument pending (k≥2).

## Frontend pass (2026-06-10)

- New axes: UI-COMPOSITION (ui-composition#UIC-01) + STATE-PLACEMENT (store#STR-P10 — the
  decision tree the audit flagged as UNSTATED, now written). Foundation audit workflow ran a
  6-reader deep extraction over every frontend skill → gap diff (results below).
- **fe-forms-iter1** (`replay-connect-integration-variant-forms`, first frontend agent run):
  FAIL — attribution three-way: (a) TASK-SPEC: baseRef is a wip-era tree with a broken
  committed SDK (tsc red before the agent typed a line); (b) INSTRUMENT: the replay's graders
  demand gold-tree invented NAMES (lib/union.ts, pickUnionVariant, CONNECT_FORMS) — violates
  idiom-not-names; gold-validates fine but unwinnable in agent mode. Systemic rule adopted:
  replay tasks = gold-validation instruments; agent-mode coverage comes from verifier-authored
  tasks with idiom-level graders. (c) REAL: the agent shipped an `as never/any/unknown` cast
  in the sheet despite the in-loop hook warning — bp-31-class violations survive advisory
  nudges under pressure (datapoint for the hook-strength discussion).

- **fe-notif iter1/1b/2** (`synthetic-notifications-panel`, 29 graders): iter1+1b the headless
  agent ANSWERED with a design doc instead of building (zero files, twice — deterministic).
  INSTRUMENT fix in the runner: an acting preamble on every agent prompt + a loud
  `agent made NO changes` post-run check. iter2: **agent built, 24/29** — and the new
  store#STR-P10 rule WORKED (zero useState, URL filters, store-driven dialog all passed).
  Two DOCS-stage gaps confirmed (grep+judge convergence): (a) onError in a section mutation —
  the no-onError canon lives in form bp-29 but component context_reads=[route] can't reach
  list-row mutations; (b) i18n enum-label canon never reached the agent (the audit's known
  enum-rules dispatch hole). Fixes folded into the frontend foundation apply-list; iter3
  measures them.

- **fe-notif iter3/4 + expo iter1 + the canon-reachability fix**: iter3 20/29, iter4 21/29 —
  scattered failures EXCEPT two families consistent across every frontend run: the legacy
  dialog API (react ×3) and the i18n label catalog (react ×3 + expo ×1 = 4-for-4). Diagnosis:
  backend canons saturate auto-loaded CLAUDE.md; frontend canons lived in skim-able skills.
  Fixes: read-then-act preamble; component CMP-04 always-pattern + bp-24 mechanical;
  packages/app/react/CLAUDE.md gains Dialogs/Enum-labels/Scaffold-first;
  packages/app/expo/CLAUDE.md CREATED (modals-are-routes, typed params, lib formatters,
  label catalog, colocation truth). Expo iter1: **39/49 first try** — fails concentrated in
  the same label family + sheet-param canon.
- **fe-notif iter5 INVALID** (infra): agent truncated after ONE file (route importing a
  never-created Section; tsr never ran) — consistent with usage-limit degradation, same class
  as the earlier verifier death. The auto-loaded-canons experiment is NOT yet measured on
  react; expo iter2 is the deciding datapoint. Protocol note honored: k=1 deltas are noise —
  the four valid runs' CONSISTENT failures drove the fixes, not iteration-to-iteration swings.

## Timeline correction + canon-carrier verdict (2026-06-10 morning)

- **Timeline correction (provenance audit)**: the four queued runs (expo iter1 04:27, react
  iter5 04:37, expo iter2 04:42, react iter5b 04:52) ALL executed on the morning of 06-10
  after the usage window reset — at the SAME docTreeHash `d1d58a5786a6` (post-canon
  f01ed6e4d). Three prior-session claims are therefore corrected: (a) expo iter1 vs iter2 is
  NOT a before/after of the expo CLAUDE.md — it is k=2 same-condition samples; the "canons
  fixed three expo families" delta is run variance, unsupported. (b) react iter5's truncation
  happened in a healthy window — it's a sampled agent failure mode (or a cap kill), not usage
  degradation. (c) the "i18n needs rung escalation, docs failed 5-for-5" conclusion was
  premature — no valid post-canon react sample existed when it was declared.
- **react iter5b: 25/29 — the auto-loaded-canon carrier is CONFIRMED on react.** The i18n
  catalog family (0-for-4 before) flipped green: agent seeded `enums.NotificationCategory.*`
  (7 values) in BOTH locales and used the typed-template `t()`; dialog went through
  `useDialogStore` with ZERO useState under the route dir. Residual decomposition (transcript
  forensics): ONE real family — **SDK-enum widening** (`category: z.string()` in
  validateSearch; `Record<string, …>` dispatch maps with `?? fallback`s, despite the SDK
  typing `category: NotificationCategory`); one grader FALSE NEGATIVE (agent's correct
  `showDialog(<Dialog …/>)` invisible to `\bshow\(\s*<`); one judge spurious complaint
  (faulted client-side category filtering that the task notes document as the expected
  shape); and one REAL contract defect surfaced — `unreadOnly?: string` in the SDK.
- **Fixes landed for iter6**: (1) react CLAUDE.md gains "SDK enums type everything they
  touch" (z.enum(SdkEnum) in validateSearch; enum-keyed exhaustive Record maps colocated
  module-level — also fixed my own f01ed6e4d contradiction that said variant maps "stay in
  @/lib"). (2) FRM-P35 grader regex now alias-tolerant (`show\w*\(\s*<`). (3) judge rubric
  gains scope notes (client-side filter expected; judge the idiom not the variable name).
  (4) CONTRACT: `z.stringbool()` pipes (no `.default()`) were emitted as `type: string` into
  OpenAPI — the override's boolean-default heuristic missed them; fixed structurally (pipe
  with boolean `out` + string JSON schema → boolean), `bun sdk` regenerated:
  `unreadOnly?: boolean`. Blast radius: ListNotifications only (TS types+zod, Go
  pkg/typescript — compiles). Backend tsc + app-react tsc green.
- **expo k=2 verdict**: consistent fails across both samples = route#bp-05 (`<Protected>`),
  route#RTE-04 (`.default()`), enum#i18n-catalog ×3. ALL three are covered verbatim by
  packages/app/expo/CLAUDE.md — which the expo task prompt NEVER pointed at (the react
  prompt names its package CLAUDE.md; that's where react's transfer came from). One-variable
  fix for expo iter3: prompt parity (read list now opens with packages/app/expo/CLAUDE.md).
  Scattered (variance, no action): SHT-P02/P05 vs SHT-03/LAYOUT swap, RTE-03,
  enum#typescript, CMP-C03.
- **Standing defect logged**: `packages/client/dist/go/pkg/go/client.gen.go` has a
  pre-existing duplicate `HandshakeResponse` declaration (go build fails); untouched by this
  regen — needs a codegen-collision fix (two ops sharing the name across backends?).

## Iteration cycle 6 / expo 3 (2026-06-10, from f746ab821)

- **react iter6: 27/29 raw — 29/29 idiom-true. The react probe has CONVERGED.** The judge
  passed for the first time. Both raw fails are instrument artifacts, transcript-verified:
  (a) enum#typescript — the agent imported the SDK's generated `notificationCategorySchema`
  for validateSearch (it explicitly reasoned "import from the SDK instead of constructing it
  myself") — a stronger spelling than the grader's literal `z.enum(`; spec broadened, canon
  gains the parenthetical. (b) form#bp-29 — the bare `/onError/` grep collided with the
  `NotificationErrorIcon` identifier substring (Notificati-onError-Icon); spec now
  `onError\s*[:,(]`. iter7 = confirmation run at the fixed instrument.
- **expo iter3 INVALID-partial (39/49)**: the builder terminated SILENTLY at ~8 min (no final
  message; react's builder finished+reported at 8.5 min in the same window) leaving exactly
  the integration steps undone: both registrations (root Stack.Screen + tabs trigger — the
  registration-drift family), the enums.* catalog, one unfixed tsc error (`"secondary"` not
  in the Button variant union). NOT canon evidence. Partial valid signal: the leaf canons
  LANDED for the first time — enum-keyed `Record<NotificationCategory, …>` icon/color maps
  (CMP-C03 ✓ after failing iter2) and useTypedSearchParams. The agent DID read
  packages/app/expo/CLAUDE.md (prompt-parity worked mechanically). iter3b = clean re-sample.
- **CLI rung escalation landed (94753089e)**: `--labels` now emits the typed
  `t(\`enums.<Enum>.${value}\`)` helper and auto-seeds `enums.<Enum>.*` into both locale
  files from the generated SDK enum values (lock-step). Probe-validated: typed-template t()
  compiles; only the expected unused-helper TS6133 remains. Drive-bys: mergeSdkImports still
  matched the dead `@template/` scope (SDK imports never merged since the rename — fixed);
  the writer's lock-step validation caught 15 pt-only `dashboard.costDistribution.*` keys
  drifted at HEAD via non-typed `i18nPrefix` strings (EN translations added). Note the hole
  it exposed: `i18nPrefix`-driven primitives bypass the typed-key rung entirely.

## Iteration cycle 7 / expo 3b–4 + route-closure escalation (2026-06-10)

- **react iter7 + expo iter3b: both builders limit-killed at the SAME wall-clock minute
  (~08:31Z)** — 5-min silent terminations (clean exit, no final message, transcripts end
  mid-tool-use). The usage window closed again mid-run; these are invalid samples, now
  self-flagging (runner pipes the final message and prints a suspect-sample warning —
  landed one commit too late for these two). react stands on iter6 (29/29 idiom-true,
  CONVERGED). Partial expo signal from the truncated 3b: tsc green and the
  **enums.* catalog landed on expo for the first time** (locales seeded both languages).
- **Registration-drift escalated doc → detect.** The folder-without-registration family
  survived the expo CLAUDE.md at k=3 (iter2 full sample + 2 truncated), and BOTH drift
  directions existed as live bugs at HEAD. New `scripts/detectors/route-closure.ts`:
  RC-01/02 sheets folder ↔ root Stack.Screen (both directions), RC-03/04 tabs folder ↔
  trigger, RC-05 sheet registration without explicit `presentation:` (mechanizes SHT-03).
  Live bugs fixed (dead game-form Stack.Screen + dead games trigger removed, expo tsc
  green); detector clean at HEAD, seeded-violation tested, wired into `bun detect` + CI +
  graders' allowlist + the expo task. expo iter4 launched at this tree.

- **expo iter4 (suspect, 44/50)**: builder silently cut again (the new runner flag fired —
  instrument works) yet got further: **registrations landed** (route-closure gate green,
  SHT-03/LAYOUT/Protected/.default all ✓), tsc green, judge PASSED. The i18n catalog flipped
  back to failing — truncated builders drop a DIFFERENT tail each run, so residual expo fails
  are truncation noise until a full-length sample. Turn-count forensics across all seven
  builders: completions ran 105–131 assistant turns, cuts 80–98, and cuts began 08:17Z then
  shrank — rolling usage-window exhaustion, not a turn ceiling. One more idiom-vs-spelling
  grader gap found: iter4 typed the category param as `z.enum(CATEGORY_FILTER_VALUES)` with
  the tuple derived from `Object.values(NotificationCategoryEnum)` + an 'all' sentinel (the
  expo .default() canon itself pushes toward a sentinel) — spec broadened to accept the
  derivation. Protocol: stand down on launches until the window resets; then ONE clean
  full-length expo sample decides the remaining families (SHT-P02 dismissal, CMP-P06
  haptics/onSettled, catalog).
- **Probe-success ≠ runway (expo iter5 cut too).** A one-liner default-model probe succeeded,
  the builder launched — and was still silently cut at 4 paths. The limit behaves like a
  slowly-refilling token bucket: a 1-turn call always fits; a 100-turn build drains the
  refill mid-run and dies. Probing with tiny calls is a misleading open-signal for a
  45-minute build — the only reliable boundary is the window reset itself (full builds last
  succeeded from ~07:00Z; cuts began 08:17Z → next boundary ≈ 12:00Z). New protocol: timed
  launch just past the boundary, no probe theater; the runner's suspect flag is the
  arbiter of sample validity.

## Boundary pair verdicts + sheet-idiom escalation (2026-06-10, 12:06Z window)

- **react iter7b: 1/1 at 100% — perfect 29/29 raw, full clean build.** The react synthetic
  probe is CONVERGED at instrument level (iter6 idiom-true 29/29 + iter7b raw 100% = k=2).
- **expo iter5b (FIRST clean full-length sample): 43/50.** Registrations green again
  (route-closure holding). The residual is now attributable and it all concentrates in the
  SHEET: raw `useLocalSearchParams` (no schema, no .default()s — SHT-P05+RTE-04), no explicit
  dismissal (SHT-P02), and the enums.* catalog skipped (k=2 valid samples now: iter2+iter5b).
  Same file follows the enum-keyed style-map canon perfectly — the agent treats enum labels
  as style, not copy.
- **Exemplar contradiction found and fixed**: the `devices` sheet at HEAD itself violated
  SHT-P02 (no explicit dismissal — relied on the iOS-only grabber). Exemplars are proven
  load-bearing teaching material; fixed (explicit close affordance + router.back()).
- **Escalations**: route-closure gains RC-06 (raw useLocalSearchParams import in any route
  file — RTE-03 mechanized; zero-FP since the raw hook lives only in lib/typed-route) and
  RC-07 (sheet dir without router.back()/dismiss() — SHT-P02 mechanized); both negative-
  tested. expo CLAUDE.md catalog section rewritten to react's proven explicitness (react's
  richer text went 3-for-3 post-canon; expo's terse one went 1-for-3) — labels are copy, not
  style; re-casing the wire value is a label map in disguise. expo iter6 measures the pair.

## Probe backlog (anti-overfit breadth)

Coverage run 2026-06-10: 8 uncovered axes + structural gaps (no agent-runnable FORM probe,
zero astro/Go-backend probes, VO-REPR never agent-run). The prioritized probe queue with
per-probe specs and standing authoring rules lives in
`scripts/skill-evals/tasks/PROBES-BACKLOG.md` — P1: react discriminated form, expo form
sheet, backend projection-mutation, wire-exposure.

## Backend parity delivered + ComponentProps gate (2026-06-10 evening)

- **Backend agent-mode iterations at the current tree: BOTH probes 100% first-try.**
  `synthetic-store-visualization-event` 9/9 (z.domainEvent payload, plain primitives,
  z.enum closed set, 3-part past-tense name, barrel, clean tsc) and
  `synthetic-order-detail-read` 10/10 (real Drizzle join with tenancy scoping, named
  ORDER_NOT_FOUND — the family that once exposed the faker-stub imitation). Combined with
  the 7/7 gold re-validation and the HEAD gates (detect suite, backend tsc, 1166/1166
  tests), the goal's "same iterations done in backend" clause now has this-session,
  same-protocol evidence at the react bar.
- **ComponentProps escalated to a gate** (user ask "tests that all components use
  ComponentProps" → detector, not probe): `scripts/detectors/component-props.ts` walks
  every exported component individually (CP-01 DOM root without ComponentProps, CP-02
  hand-typed className) — closing the two holes in bp-20's edit-time regexes (zero-prop-only
  detection; whole-file skip). Found 11 REAL violations at HEAD; all fixed (DataTable trio,
  NotificationItem, UserProfile, RecommendedAppCardSkeleton, StatCard, PlatformIcon,
  IntegrationSearchBar — incl. the Omit<ComponentProps<'div'>,'onChange'> collision
  spelling). Ships with ZERO baseline; wired into bun detect + CI + graders.
- **Runner self-heals silent terminations**: on the suspect signature it re-spawns the
  builder once (AGENT_RESUMES) in the SAME worktree with a continuation preamble. iter6b
  (suspect, cut as the FIRST build of a fresh window) falsified pure window-exhaustion —
  the environment is flaky for long builders; resume converts cuts into complete builds.
  expo iter7 runs under the resume-capable runner; expo iter5b (43/50 full-length) stands
  as the current valid expo sample.

## expo iter7 (resumed-valid) + the dynamic-t() rule (2026-06-10 night)

- **The runner resume WORKED on its first live use**: iter7's builder was silently cut,
  resumed in the same tree, completed with a report — 43/50, registrations green. Residual
  k=3 families sharpened by transcript forensics:
  (a) **catalog mis-namespacing, not label-dropping**: the agent DID localize category labels
  via a dynamic t() — under `notifications.category.*` instead of `enums.<Enum>.*` (feature-
  namespace gravity). Escalated to detect: component react bp-25 + expo bp-23 — a
  template-literal t() key with a literal non-`enums.` prefix is a label catalog in disguise
  (`${i18nPrefix}` primitives exempt by shape). The rule immediately found 5 pre-existing
  product violations (CostDistribution kind, FunnelStage, OrderTable, ProductFilterMenu,
  ProductListSection) — the SAME family behind the earlier costDistribution locale drift;
  baselined (ratchet) + burn-down ticketed below.
  (b) **sheet params**: RC-06 gated it correctly at grading; expo CLAUDE.md now carries the
  concrete id-only example (`useTypedSearchParams(z.object({ id: z.string().default('') }))`)
  — the repo had NO exemplar sheet that reads params, which is why imitation failed.
- **Burn-down ticket**: migrate the 5 baselined dynamic-t() call sites + their locale keys
  into `enums.<EnumName>.*` (lock-step both languages), then ratchet the baseline back down.

## Probe backlog authored — 11/11 (2026-06-10 night, workflow wf_d0bfcd25)

- **All 11 authoring probes written and adversarially reviewed** (22 agents, ~3.2M tokens):
  every task passes the free-real-estate validator (15/15 synthetics clean at HEAD incl.
  the 4 pre-existing); 5 verdicts clean, 6 reviewer-fixed (regex winnability, grader-id
  mismatches, glob caveats), 0 blocked. Grader counts 27–85 per probe.
- **Reviewer-surfaced contradictions FIXED at the source**: (a) form/react SKILL.md §5
  still taught raw `.def.options[0]` extraction while registry FRM-P44 mandates the
  @/lib/union helpers — rewritten to pickUnionVariantField (the exact contradiction class
  the audit opened with, found by a probe author). (b) Root CLAUDE.md said "Go + sqlc" but
  ZERO sqlc exists — the Go persistence canon is hand-written SQL constants over
  database/sql; root doc + backlog row corrected (docs follow reality).
- **Run-time gaps logged**: wire-exposure needs root .env provisioned into eval worktrees
  (bun sdk reads it; gitignored → absent from trees); astro lacks a package CLAUDE.md
  (carrier gap — create one before expecting astro canon transfer); P1/P2 backlog table
  numbering collides (cosmetic).
- Next: run P1 probes (#1, #2, #3, #5 + wire-exposure after .env provisioning) at two
  builds per window, k=2 convergence bar, rung-escalate persistent families.

## W2 results — expo breakthrough + first FORM-COMPOSE sample (2026-06-10 ~23:30Z)

- **expo iter8: 48/50, and both fails were grader path-scoping bugs — the build is
  canon-true.** All three chronic families landed in the first full-length run after their
  rung escalations: registrations (route-closure), enums.* catalog (bp-23 + rewritten
  canon), sheet typed-params (RC-06 + id-param exemplar — builder used a route-scoped
  -hooks/ wrapper, the clinical fork house pattern). Graders fixed (RTE-03 accepts -hooks;
  CMP-C03 glob widened — the exhaustive CategoryStyle map lived in the sheet folder).
  iter9 armed at W7 (23:50Z) as the k=2 confirmation under fixed graders.
- **onboarding iter1: 36/41** — pickUnionVariantField transferred (FRM-P44 ✓); the misses
  are ONE coherent family: wizard orchestration (no final pickUnionVariant gate FRM-P43,
  hand-typed FormValues FRM-P18, no Record<ConnectionMode> sequence map FRM-P13, switch on
  discriminant in ReviewStep CMP-P18 + judge). k=1 — iter2 armed at W7 (23:55Z) for the
  consistency read before any doc action.
- Mid-window instrument catch: the validator caught registry-scan red at HEAD (my SSE
  controller cast; AuthController's identical cast was baselined debt) — W2 was killed
  pre-grade and relaunched on the fix (core rawResponse helper). The realtime infra port
  (ListenEventsController + useServerEvents + canon section) landed as the P0 prerequisite.

## onboarding k=2 verdict — variance, not canon gaps (2026-06-11 ~00:40Z)

- iter2 (timer arithmetic fired it tonight, window absorbed a 3rd big build): **38/41,
  complete**. ZERO fail overlap with iter1: the entire wizard-orchestration cluster
  (FRM-P43/P18/P13, CMP-P18) PASSED; iter2's misses are a useState in TargetStep
  (STR-P10), a CP-01 (the new component-props gate catching a real violation in an eval
  tree — the walker works end-to-end), and a form.state.values render-body read (judge).
- Attribution per protocol: scattered across samples → VARIANCE. No doc surgery. The
  FORM-COMPOSE baseline measurement stands at ~90% (37±1/41, k=2) with no consistent
  family. Union helpers + slice composition transferred both runs (FRM-P44 ✓✓).

## P0 COMPOSITION — the app-scale answer (2026-06-11 ~23:30Z)

**46/50 (92%) — one Sonnet builder, 63 files, five layers, one build** (archived:
scoreboard/fullstack-composition-iter1b--*.patch, 358kb). Layer decomposition: contracts
PERFECT · TS backend (new procurement BC end to end) PERFECT · realtime wire PERFECT
(first agent use of useServerEvents — the exemplar+canon landed) · Go consumer PERFECT ·
react+e2e carry all 4 fails (PurchaseOrderStatus catalog missing both locales; e2e
api-setup; judge#frontend-e2e). NAME-CONSISTENCY held across all five layers
(judge#backend-composition PASSED). Gate-enforcement fired mid-run and fixed its own
findings at composition scale. Conclusion: compound rate ≈92% with misses CONCENTRATED in
two already-known railed families (catalog, e2e-setup) — composition revealed no new
cross-layer failure modes. Verification wave (6 re-runs of today's rails) auto-fired.

Also this cycle: enum widening became 100% type-enforced (local/no-enum-widening typed
lint rule; 11 real hits incl. 3 helper-signature diseases and one dead-code guard from
this morning; lint 0 errors at error severity).

## NIGHT CLOSE — consolidated diagnosis (2026-06-12 ~01:40Z)

**Board: 12 of 17 active probes at 100% on Sonnet.** Verification wave went 3/6 same-day
(go-projector, go-controller, e2e — each a rail-to-pass conversion). P0 composition 46/50
with the backend half perfect. The 5 reds reduce to TWO structural causes:
1. **The label-catalog family** (#1 system-wide: dashchart 2/3, P0 ×2, expo historic) —
   builders skip creating the catalog (bp-25 killed mis-namespacing; absence remains).
   Fix candidates: scaffold-adherence (--labels recipe exists, unused) or a contextual
   enum-rendered-without-catalog walker. MORNING ITEM #1.
2. **Missing/unused scaffolds**: wizard orchestration (onboarding 3/4 fails — extend the
   CLI onboarding recipe to emit the spine: sequence map, _infer typing, final union
   gate) and the entire expo platform (zero CLI artifacts; expo pair's k≥2 families are
   all emit-able shapes). MORNING ITEMS #2/#3.
state-placement got both its k=2 rails today (bp-27 try/catch-mutate + lint-in-gate) —
iter6 armed at 03:45Z verifies.

**Crystallization verdicts (frameworkism, per the 4-condition bar):**
- defineProjection: **GO** (projection 100% + P0 ts-layer perfect; walker 0 FP)
- storeScopedController (ctx/omit): **GO** (wire-exposure 100% + P0 controllers perfect)
- enum Values() pattern: **GO** (go-controller + go-consumer 100%)
- dispatch-map/variant(): **GO** (map rules green across react probes)
- useInvalidateOnEvent: k=1 (P0 realtime layer perfect, first agent use) — one more sample.
Gate-enforcement saved 3 builds tonight (GEL-01 struct tags, onboarding tsc, P0 findings).

## Detector follow-ups (known limitations, by design in v1)

- **Context-misfire FP class**: `context_reads` loads neighbors' mechanical rules (entity bp-13
  fires on event files where `.input()` is CORRECT). Pre-existing hook behavior kept for parity;
  fix = per-rule `scope: self` flag in the engine.
- **Whole-text `detect_skip`**: a skip match anywhere in the file silences the rule for the whole
  file; fix = per-rule `skip_scope: line` flag.
- **SCW-03 enums check**: 1 standing warning (notifications) is likely a check FP (existence-only
  test of `enums/index.ts`) — tighten to require non-empty exports.
- Expo variants of the fetch-ban rule; per-line skip; dynamic-import evasion (R1/R3/R5/R6) — see
  reviewer notes in the build workflow output.
