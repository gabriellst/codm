# Probe backlog — anti-overfit breadth queue

> **STATUS 2026-06-10: ALL 11 authoring probes AUTHORED** (workflow: 11 authors + 11
> adversarial reviewers; every task passes `validate-task.ts`). Probe #9 (VO-REPR) needs no
> authoring — schedule the existing tasks in --agent mode. Run order: P1 first, max two
> agent builds per usage window (see .plans/2026-06-10-correctness-handoff-next-steps.md).
> Run-time gaps: astro has no package CLAUDE.md yet (carrier gap — create it before the
> astro probe; the prompt names the skill variants instead). RESOLVED at review: a missing
> root .env is NOT a blocker for wire-exposure — bun sdk/migrate:create run env-less in a
> fresh worktree (Config fallbacks + drizzle.config DATABASE_URL default).

> Derived from `bun scripts/skill-evals/feature-loop/coverage.ts` (2026-06-10: 8 uncovered
> axes) + structural gaps the table doesn't show (no agent-runnable FORM probe, zero astro
> probes, zero Go-backend probes, VO-REPR never agent-run). Each probe follows the
> generator/verifier split: the spec below is the generator side; graders get derived
> independently from the spec (idiom-level, never name-literal — see the variant-forms
> replay lesson). Authoring protocol: free-real-estate check at HEAD, every grep-must 0
> before the build, both detect gates green at HEAD.

## Why this list exists

react + expo converged on ONE probe family each (notifications). The canons exercised are
broad, but convergence on n=1 family is not excellence everywhere — this queue is the
breadth evidence. Cross-cutting axes (NAME-CONSISTENCY, NAMING, ERR-VOCAB) are NOT given
dedicated probes; they ride as graders on every new probe below.

## P0 — the app-slice composition probe (DEDICATED SESSION; run after the P1–P3 queue)

**`synthetic-fullstack-crud-realtime`** — the app-scale experiment: one vertical slice
spanning **contracts → api-ts → api-go → app-react → e2e**, measuring the COMPOUND
canon-application rate (the p^N question) rather than a single family. Expect the first
run well below 100% — its purpose is to measure composition and surface cross-layer
families no single-platform probe can see.

**Prerequisite — port the real-time infra FIRST (product work, own canon, before the
probe exists).** The server SSE primitives are already here
(`core/src/utils/sse.ts` even references "ListenEventsController") but the consumer half
was never ported. Ground in medscall
(`packages/api/src/ui/controllers/ListenEvents.ts` + `packages/app/src/hooks/useServerEvents.ts`):
1. `ListenEventsController` (api-ts `ui` context): SSE endpoint streaming a CURATED
   discriminated union of integration events (typed OutputSchema → SDK type), data-only
   frames via `encodeSSEFrame`, keepalive, auth-gated.
2. `useServerEventSource()` + `useServerEvents<K>(name | name[], cb)` with the event-name
   union DERIVED from the SDK response type (`ListenEventsQueryResponse['name']`) — typed,
   narrowed per name via `Extract`. Dep: `@microsoft/fetch-event-source`.
3. Canon docs: a "Real-time" section in `packages/app/react/CLAUDE.md` + hook skill entry.

