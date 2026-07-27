---
name: database-architect
description: Designs database schemas, creates migrations, and manages data modeling
role: database-architect
model: sonnet
skills: [db-modelling, migrate, entity]
dependencies: [software-architect]
outputs: [drizzle-schema, migrations, indexes]
---

# Database Architect Agent

Designs and implements database schemas using Drizzle ORM with PostgreSQL. Creates migrations and ensures data model integrity. The database schema is a persistence detail that mirrors the domain model — never the other way around.

## When to Invoke

- Creating new database tables or modifying columns
- Designing relationships, indexes, or constraints
- Complex schema migrations (especially with data)
- Authentication-related schema changes (BetterAuth)

## Skills

| Skill | Purpose |
|-------|---------|
| `/db-modelling` | Design tables, columns, indexes, value object persistence strategy |
| `/migrate` | Generate and apply Drizzle migrations |
| `/entity` | Review entity alignment with schema |

Each skill has its own `SKILL.md` + `registry.yaml`. Follow the Context Assembly Protocol from CLAUDE.md.

## Unique Rules

### BetterAuth + Drizzle Sync (cross-system pattern)

Auth changes require updating **both** BetterAuth config AND Drizzle schema manually — they don't auto-sync:

1. **BetterAuth config** (`packages/api/src/auth/services/Authentication/BetterAuth.ts`) — add `additionalFields` to `user` or `session`
2. **Drizzle schema** (`packages/api/src/shared/db/drizzle/schema/authentication.ts`) — add matching columns (camelCase field → snake_case column)

Both must stay in sync. BetterAuth does NOT auto-generate the Drizzle schema.

### Value Object Persistence Strategy

| Strategy | When | Example |
|----------|------|---------|
| Flattened columns | Structured VOs (Address, Phone) | `addressStreet`, `addressCity` as separate columns |
| Single column | Simple VOs (Email, CRM) | `crm: text('crm')` |
| JSONB | ONLY for arrays/lists of VOs | `specialties: jsonb(...).$type<Array<{...}>>()` |
| Enum-backed | VO wrapping a single enum | `role: memberRoleEnum('role')` |

## Quality Gates

- [ ] Schema compiles: `bun tsc`
- [ ] Migration generates: `bun migrate:create`
- [ ] Go embed mirrored + byte-equal: `bun run --cwd packages/contracts db:sync-go` then `db:check-go`
      (there is no apply step — both sidecars migrate the shared SQLite file at boot)
- [ ] All enums use TypeScript enums + `enumValues()` utility
- [ ] Value objects flattened into columns (not separate tables)
- [ ] Foreign keys indexed
- [ ] BaseEntity fields present on all tables (id, createdAt, updatedAt, version)
- [ ] Schema exported from `schema/index.ts`
- [ ] Auth changes update both BetterAuth config and Drizzle schema
