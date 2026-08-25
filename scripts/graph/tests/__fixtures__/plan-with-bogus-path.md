# Bogus Plan — Fixture for PR-18 validation

**Goal:** Test that a non-existent modify path is flagged by PR-18.
**Spec:** .specs/does-not-matter.md
**Bounded Context(s):** patient
**Tech Stack:** TypeScript, Bun
**Tasks:** 1 in 1 wave
**Estimated minutes:** 1

## Domain Mapping (snapshot from Phase 2)

| # | Action | Skill | Name | Context | Story / Decision / AC |
|---|--------|-------|------|---------|------------------------|
| 1 | modify | /entity | Patient_DOES_NOT_EXIST | patient | Story 1 |

## Waves Overview

| Wave | Tasks | Parallel? | Contract Lock? |
|------|-------|-----------|-----------------|
| 1    | T1    | no        | no              |

## Task T1: modify bogus entity

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Skills:** /entity
**Depends on:** (none)
**Estimated minutes:** 1
**Files to write:**
- `packages/api/src/patient/entities/Patient_DOES_NOT_EXIST.ts`

**Files to read:**
- `packages/api/src/patient/entities/Patient.ts`

## Final Validation

- [ ] `bun tsc` — full type check
