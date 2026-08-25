---
name: plan
description: Turn an approved business spec into an implementation plan. Adapted from obra/superpowers:writing-plans with domain extensions for the code graph, anti-invention rules, and diff-style Modify operations. Use AFTER /brainstorm and BEFORE /build.
argument-hint: <path to approved spec file>
---

# /plan — Implementation Plan Creation

Read the approved spec at `$ARGUMENTS` and produce an implementation
plan at `.plans/YYYY-MM-DD-<slug>.md`.

Write comprehensive implementation plans assuming the engineer has
zero context for our codebase and questionable taste. Document
everything they need to know: which files to touch for each task,
the actual code (or the exact diff), how to test it. Give them the
whole plan as bite-sized tasks. **DRY. YAGNI. TDD. Frequent commits.**

Assume they are a skilled developer but know almost nothing about
our toolset or problem domain. Assume they don't know good test
design very well.

**Announce at start:** "I'm using the /plan command to create the
implementation plan."

## When to Use

- Approved spec exists at `.specs/` (Status: Approved).
- No plan yet for this spec.

## When NOT to Use

- Spec is Draft → go back to `/brainstorm`.
- Plan already exists → edit directly.
- Trivial single-file change → just write it.
- Spec lacks any of the six enforced sections (Context / Problem /
  Goal / Decisions / User Stories / Acceptance Criteria) → refer
  back to `/brainstorm`.

## Three Domain Extensions (over superpowers writing-plans)

1. **Graph CLI as input** — query the code-graph during exploration
   to find sibling artifacts and verify spec claims, BEFORE writing
   the plan.
2. **Anti-invention rule** — every Task must trace to spec ACs /
   Decisions / Stories. No inventing abstractions, events, helpers,
   or test backdoors the spec didn't ask for.