**Usage idioms (forensics from medscall's live call sites — the canon to port):**
- **One source per SSE endpoint, mounted at the layout that owns the scope**: medscall has
  an app-global source (mounted once in the `(app)` route layout) AND a route-scoped one
  (channel layout, different backend's listen endpoint, SDK surface `channel/app`).
  Components NEVER mount the source — they subscribe via `useServerEvents` from the
  matching scope.
- **Guard-then-invalidate** is the canonical callback: filter by payload scope first
  (`if (event.payload.channelId !== channelId) return`), then
  `queryClient.invalidateQueries({ queryKey: listXQueryKey({...}) })` — invalidation,
  never manual cache surgery; UI side-effects (scroll pinning) are allowed after.
- **Shared handler for sibling events**: one `invalidateMessages` reused across
  delivered/seen subscriptions; array form for unions
  (`useServerEvents(['a.connected','a.disconnected'], e => { if (e.name === ...) })`).
- **`'<event>' satisfies ServerEventName`** for single literal names (typo = tsc error).
- **Name flow is the cross-layer thread**: contracts integration-event name → outbox →
  SSE frame `name` field → SDK union → hook subscription — ONE name end to end (this is
  the composition probe's NAME-CONSISTENCY spine).
- **Port wart to fix, not copy**: medscall's partial-prefix invalidation spells
  `[getXQueryKey({} as never)[0]]` — an `as never` cast that violates our no-casts canon;
  our port needs a sanctioned prefix-invalidation helper instead.

**The probe slice** (one cohesive domain ask, e.g. "supplier purchase orders"):
- contracts: new table + a new integration event (TypeSpec, frozen first — Phase-0 style)
- api-ts: CRUD aggregate (create/update/cancel), domain events, internal handler publishing
  the integration event, projection + projector for the list read-model, BFF queries
- api-go: consumer of the integration event (fx module, contracts bindings, hand-written
  SQL persistence — an indexer/audit slice)
- app-react: CRUD screen (URL-contract list + store-driven dialogs + SDK mutations) whose
  list LIVE-UPDATES via `useServerEvents` → query-key invalidation
- e2e: Playwright flow asserting the CRUD round-trip AND the real-time update (mutate via
  API in the test, assert the open list refreshes without reload)

**STATUS: AUTHORED 2026-06-11** (synthetic-fullstack-crud-realtime.yaml, 50 graders, validator clean; armed for a dedicated window). **Grading**: the full battery decomposed PER LAYER (so the compound score attributes:
contracts/ts/go/react/e2e sub-scores), every detect gate, per-layer judges with scope
notes, plus cross-layer NAME-CONSISTENCY graders (one ubiquitous-language term end to end).

**Runner requirements (why it needs its own session)**: a single 45-min builder cannot do
this. Reserve a FULL usage window; `AGENT_TIMEOUT_MS` ≈ 3h, `AGENT_RESUMES` ≥ 4, or better:
a phased-prompt run (contracts → backend-ts → go → frontend → e2e as sequential resume
prompts in the SAME worktree — the resume mechanism already supports the shape). Authoring
the task itself (free-real-estate verification across FOUR packages + openapi + SDK) is a
session-sized job too — do both in the dedicated session, with this spec + the medscall
references as the inputs.

## P-Go — Go backend depth (AUTHORED 2026-06-11, user ask: projectors/controllers/enums)

Census-grounded (29 controllers, 23 use cases, 102 handler files, enum canon in
core/enums + internal/sync/enums, **zero projectors**):

| Probe | Measures | Condition note |
|---|---|---|
| `synthetic-go-projector-activity` | PROJECTION-MUTATION in Go: projection owns transitions (ApplyEvent), projector find→ApplyEvent→save, contracts-bound decode, idempotent redelivery, embedded migration | **NO live Go projector exists** — measures skill-variant transfer without exemplar; a fail localizes to the carrier gap (fix = exemplar/scaffold, not louder docs) |
| `synthetic-go-controller-summary` | Go controller canon + ENUM-REPR: enum-exhaustive-by-construction response, zero re-typed literals, one GROUP BY query, openapi regen | live sibling exemplar (list_sync_jobs.go) |
| `synthetic-go-entity-retry` | Go write-side: entity owns invariants (Retry() + 2 named errors), use case orchestrates without re-checking, code-asserting tests | **brownfield-lite** — first probe extending EXISTING domain code (step toward L3) |

All three: validator clean, cmd gates (go build/test) green at HEAD, sonnet builders.

## CRYSTALLIZATION = SCAFFOLDS, NOT LIBRARY APIs (user decision 2026-06-12)

Terminal rung ruling: validated canons crystallize as **CLI scaffolds emitting visible,
owned code** — never as library abstractions (no defineProjection factory, no
storeScopedController wrapper). Rationale: emitted code stays inspectable/editable per
artifact, no runtime indirection, no framework lock-in; the walkers/detectors remain the
PERMANENT gates (they never retire into types). Existing small utilities (pickUnionVariant,
tryCatch, Values()) stay as-is; no new abstraction layers.

Validated canons → scaffold status:
| Canon (probe-validated) | Scaffold | Gate (permanent) |
|---|---|---|
| projection free-record shape | `bun cli projection` (exists, canon-true) | projection-shape walker |
| controller ctx/.omit derivation | verify/extend `bun cli controller` emits the ctx envelope + .omit shape | SCW-05 |
| Go enum Values() helper | extend the Go enum scaffold to emit Values() | go-enum-literals + ENUM-GO-05 |
| dispatch maps / variant() | component scaffolds' variant recipes (exist) | bp-26 |
| realtime guard-then-invalidate | component scaffold realtime block (candidate) | lint no-raw-enum-render + CLAUDE.md |
| wizard orchestration spine | **`bun cli onboarding-wizard` — TO BUILD (the one missing scaffold)** | form FRM-P13/15/18 graders |

## P4/P5 — the autonomy ladder (probe classes for fully autonomous development)

Everything above (P0–P3) measures **L1/L2: pattern application + composition given a
human-written slice prompt**. Full autonomy means the agent owns the upstream stages and
the messy non-greenfield work too. Each level below is a distinct probe CLASS with its own
oracle problem; judge-heavy classes need higher k (weaker oracles).

**L3 — self-checking (probe-able with current machinery):**
- **review-judgment probe**: a diff seeded with K violations + M legitimate-exceptions
  (the judge scope-note traps, in reverse); measure the agent's review precision/recall.
  Calibrates the agent as its own gatekeeper — required before removing human review.
- **brownfield-modification probes**: change an existing aggregate's behavior, extend a
  wire contract non-breakingly, refactor with consumers. Free-real-estate probes
  systematically avoid this (by design) — but real autonomy is ~80% edits, not greenfield.
  Oracle: regression suites stay green + behavior-change graders + SDK-diff discipline.
- **debugging/incident probe**: baseRef WITH a seeded bug (the replay machinery already
  supports this), symptom-level prompt (failing e2e, Grafana trace). Measures
  fix-the-cause discipline; graders: hidden regression test passes, no test-weakening,
  no suppression patterns ([[no-hacky-workarounds]] as graders).
- **contract-evolution probe**: mutate a FROZEN contract correctly — TypeSpec change,
  both-language regen (ts+go), every consumer updated, breaking-change surfaced. The
  polyglot SDK pipeline is the riskiest machinery and no probe exercises a CHANGE to it
  (wire-exposure only ADDS).

**L4 — upstream judgment (specification/planning/clarification AUTHORED 2026-06-13: synthetic-l4-{specification,planning,clarification}.yaml, validator-clean, judge-heavy + mechanical anchors on produced spec/plan artifacts) (judge-heavy; gold-reference + rubric oracles):**
- **specification probe**: vague product ask → spec. Grades the modeling heuristics from
  CLAUDE.md ("question every aggregate": event vs aggregate vs VO vs enum+quota), scope
  discipline (no speculative contexts), ubiquitous-language naming. The template port
  retrospective is the failure corpus to seed traps from.
- **decomposition/planning probe**: spec → plan. Contract-lock-first ordering, ownership
  decisions (Go vs TS writer), wave classification, split-at->7-deliverables.
- **clarification probe**: an UNDER-specified or self-contradictory ask where the correct
  output is the right QUESTION (or surfacing the contradiction), not a build. We have
  never graded declining-to-invent — autonomy without it is confident wrongness at scale.
  Runner gap: claude -p can't ask; grade the final message for the surfaced ambiguity.

**L5 — process + self-maintenance (long-horizon):**
- **handoff-continuity probe**: agent A builds half a slice and writes a handoff; agent B
  (fresh context) must finish from the handoff alone. Oracle: the composition probe's
  graders on the COMBINED tree. Tests the multi-session reality of autonomous work.
- **goal-adherence probe**: a long build with tempting adjacent debt; measure scope drift
  (files touched outside the plan's manifest) and gate honesty (no skipped finishing gates).
- **learnings probe (meta)**: N review findings + scoreboard history → does the agent
  propose the correct skill/registry/rung edits? This is the probe for the optimization
  loop ITSELF — the last human in the loop is whoever does the rung escalation; this
  measures replacing them.

Instrument prerequisites: brownfield + debugging probes need seeded baseRef construction
(replay machinery reusable); L4 probes need gold-reference specs/plans + rubric judges;
clarification probes need final-message grading; L5 needs multi-invocation runner support
(the resume mechanism is already 80% of it).

## P1 — known-weak families + uncovered axes (author first)

| # | Probe | Side | Axes closed | Core discriminating questions |
|---|---|---|---|---|
| 1 | `synthetic-react-onboarding-composed-form` | react | **FORM-COMPOSE, FORM-SUBSCRIBE** (new axes, uncovered), DISC-UNION, SCHEMA-DERIVE, SDK-CONSUME | Multi-step onboarding-style flow over a discriminated-union SDK mutation body where the discriminant selects DIFFERENT step sequences (const-asserted step tuples per variant). The canon under test (medscall's composition upgraded to OUR helpers — see "Reference corpora"): each step's schema is a SLICE of the union member via `@/lib/union` — `pickUnionVariantField(unionSchema, { type: 'X' }, 'section')` (a valid TanStack `validators.onChange`; `.pick()` on it for partial steps), discriminant selector options from `unionVariantValues(unionSchema, 'type')` — never a re-typed parallel schema, never raw positional `.def.options[0].shape.x`; `StepData` inferred from the slice (`z.output`); NO hand-written aggregate form type — the route form's type comes from function inference (`export type XForm = ReturnType<typeof _inferXForm>`); steps render via a dispatch map keyed by the step enum (CMP-P18); parent form aggregates via `setFieldValue`; FINAL submit gates with `pickUnionVariant(unionSchema, match).safeParse(payload)` and sends `result.data`. Subscribe canon: submit/next buttons gated by `form.Subscribe` narrow selectors + safeParse (FRM-P03), zero `useState` mirrors of field values, Zustand store for NAV state only (step index/direction — never form data). Scaffold-first: `bun cli onboarding-step --from=<sdk.path>` emits the canonical step shape. Grader sketch: grep-must `pickUnionVariant(Field)?\(` + `unionVariantValues\(` + `ReturnType<typeof _infer` + `form\.Subscribe`; grep-must-not `\.def\.options\[` positional access and `interface \w+(FormValues|FormData)\s` hand-rolled aggregates (judge for the inference claim); per-union-cell scenarios from the DISC-UNION axis. (Helper names in graders are legitimate here — `lib/union.ts` exists at HEAD on both platforms; the variant-forms lesson was about gold-INVENTED names.) Replaces the gold-only variant-forms replay for agent mode. |
| 2 | `synthetic-expo-form-state-subscribe` | expo | **FORM-SUBSCRIBE** (expo spelling), NAV-MODAL, STATE-PLACEMENT, DISC-UNION (`form/expo` — UNTESTED) | Deep-linkable create/edit formSheet (registration + explicit presentation now RC-gated; typed `.default()`-ed params; dismissal pairing) whose form exercises the SUBSCRIBE canon under list-row pressure (reference: berzerk-club `active-exercise/[id].tsx` + `(sheets)/edit-profile`): screen owns `useForm` with `validators: { onChange: sdkSchema }`; children take the form as a typed prop via the inference helper (`ReturnType<typeof _inferFooForm>` — form/expo registry); list rows subscribe with PRIMITIVE-returning selectors (the 3-mode editing discriminant — idle/editing-this/editing-other) so unrelated field changes don't re-render rows; submit `safeParse`s into `result.data` then mutation + `onSettled` invalidation + haptics; store holds UI flags only with selector access + reset-on-unmount. TRAPS (catalogued berzerk deviations the agent must NOT reproduce): `useState` mirroring a field value, whole-state `form.Subscribe` selectors around leaves, raw `form.state.values` reads in render bodies, form data in the Zustand store. |
| 3 | `synthetic-be-projection-digest` | api-ts | PROJECTION-MUTATION, ASYNC-INLINE (both UNCOVERED) | New projection + projector over existing domain events: overloaded `static create(event)` / `applyEvent(event)`, canonical find→applyEvent→save, async-via-outbox by default, atomic repo op ONLY with a written trigger justification (hot row / bulk / monotonic / conditional / cache-mirror), `events: readonly string[]`, exhaustive `default: never`. |
| 4 | `synthetic-be-wire-exposure` | api-ts | WIRE-EXPOSURE (UNCOVERED, detector-rung), SCHEMA-DERIVE | New endpoint that NEEDS a shared VO and touches an entity with a sensitive invariant: `registerSchemas` gets shared/objects + shared/schemas ONLY; the entity (write-model) schema must NOT appear in `openapi.json`; the sensitive `.refine()` stays server-side; SDK regenerated and diff inspected. |
| 5 | `synthetic-react-state-placement` | react | STATE-PLACEMENT (deep cut), FORM-SUBSCRIBE, SCHEMA-DERIVE, ENUM-REPR | One screen that forces ALL FIVE STR-P10 cases simultaneously — an analytics/list page with filters, a cross-component selection, and an inline edit form with live derived UI. The canon under test: (a) **composed search schema** — derive from the SDK query-params schema, `.omit()` the app-global-store-owned field (tenancyScope pattern — and READ it from the store, proving the omit was a relocation not a deletion), `.and(z.object({...}))` the route-local fields, EVERY field `.default()`-ed (incl. an SDK-enum-typed field with `.default()`), exemplar `dashboardSearchSchema`; (b) **Zustand for the genuinely cross-component piece** — a selection read by 2+ sibling sections (chart + table + toolbar), route-scoped `-stores/`, selector access — NOT URL (runtime-resolved, non-shareable), NOT lifted useState; (c) **form-derived state via `form.Subscribe`** — a computed total/preview/dirty-banner whose value derives from form fields through narrow selectors, NEVER mirrored into useState or a store on `onChange`; (d) zero `useState` outside case-5 transients. Grader sketch: grep-must `\.omit\(` + `\.and\(` + `\.default\(` in the route index, `form\.Subscribe` in the form, store file under `-stores/`; grep-must-not `useState` mirrors (judge distinguishes case-5 transients), `setState.*onChange` form-mirror handlers, hand-rolled search field lists when an SDK query-params schema exists. Traps: a filter that LOOKS cross-component (URL is right), a derived value that LOOKS store-worthy (Subscribe is right). |

### Reference corpora for the form probes (read before authoring)

- **medscall onboarding** (`/Users/work/Desktop/Projetos/medscall/software/monorepo`,
  `packages/app/src/routes/onboarding/`): the composition source — step schemas as union-member
  slices, inferred `StepData`, per-discriminant step tuples, dispatch-map rendering, nav-only
  Zustand store, final union-level safeParse. NOTE: medscall slices via raw property access
  (`completeOnboardingMutationRequest.DOCTOR.shape.doctorInfo`) — in THIS repo the canonical
  spelling is the `@/lib/union` helpers (`pickUnionVariantField` / `pickUnionVariant` /
  `unionVariantValues`: discriminant-matched, compile-checked, valid `validators.onChange`),
  which supersede the raw access. Helpers now exist on BOTH platforms (react + expo
  `lib/union.ts`). Our `bun cli onboarding-step` already scaffolds the step shape.
- **berzerk-club expo** (`/Users/work/Desktop/Projetos/pessoal/berzerk-club/packages/expo`):
  ~85% canon-aligned mobile corpus — the subscribe idioms to adopt (primitive selectors,
  safeParse-gated buttons, `onSettled` invalidation) AND a catalogued deviation list that
  doubles as the probes' trap inventory (useState debounce mirror, raw fetch for S3 signed
  URLs — legitimate, must NOT be flagged; useState entity mirrors — must be flagged). Traps
  distinguishing legitimate-exception from violation are what keep the judge honest.

## P2 — breadth on converged platforms + DI/test canon

| # | Probe | Side | Axes closed | Core discriminating questions |
|---|---|---|---|---|
| 5 | `synthetic-react-dashboard-chart` | react | UI-COMPOSITION, DATA-OWNERSHIP, CENTRALIZE-MAPS, LOCALE-MONEY (new family: BFF reads) | Dashboard section over a kind-discriminated BFF read (GetDashboard/GetChart shape): named section fragments + variant() composer + single `z.discriminatedUnion('kind')` consumption; dispatch-by-map per kind (CMP-P18); `useMoney()` everywhere; skeleton inline; no prop-drilled data. |
| 6 | `synthetic-be-di-test-mode` | api-ts | DI-REG, TEST-MODE (both UNCOVERED) | New repository + use case wired through the context `registry.ts` for all three envs (mock/integration/real); colocated repo + use-case tests using `TestBed.create('integration')`, `given*` helpers (state via repos, never via use cases), no VALIDATION_ERROR re-testing in use-case tests. |
| 7 | `synthetic-react-table-route-search` | react | STATE-PLACEMENT (table spelling), ENUM-REPR, SDK-CONSUME (new family: tables) | Server-paginated DataTable: page/sort/filter fully in `validateSearch` (typed by SDK enums, composed + `.default()`-ed per P1 #5's canon); `useMemo` column defs with `locale` in deps; cross-component bulk selection in a Zustand store (the ONE store case) — everything else URL or hook-owned. Lighter sibling of P1 #5 — author only if #5 leaves the table family unexercised. |
| 8 | `synthetic-e2e-notifications-flow` | e2e | E2E-DISCIPLINE (UNCOVERED) | Playwright spec for the now-canonical notifications flow: data setup via API/given-style fixtures (not UI), role/label selectors, zero `waitForTimeout`, deep-link assertions on the URL contract. Graders: `bun e2e` green + grep-must-nots on sleep/css-selectors. |
| 9 | VO-REPR agent runs (NO authoring) | api-ts | VO-REPR (tasks exist, never agent-run) | Schedule the two existing VO-REPR tasks in `--agent` mode at the next window; type-rung axis, expect near-perfect — confirms the rung claim empirically. |

## P3 — platform zero-coverage (honest debt, larger setup)

| # | Probe | Side | Axes closed | Notes |
|---|---|---|---|---|
| 10 | `synthetic-astro-landing-section` | astro | component/route/astro variants, PRIMITIVES-A11Y (both untested) | Localized landing section with locale-prefixed routing and ONE deliberate island decision (static vs react island). First astro probe ever; needs an astro grader target in `TSC_TARGETS` first (harness gap). |
| 11 | `synthetic-go-consumer-slice` | api-go | EVENT-EMISSION/ASYNC-INLINE on the Go side | Go worker consuming an existing integration event: fx module wiring, contracts bindings (NOT hand-rolled structs), hand-written SQL constants over database/sql (the actual Go persistence canon — root CLAUDE.md's "sqlc" was stale, corrected), projector parity with the TS canon. The Go backend has had ZERO agent iterations — biggest backend blind spot. |
| 12 | `synthetic-react-primitive-variant` | react | PRIMITIVES-A11Y (UNCOVERED) | Add a CVA variant + a11y contract to an existing primitive (focus trap, aria-*, keyboard path); graders grep aria patterns + judge on the a11y rubric; exercises `design-system`/`primitive` skills. |

## Standing rules for every new probe

- Cross-cutting graders ride along: NAMING/NAME-CONSISTENCY (ubiquitous-language terms),
  ERR-VOCAB (named errors, no `throw new Error("...")`), detect suite (all four walkers),
  platform tsc, and a judge with scope notes (client-side-expected shapes spelled out —
  iter5b/iter6 lesson: judge the idiom, not the variable name).
- Task prompts name the package `CLAUDE.md` first in the read list (proven carrier).
- Max two agent builds per usage window, timed at the boundary; the runner's suspect flag
  invalidates cut samples (see `.plans/2026-06-09-correctness-phase-0-and-detectors.md`).
- A probe "converges" at k=2 clean full-length samples ≥ the react bar (idiom-true 100%).
- When a family fails k≥2 valid samples with the canon present and read: escalate the rung
  (doc → detect/scaffold/type), never just rewrite the doc louder.
