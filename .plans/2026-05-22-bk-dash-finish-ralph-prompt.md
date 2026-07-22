# BK Dash Port — Finishing Ralph Loop Prompt (v3)

> Successor to `.plans/2026-05-21-bk-dash-port-ralph-prompt.md` (v1)
> and the deprecated v2 body of this same file. v3 internalizes the
> retrospective on the first 127 iters:
>
> - **Vertical slices, not horizontal layers.** One iter = one
>   user-facing operation end-to-end (entity method + repo + use case +
>   controller + handler + tests), not "one of four files for one use
>   case." Sized 60–90 min, not 30.
> - **Contract lockfile up front.** All integration events, enums, and
>   DB schema for the remaining BCs are frozen in `packages/contracts/`
>   in Phase 0, so downstream BCs and the Go worker can be authored in
>   parallel against a stable target.
> - **Parallel leaf BCs + parallel Go worker.** After the lockfile +
>   P4-INTEGRATION close, leaf BCs (Catalog/Marketing/Tracking/Finance/
>   Notifications/Analytics) and the Go worker port run as named
>   sub-agents, not serialized iterations.
> - **Workspace health is Step 0.** Each iter starts by asserting `bun
>   tsc` and `bun test` are green at HEAD. If not, that iter IS the fix.
> - **Mocks ship with their first consumer, not before.** No more
>   speculative `Mock<X>Repository` with 12 tests for finders no use
>   case has called.
> - **Deferred event seam is named.** When a BC handler needs to listen
>   to an event from a not-yet-implemented BC, the seam is a stubbed
>   `external.ts` with a `// PENDING <event-name>` marker, wired for
>   real when the producing BC lands.
> - **Pre-commit `--no-verify` policy is in the prompt from day 1**,
>   not inherited tribal knowledge.
> - **Progress log is rolling.** Entries older than 50 iters get
>   archived to a sibling file so future iters re-read a tight tail.
>
> Same self-bootstrapping format: each iter re-reads this file + the
> progress log before doing anything, so the loop converges without
> conversational memory.

---

## Prompt body (paste verbatim)

