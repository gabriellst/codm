# Development Guide

> Rules and decision criteria for implementing and reviewing code in this monorepo.

This document is intentionally normative. It contains:
- mandatory rules
- dependency direction and implementation order
- skill references
- validation checklists

This document intentionally does not contain concrete implementation examples. Concrete bad/good examples and prohibited practices must live in `docs/BAD_PRACTICES.md`.

---

## Purpose and Scope

Use this guide when transforming a task into code across `api/`, `app/`, and generated SDK clients.

For concrete anti-patterns, read:
- `docs/BAD_PRACTICES.md`

For domain-specific patterns, read:
- `docs/BACKEND.md`
- `docs/FRONTEND.md`
- `docs/COMPONENTS.md`

---

## Mandatory Principles

1. Contract first
- Define or update API contracts (controllers + schemas) before implementation details.
- Regenerate SDK after contract changes so frontend and integrations consume typed contracts.

2. Clear dependency direction
- Frontend depends on SDK-generated contracts.
- Inside `api`, cross-context business validations may use other context repositories for read access (for example, `findById`).
- Avoid creating/calling pass-through use cases only to check entity existence.
- For asynchronous cross-context effects, use integration events.
- SDK HTTP client must not be used from inside `api`.
- Direct imports of controllers/entities across contexts are forbidden.

3. Validation at boundaries, invariants in domain
- Input/output formatting validation belongs to controller schemas.
- Business invariants belong to entities, value objects, and use cases.

4. Strong typing end-to-end
- Use shared enums/schemas/types from SDK where applicable.
- Avoid local type duplication and unsafe casts.

5. Evolvable architecture over local convenience
- Prefer explicit boundaries, stable contracts, and isolated responsibilities.
- Optimize for maintainability and changeability, not only short-term speed.

6. Pragmatic execution
- Follow architecture rules strictly for behavior and boundaries.
- Keep implementation proportional to feature risk and complexity.

---

## Required Workflow

### Phase 0: Understand
- Identify feature scope and affected contexts.
- Identify if change is command/write, query/read, or both.
- Identify if contract change is required.

### Phase 1: Contract and Integration
- Create or update errors and enums required by the contract.
- Create or update controllers and input/output schemas.
- Register routes/routers and barrel exports.
- Regenerate SDK.
- If frontend depends on this contract, unblock frontend now.

### Phase 2: Domain Modeling → Implementation

**CRITICAL: DDD modeling MUST precede database schema design.**

1. **DDD Modeling** — Run `/ddd-modeling` to define aggregates, boundaries, entity relationships, and invariants.
2. **Domain Model** — Implement entities (`/entity`), value objects (`/value-object`), enums (`/enum`), and domain errors (`/errors`) based on DDD output.
3. **Database Migration** — Run `/migrate` to create schema derived from the validated entities. Entity structure and value objects determine column design.
4. **Repository** — Implement repository interface + sqlc implementation (`/repository`).
5. **Use Cases** — Implement business logic with DI, transaction handling, and domain events (`/usecase`).
6. **Handlers/Events** — Implement event handlers where cross-context or async effects are needed.

### Phase 3: UI and Composition
- Implement routes and pages consuming SDK hooks/functions.
- Keep data ownership at route/page level and pass data via props to lower levels.
- Use store/search-state patterns consistently.

### Phase 4: Verification
- Run lint/build/tests.
- Re-run SDK generation if contracts changed.
- Re-run route tree generation if routes changed.
- Review against `docs/BAD_PRACTICES.md` and `/review` skill.

---

## Architecture Rules by Concept

### Routes and Navigation
- Route files are the entrypoint for screen-level composition.
- Search params for URL state must be schema-validated and stable.
- Route-level loading/error/not-found patterns must be explicit.

### Page / Section / Component Hierarchy
- Page/Route level owns data acquisition and orchestration.
- Section level owns composition of related UI concerns.
- Specific components own presentation logic and local interaction.
- Primitive components are reusable UI building blocks, not domain orchestrators.

### Props and Component Contracts
- Props should reflect explicit contract boundaries and ownership.
- Avoid passing unstable or overly broad objects when narrower contracts suffice.
- Avoid coupling lower-level components to global routing or data-fetching context.

### Queries, Mutations, and SDK Usage
- Queries and mutations must be represented by explicit API contracts.
- SDK-generated types/schemas/enums are the source of truth for client usage.
- Avoid duplicating schema logic in UI when the contract already defines it.

### Controllers and Schemas
- Controllers define external API contract and transport-level validation.
- Input/output schemas must be complete, explicit, and aligned with use case boundaries.
- Controller errors must map to centralized error mapping.

