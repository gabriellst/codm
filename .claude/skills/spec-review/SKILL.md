---
name: spec-review
description: Review implementation plans before coding with strict architecture compliance. Use when validating whether a spec or plan aligns with project architecture docs and conventions. Use this skill before starting any implementation to catch design issues early.
---

# Review Implementation Plan

Use this skill to review an implementation plan rigorously before code is written.

## Goal

Detect plan issues early:
- architecture violations
- contract mismatches between layers
- SDK/type/hook assumptions that do not match reality
- missing mandatory steps and sequencing

## Source Order (Required)

Read sources in this order:
1. `docs/BACKEND.md` + `docs/FRONTEND.md` — architectural references
2. `CLAUDE.md` — first-class citizens overview
3. the relevant skill's `registry.yaml`
4. Current repository files touched by the plan
5. Generated SDK surface (`client/dist/app/index.d.ts` + relevant hook/type files)

If rules conflict, report `Architecture Ambiguity` with a recommended direction.

## When to Use

- User asks to review an implementation plan
- User asks if a plan is safe to execute in this monorepo
- User asks for a review prompt/template for plan validation
- `/plan` needs architectural validation before spec sign-off

## When NOT to Use

- Reviewing already-implemented code diffs (use `/review`)
- Writing implementation code directly

## Review Protocol

### Step 1: Normalize the Plan

Break plan into explicit items:
- phase
- step id
- layer (`backend-contract`, `sdk`, `frontend-route`, `frontend-component`, `verification`)
- expected artifact (file/hook/type/command)

If file paths are missing, mark assumption explicitly.

### Step 1.5: Ask Clarifying Questions Early

Before deep validation, ask targeted questions whenever assumptions remain. Prioritize questions about:
- scope boundaries
- fields/contracts not explicitly defined
- ownership decisions (backend vs frontend computation)
- acceptance criteria that are implied but not stated

Do not finalize review as "ready" while high-impact assumptions remain unanswered.

### Step 2: Extract Mandatory Rules

From docs, extract only rules relevant to the plan. Always include:
- contract-first workflow and dependency direction
- route/page/section/component ownership
- SDK as source of truth
- URL search params rules
- required route safeguards (`errorComponent`, route tree generation)
- verification gates (lint/build/tests)

### Step 3: Map Plan Items to Rules

For each plan item:
- link item to required rule(s)
- identify violations and omissions
- identify fragile assumptions

### Step 4: Reality Check Against Repository

Validate plan assumptions against current code:
- controller schemas and current contracts
- existing route/component structure
- available SDK exports (hooks/types/schemas/enums/signatures)
- barrel exports and router wiring

Never assume names exist because they are in the plan.

### Step 5: Cross-Layer Compatibility Checks (Mandatory)

Run these checks explicitly:
1. Backend contract vs frontend form/query fields
2. Planned SDK hook/type names vs actual generated naming conventions
3. Query/mutation call signatures vs SDK usage patterns
4. Consistent field names across endpoints (same entity)
5. Route-level fetch ownership (no component-level fetch/params usage)
6. Search schema extension from SDK schema (not replacement)
7. Search params passed directly to SDK query hook when required
8. Skeleton/export expectations for sections
9. Icon/mask/util reuse rules
10. Route tree + SDK regeneration steps included
11. Verification includes lint/build/tests (not partial)
### Step 6: Severity Classification

Use this rubric:
- `Critical`: Plan cannot be implemented correctly as written, or violates high-severity architecture/FP rule
- `Moderate`: High risk of regression, missing required step, or strong inconsistency
- `Low`: Non-blocking inconsistency, convention drift, or incomplete detail

### Step 7: Refactor Loop Until Spec Closure

When this skill is used inside `/plan`:
1. Run review on current plan/spec draft
2. Refactor plan based on findings
3. Ask follow-up questions for unresolved assumptions
4. Re-review the updated plan
5. Repeat until:
   - no critical gaps remain
   - no unresolved high-impact assumptions remain
   - stories/criteria map to a complete implementation sequence

## Output Contract (Required)

Return findings first, ordered by severity.

### Section Order
1. `Findings (ordered by severity)`
2. `Open Questions / Assumptions`
3. `What Is Already Aligned`
4. `Suggested Plan Corrections` (short, actionable)

### Finding Format (Required)

Each finding must contain:
1. Severity (`Critical | Moderate | Low`)
2. Problem statement
3. Why it matters (behavior/architecture risk)
4. Rule reference (`docs/...` and `bp-xx` when applicable)
5. Concrete impacted paths/symbols
6. Minimal correction to the plan

If no findings:
- state `No findings`
- list residual risks/testing gaps

## Command Playbook (Optional, Fast Path)

Use these commands to ground the review:

```bash
# Find relevant FP rules quickly
rg -n "^  - id: " .claude/skills/*/registry.yaml

# Find specific rule references used by the plan
rg -n "bp-01|bp-02|bp-03" .claude/skills/route/registry.yaml

# Inspect target files with stable line numbers
nl -ba <file> | sed -n '1,240p'

# Validate SDK exports and signatures
rg -n "use[A-Za-z]+|QueryParamsSchema|MutationRequestSchema" client/dist/app/index.d.ts
nl -ba client/dist/app/hooks/<...>.d.ts | sed -n '1,220p'
nl -ba client/dist/app/types/<...>.d.ts | sed -n '1,220p'
```

## Prompt Generator Mode

If user asks for a reusable prompt, generate a prompt that enforces:
- doc-first rule extraction
- plan-to-rule mapping
- repository reality checks
- severity-ordered findings with references
- explicit corrections
- clarification questions before final approval

Keep generated prompts concise and operational.

## Quality Bar

- Do not approve a plan based on style alone.
- Prioritize blockers and hidden incompatibilities.
- Be explicit about assumptions.
- Prefer small concrete corrections over broad rewrites.
