# BK Dash Port — Ralph Loop Prompt

> Paste the prompt block below into `/ralph-loop:ralph-loop` (incantation at the
> bottom). The prompt is self-bootstrapping: each iteration re-reads it plus the
> progress log, so the loop converges without conversational memory.

---

## Prompt body (paste verbatim)

```
GOAL
─────
Port the BK Dash backend per .specs/2026-05-21-ddd-modeling-bk-dash.md
into this monorepo. Match conventions in CLAUDE.md, docs/BACKEND.md, and
.claude/skills/*. The Go sync worker is ported from
/Users/gabrielaraujo/Desktop/Projetos/bk-company/go-worker-monorepo
into packages/go-worker/ — preserve its sqlc queries, pipelines, mediator,
and outbox.

DURABLE STATE (read these EVERY iteration before doing anything else)
─────────────────────────────────────────────────────────────────────
1. .specs/2026-05-21-ddd-modeling-bk-dash.md   ← the spec (read-only)
2. .plans/2026-05-21-bk-dash-port.md           ← the plan (write via /plan once, append-only after)
3. .plans/2026-05-21-bk-dash-port.progress.md  ← progress log (append-only per iteration)
4. packages/api/src/contexts/                       ← TS BCs you're building
5. packages/go-worker/                              ← Go worker being ported

FIRST ACTION (only on iteration 1)
──────────────────────────────────
If .plans/2026-05-21-bk-dash-port.md does NOT exist:
  invoke the /plan skill on the spec to produce it.
  The plan MUST enumerate every BC, every aggregate, every command/read,
  every Go pipeline, dependency order, and acceptance criteria per phase.
  DO NOT start phase 1 work in iteration 1 — planning IS iteration 1.

PHASE ORDER (strict — never start phase N before phase N-1 is fully done)
────────────────────────────────────────────────────────────────────────
Phase 1 — Shared types & enums from §7.0: CurrencyCode, MonetaryAmount,
          MonetaryByCurrency, FxRate, all platform/status enums. Lands in
          packages/api/src/shared/ and packages/client/.
Phase 2 — Integration event catalog (shared.* Zod schemas), error glossary,
          registry wiring.
Phase 3 — go-worker port: copy folder structure from go-worker-monorepo into
          packages/go-worker/. Wire sqlc against TS-owned migrations. Implement
          outbox publisher. Port pipelines one per provider.
Phase 4 — TS bounded contexts in dependency order:
            Identity → Tenancy → Billing → Integration → Sales → Catalog →
            Marketing → Tracking → Finance → Notifications → Analytics
          Each BC: aggregates → use cases → controllers → handlers →
          repositories → unit tests → integration tests.
Phase 5 — End-to-end tests in packages/e2e for canonical flows
          (signup → connect-integration → webhook-ingest → query-dashboard,
           subscribe → cancel, manual-override → analytics-invalidate).
Phase 6 — Run /review on the full diff. Fix every HIGH severity finding.
          Re-run /review until zero HIGH.

PER-ITERATION PROTOCOL
──────────────────────
Step 1: Read progress.md. Identify the SMALLEST unfinished work item from the
        current phase that fits in ~30 minutes of focused work.
        DO NOT pick anything from a later phase if any earlier phase work
        remains.
Step 2: Run verification baseline and record in progress.md:
          bun tsc 2>&1 | tail -5
          bun lint 2>&1 | tail -5
          bun run test 2>&1 | tail -5
Step 3: Do the chosen work item. Use project skills (/entity, /usecase,
        /controller, /repository, /handler, /event, /errors, /schema, /test,
        /sdk, /migrate, /commit) — do NOT hand-write boilerplate the
        scaffolders cover.
Step 4: Re-run verification. If anything that was green is now red, ROLL BACK
        and try a smaller piece.
Step 5: Append to progress.md:
          - timestamp
          - item completed (single line)
          - tsc/lint/test deltas
          - what's BLOCKED (with reason)
          - what's next iteration should pick up
Step 6: /commit (conventional message, one logical chunk).
Step 7: Check completion criteria below. If ALL true → emit promise. Else stop.

GUARDRAILS
──────────
- Never invent code paths that contradict CLAUDE.md, docs/BACKEND.md, or any
  .claude/skills/*/registry.yaml.
- Never delete or skip passing tests to make red bars go away.
- Never claim work is done without running the verification commands and
  recording the output in progress.md.
- Never spawn parallel agents that write to the same files — only spawn
  parallel agents for disjoint BCs that are confirmed dependency-free per the
  plan.
- When a decision is ambiguous, leave `# QUESTION: <what>` in progress.md and
  move on to a non-blocked item. Do not guess and ship.
- Resist scope creep — implement what the spec says, no more.

COMPLETION CRITERIA (ALL must be true to emit the promise)
──────────────────────────────────────────────────────────
[ ] Every BC1..BC11 from spec §4 has aggregates, use cases, controllers,
    repositories, handlers, and tests under packages/api/src/contexts/
[ ] All 57 commands and 39 reads from spec §3 are implemented
[ ] packages/go-worker/ compiles, runs locally, and serves the HTTP endpoints
    listed in spec §5.2 (/integrations/handshake, /sync,
    /marketing/reconcile/<platform>)
[ ] Go worker idempotency keys match spec deterministic-ID rules
[ ] bun tsc          → 0 errors
[ ] bun lint         → 0 errors
[ ] bun run test     → all green, 0 skipped suites
[ ] bun e2e          → all green
[ ] bun sdk          → regenerated and committed
[ ] /review on full diff → 0 HIGH-severity findings
[ ] All commits land on current branch with clean git status

COMPLETION PROMISE
──────────────────
Output EXACTLY: <promise>BACKEND SYSTEM ENTIRELY BUILT</promise>
Only when every checkbox above is verified true in this iteration's
verification log. Do not paraphrase, do not output it partially true.
If even one box is unchecked, do nothing this iteration to emit the promise.
```

---

## Slash-command incantation

```
/ralph-loop:ralph-loop "<paste the prompt body above, verbatim>" --max-iterations 200 --completion-promise "BACKEND SYSTEM ENTIRELY BUILT"
```

---

## Honest caveats before running

1. **Scope reality** — the spec describes ~57 commands × ~39 reads × 11 BCs +
   a Go service port + tests + reviews. That's many dozens of iterations even
   with parallel agents.
2. **Keep the 200-iteration cap.** If the loop hasn't converged by then, the
   prompt or scope needs a redesign, not more iterations.
3. **Watch the progress log every 5–10 iterations.** If `bun tsc` /
   `bun run test` aren't trending green over time, the loop is thrashing —
   interrupt and adjust the plan or guardrails.
4. **The "0 HIGH-severity findings" gate** prevents premature victory. If the
   agent argues a HIGH should be downgraded, that's a red flag for the
   iteration's quality.
5. **`bun sdk` regeneration is load-bearing.** Skipping it makes frontend
   integration tests fail in ways that look unrelated. The prompt lists it
   explicitly — don't loosen that.
