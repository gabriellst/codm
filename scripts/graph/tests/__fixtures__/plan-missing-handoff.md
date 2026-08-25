# Handoff Plan — Fixture for PR-28 validation

**Goal:** Test that a dependent Task missing its load-bearing handoff is flagged by PR-28.
**Spec:** .specs/does-not-matter.md
**Bounded Context(s):** procurement
**Tech Stack:** TypeScript, Bun
**Tasks:** 3 in 2 waves
**Estimated minutes:** 3

## Domain Mapping (snapshot from Phase 2)

| # | Action | Skill | Name | Context | Story / Decision / AC |
|---|--------|-------|------|---------|------------------------|
| 1 | create | /event | PurchaseOrderRecorded | procurement | Story 1 |

## Waves Overview

| Wave | Tasks | Parallel? | Contract Lock? |
|------|-------|-----------|-----------------|
| 0    | T1    | no        | yes             |
| 1    | T2,T3 | yes       | no              |

## Task T1: freeze the purchase-order contract

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Skills:** /event
**Depends on:** (none)
**Files to write:**
- Create: `packages/contracts/wire/events/po-lib.ts`

### Step T1.1 — author the event

```typescript
export const x = 1
```

## Task T2: list section (BAD — depends on T1, no handoff)

**Agent:** frontend-developer
**Reviewer:** code-reviewer
**Skills:** /component
**Depends on:** T1
**Files to write:**
- Create: `packages/app/react/src/lib/po-section-helper.ts`

### Step T2.1 — build the section helper

```typescript
export const y = 2
```

## Task T3: create dialog (GOOD — depends on T1, full handoff)

**Agent:** frontend-developer
**Reviewer:** code-reviewer
**Skills:** /form
**Depends on:** T1
**Consumes (frozen):** useCreatePurchaseOrder, createPurchaseOrderMutationRequestSchema
**Scope fence:** DONE: contract+SDK (T1) consume only · OUT: the list section (T2)
**Gate:** cd packages/app/react && bun x tsc --noEmit
**Files to write:**
- Create: `packages/app/react/src/lib/po-dialog-helper.ts`

### Step T3.1 — build the dialog helper

```typescript
export const z = 3
```

## Final Validation

- [ ] `bun tsc` — full type check
