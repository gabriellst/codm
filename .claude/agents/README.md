# Claude Agents for template Monorepo

Agents are specialized AI personas dispatched via the `Agent` tool with `subagent_type`. Each agent has an `AGENT.md` defining its role, skills, unique rules, and quality gates.

## How Agents Actually Work

**The parent Claude instance orchestrates everything.** Subagents:
- Start fresh with no conversation history
- Cannot communicate with each other directly
- Receive context only through the parent's prompt
- Cannot spawn other subagents efficiently

The parent must: run agent A → capture output → feed to agent B → repeat. All "coordination" happens through the parent, not between agents.

## Model Selection per Agent

Each `AGENT.md` declares its default model in frontmatter:

```yaml
---
name: backend-developer
role: backend-developer
model: sonnet     # default model for this agent
...
---
```

Accepted values: `opus`, `sonnet`, `haiku`. The Agent tool's `model`
parameter overrides the default at dispatch time when needed:

```ts
Agent({ subagent_type: 'code-reviewer', model: 'sonnet' })
// uses sonnet even though code-reviewer's default is haiku
```

### Current defaults

| Tier | Agent | Default | Rationale |
|------|-------|---------|-----------|
| Strategic | `software-architect` | `opus` | irreversible decisions, DDD boundaries, blast radius |
| Build | `backend-developer` | `sonnet` | TDD + domain logic balance |
| Build | `frontend-developer` | `sonnet` | same |
| Build | `database-architect` | `sonnet` | bad schema is expensive |
| Build | `qa-tester` | `sonnet` | reads code + synthesizes E2E tests |
| Build | `product-owner` | `sonnet` | story refinement needs nuance |
| Quality | `code-reviewer` | `haiku` | (rarely dispatched — see note below) |
| Ops | `project-manager` | `haiku` | mostly mechanical orchestration |

### When to override

- Migration in production-critical table → bump `database-architect`
  or its reviewer to `opus`.
- New bounded context (greenfield domain) → bump `backend-developer`
  to `opus`.
- Routine CRUD review → keep on `haiku` (cheap).
- Cross-Task wave review (Tier 3 batch judge) → uses `sonnet` even
  though it shares the `code-reviewer` role.

`/plan` may declare a per-Task `Model:` and `Reviewer-Model:` field
that overrides the default for that specific Task.

### Note on the `code-reviewer` agent

The default `/build` review flow does **not** dispatch the
`code-reviewer` agent. It calls the `/review` command directly,
which wraps `scripts/review.ts` — a script that already spawns
`claude` CLI subprocesses in parallel with its own `--model`
selection. The model that controls per-Task review cost is
`scripts/review.ts --model <value>`, propagated from the Task's
`Reviewer-Model:` field.

The `code-reviewer` agent remains defined for two cases:
1. **Manual dispatch** — a parent agent or user invokes
   `Agent({ subagent_type: 'code-reviewer', ... })` for an ad-hoc
   review workflow that needs judgment beyond what `scripts/review.ts`
   provides.
2. **Future Tier 3 batch judge** — when the cross-Task wave review is
   built, it may reuse the `code-reviewer` role with a different model
   override (sonnet) for multi-file coherence checks.

In both cases the agent's `model: haiku` frontmatter applies; the
real cost driver for the default flow is `scripts/review.ts`'s
`--model` flag.

### Rough cost ratio

(approximate, per token; varies with prompt caching):

```
haiku    : ~1×
sonnet   : ~5×
opus     : ~12×
```

If 60% of `/build`'s work is `code-reviewer` (Tier 2 per Task), moving
it from sonnet to haiku saves roughly 50% of review cost.

## Agent Catalog

### Product & Architecture

| Agent | When to Use | Skills |
|-------|-------------|--------|
| `product-owner` | New feature needs user stories; human clarification needed | `/user-stories` |
| `software-architect` | Stories ready, need implementation plan + context mapping | `/plan`, `/spec-review`, `/ddd-modeling`, `/bounded-context`, `/errors`, `/enum` |

### Planning

| Agent | When to Use | Skills |
|-------|-------------|--------|
| `project-manager` | Multi-context feature needs phased task breakdown + wave planning | `/task-breakdown`, `/spec-review`, `/commit` |

### Development

| Agent | When to Use | Skills |
|-------|-------------|--------|
| `backend-developer` | Pure backend: controllers, entities, use cases, repos, SDK | 14 backend skills |
| `frontend-developer` | Pure frontend: routes, components, forms, stores | 6 frontend skills |
| `database-architect` | Schema design, migrations, BetterAuth changes | `/db-modelling`, `/migrate`, `/entity` |

### Quality

| Agent | When to Use | Skills |
|-------|-------------|--------|
| `spec-compliance-reviewer` | Stage 1 of /build's per-Task review — does the diff match the plan's Task contract (no over/under-building)? | none (reads diff + plan) |
| `code-reviewer` | Stage 2 of /build's per-Task review — registry-driven BP audit of changed files | `/review` |
| `qa-tester` | E2E testing of features with routes and interactive UI | `/e2e`, `/test` |

## Typical Feature Workflow

```
1. Parent receives feature request
2. Parent dispatches product-owner → gets user stories
3. Parent dispatches software-architect with stories → gets tech spec
4. Parent dispatches project-manager with stories + spec → gets task breakdown
5. Parent dispatches implementation agents (backend/frontend/integration) per task
6. Parent dispatches code-reviewer on changed files
7. Parent dispatches qa-tester for E2E validation
```

Each dispatch is a fresh context. The parent includes relevant outputs from previous agents in each prompt.

## Parallel Execution Model (Ralph Phases)

```
Phase 0: Contract Lock (sequential)
  backend-developer: /context → /errors → /enum → /controller → /sdk

Phase 1 + 2: Parallel after SDK lock
  frontend-developer: screens + forms
  backend-developer: domain logic by context waves
  database-architect: schema + migrations

Phase 3: Validation
  qa-tester → code-reviewer
```

## When NOT to Use Agents

- **Simple changes** — don't dispatch an agent for a 1-file edit
- **Single-skill work** — invoke the skill directly instead of wrapping it in an agent
- **Already have context** — if the parent already has full context, dispatching loses it
