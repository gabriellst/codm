# Claude Skills for template Monorepo

This directory contains Claude Code skills (slash commands) for building full-stack features in the template monorepo.

## Skill Categories

### Planning & Analysis

| Skill | Description | When to Use |
|-------|-------------|-------------|
| `/prd` | Generate PRD.md from product idea | Defining product scope before implementation |
| `/user-stories` | Generate user stories with acceptance criteria | Transforming feature requests into stories |
| `/brainstorm` | Turn raw idea into approved design spec | First step of any new feature |
| `/plan` | Derive artifacts + write implementation plan from spec | After spec is approved, before /build |
| `/task-breakdown` | Phase-lane overlay (Contract Lock / Frontend / Backend / QA) | Only invoked by /plan when artifact count ≥10 or ≥3 contexts |
| `/spec-review` | Review plans for architecture compliance | Validating specs against docs and contracts |
| `/ddd-modeling` | Strategic & tactical DDD modeling | Features with >3 new entities, context splitting |

### Phase 0: Contract/API (Backend Foundation)

| Skill | Description | When to Use |
|-------|-------------|-------------|
| `/bounded-context` | Create bounded context | Starting a new domain like 'product', 'order' |
| `/controller` | Create HTTP controller | Adding endpoints like POST /products |
| `/errors` | Define error types | Adding domain or application errors |
| `/enum` | Create domain enum | Defining fixed values like OrderStatus |
| `/sdk` | Generate SDK | After creating/modifying controllers |

### Phase 1: Frontend

| Skill | Description | When to Use |
|-------|-------------|-------------|
| `/route` | Create TanStack Router page | Adding pages like /products, /users |
| `/component` | Create React component | Building UI elements and sections |
| `/form` | Create form with validation | Building forms with TanStack Form |
| `/store` | Create Zustand store | Managing interactive state |
| `/primitive` | Create primitive UI component | Building design system components |
| `/design-system` | Generate SYSTEM.md design system | Starting UI or changing design direction |

### Phase 2: Domain Modeling → Backend Implementation

> **Critical**: Domain model (entities) must be defined BEFORE database migrations. The DB schema is derived from validated entities, not the other way around.

| Skill | Description | When to Use |
|-------|-------------|-------------|
| `/ddd-modeling` | Define aggregates and boundaries | **First step** — before any entity or migration |
| `/entity` | Create domain entity | Modeling business objects like Order |
| `/value-object` | Create value object | Modeling concepts like Money, Email |
| `/migrate` | Database migration | **After entities** — schema derived from domain model |
| `/usecase` | Create use case | Implementing operations like CreateOrder |
| `/event` | Create domain event | Signaling significant occurrences |
| `/handler` | Create event handler | Reacting to events |
| `/service` | Create service | Cross-entity operations |
| `/repository` | Create repository | Adding data persistence |
| `/query` | Create UI query use case (BFF) | Frontend read data via direct Drizzle |

### Cross-Cutting

| Skill | Description | When to Use |
|-------|-------------|-------------|
| `/refactor` | Refactor code | Improving code quality |
| `/fix` | Fix bugs | Diagnosing and fixing issues |
| `/test` | Generate tests | Adding tests |
| `/review` | Code review | Reviewing PRs and code |
| `/commit` | Create commit | Committing with proper format |
| `/clean-branch` | Update `clean` branch from `dev` | Syncing architectural changes to generic boilerplate |

## Workflow

The recommended workflow follows these phases:

```
ANALYSIS (command-driven)
/brainstorm → /plan → (optional /spec-review) → /build → /pr
                              ↑                    │
                              └── refactor ────────┘

PRODUCT DEFINITION (before everything)
/prd (if PRD.md missing) → /design-system (if SYSTEM.md missing)

PROTOTYPING (parallel with analysis)
/prototype

PHASE 0: CONTRACT LOCK
/bounded-context → /errors → /enum → /controller → /sdk

PHASE 1 & 2: PARALLEL WORK
┌─────────────────────┐    ┌─────────────────────┐
│    FRONTEND         │    │    BACKEND          │
│ /implement-prototype│    │ /ddd-modeling (FIRST)│
│ /route              │    │ /entity             │
│ /component          │    │ /value-object       │
│ /form               │    │ /migrate (from model)│
│ /store              │    │ /repository         │
│                     │    │ /usecase            │
│                     │    │ /query              │
│                     │    │ /event              │
└─────────────────────┘    └─────────────────────┘

FINALIZE
/test → /review → /commit
```

## Quick Reference

### Starting a New Feature (Agent-Driven)

The recommended flow uses specialized agents:

```
product-owner    → /user-stories
software-architect → /plan + /spec-review
ui-designer      → /prototype
project-manager  → /build  (orchestrates execution; /task-breakdown
                              invoked internally only for large plans)
```

### Manual Step-by-Step

```
/bounded-context product
/errors
/enum ProductStatus
/controller CreateProduct
/controller ListProducts
/sdk
```

### Adding a Frontend Page

```
/route /products
/component products-list-section
/form CreateProductForm
```

### Implementing Backend Logic

```
/ddd-modeling          # Define aggregates and boundaries FIRST
/entity Product        # Create entity from DDD model
/value-object Money    # Create value objects
/migrate create_product # DB schema derived from entities
/repository ProductRepository
/usecase CreateProduct
/event ProductCreated
```

### Common Operations

```
/fix "500 error on create product"
/refactor packages/api/typescript/src/product/controllers
/test product/entities/Product
/migrate create_product
/commit
```

## Documentation References

Each skill references relevant documentation:

- `CLAUDE.md` — First-class citizens overview + commands
- `docs/BACKEND.md` — Backend architecture
- `docs/FRONTEND.md` — Frontend architecture
- `docs/COMPONENTS.md` — UI component patterns
- `.specs/` — Design specs (architectural decisions)
- `.plans/` — Implementation plans (history)

## Skill File Structure

Each skill is a directory with a `SKILL.md` file:

```
.claude/skills/
├── user-stories/
│   └── SKILL.md
├── task-breakdown/
│   └── SKILL.md
├── prototype/
│   └── SKILL.md
├── bounded-context/
│   └── SKILL.md
├── controller/
│   └── SKILL.md
└── ...
```

The `SKILL.md` file contains:
- YAML frontmatter with `name` and `description`
- Process steps
- Code examples
- Checklist
- References