### Use Cases
- Use cases model application behavior and orchestration.
- Command/write behavior must enforce transaction and consistency boundaries.
- Use cases should not become generic read-query containers.

### Query Use Cases
- Read/query behavior should be implemented in dedicated query use cases with direct sqlc access.
- Query outputs should be optimized for consumer screens/use cases, not entity-shape leakage.

### Context Ownership
- The `ui` context is exclusively for read-only BFF queries and UI-exclusive state (e.g., onboarding).
- Write controllers (create, update, delete) must live in the bounded context that owns the entity being mutated, never in `ui`.
- Even mock controllers with `mockController = true` must respect context ownership — they will eventually be replaced with real implementations in the same context.

### Entities and Value Objects
- `.create()` is for invariant-safe creation.
- Rehydration must preserve persisted identity/state without re-running creation semantics.
- Entity methods should encapsulate business intent, not transport concerns.

### Events and Handlers
- Domain/integration events should represent meaningful domain facts.
- Event publication must respect transaction boundaries.
- Handlers must be idempotent where event delivery can repeat.

### Repositories and Infrastructure
- Repositories persist aggregates and domain state.
- Avoid leaking persistence concerns into controllers/components.
- Keep infrastructure details behind abstractions used by use cases.

### State Management
- URL state for shareable/searchable navigation concerns.
- Local/store state for interactive UI concerns.
- Avoid mixing unrelated concerns in one store/component.

---

## Naming, Exports, and File Organization Rules

- Follow project naming conventions for routes, controllers, use cases, and components.
- Keep barrel exports updated for discoverability and wiring.
- Prefer named exports as project default convention.
- Keep file placement aligned with architectural layer responsibility.

---

## Skill Reference Matrix

Use the skills as the operational playbook for each concept.

### Contract and API
- `.claude/skills/bounded-context/SKILL.md`
- `.claude/skills/errors/SKILL.md`
- `.claude/skills/enum/SKILL.md`
- `.claude/skills/schema/SKILL.md`
- `.claude/skills/controller/SKILL.md`
- `.claude/skills/sdk/SKILL.md`

### Backend Behavior and Persistence
- `.claude/skills/value-object/SKILL.md`
- `.claude/skills/entity/SKILL.md`
- `.claude/skills/service/SKILL.md`
- `.claude/skills/usecase/SKILL.md`
- `.claude/skills/query/SKILL.md`
- `.claude/skills/repository/SKILL.md`
- `.claude/skills/event/SKILL.md`
- `.claude/skills/handler/SKILL.md`
- `.claude/skills/migrate/SKILL.md`

### Frontend Composition
- `.claude/skills/route/SKILL.md`
- `.claude/skills/component/SKILL.md`
- `.claude/skills/form/SKILL.md`
- `.claude/skills/store/SKILL.md`
- `.claude/skills/primitive/SKILL.md`

### Cross-Cutting
- `.claude/skills/feature/SKILL.md`
- `.claude/skills/fix/SKILL.md`
- `.claude/skills/refactor/SKILL.md`
- `.claude/skills/spec/SKILL.md`
- `.claude/skills/test/SKILL.md`
- `.claude/skills/trace-analysis/SKILL.md`
- `.claude/skills/review/SKILL.md`
- `.claude/skills/commit/SKILL.md`

---

## Review and Quality Gates

Every implementation should be reviewed against both:
- concept implementation quality
- concept relationship quality

Minimum review expectations:
- Concept completeness: required concepts for the feature exist.
- Dependency correctness: direction and ownership are coherent.
- Contract integrity: schemas/types/enums are consistent across layers.
- ZapGo readiness: extension points exist without unsafe coupling.
- Pragmatism: complexity is proportional to business risk.

Use:
- `.claude/skills/review/SKILL.md`
- `.claude/agents/code-reviewer/AGENT.md`
- `docs/BAD_PRACTICES.md`

---

## Mandatory Delivery Checklist

- [ ] Architectural boundaries are respected.
- [ ] Contract changes are explicit and SDK is regenerated.
- [ ] Errors/enums/schemas are centralized and consistent.
- [ ] Controller, use case, domain, and repository responsibilities are separated.
- [ ] Route/page/section/component responsibilities are separated.
- [ ] URL state and interactive state are correctly split.
- [ ] Lint/build/tests pass.
- [ ] Review against `docs/BAD_PRACTICES.md` is complete.

---

## Maintenance Rule

If a concrete anti-pattern or implementation practice is discovered, document it in `docs/BAD_PRACTICES.md` (new FP entry or update existing one), not in this document.