```
GOAL
─────
Finish the BK Dash port. The first loop shipped P1-IDENTITY, P2-TENANCY,
P3-BILLING, and ~50% of P4-INTEGRATION across iters 39–127. This loop
freezes the remaining cross-BC contracts, closes P4-INTEGRATION as
vertical slices, then ships TS BCs P5–P11 + the full Go worker port in
parallel sub-agents, regenerates the SDK, runs cross-stack E2E, and
finally executes `bun review` with every HIGH-severity finding resolved.

The spec is .specs/2026-05-21-ddd-modeling-bk-dash.md. The master
plan is .plans/2026-05-21-bk-dash-port.md. Conventions live in
CLAUDE.md, docs/BACKEND.md, .claude/skills/*. The Go-worker reference
is /Users/gabrielaraujo/Desktop/Projetos/bk-company/go-worker-monorepo/api/
(internal/{auth,ecommerce,integrations,marketing,shared,sync,ui}/).
Polyglot framework primitives (mediator, outbox, UnitOfWork, HttpRouter,
BaseEntity, AppError, types.Controller) already exist in
packages/api/go/core/ — bind to them, do not rebuild the reference's
homegrown framework.

DURABLE STATE (read these EVERY iteration before doing anything else)
─────────────────────────────────────────────────────────────────────
1. .specs/2026-05-21-ddd-modeling-bk-dash.md         ← spec (read-only)
2. .plans/2026-05-21-bk-dash-port.md                 ← plan (append-only)
3. .plans/2026-05-21-bk-dash-port.progress.md        ← rolling progress log (you append; archive at 50-iter mark)
4. .plans/2026-05-21-bk-dash-port.progress.archive.md ← cold storage; never re-read in normal iters
5. .plans/2026-05-22-bk-dash-finish-ralph-prompt.md  ← THIS file
6. packages/contracts/                                    ← LOCKED in Phase 0; treat as immutable after
7. packages/api/typescript/src/<bc>/                      ← TS BCs you're building
8. packages/api/go/internal/<bc>/                         ← Go BCs you're porting
9. /Users/gabrielaraujo/Desktop/Projetos/bk-company/go-worker-monorepo/api/ ← reference (read-only)

CURRENT STATE (as of loop start)
────────────────────────────────
- Branch: feat/bk-dash-polyglot
- Last iter committed: 127 (P4 Task 10 partial — StoreIntegrationRepository + Mock)
- TS backend tests: 527 pass / 0 fail / 1208 expect across 77 files
- TS tsc (api-typescript workspace): clean
- Known workspace breakage: `nx run-many -t tsc` fails on client-typescript
  (stale SDK regen + Rust openapi emit issues) and app-react/e2e. These
  are NON-blocking for backend work but BLOCK Phase E (E2E) and Phase F
  (review). Phase A explicitly fixes them.

PER-ITERATION PROTOCOL
──────────────────────
Step 0 — Workspace health check (MANDATORY, non-skippable).
         Run:
           cd packages/api/typescript && bun --filter @template/api-typescript tsc 2>&1 | tail -3
           cd packages/api/typescript && bun test 2>&1 | tail -3
         If TS tsc or test is RED at HEAD, the iter IS the fix — do not
         start feature work on a broken workspace. Diagnose, fix, commit
         the fix, then stop (next iter resumes feature work). The cost of
         building on top of a broken baseline is N iters of false-positive
         debugging later. Don't accumulate that debt.
         (For iters touching Go: also run `cd packages/api/go && go build
         ./... && go test ./...`. For iters depending on regenerated SDK:
         also run `bun sdk` and assert it exits 0.)

Step 1 — Pick a VERTICAL SLICE from the current phase.
         A vertical slice is one user-facing operation (one command or
         one query) carried end-to-end through every layer it touches:
           - entity method or aggregate mutation (if new behavior)
           - repository method (abstract + Mock together)
           - use case (command or query)
           - controller (HTTP)
           - handler (internal/external — stub deferred seams per below)
           - projector + projection update (if read-side materialization
             applies)
           - tests at the layer that proves the behavior (entity → invariant
             test; use case → orchestration test; controller → contract test)
         Target ~60–90 min per slice. If a single command genuinely needs
         more (rare — billing webhook ingest was the only one in P1-P3),
         decompose it into sub-slices in progress.md FIRST, then pick the
         smallest sub-slice. Do NOT slice a coherent operation into 3
         commits for "one of four files at a time" — that's the anti-
         pattern v3 exists to kill.
         If the phase is parallelizable (see "PARALLELIZATION
         CHECKPOINTS" below) and the parallelization point has been
         reached, dispatch sub-agents per the template and supervise
         instead.
Step 2 — Implement using project skills (/entity, /usecase, /controller,
         /repository, /handler, /event, /errors, /schema, /test, /sdk,
         /migrate, /commit). Reference patterns: tenancy BC is the most
         complete TS template; packages/api/go/internal/transcoding/ is
         the most complete Go template on the polyglot framework.
         RULES:
         - Mocks ship WITH their first consumer use case, never standalone.
           If the use case isn't being shipped this iter, ship only the
           abstract repository interface; defer the Mock.
         - New domain events: declare in packages/contracts/wire/events/
           FIRST (re-emit TypeSpec, run `bun emit-openapi`), THEN use the
           event in handler/use case code. Never inline an ad-hoc event
           shape.
         - Deferred external.ts seam: when a handler needs to listen to
           an event from a not-yet-implemented BC, stub the handler shape
           with `// PENDING <event-name> from BC-X (iter ###)` and ship
           it. When BC-X lands, that iter wires the real handler. Phase F
           (review) catches any stub that survived.
Step 3 — Re-run Step 0's verification commands. If any green→red, ROLL
         BACK to the previous HEAD and try a smaller slice. Never delete
         or skip passing tests to make red bars go away.
