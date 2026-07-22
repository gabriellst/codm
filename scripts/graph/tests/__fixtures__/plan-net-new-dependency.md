# Net-New Dependency Plan — Fixture for PR-19 validation

**Goal:** Test that PR-19 skips depends_on pairs whose target files are net-new (not yet in the
graph), while still flagging a pure-modify chain that has no graph upstream edge.
**Spec:** .specs/does-not-matter.md
**Bounded Context(s):** finance
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
- Modify: `packages/api/typescript/src/finance/entities/Taxes.ts`

## Task T3: same shape as T2 but also writes a net-new file (FIX — PR-19 skips)

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Skills:** /entity
**Depends on:** T1
**Files to write:**
- Modify: `packages/api/typescript/src/finance/entities/Fees.ts`
- Create: `packages/api/typescript/src/finance/newledger/index.ts`

## Final Validation

- [ ] `bun tsc` — full type check
