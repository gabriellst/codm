# Generator Capability Plan — Fixture for PR-27 lang-capability validation

**Goal:** Test that PR-27 exempts a net-new scaffoldable artifact in a language with no `bun cli`
generator (declared via GENERATOR_SUPPORT), while still flagging one in a language that has a
generator and skipped the scaffold step (the falsifier — proves the fix didn't neuter the rule).
**Spec:** .specs/does-not-matter.md
**Bounded Context(s):** billing
**Tech Stack:** TypeScript, Go, Bun
**Tasks:** 2 in 1 wave
**Estimated minutes:** 2

## Waves Overview

| Wave | Tasks | Parallel? | Contract Lock? |
|------|-------|-----------|-----------------|
| 0    | T1,T2 | yes       | yes             |

## Task T1: new Go service, no scaffold step (FIX — PR-27 exempt, Go has no generator)

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Skills:** /service
**Depends on:** (none)
**Files to write:**
- Create: `packages/api/go/internal/billing/services/invoice_service.go`

### Step T1.1 — hand-author the service

```go
package services
```

## Task T2: new TS entity, no scaffold step (CONTROL — PR-27 still flags, TS has a generator)

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Skills:** /entity
**Depends on:** (none)
**Files to write:**
- Create: `packages/api/typescript/src/billing/entities/Invoice.ts`

### Step T2.1 — hand-author the entity

```typescript
export class Invoice {}
```

## Final Validation

- [ ] `bun tsc` — full type check