3. **Proposed-code, not diffs** — the plan ships the final code. Scaffoldable
   artifacts: `bun cli` scaffold step + a full proposed-file block the executor
   writes (no SEARCH/REPLACE). Modifications: full proposed file when the Task owns
   it, or a one-line description for a small edit to a large file it doesn't own.
   No ` ```diff ` hunks.

## Scope Check

If the spec covers multiple independent subsystems, it should have
been broken into sub-project specs during brainstorming. If it
wasn't, suggest breaking this into separate plans — one per
subsystem. Each plan should produce working, testable software on
its own.

**Porting from another system / spanning ≥3 bounded contexts?** Follow
the CLAUDE.md "Modeling from another system" workflow before planning
Tasks (rationale: `.specs/2026-05-26-audit-distillation-what-we-got-wrong.md`):
- **Phase 0 = Contract Lock FIRST.** Author and freeze all cross-boundary
  enums + integration events in `packages/contracts` and regen bindings
  BEFORE any BC Task. Frozen contracts are what let BCs be planned/built
  in parallel without serializing through the contracts file. Make this
  the plan's Task 1, not a trailing SDK-regen task.
- Derive every aggregate shape, enum value, and Drizzle column from the
  **spec / source system**, never the lean wire-event payload or the
  template's existing registry.
- Decide **data ownership per subsystem** (who writes each canonical
  projection — Go worker vs TS) before specing commands.
- Question every aggregate (event / VO / code-enum / framework-owned
  before a persisted aggregate); don't speculatively add BCs/read-models.

## Phase 1 — Explore (silent, mandatory)

End this phase holding (a) the spec's behavior, (b) the candidate
skills' conventions, (c) one sibling per kind in the relevant
context — **absorbed into your head, not quoted into the plan**.

### 1.1 Graph snapshot

```bash
bun scripts/graph/cli/index.ts build
bun scripts/graph/cli/index.ts plan "$ARGUMENTS" --json > /tmp/plan-graph.json
```

If `plan` reports a hard error, **stop and report**. Do not plan
against a broken graph.

### 1.2 Read the spec end-to-end

The spec MUST have these six sections (enforced by `/brainstorm`):
Context · Problem · Goal · Decisions · User Stories · Acceptance
Criteria. If any is missing, **stop and refer back to /brainstorm**.

Legacy spec tolerance: accept `### Objetivo` as equivalent to
`## Goal`. Accept absent `## Problem` (treat as "Net-new — no
current problem being solved").

### 1.3 Artifact existence verification

For every artifact the spec asserts as already existing, run:

```bash
bun scripts/graph/cli/index.ts file <path>
```

If any claim is wrong (the spec asserts a path that doesn't exist),
**stop and refer back to /brainstorm** with the specific false claim.

### 1.4 Identify candidate skills + read their SKILL.md

From the spec's behavior, list candidate skills. Heuristic:

| Behavior in the spec | Candidate skills |
|---|---|
| Mutation (create / update / cancel / send) | `/entity` + `/repository` + `/usecase` + `/controller` + `/schema` + `/migration` |
| UI read (list / detail / filter) | `/query` + `/controller` + `/schema` |
| Reaction ("when X happens, Y…") | `/event` + `/handler` |
| Cross-service | integration `/event` + `/handler` in receiving context |
| Wizard / multi-step | `/form` + `/store` |
| Greenfield context | `/bounded-context` + everything below |
| UI page | `/route` + `/component` (+ `/form` if input) |

> **Frontend artifacts scaffold via `bun cli` too.** When a row above resolves to a
> frontend skill (`/route`, `/component`, `/store`, `/form`, `/primitive`), its plan task
> MUST use the scaffold-then-mutate shape (Phase 3 → "Scaffoldable artifacts") with the
> skill's `scaffold:` `bun cli …` line — never a whole-file `.tsx` paste. Read the skill's
> `registry.yaml` `scaffold:` and `canonical_snippet` during this step.
>
> **Storybook stories (`/storybook`).** When a Task delivers a React component worth showcasing,
> include a `*.stories.tsx` per the `/storybook` skill: dumb (props-only) → `args`; connected
> (owns data) → the real component + typed SDK mocks (`mockQuery`/`loadingQuery`/`errorQuery`/…)
> with `parameters.route`/`stores`. Verify stories with `bun run storybook:build` (no unit-test
> runner in the react workspace) — add it to the Task's verification + Final Validation for
> story-bearing frontend work.

For each candidate, read its full `SKILL.md` (the file, not the
description) and one sibling artifact of the same kind+context
from `/tmp/plan-graph.json`. **You absorb the convention; the plan
output ships the new code only.** The sibling does NOT go into the
plan as a "Reference block".

### 1.5 DDD escape hatch

If aggregate boundaries or context membership is genuinely ambiguous,
invoke `Skill(skill='ddd-modeling')` before proceeding.

### 1.6 Threshold for `/task-breakdown`

If the plan will produce ≥10 artifacts OR cross ≥3 bounded contexts,
invoke `Skill(skill='task-breakdown')` for the four-phase overlay.
Smaller plans use the inline topo-sort below.

## Phase 2 — File Structure (interactive, mandatory)

Surface in chat (not yet in the file) the list of files this plan
touches and what each one owns. **This is where decomposition gets
locked in.** Format:

```
Create: packages/api/src/<ctx>/entities/<X>.ts
  Owns: domain invariants for <X>; behavior method <method>(...)

Create: packages/api/src/<ctx>/usecases/<Cmd>.ts
  Owns: command orchestration — load <X>, mutate, save

Modify: packages/api/src/<ctx>/controllers/index.ts
  Adds: export of <Cmd>Controller

Modify: packages/api/src/ui/errors/index.ts
  Change: UiInterfaceErrors from `never` to `'EXPORT_LIMIT_EXCEEDED'`
```

**Principles** (from writing-plans):
- Design units with clear boundaries. Each file has one responsibility.
- Files that change together live together. Split by responsibility,
  not by technical layer.
- Follow existing patterns. If a file you're modifying has grown
  unwieldy AND the change calls for it, including a split in the
  plan is reasonable.

Ask: **"Does this file structure match what you have in mind?"**

Common redirects: "Make X a value-object, not entity" / "We don't
need a handler, this is synchronous" / "Use the existing query".

Loop until acknowledged. Only then proceed to Phase 3.

## Phase 3 — Write the Plan File

### Plan Document Header

Every plan MUST start with this header:

```markdown
# [Feature Name] — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** [One sentence — distilled from the spec's Goal section]

**Architecture:** [2-3 sentences about approach — how the pieces fit]

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, TanStack Router/Query, Zod, Tailwind

**Spec:** .specs/YYYY-MM-DD-<slug>-design.md
**Tasks:** <N>
**Estimated minutes:** <sum>

---
```

### Task Structure

> **Grammar is load-bearing — `scripts/graph/cli/plan-parser.ts` parses these
> markers; deviate and the Task parses to nothing (and `/build` sees an empty
> plan).** The exact rules:
> - Task heading: `## Task T<N>:` — IDs MUST be **`T`-prefixed** (`T1`, `T2`, `T3a`…). `## Task 1:` does NOT parse.
> - Step heading: `### Step T<N>.<K> — <title>` — a `###` heading, NOT a `- [ ] **Step**` bullet. Step bodies (test code, diffs, commands) live under the heading.
> - Files field: `**Files to write:**` (and optional `**Files to read:**`), each path in backticks. `**Files:**` does NOT parse.
> - Deps: `**Depends on:** T1, T2` or `**Depends on:** (none)` — references MUST be `T`-prefixed (the parser matches `T\d+`).
>
> **Every Task is a handoff — write it as one.** `/build` dispatches each Task to a SEPARATE,
> FRESH-CONTEXT worker subagent (parallel within a wave); the worker sees only the Task body, not
> this session's context. So the Task body IS the handoff, and its quality is load-bearing — this is
> measured, not stylistic: a single context building a 7+-deliverable slice drops the tail (stubs the
> last artifacts under budget pressure), while a fresh worker handed a PRECISE handoff (exact frozen
> identifiers, scope fences, gate) builds the tail the monolith dropped and respects the contract
> instead of rebuilding it. The `**Consumes (frozen):**`, `**Scope fence:**`, and `**Gate:**` fields
> are what make a Task safely dispatchable: name EXACT identifiers (`createPurchaseOrderMutationRequestSchema`,
> not "the create schema"), fence what's DONE vs OUT, and give the close-out command. Litmus: if you
> couldn't paste the Task body alone into a fresh `claude -p` and expect a canon-clean slice back, it
> isn't a sufficient handoff yet. (For ≥3-BC / ≥10-artifact plans, `/task-breakdown` Step 4.5 derives
> these per wave; for every other plan, fill them by hand — they are never optional.)

````markdown
## Task T<N>: [Behavior Name — not artifact name]

**Files to write:**
- Create: `exact/path/to/NewFile.ts`
- Modify: `exact/path/to/ExistingFile.ts` — [one-line description of what changes]
- Test: `exact/path/to/NewFile.test.ts`

**Files to read:**
- `exact/path/to/SiblingForContext.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /usecase, /controller, /schema, /test
**Depends on:** (none)
**Consumes (frozen):** the EXACT identifiers this Task imports verbatim from Phase 0 / earlier waves — SDK hooks/schemas/enums/event names (`useListPurchaseOrders`, `createPurchaseOrderMutationRequestSchema`, `PurchaseOrderRecordedEventName`), not prose ("the create hook"). If an identifier isn't frozen yet, this Task isn't dispatchable — make it `Depends on` the wave that freezes it. `(none)` only for a pure Phase-0 contract Task.
**Scope fence:** DONE elsewhere (consume, never rebuild/redefine) · OUT (sibling Tasks own it) — so a fresh-context worker doesn't re-derive what another wave froze.
**Gate:** the exact close-out command(s) this Task must pass before commit (`cd packages/app/react && bun x tsc --noEmit`, a detector, the test path).

### Step T<N>.1 — Write the failing test

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { ExportAppointments } from './ExportAppointments'

describe('ExportAppointments', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer
  let usecase: ExportAppointments

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer, ownerId: 'tenant' })
    usecase = testBed.resolve(ExportAppointments)
  })
  beforeEach(async () => { await testBed.reset() })
  afterAll(async () => { await testBed.destroy() })

  it('returns CSV with BOM and header for a doctor actor', async () => {
    // ... full test code, NOT "write a test that asserts..."
  })
})
```

### Step T<N>.2 — Run test to verify it fails

Run: `bun test packages/api/src/ui/usecases/appointments/ExportAppointments.test.ts`
Expected: FAIL with `Cannot find module './ExportAppointments'`

### Step T<N>.3 — Write minimal implementation

```typescript
// full implementation, NOT "implement the entity" prose
import { injectable } from 'tsyringe-neo'
import { Handler } from '@shared/types/Handler'
// ... etc
```

#### Scaffoldable artifacts — scaffold, then write the proposed file (preferred)

If `bun cli` can generate the artifact, emit a **scaffold step** then a **proposed-file step**.
The CLI creates the canonical skeleton (folder, imports, export shape, recipe blocks, story,
i18n stub); the plan then ships the **COMPLETE final file** as one ` ```typescript ` block, which
the executor **writes over** the scaffolded file. **No diffs, no SEARCH/REPLACE** — the plan
spits the proposed code and applying it is a plain file write. This applies to BOTH backends:

- **Backend** (`packages/api/**`): entity, value-object, usecase, controller, repository,
  schema, event, handler, service, middleware, enum, projection, projector, query.
- **Frontend** (`packages/app/**`): route, component, store, form, primitive — the unified
  scaffolder (`bun cli`, see `docs/CLI.md` + each frontend skill's `scaffold:` line). A
  **frontend-only plan is NOT an exception**: scaffold first, then write the proposed file. A
  hand-written whole-file for a scaffoldable artifact WITHOUT a preceding `bun cli` step is
  **rejected by `validate-plan` PR-27**.

Scaffolding establishes the **canonical shape** (e.g. `interface XProps extends
React.ComponentProps<'section'>`, `cn(...)`, recipe blocks; or a backend entity's
`BaseValueObject`/`Handler` idiom). Author the proposed file to MATCH that shape — open the
generated skeleton (or run the verb) during planning so the proposed code isn't a guess that
diverges from the CLI idiom.

Backend example:

````markdown
### Step T<N>.3 — Scaffold

```bash
bun cli entity sales Order --aggregate
```

### Step T<N>.4 — Proposed file (executor writes this over the scaffold)

```typescript
// packages/api/typescript/src/sales/entities/Order.ts — COMPLETE final file, matching the
// scaffolded entity shape (static schema, declaration-merged interface), with the behavior added.
import { ... } from '@codm/core-typescript'
// ...full entity including ship() ...
```
````

Frontend example:

````markdown
### Step T<N>.3 — Scaffold

```bash
bun cli component "(app)/dashboard" PixelFunnelSection --recipe=section --sdk=GetPixelFunnel --store=useTenancyStore --i18n=pixelFunnel
```

### Step T<N>.4 — Proposed file (executor writes this over the scaffold)

```typescript
// packages/app/react/src/routes/(app)/dashboard/-components/PixelFunnelSection/index.tsx — COMPLETE final file.
// KEEP the scaffolded shape: `interface PixelFunnelSectionProps extends React.ComponentProps<'section'>`,
// `{ className, ...props }`, `cn(...)`. Fix the scaffolder's guessed wiring (it may emit a wrong
// hook/store import) and fill the body.
import * as React from 'react'
// ...full section...
```
````

When the target file **already exists** (the spec described it but a parallel change has since
created it — e.g. a shared dashboard route), do NOT scaffold it: mark the task `Modify` and ship
the proposed file (or a one-line append for a large barrel/registry). Re-check existence in
Phase 1.3 against the CURRENT branch, not the spec's snapshot. PR-27 exempts files that already
exist on disk / in the graph.

`review-plan.ts` reviews the proposed ` ```typescript ` block as the file's final content
(attributed to the most recent `Create:`/`Modify:` path) — no skeleton reconstruction, no SEARCH
matching: the block IS the code.

### Step T<N>.4 — Run test to verify it passes

Run: `bun test packages/api/src/ui/usecases/appointments/ExportAppointments.test.ts`
Expected: PASS — 1 test passes

### Step T<N>.5 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors

### Step T<N>.6 — Commit

```bash
git add packages/api/src/ui/usecases/appointments/ExportAppointments.ts \
        packages/api/src/ui/usecases/appointments/ExportAppointments.test.ts
git commit -m "feat(ui): export appointments to CSV (Task T<N>)"
```
````

### Modify Operations — proposed file, not diffs

The plan ships the **proposed code**, not a diff to compute. **No ` ```diff ` blocks,
no `-`/`+` hunks, no SEARCH/REPLACE.** Pick by who owns the file:

- **Task owns the whole file** (a file it just scaffolded, or a small/medium file it fully
  rewrites) → ship the **complete final file** as a ` ```typescript ` block under a
  `Modify:`/`Create:` path. The executor writes it. This is the default — "spit the proposed code".
- **Small change to a LARGE file the Task does NOT own** (a registry, a barrel, an error union,
  a `GlobalErrorMapper` entry) → a **one-line description** of the edit. Full-file is unsafe here
  (the executor would clobber unrelated content), and a diff is unnecessary.

**Full proposed file (default):**

````markdown
### Step T<N>.X — Proposed file

```typescript
// packages/app/react/src/lib/format.ts — COMPLETE final file
export interface Money { amountCents: number; currency: string }
// ...everything the file should contain after the change...
```
````

**One-line description (only for a small edit to a large file the Task doesn't own):**

```markdown
### Step T<N>.X — Add error code

Modify `packages/api/src/ui/errors/index.ts`: change `UiInterfaceErrors` from
`never` to `'EXPORT_LIMIT_EXCEEDED'`.

Modify `packages/api/src/shared/utils/GlobalErrorMapper.ts`: after the
`ONBOARDING_NOT_COMPLETED` entry, add `EXPORT_LIMIT_EXCEEDED: HttpStatusCode.UNPROCESSABLE_ENTITY,`.
```

**Never:**
- Emit a ` ```diff ` block or SEARCH/REPLACE — the plan ships final code, not deltas.
- Ship a full-file block for a large file the Task doesn't own (clobbers unrelated content) —
  use the one-line description instead.

### Bite-Sized Task Granularity

Each step is one action (2-5 minutes):
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Write minimal implementation" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

For multi-layer Tasks (entity + usecase + controller in one behavior),
each layer gets its own inner test → impl → verify cycle. The
**outer test** turns green when all layers are wired.

**Anti-pattern: horizontal slicing.** Do NOT create per-artifact
Tasks (T1=entity, T2=repo, T3=usecase, T4=controller). When tests
are split from behavior, they assert data shape instead of capability;
they pass while the user-facing behavior breaks. **One Task = one
observable behavior**, spanning whatever artifacts the behavior
requires.

**Invariants undetectable by the happy-path become isolated Tasks:**

- Security / authorization (multi-actor leaks)
- Frontend security (sensitive data in `localStorage` / DOM / payload)
- Idempotency (retry must not duplicate)
- State conflicts (cancel a cancelled)
- Race conditions (concurrent ops)

Each gets its own outer test that targets the specific invariant.

### Contract Lock

For every Task that creates/modifies a controller or schema, insert
a Contract Lock task immediately downstream:

> `T<M>` is the next concrete task id (e.g. if the controller Task is `T5`,
> this is `T6`) — `T<N+1>` is shorthand, write the actual integer.

````markdown
## Task T<M>: Contract Lock — SDK regen

**Files to write:**
- Regen: `packages/api/src/api/openapi.json`
- Regen: `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T<N>

### Step T<M>.1 — Regenerate OpenAPI + SDK

```bash
bun emit-openapi && bun sdk
```

### Step T<M>.2 — Verify regen produced expected artifacts

```bash
git diff --stat packages/client/dist/ packages/api/src/api/openapi.json
```

Expected: openapi.json changed; `packages/client/dist/` files changed
(new export/operation/hook for the new endpoint).

### Step T<M>.3 — Type-check after regen

Run: `bun tsc`
Expected: 0 errors across all workspaces.

### Step T<M>.4 — Commit

```bash
git add packages/api/src/api/openapi.json packages/client/dist/
git commit -m "chore(sdk): regenerate openapi+sdk for <feature> (Task T<M>)"
```
````

### Migration Ordering

For Drizzle schema changes, the migration Task precedes any
repository/usecase Task that reads or writes the changed column.

## Phase 4 — Self-Review

After writing the plan, look at the spec with fresh eyes and check
the plan against it.

### 1. Spec coverage

Walk each AC in the spec. Can you point to a Task that implements
it? List any gaps. If a Task covers an AC, the AC mapping in Final
Validation should already cite that Task's test path.

### 2. Placeholder scan

Search your plan for red flags. These are **plan failures** — never
write them:

- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" — repeat the code; the executor may read out of order
- "Follow the pattern of X" / "see X for the convention" — inline the
  change; if you read X during planning, you absorbed it
- Steps that describe what to do without showing how
- References to types, functions, or methods not defined in any Task

### 3. Type / signature consistency

Do the types, method signatures, and property names you used in later
Tasks match what you defined in earlier Tasks? A function called
`clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

### 4. Anti-invention check (domain extension)

Walk every Task. Each must trace to one of:

1. **An AC in the spec** — the Task makes a previously-failing AC pass.
2. **A Decision in the spec** — the Task honors a HOW commitment.
3. **An obvious technical necessity** to satisfy an AC or Decision
   (e.g., the AC asserts persistence ⇒ a migration is technically
   necessary).
4. **A Phase 2 File Structure entry the user explicitly accepted.**

Tasks that fail all four are **invention** and must be cut. Common
invented Tasks to cut:

- **Extra abstractions** — `<X>Service` / `<X>Helper` / `<X>Factory`
  / `<X>Wrapper` the spec didn't ask for. Inline the logic instead.
  Example: a `CSVSerializer` abstract class + concrete + DI binding
  for a feature where the spec just says "export as CSV". **15 lines
  inline beats 200 lines of DI.**
- **Domain events the spec said NOT to create** — re-read the spec's
  Decisions. If a Decision explicitly says "logger, not event",
  do NOT invent the event.
- **Test backdoors** in production code — `__testOverrideLimit`,
  `__bypassAuth`, env-flagged shortcuts. If a test needs a back
  door in prod code, the test design is wrong or the test
  shouldn't exist.
- **NFR ACs** not in the spec — latency, throughput, a11y, i18n,
  rate-limit, audit. `/brainstorm` should have blocked these
  upstream; if they slipped through, refer back.
- **Cross-cutting Tasks** the spec didn't request — i18n keys for
  every error string, accessibility audits, observability spans —
  unless the codebase already enforces them for similar features.

**YAGNI guardrail.** If you're tempted to introduce an abstraction
the spec doesn't require AND the codebase doesn't already enforce
for similar features — **don't**. Inline it. The simplest code that
works beats the "proper" version the spec didn't ask for.

### 5. Determinism check (domain extension)

- **D-1** Every new `entity` has `repository` + `db-modelling` + `migration` in the same context.
- **D-2** Every new `controller` has at least one input schema and one output schema.
- **D-3** Every `handler` subscribes to exactly one event.
- **D-4** Every UI Story has a `route`.
- **D-5** Every controller/schema change is followed by an SDK Contract Lock Task.
- **D-6** No cross-context import — integration event or shared schema only.
- **D-7** Every spec AC maps to ≥1 Task with a test that asserts it.

### 6. Graph validation

```bash
bun scripts/graph/cli/index.ts validate-plan .plans/<file>.md
```

Exit 0 → ready. Non-zero → fix and re-run. Checks:
- **PR-18** Every path in `Files:` not marked new resolves to an existing graph node.
- **PR-19** Every `Depends on` matches a graph upstream edge between Task-written nodes.
- **PR-20** Each Task's `Skills:` list matches the kinds being written.
- **PR-26** Every non-done Task with steps declares `**Files to write:**`.
- **PR-27** Every NET-NEW scaffoldable artifact — backend (entity, value-object, usecase, query,
  controller, repository, schema, event, handler, service, middleware, enum, projection, projector
  under `packages/api/**`) AND frontend (route, component, store, form, primitive under
  `packages/app/**`) — has a matching `bun cli <verb>` scaffold step in its Task. Modifying a file
  that already exists, or deleting/regenerating one, is exempt. This is the gate that makes
  scaffold-first non-optional for both backends.
- **PR-28** Every non-done Task that `Depends on` another Task carries its load-bearing handoff:
  a non-empty `**Consumes (frozen):**` (the EXACT identifiers it imports from upstream) AND a
  non-empty `**Gate:**` (close-out command). `/build` dispatches each Task to a fresh-context
  worker that sees only the Task body — a dependent Task with no handoff makes the worker
  re-derive and drop the tail. Phase-0 contract Tasks / independent leaves (no `Depends on`) are
  exempt — they freeze the contract, they don't consume one.

**Parse sanity (mandatory — `validate-plan` passes vacuously on 0 tasks):**

```bash
bun scripts/graph/cli/index.ts parse-plan .plans/<file>.md --json \
  | jq '.tasks | length'
```

This number MUST equal the count of `## Task` headings you authored. If it
prints `0` (or fewer than expected), the plan markers don't match the
`plan-parser.ts` grammar — re-check the Task-Structure grammar rules above
(`## Task T<N>:`, `### Step T<N>.<K> —`, `**Files to write:**`, `T`-prefixed
`Depends on`). A plan that parses to 0 tasks is **silently unbuildable** — `/build`
will compute an empty wave set. Fix before handoff.

Fix any issues inline. No need to re-review — just fix and move on.

### 7. Skill-registry review of embedded code (domain extension)

```bash
bun scripts/review-plan.ts .plans/<file>.md --parallel 8
```

Extracts every fenced TS/tsx code block in the plan, attributes each to
the most recent `Create:` / `Modify:` path declaration in the same Task,
materializes them at `.review-plan-tmp/<path>`, and runs the same
checklist evaluator as `scripts/review.ts` against each skill's
`registry.yaml` (patterns + bad practices + cross-cutting).

Triage protocol — for each `F` (fail) finding, classify as:

1. **Real defect** — the snippet genuinely violates a project convention
   that would also fail at code-review time after `/build` (e.g. wrong
   mutation pattern, missing required field on a controller, mock binding
   in a real registry). **Fix the plan inline before `/build`.**
2. **Snippet-mode false positive** — the rule needs whole-file context
   that the Modify snippet doesn't carry (e.g. `CMP-01 named export
   function` flagged on a partial component diff where the `export
   function` declaration lives outside the snippet, or `routeApi.useSearch`
   flagged because the call site lives above the inserted block).
   Note in chat and move on.
3. **Skill misclassification** — the path resolves to a skill that doesn't
   match the artifact's actual role (rare; investigate the path or rename
   the file in the plan).

Skip without action: `.test.ts`/`.spec.ts` files, files under paths with
no skill rule (e.g. `packages/app/src/lib/`), and pure barrel modifications.
The reviewer already filters these.

Fix real defects inline; do not re-run unless you changed the snippet
content. Move on to Phase 5.

## Phase 5 — Handoff

Output:

```
Plan ready: .plans/<file>.md
Tasks: <N>, Critical path: T1 → T2 → ... → Tn
Estimated: <X> min

Next: /build .plans/<file>.md
```

Do NOT invoke `/build` yourself.

## Final Validation Block (mandatory tail of every plan)

Every plan ends with this block:

````markdown
## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun test affected --base=dev` — affected tests pass
- [ ] `bun e2e --grep "<feature-slug>"` — E2E covers the feature
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `packages/api/src/<ctx>/.../X.test.ts:"<test name>"`
  - AC-2 → `packages/e2e/tests/<slug>.spec.ts:"<test name>"`
  - ...

## Notes

<env vars, libraries to add, special permissions — anything the
implementing agent needs that doesn't fit a Task body.>
````

## Remember

- **Exact file paths** always.
- **Complete code in every step** — if a step changes code, show
  the code. But for `Modify` operations, **show only the diff or
  describe in one line**. NEVER paste the whole file for a small change.
- **Exact commands** with expected output verbatim.
- **DRY, YAGNI, TDD, frequent commits.**
- **No Reference blocks. No self-correction trails. No "follow the
  pattern of X".** If you read X during planning, you absorbed the
  convention — the plan ships the new code, not a quote of X.

## Relevant Files

Read for context (in this order):

- `/tmp/plan-graph.json` — Phase 1 graph snapshot
- `$ARGUMENTS` — the approved spec
- `CLAUDE.md` — backend implementation order, DDD rules, event architecture
- `.claude/registry.yaml` — file patterns, BPs
- `.claude/agents/README.md` — agent catalog
- `.claude/skills/<each-candidate-skill>/SKILL.md` — full file per skill (canonical structure + composition pattern when central)
- One sibling artifact per kind in the target context — for the planner's understanding; the sibling does NOT go into the plan as a separate block.

Do NOT re-read:

- Skill `registry.yaml` files when `payload.registries[skill]` from the graph snapshot has them.
- Bounded-context source folders to "see what's there" — the graph already knows.

Write only:

- `.plans/YYYY-MM-DD-<slug>.md`

Never write:

- Code, schema, migration, scaffold during `/plan`.

## Anti-Patterns (do NOT do)

- ❌ **Reference blocks before steps.** Code lives IN steps. If you
  read a sibling during planning, you absorbed the convention; the
  plan output ships the new code only — not a quote of the sibling.
- ❌ **Self-correction trails.** *"[Approach A — bad] ❌ … [Approach
  B — good] ←"*. Pick the right one and write it. The trail of bad
  ideas belongs in a commit message or in `/brainstorm`'s Unforeseen
  Angles, not in the plan.
- ❌ **Whole-file `Modify` pastes.** A 20-line file rendered to
  change one line on line 5. Use diff blocks or one-line descriptions.
- ❌ **Invented abstractions** the spec didn't ask for. Services,
  helpers, factories, events, wrappers when inline code would do.
- ❌ **Test backdoors** in production code. `__testOverrideLimit`,
  env-flagged shortcuts. If you need this, the test design is wrong.
- ❌ **NFR ACs** not in the spec. Latency / a11y / i18n / rate-limit
  not asked for.
- ❌ **Horizontal slicing.** One Task per artifact kind. Behavior is
  the unit; the artifacts the behavior needs are inner cycles inside
  one Task.
- ❌ **Naming Tasks after artifacts.** "Create Appointment entity"
  is noise; "Doctor schedules an appointment" is the contract.
- ❌ **"Follow the pattern of X"** instead of pasting the change.
- ❌ **Writing the plan without Phase 2 user ack.** The user gets
  one chance to redirect before the plan locks.
- ❌ **Inventing commands.** Every `bun ...` must exist in `package.json`
  or `bun cli`.
- ❌ **Implementer = reviewer.** Different agents.
- ❌ **Forgetting Contract Lock** after a controller/schema change.
- ❌ **Re-reading siblings at execution time.** You read them during
  planning. Inline what the new code needs to look like; don't tell
  the executor "go check X".
- ❌ **Pasting a whole-file `typescript` block for an artifact `bun cli`
  can scaffold.** Scaffold it, then ship only the `edit` delta — the CLI
  owns the boilerplate (Phase B).

## Spec

$ARGUMENTS
