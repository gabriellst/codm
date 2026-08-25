---
name: prd
description: Generate a PRD.md (Product Requirements Document) from a product idea or feature description. Use when starting a new project or defining product scope before implementation. Use this skill for any product specification that needs structured requirements, personas, user flows, and success metrics.
---

# Generate PRD (PRD.md)

Generates a complete `PRD.md` Product Requirements Document from a product idea, feature description, or stakeholder conversation.

## Why This Exists

Every feature depends on well-defined product requirements. Without `PRD.md`, teams build features based on assumptions instead of explicit decisions. This skill establishes the product scope that all user stories, tech specs, and implementations reference.

## When to Use

- Starting a new project and defining what to build
- Defining a major feature or product area before technical work
- No `PRD.md` exists and `/user-stories` or `/plan` need product context
- Stakeholder provides a high-level idea that needs structured requirements

## When NOT to Use

- `PRD.md` already exists and just needs small updates (edit directly)
- Breaking down existing requirements into stories (use `/user-stories`)
- Architectural decisions (use `/plan`)
- Implementation work

## Prerequisites

- A product idea, feature description, or stakeholder conversation
- Understanding of the target users and their problems
- Access to the user/stakeholder for clarifying questions

## Key Principles

1. **Problem-First**: Start with the problem, not the solution
2. **User-Centric**: Every requirement traces back to a user need
3. **Scope-Bounded**: Explicitly state what's in and out of scope
4. **Measurable**: Success criteria must be verifiable
5. **Collaborative**: Surface questions early — don't assume

## Process

### Step 1: Understand the Product Idea

Extract from the input:

- **Problem**: What problem are we solving? Who has this problem?
- **Users**: Who are the primary and secondary users?
- **Context**: What's the business context? Why now?
- **Constraints**: Budget, timeline, technical, regulatory constraints?
- **Existing solutions**: What do users do today? What's lacking?

Ask clarifying questions whenever ambiguity exists. Do not proceed with hidden assumptions.

### Step 2: Define the Product Vision

Establish the high-level direction:

```markdown
## Vision

**Problem Statement:** [1-2 sentences describing the core problem]

**Target Users:** [Primary and secondary user personas]

**Value Proposition:** [What unique value does this product deliver?]

**Success Metrics:** [How do we measure success?]
```

### Step 3: Define Functional Requirements

List what the system must do, organized by user workflow:

```markdown
## Functional Requirements

### FR-001: [Requirement Title]
**Priority:** Must Have | Should Have | Nice to Have
**Description:** [What the system must do]
**User Workflow:** [How the user interacts with this]
**Acceptance Criteria:**
- [ ] [Criterion 1]
- [ ] [Criterion 2]
```

Priority definitions:
- **Must Have**: Product is not viable without this
- **Should Have**: Important but product can launch without it
- **Nice to Have**: Desirable but can be deferred

### Step 4: Define Non-Functional Requirements

Cover system qualities:

```markdown
## Non-Functional Requirements

### Performance
- [Response times, throughput, capacity]

### Security
- [Authentication, authorization, data protection]

### Accessibility
- [WCAG level, specific requirements]

### Compatibility
- [Browsers, devices, integrations]
```

### Step 5: Define Scope Boundaries

Explicitly state what's included and excluded:

```markdown
## Scope

### In Scope
- [Feature/capability 1]
- [Feature/capability 2]

### Out of Scope
- [Explicitly excluded item 1 — why]
- [Explicitly excluded item 2 — why]

### Future Considerations
- [Potential future feature 1]
- [Potential future feature 2]
```

### Step 6: Surface Risks and Open Questions

Document unknowns and risks:

```markdown
## Risks
- **[Risk]**: [Impact] — [Mitigation]

## Open Questions
- [ ] [Question 1 — impact: scope/timeline/feasibility]
- [ ] [Question 2]
```

### Step 7: Write PRD.md

Create `PRD.md` at the project root. Keep it concise and actionable.

## PRD.md Structure Reference

The complete section order:

| # | Section | Purpose |
|---|---------|---------|
| 1 | Overview | Product name, one-line description, date |
| 2 | Vision | Problem, users, value proposition, success metrics |
| 3 | User Personas | Who are the users, their goals and pain points |
| 4 | Functional Requirements | What the system must do (FR-001 format) |
| 5 | Non-Functional Requirements | Performance, security, accessibility |
| 6 | User Flows | Key workflows described step by step |
| 7 | Scope | In scope, out of scope, future considerations |
| 8 | Risks | Known risks with impact and mitigation |
| 9 | Open Questions | Unresolved questions with impact classification |
| 10 | Assumptions | Documented assumptions with risk level |

