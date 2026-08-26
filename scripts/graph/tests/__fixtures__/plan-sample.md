# Sample Plan — Fixture for the plan parser

**Goal:** Give `parsePlan` a document THIS repo owns, exercising every field the parser extracts.
**Spec:** scripts/graph/tests/__fixtures__/spec-sample.md
**Bounded Context(s):** tooling
**Tech Stack:** TypeScript, Bun
**Tasks:** 6 in 3 waves
**Estimated minutes:** 0

> Replaces `.plans/2026-05-13-agentic-coding-system-bootstrap.md`, which never existed in this repo.
> The suite self-skipped when it was missing (`describeIf = hasFixture ? describe : describe.skip`),
> so the absence was invisible for as long as nothing ran the suite — a skip that hid a dead pointer.

## Waves Overview

| Wave | Tasks    | Parallel? | Contract Lock? |
|------|----------|-----------|-----------------|
| 0    | T0,T1    | no        | yes             |
| 1    | T2,T3    | yes       | no              |
| 2    | T4,T5    | yes       | no              |

## Task T0: freeze the section vocabulary (DONE)

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Skills:** /schema
**Depends on:** (none)
**Files to write:**
- Create: `scripts/graph/tests/__fixtures__/t0-vocabulary.ts`

### Step T0.1 — write down the section names

The vocabulary is the set of `##` headings the parsers address by name. Freezing it first is what
lets the two parsers be written in parallel without agreeing on anything else.

## Task T1: parse a spec into typed sections

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Skills:** /schema
**Depends on:** (none)
**Files to write:**
- Modify: `scripts/graph/cli/spec-parser.ts`

### Step T1.1 — write the failing test first

Create `scripts/graph/tests/spec-parser.test.ts` and point it at a fixture this repo owns, never at
a document in `.specs/` — a parser test that reads a living document fails the day somebody edits
that document for an unrelated reason, and that failure teaches nothing about the parser. The test
asserts the status, the bounded context, and the exact count of decisions, components and
acceptance criteria.

- [ ] the test names the fixture path explicitly
- [ ] the counts are exact, not `>=`

### Step T1.2 — make it pass

Address sections by heading, fold indented continuations into the numbered line above them, and
return empty arrays for sections the document does not have.

- [ ] `bun test scripts/graph/tests/spec-parser.test.ts`

## Task T2: parse a plan into typed Tasks

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Skills:** /schema
**Depends on:** T1
**Consumes (frozen):** parseSpec, SpecStatus
**Scope fence:** DONE: the spec parser (T1) consume only · OUT: validation rules (T4)
**Gate:** bun test scripts/graph/tests/plan-parser.test.ts
**Files to write:**
- Create: `scripts/graph/tests/__fixtures__/t2-plan-shapes.ts`

### Step T2.1 — one step per heading

A `### Step` heading starts a step; a bullet inside it does not. Collapsing bullets into steps was
the bug that made two steps share an id.

## Task T3: keep the checks attached to their step

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Skills:** /schema
**Depends on:** T1
**Consumes (frozen):** parseSpec
**Scope fence:** DONE: the spec parser (T1) consume only · OUT: the plan shapes (T2)
**Gate:** bun test scripts/graph/tests/plan-parser.test.ts
**Files to write:**
- Create: `scripts/graph/tests/__fixtures__/t3-checks.ts`

### Step T3.1 — checkboxes belong to the step above them

## Task T4: validate a plan against the graph

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Skills:** /schema
**Depends on:** T2
**Consumes (frozen):** parsePlan, PlanTask
**Scope fence:** DONE: the plan parser (T2) consume only · OUT: the report format (T5)
**Gate:** bun test scripts/graph/tests/validate-plan-cmd.test.ts
**Files to write:**
- Create: `scripts/graph/tests/__fixtures__/t4-rules.ts`

### Step T4.1 — a missing graph is LOUD

## Task T5: report the findings (DONE)

**Agent:** backend-developer (was: tooling-developer)
**Reviewer:** code-reviewer
**Status:** done
**Depends on:** T4
**Consumes (frozen):** validatePlan, Finding
**Scope fence:** DONE: the rules (T4) consume only · OUT: anything that writes to the graph
**Gate:** bun test scripts/graph/tests/validate-plan-cmd.test.ts
**Skills:** /schema
**Files to write:**
- Create: `scripts/graph/tests/__fixtures__/t5-report.ts`

### Step T5.1 — one line per finding

## Final Validation

- [ ] `bun tsc` — full type check
