# Net-New Dependency Plan — Fixture for PR-19 validation

**Goal:** Test that PR-19 skips depends_on pairs whose target files are net-new (not yet in the
graph), while still flagging a pure-modify chain that has no graph upstream edge.

> RE-PATHED 2026-08-14: this fixture named a `finance` bounded context, which does NOT exist in this
> repo — so every `Modify` resolved to no graph node, PR-19 read the whole plan as net-new and
> flagged nothing, and the test failed for a reason that had nothing to do with PR-19. The paths are
> now real entities of this tree, which is what makes the pure-modify chain a pure-modify chain.
**Spec:** .specs/does-not-matter.md
**Bounded Context(s):** tooling
**Tech Stack:** TypeScript, Bun
**Tasks:** 3 in 2 waves
**Estimated minutes:** 3

## Waves Overview

| Wave | Tasks | Parallel? | Contract Lock? |
|------|-------|-----------|-----------------|
| 0    | T1    | no        | yes             |
| 1    | T2,T3 | yes       | no              |

## Task T1: touch an existing tracked entity

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Skills:** /entity
**Depends on:** (none)
**Files to write:**
- Modify: `packages/api/typescript/src/auth/entities/User.ts`

## Task T2: pure-modify chain with no graph edge (CONTROL — PR-19 flags)

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Skills:** /entity
**Depends on:** T1
**Files to write:**
- Modify: `packages/api/typescript/src/workspace/entities/Workspace.ts`

## Task T3: same shape as T2 but also writes a net-new file (FIX — PR-19 skips)

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Skills:** /entity
**Depends on:** T1
**Files to write:**
- Modify: `packages/api/typescript/src/issue/entities/Issue.ts`
- Create: `packages/api/typescript/src/issue/newledger/Ledger.ts`

## Final Validation

- [ ] `bun tsc` — full type check