## Output Template

```markdown
# PRD: [Product Name]

> [One-line product description]

**Date:** [YYYY-MM-DD]
**Status:** Draft | Review | Approved

---

## Vision

**Problem Statement:**
[1-2 sentences describing the core problem users face]

**Target Users:**
[Primary and secondary user personas — brief]

**Value Proposition:**
[What unique value does this product deliver that existing solutions don't?]

**Success Metrics:**
- [Metric 1 — how measured]
- [Metric 2 — how measured]

---

## User Personas

### [Persona 1 Name]
- **Role:** [Their role/context]
- **Goals:** [What they want to achieve]
- **Pain Points:** [Current frustrations]

### [Persona 2 Name]
- **Role:** [Their role/context]
- **Goals:** [What they want to achieve]
- **Pain Points:** [Current frustrations]

---

## Functional Requirements

### FR-001: [Requirement Title]
**Priority:** Must Have
**Description:** [What the system must do]
**User Workflow:** [Step-by-step interaction]
**Acceptance Criteria:**
- [ ] [Criterion]

### FR-002: [Requirement Title]
**Priority:** Should Have
**Description:** [What the system must do]
**Acceptance Criteria:**
- [ ] [Criterion]

---

## Non-Functional Requirements

### Performance
- [Requirement]

### Security
- [Requirement]

### Accessibility
- [Requirement]

### Compatibility
- [Requirement]

---

## User Flows

### [Flow 1: Primary Happy Path]
1. User [action]
2. System [response]
3. User [action]
4. System [response]

### [Flow 2: Secondary Flow]
1. ...

---

## Scope

### In Scope
- [Item]

### Out of Scope
- [Item — reason]

### Future Considerations
- [Item — when/why it might be added]

---

## Risks
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| [Risk] | High/Med/Low | High/Med/Low | [Strategy] |

---

## Open Questions
- [ ] [Question — impact: scope/timeline/feasibility]

## Assumptions
- [Assumption — risk: low/medium/high]
```

## Critical Rules

### Problem Before Solution

```markdown
<!-- WRONG -->
## Vision
We need a React app with a dashboard that shows charts.

<!-- CORRECT -->
## Vision
**Problem Statement:**
Clinic managers spend 2+ hours daily manually compiling patient statistics
from spreadsheets, leading to delayed decisions and reporting errors.
```

### Measurable Success Metrics

```markdown
<!-- WRONG -->
**Success Metrics:**
- Users like the product
- It works well

<!-- CORRECT -->
**Success Metrics:**
- Dashboard load time under 2 seconds (P95)
- 80% of clinic managers adopt within 30 days of launch
- Manual report generation time reduced by 70%
```

### Explicit Scope Boundaries

```markdown
<!-- WRONG -->
## Scope
We'll build the main features.

<!-- CORRECT -->
## Scope
### In Scope
- Patient registration and management
- Appointment scheduling for single-clinic setups

### Out of Scope
- Multi-clinic management — deferred to v2 after single-clinic validation
- Billing/payment processing — separate product area
```

### Ask, Don't Assume

When the input is ambiguous, surface questions instead of making assumptions:

```markdown
## Open Questions
- [ ] Should doctors be able to self-register, or only via admin invite? — impact: scope, auth flow
- [ ] Is multi-language support required for v1? — impact: timeline, frontend architecture
```

## Checklist

- [ ] Problem statement is clear and user-centric
- [ ] Target users are identified with personas
- [ ] Value proposition differentiates from existing solutions
- [ ] Success metrics are measurable and verifiable
- [ ] All functional requirements have priority and acceptance criteria
- [ ] Non-functional requirements cover performance, security, accessibility
- [ ] Key user flows are documented step by step
- [ ] Scope explicitly states in/out boundaries with reasons
- [ ] Risks are identified with impact and mitigation
- [ ] Open questions are surfaced with impact classification
- [ ] Assumptions are documented with risk level
- [ ] No implementation details leaked into requirements

## References

- `PRD.md` — Current product requirements (project root, when present)
- `.claude/skills/user-stories/SKILL.md` — Break PRD into user stories
- `.claude/skills/tech-spec/SKILL.md` — Architectural breakdown from stories
- `.claude/skills/prototype/SKILL.md` — Visual prototyping from requirements