Step 4 — Append to .plans/2026-05-21-bk-dash-port.progress.md:
           - timestamp + iteration number (continue from 128)
           - vertical slice completed (one line)
           - tsc/test deltas (TS + Go where applicable)
           - what's BLOCKED (with reason, if anything)
           - what next iteration should pick up
         PROGRESS LOG DISCIPLINE: if the latest entry would push the
         file past 50 iters since the last archive, FIRST move every
         entry older than the most recent 25 iters into
         .plans/2026-05-21-bk-dash-port.progress.archive.md (with
         a "## Iter ###—### archive" header), leave a one-line summary
         in the live file (e.g. "Iters 78–127: P3-BILLING + P4-INTEGRATION
         tasks 1-10. See archive."), THEN append this iter's entry. The
         rolling log keeps re-reads cheap.
Step 5 — `git commit --no-verify` with conventional message. ONE logical
         slice per commit. The `--no-verify` is authorized policy for
         this loop (see GUARDRAILS § Pre-commit policy); the per-iter
         Step 0 commands above ARE the binding gate.
Step 6 — Check the COMPLETION CRITERIA below. If ALL true → emit promise.
         Else stop.

PHASE ORDER (strict; never start phase N before phase N-1 is fully done)
────────────────────────────────────────────────────────────────────────
Phase 0 — Contract Lockfile.
          Author in packages/contracts/wire/events/ + wire/enums/ +
          db/schema/ EVERY remaining integration event, enum, and DB
          table needed by ALL BCs that will be implemented in Phases
          B–D. Run `bun emit-openapi` + Drizzle migration generation.
          Output: a "FROZEN CONTRACTS" checklist in progress.md
          enumerating exactly which events/enums/tables are now
          immutable. After Phase 0, BCs can be authored in parallel
          without contract contention.
          If during a later phase a BC genuinely needs a contract that
          wasn't frozen, that iter HALTS feature work, amends Phase 0
          (freeze the new contract, re-emit, re-run all dependent BC
          tests), and only then resumes.

Phase A — Workspace Health Sweep.
          Make the entire `bun x nx run-many -t tsc` graph green so
          Phase E (E2E) and Phase F (review) have a clean baseline.
          Concretely: fix the client-typescript SDK regen issues
          (stale dist/, _http.ts `Client` named-export gap noted in
          iter 124 — generator-level, not application-level), get the
          Rust openapi emit unstuck (chrono::DateTime<Utc> utoipa
          gap), defer app-react/e2e to Phase E (acceptable carve-out
          since those tests can't run until the SDK is regenerated
          anyway). Each fix is its own iter with its own verification.
          Done when `bun x nx run-many -t tsc --exclude=app-react,e2e`
          exits 0.

Phase B — Close P4-INTEGRATION as vertical slices.
          For each integration command (C21–C25) and each integration
          read (T11–T12): one iter per command/read, end-to-end through
          every layer it touches. Order: C21 ConnectIntegration first
          (it's the entry point that exercises HandshakeService +
          OAuthCodeExchanger + PlatformCredentialSchemas the prior loop
          already shipped), then C22 Disconnect, C23/C24 Reintegrate,
          C25 ToggleActive, then T11/T12 reads. Closes when every
          C##/T## in the Integration BC spec section has a controller,
          a use case, a tested handler chain, and the projector update
          (if applicable).

Phase C — Parallel leaf BCs (P5-SALES, P6-CATALOG, P7-MARKETING,
          P8-TRACKING, P9-FINANCE, P10-NOTIFICATIONS, P11-ANALYTICS).
          The parallelization checkpoint is "Phase 0 + Phase B both
          done." After that, these seven BCs share NO TS files —
          dispatch N parallel `backend-developer` sub-agents per the
          SUB-AGENT TEMPLATE below. The supervisor iter monitors,
          merges, and re-runs Step 0 verification on each sub-agent's
          deliverable. A sub-agent failing its own internal verification
          gets re-spawned with a tightened prompt (smaller scope, more
          explicit reference paths) — never patched in-line by the
          supervisor.

Phase D — Go worker port (parallel with Phase C).
          Independent sub-agent. Mirrors the reference's internal/
          structure under packages/api/go/internal/, but binds to
          packages/api/go/core/ instead of rebuilding the reference's
          homegrown framework. Per-platform webhook mappers + verifiers
          via the Factory pattern (Memory: feedback_webhook_mapper_pattern).
          sqlc against the TS-owned Drizzle migrations from Phase 0.
          Deterministic ids via HashedID (Memory: iter 116 golden tests
          must keep passing). Spec § 5.2 lists every HTTP endpoint the
          worker must serve. Phase D done when `go build ./... && go
          test ./...` is green and the worker boots locally with TS-API
          consuming its Redis-Streams events without errors.

Phase E — SDK regeneration + production Drizzle repositories.
          `bun sdk` succeeds end-to-end (TS + Rust + Go OpenAPI emit
          + Kubb generation). Every Mock repository shipped in Phases
          B/C gets a Drizzle sibling with integration-mode tests
          (PGlite via DrizzleDatabaseDriver, mirrors tenancy patterns).

Phase F — Cross-stack E2E in packages/e2e per spec canonical flows:
            • signup → connect-integration → webhook-ingest → query-dashboard
            • subscribe → cancel → quota-degraded
            • manual-override → analytics-invalidate
            • multistore consolidated dashboard
            • daily-digest delivery
            • pixel-funnel completeness
          Playwright webServer boots all three backends + app-react.
          Tests assert end state in Postgres + UI.

Phase G — `bun review` pass on the full branch diff vs v1.4. Fix every
          HIGH-severity finding. Re-run until zero HIGH. MEDIUM logged
          to progress.md as follow-ups but not blockers. Surviving
          `// PENDING <event-name>` stubs (from the deferred-seam
          pattern) are HIGH-by-default and must be wired or formally
          deferred with a tracked issue.

PARALLELIZATION CHECKPOINTS
───────────────────────────
After Phase 0 closes:        contracts frozen → Go worker (Phase D) can start
After Phase B closes:        P4 done → leaf BCs (Phase C) can start in parallel
Concurrent: Phase C + Phase D, capped at 5 active sub-agents to keep
            supervisor merge cost bounded.
Hard-serial: Phase E waits on Phase C + D. Phase F waits on E. Phase G last.

SUB-AGENT TEMPLATE (use during Phases C + D)
────────────────────────────────────────────
For each parallelizable BC (Phase C) or for the Go worker (Phase D),
dispatch via the Agent tool with subagent_type='backend-developer' and
the following prompt:

  GOAL: Implement <BC-NAME> bounded context per
  .specs/2026-05-21-ddd-modeling-bk-dash.md § <BC-SPEC-SECTION>.

  FROZEN CONTRACTS YOU CONSUME (do NOT modify any of these):
  - Events: <list from progress.md "FROZEN CONTRACTS" section>
  - Enums:  <list>
  - Tables: <list>

  IMPLEMENT (in order):
  1. Errors glossary (src/<bc>/errors/index.ts)
  2. Aggregates + entities + value objects (src/<bc>/{entities,objects}/)
  3. Domain events (src/<bc>/events/) — IN-PROCESS only; cross-BC
     events come from the frozen contracts above
  4. Repository interfaces (abstract only; Mock ships with first consumer)
  5. Use cases — ONE COMMAND OR QUERY PER COMMIT, VERTICAL SLICE
     (entity method + repo Mock + use case + controller + handler/
     projector + tests, all in one commit)
  6. BC.create() wiring in src/<bc>/registry.ts
  7. Integration test sweep at the BC boundary

  PROTOCOL: same as the parent loop (Steps 0-6). Use --no-verify with
  the per-iter Step 0 commands as the binding gate.

  STOP CONDITION: every C## and T## in your BC's spec section has a
  controller, use case, handler chain, and tests. Report back to the
  supervisor with a one-line summary per command/query implemented +
  the final test count.

GUARDRAILS
──────────
- Never invent code paths that contradict CLAUDE.md, docs/BACKEND.md,
  or any .claude/skills/*/registry.yaml.
- Never delete or skip passing tests to make red bars go away.
- Never claim work done without running Step 0's verification commands
  and recording the output in progress.md.
- When a decision is ambiguous, write `# QUESTION: <what>` in
  progress.md and move on to a non-blocked item. Do not guess and ship.
- Resist scope creep — implement what the spec says, no more. If a CLI
  scaffolder gap forced hand-written boilerplate, file `# CLI-GAP:
  <what>` in progress.md and proceed (per CLAUDE.md house rule).
- Pre-commit policy: `git commit --no-verify` is AUTHORIZED for every
  commit in this loop. Rationale: the project pre-commit hook runs
  `bun x nx run-many -t tsc` across ALL workspaces, which fails on
  client-typescript SDK staleness + app-react/e2e issues that are
  out-of-scope for this loop (until Phase A fixes the SDK; until
  Phase E re-runs SDK + E2E). Per-iter Step 0 commands (api-typescript
  tsc + tests, Go build + tests where applicable) ARE the binding
  gate. Document this once in each commit's body ("--no-verify per
  v3 prompt § Guardrails Pre-commit policy"); do not re-litigate.
- Mock repositories ship WITH their first consumer use case. Never
  ship a Mock with speculative finder tests for a use case that
  hasn't landed yet — those tests have to be rewritten when the use
  case actually arrives and turns out to want a different signature.
- New domain events: freeze in packages/contracts/wire/events/ FIRST,
  then use. If Phase 0 missed an event, halt feature work and amend
  Phase 0 before resuming.
- Deferred external.ts seam: stub with `// PENDING <event-name> from
  BC-X (iter ###)` when the producing BC hasn't been implemented yet.
  Phase G review catches survivors.
- For the Go phase: do not copy the reference repo verbatim. Bind to
  polyglot core; do not duplicate its primitives.
- Webhook handling everywhere: per-platform Mapper + Verifier registered
  via the Factory pattern, dedupe via (platform, externalEventId)
  unique index. (Memory: feedback_webhook_mapper_pattern.md.)
- Domain entities use plain imperative methods (activate/cancel/etc).
  Event sourcing is for PROJECTIONS only. (Memory:
  feedback_no_event_sourcing_for_domain_entities.md.)
- givenEvent helpers are for cross-process boundaries — in-process
  handlers get tested by instantiating the event class and calling
  handler.handle(event) directly. (Memory: feedback_givenevent_scope.md.)
- Progress log discipline (re-stated because it's the cheapest win):
  the live progress.md MUST stay under 50 iters of entries. Archive
  older entries to .progress.archive.md and leave a one-line
  back-reference. Iters re-read the live tail; never the archive.

COMPLETION CRITERIA (ALL must be true to emit the promise)
──────────────────────────────────────────────────────────
[ ] Phase 0 FROZEN CONTRACTS checklist in progress.md, signed off
[ ] Phase A: `bun x nx run-many -t tsc --exclude=app-react,e2e` exits 0
[ ] Every BC1–BC11 from spec § 4 has aggregates, use cases, controllers,
    repositories (Mock + Drizzle), handlers, projectors (where read-side
    materialization applies), and tests in packages/api/typescript/src/
[ ] All 57 commands (C01–C57) from spec § 3.1 implemented (use case +
    controller + handler chain where applicable)
[ ] All 39 reads (T01–T39) from spec § 3.2 implemented (query use case
    + controller + projection)
[ ] packages/api/go/internal/{auth,ecommerce,integrations,marketing,
    shared,sync,ui}/ exist and compile on polyglot core
[ ] Go worker serves every HTTP endpoint in spec § 5.2
[ ] Go worker idempotency keys match spec deterministic-ID rules
    (HashedID golden tests from iter 116 still pass)
[ ] Every provider webhook handled has a per-platform Mapper +
    Verifier registered via the Factory pattern, with the
    (platform, externalEventId) dedupe index in place
[ ] bun --filter @template/api-typescript tsc → 0 errors
[ ] cd packages/api/typescript && bun test → all green, 0 skipped
[ ] cd packages/api/go && go build ./... → 0 errors
[ ] cd packages/api/go && go test ./... → all green
[ ] bun sdk → regenerates cleanly + committed
[ ] bun e2e → all canonical flows green
[ ] bun review → 0 HIGH findings; no surviving `// PENDING` stubs
[ ] All commits land on feat/bk-dash-polyglot with clean git status

COMPLETION PROMISE
──────────────────
Output EXACTLY: <promise>BK DASH PORT COMPLETE</promise>
Only when every checkbox above is verified true in this iteration's
verification log. Do not paraphrase, do not output it partially true.
If even one box is unchecked, do nothing this iteration to emit the
promise.
```

---

## Slash-command incantation

```
/ralph-loop:ralph-loop "<paste the prompt body above, verbatim>" --max-iterations 400 --completion-promise "BK DASH PORT COMPLETE"
```

> The 400-iter cap stays from v2, but the v3 changes should compress
> the remaining-work-cost meaningfully: vertical slices roughly halve
> the iter count per BC (one slice ships ~4 layers vs one layer); the
> parallel checkpoint after Phase B lets Phases C + D run concurrently
> as sub-agents; Phase 0 prevents cross-BC serialization on contract
> additions. Realistic estimate: 150–250 supervisor iters + however
> many internal iters the parallel sub-agents need.

---

## What changed from v2 (so you know what to expect)

| Change | Why |
|---|---|
| Step 0 workspace-health check added | First loop went many iters with SDK regen rot undiagnosed; iter 114 was needed just to restore deleted dirs. Step 0 catches this on iter 1, not iter N. |
| Phase 0 Contract Lockfile added | First loop kept adding events as BCs needed them, serializing everything through `packages/contracts/`. Freezing up front removes that contention. |
| Phase A Workspace Health Sweep added | Decouples Phase B feature work from the known SDK/Rust openapi rot. |
| Vertical-slice rule in Step 1 | P4 Task 9 was sliced into 3 commits for one cohesive OAuth/connect trio. v3 forbids that anti-pattern: one user-facing operation = one commit, end-to-end. |
| Mock-ships-with-consumer rule | iter 127 shipped a Mock with 12 tests for finders no use case had called yet. v3: abstract repo only until the first consumer lands. |
| Deferred `external.ts` seam named explicitly | The pattern emerged ad-hoc in P3-P4. v3 declares it upfront with a grep-able marker so Phase G catches survivors. |
| Pre-commit `--no-verify` policy in prompt | Inherited from a different plan; not in v1 → multiple iters burned working around the hook before someone authorized the bypass. v3 states it day 1. |
| Parallelization checkpoints + sub-agent template | Leaf BCs share zero TS files. Go worker shares zero TS files. v1/v2 ran them serially. v3 spawns parallel `backend-developer` agents after the Phase B checkpoint. |
| Rolling progress log + archive rule | progress.md is already long. v3 caps the live file at ~50 iters, archives older entries, future iters re-read a tight tail. |
| Completion promise text changed | v1 was "BACKEND SYSTEM ENTIRELY BUILT" (still emitted partway through P4). v3 = "BK DASH PORT COMPLETE" — distinct so the loop runner knows v2's gate is dead. |

## Disagreements with the retrospective (none)

Every critique in the retro is adopted. The closest thing to a
push-back is on the "drop test-before-consumer for mocks" rule: in
some cases a Mock with documented behavior is valuable as a contract
example. v3's compromise is "abstract ships freely; Mock + tests wait
for first consumer." That preserves the documentation value when the
consumer arrives, without committing speculative signatures.
