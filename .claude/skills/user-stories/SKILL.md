---
name: user-stories
description: Generate user stories with acceptance criteria from a feature request or requirement. Use when transforming business needs into structured, testable stories. Use this skill for any feature specification that needs to be broken into implementable stories with clear acceptance criteria.
---

# Generate User Stories

Transforms a feature request or requirement description into structured user stories with acceptance criteria.

## When to Use

- Receiving a new feature request from a stakeholder or PRD
- Breaking down a large requirement into testable stories
- Defining scope and acceptance criteria before technical work begins

## When NOT to Use

- Architectural component breakdown (use `/plan`)
- Implementation sequencing (use `/task-breakdown`)
- Reviewing an existing plan (use `/spec-review`)

## Prerequisites

- Feature request, PRD excerpt, or natural language description
- Understanding of the project's domain and bounded contexts

## Output

User stories in `US-XXX` format with acceptance criteria. Nothing else — no component tables, no sequencing, no architecture.

## Process

### Step 1: Understand the Requirement

Read the input and extract:

- **Domain**: What bounded context does this belong to?
- **Actors**: Who are the users/systems involved?
- **Actions**: What operations need to be performed?
- **Data**: What information is being created/modified/read?
- **Rules**: What business rules apply?

Ask clarifying questions whenever ambiguity exists. Do not proceed with hidden assumptions when a question can resolve scope or contract uncertainty.

### Step 2: Generate User Stories

Create stories following this format:

```markdown
## User Stories

### US-001: [Story Title]
**As a** [actor/role]
**I want to** [action/goal]
**So that** [benefit/value]

**Acceptance Criteria:**
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

**Notes:**
- [Any additional context, edge cases, constraints]

### US-002: [Story Title]
...
```

### Step 3: Validate Completeness

Check each story against:

- [ ] Actor is a real role in the system (not generic "user" when specificity matters)
- [ ] Action is specific and testable
- [ ] Benefit is business-focused (not implementation detail)
- [ ] Acceptance criteria are measurable and verifiable
- [ ] Edge cases documented in Notes
- [ ] Stories are independent where possible (no hidden coupling)
- [ ] No acceptance criterion implies a specific implementation

### Step 4: Ask Clarifying Questions

Before finalizing, surface targeted questions about:

- **Scope boundaries**: What's explicitly excluded?
- **Actor permissions**: Who can do what?
- **Data rules**: Required fields, validation constraints, uniqueness
- **State transitions**: Valid transitions and who can trigger them
- **Error scenarios**: What happens when things go wrong?

Do not finalize stories while high-impact assumptions remain unanswered.

## Output Template

```markdown
# User Stories: [Feature Name]

## Summary
[1-2 sentence description of the feature]

## User Stories

### US-001: [Story Title]
**As a** [role]
**I want to** [action]
**So that** [benefit]

**Acceptance Criteria:**
- [ ] [Criteria]

**Notes:**
- [Context]

---

## Open Questions
- [ ] [Question 1 — impact: scope/contract/acceptance]
- [ ] [Question 2]

## Assumptions
- [Assumption 1 — risk level: low/medium/high]
```

## Checklist

- [ ] All actors identified from the requirement
- [ ] Each story has clear, testable acceptance criteria
- [ ] Stories are independent where possible
- [ ] Edge cases and error scenarios considered
- [ ] Open questions surfaced with impact classification
- [ ] Assumptions documented with risk level
- [ ] No architectural or implementation details leaked into stories

## References

- `docs/BACKEND.md` — Backend domain context
- `docs/FRONTEND.md` — Frontend patterns
