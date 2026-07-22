---
name: migrate
description: Generate and apply database migrations after schema design is complete. Use this skill AFTER `/db-modelling` to turn Drizzle schema changes into versioned SQL migrations.
---

> **BEFORE USING**: Schema design must be done first with `/db-modelling`. This skill only generates and applies the migration.

# Database Migration

Generates and applies Drizzle database migrations. This skill is purely operational — it turns schema file changes into versioned SQL and applies them to the database.

## Why Migrations Exist

Migrations create a versioned history of schema changes that can be applied consistently across environments (dev, staging, prod). Drizzle generates SQL migrations from schema definitions, ensuring the TypeScript schema and database stay in sync.

## When to Use This Skill

- After `/db-modelling` has updated schema files and you need to generate the SQL migration
- Applying pending migrations to the database
- Reviewing generated migration SQL before applying

## When NOT to Use This Skill

- **Designing tables, columns, indexes, relationships** — use `/db-modelling` first
- **Deciding how to persist value objects** — use `/db-modelling`
- **Writing repository code** — use `/repository`

## Prerequisites

- Schema files already updated via `/db-modelling`
- Schema exported from `packages/api/typescript/src/shared/db/drizzle/schema/index.ts`
- Database connection available

## Process

### Step 1: Generate Migration

```bash
bun migrate:create
```

This reads the schema files and generates a SQL migration in `packages/api/typescript/src/shared/db/drizzle/migrations/`.

### Step 2: Review Generated SQL

Check the generated migration file for:
- Correct CREATE/ALTER statements
- Data loss risks (column drops, type changes)
- Enum creation order
- Schema namespace creation (`CREATE SCHEMA IF NOT EXISTS`)
- **Go-owned `shared` / `channel` DDL** — drizzle emits non-idempotent `CREATE SCHEMA "shared"` and `CREATE TABLE "shared"."events"` / `"shared"."outbox"` by default, which collides with the Go channel service. Patch those to `IF NOT EXISTS` before applying (see "Cross-Service Schemas" below).

### Step 3: Apply Migration

```bash
bun migrate:dev
```

### Step 4: Verify

```bash
bun tsc  # Ensure types compile
```

## Troubleshooting

### "Column already exists"

Schema might be out of sync with the database. Check if a previous migration already added the column.

### "Table not found"

Ensure schema is exported from `schema/index.ts`:
```typescript
export * from './myNewContext'
```

### Migration History

View applied migrations:
```bash
bun --cwd packages/api drizzle-kit status
```

## Checklist

- [ ] Schema files updated via `/db-modelling`
- [ ] Schema exported from `schema/index.ts`
- [ ] Migration generated: `bun migrate:create`
- [ ] Migration SQL reviewed for correctness and data safety
- [ ] `shared.*` / `channel.*` DDL patched to `IF NOT EXISTS` if the new migration touches them (see "Cross-Service Schemas")
- [ ] Migration applied: `bun migrate:dev`
- [ ] Types compile: `bun tsc`

## Cross-Service Schemas (Go-owned `shared` and `channel`)

The `shared` and `channel` schemas are **owned by the Go channel service** (`packages/channel/internal/shared/db/sql/migrations/`). Drizzle still has schema files for them (`schema/shared.ts`, `schema/channel.ts`) so TS code can query them with type safety — but in real dev/prod the DDL is created by Go migrations, not drizzle.

`bun migrate:dev` runs the two migrators in order:

```
nx run channel:migrate && nx run api:migrate:dev
```

Go creates the canonical tables first; drizzle's migration then applies everything else. Because drizzle's generated SQL touches the same `shared` schema, the collision points need to be idempotent.

### The collision and the fix

Drizzle-kit generates non-idempotent DDL by default: `CREATE SCHEMA "shared"` and `CREATE TABLE "shared"."events"` without `IF NOT EXISTS`. When Go has already created them, drizzle fails.

Drizzle-orm does **not** expose a schema-file-level way to mark tables or schemas as "external" / "already exists":
- `.existing()` exists on `pgView`, `pgMaterializedView`, `pgRole` — **not on `pgTable` or `pgSchema`**
- There is no `emit IF NOT EXISTS` config option

The [official drizzle guidance](https://orm.drizzle.team/) for tables owned by another tool (e.g. Supabase's `auth` schema) is to **hand-edit the generated migration**:

> "For tables that already exist, it's important to manually review the generated migration files from `npx drizzle-kit generate`. You should comment out or adjust any unsafe pure create statements (e.g., `CREATE SCHEMA "auth";`) while ensuring safe conditional creates (e.g., `CREATE TABLE IF NOT EXISTS "auth"."users"`) are properly handled."

In this repo, after running `bun migrate:create`, patch any new or regenerated SQL that touches the `shared` schema (and any Go-owned `channel` tables) to use `IF NOT EXISTS`:

```sql
-- ❌ drizzle-kit default (fails when Go already created it)
CREATE SCHEMA "shared";
CREATE TABLE "shared"."events" (...);
CREATE TABLE "shared"."outbox" (...);

-- ✅ patched after generation
CREATE SCHEMA IF NOT EXISTS "shared";
CREATE TABLE IF NOT EXISTS "shared"."events" (...);
CREATE TABLE IF NOT EXISTS "shared"."outbox" (...);
```

Indexes on those tables already use `CREATE INDEX IF NOT EXISTS` from drizzle; leave those alone. The `channel.*` tables drizzle emits are already `CREATE TABLE IF NOT EXISTS` (they come from the channel projections migration, which was written by hand).

### Why this works in both environments

| Environment | What runs first | How the patched statements behave |
|---|---|---|
| Real dev/prod | Go migrations create `shared.events` / `shared.outbox` | Drizzle's `IF NOT EXISTS` statements are no-ops |
| PGlite (integration tests) | Only drizzle runs (Go service not present) | Drizzle creates `shared.events` / `shared.outbox` from scratch — the `IF NOT EXISTS` is harmless |

### What NOT to do

- Don't try to exclude `shared.ts`/`channel.ts` from drizzle-kit generation via a glob (`!(shared|channel)`) — the `schema/index.ts` re-export pulls them back in, and splitting the folder adds more moving parts than the 3-line SQL patch.
- Don't wrap `bun migrate:dev` in a shell script that drops the `shared` schema before drizzle. That's what the patched `IF NOT EXISTS` avoids.
- Don't edit drizzle-generated migrations that have already been applied to prod — patch only fresh, unapplied ones. Drizzle-kit tracks applied migrations by hash and won't re-run a patched one on an existing DB, but it will warn.

## Bad Practices

### bp-01: Destructive Migration Without Plan

**Severidade:** 🔴 Crítico

Dropping columns or tables without a safety plan risks data loss.

```sql
-- ❌ WRONG — Dropping column directly
ALTER TABLE users DROP COLUMN phone_number;
```

```sql
-- ✅ CORRECT — Phased approach
-- Step 1: Remove code references to the column
-- Step 2: Deploy code without the column usage
-- Step 3: Drop column in a separate migration after verification
ALTER TABLE users DROP COLUMN phone_number;
```

## References

- `.claude/skills/db-modelling/SKILL.md` - Schema design (tables, columns, indexes, VO persistence)
- Drizzle ORM Documentation: https://orm.drizzle.team/docs
- `docs/BACKEND.md` - Architecture principles
