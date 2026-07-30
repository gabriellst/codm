---
name: migrate
description: Generate SQLite migrations after schema design is complete. Use this skill AFTER `/db-modelling` to turn Drizzle schema changes into versioned SQL, mirror them into the Go embed, and verify they apply.
---

> **BEFORE USING**: Schema design must be done first with `/db-modelling`. This skill only authors
> the migration and gets it into both runtimes.

# Database Migration

Turns schema file changes into versioned SQL. The database is **one SQLite file** at
`$CODEDM_DATA_DIR/codedm.db`, shared by the TS daemon and the Go gateway.

## The one thing to internalise: ONE ledger

The invariant is **one ledger, one SQL source** — not "no script".

Two processes open the same file, so migrations are applied at **boot**, by **two idempotent
migrators over the SAME ledger** (`_sqlite_migrations`, keyed by filename):

| Process | Migrator | Source of the SQL |
|---|---|---|
| TS daemon | `LibsqlDriver` | `packages/contracts/db/schema/migrations/*.sql` |
| Go gateway | `SqliteStore` | `packages/api/go/core/db/sqlite/migrations/*.sql` (`//go:embed`) |

Whoever boots first applies; the second finds the ledger rows and no-ops. Both split each file on
`--> statement-breakpoint` and derive the set to apply from `readdir | filter .sql | sort` — never
from `meta/_journal.json`.

**Convention (upstreamed to the template): the schema directory name is neutral to dialect.**
`packages/contracts/db/schema/` carries no `-sqlite`/`-postgres` suffix — the dialect is a property
of the driver and of `drizzle.config.ts`'s `dialect` key, not of the folder name. A fork that swaps
SQLite for Postgres edits the config, it does not rename or move the 30 schema files.

A **third** applier carrying a ledger of its own is the failure mode this design exists to
prevent — which is why `drizzle-kit migrate` (it writes `__drizzle_migrations`) has no script here.

`bun migrate:dev` exists and is safe **because it is not a third applier**: it calls
`migrateEmbeddedDatabase()` — the same function `src/boot/migrate-embedded.ts` calls — so it is the
TS row of the table above, run without booting the server. Reach for it to prepare a cold data dir
for a test or a script; `bun dev` still migrates on its own and needs no help. It creates the
Drizzle tables only: `whatsmeow_*` belongs to the gateway and appears on first connect.

## When to Use This Skill

- After `/db-modelling` updated `packages/contracts/db/schema/*.ts` and you need the SQL
- Reviewing generated migration SQL before it reaches a runtime
- Getting a new migration into the Go `//go:embed` copy

## When NOT to Use This Skill

- **Designing tables, columns, indexes, relationships** — use `/db-modelling` first
- **Deciding how to persist value objects** — use `/db-modelling`
- **Writing repository code** — use `/repository`

## Prerequisites

- Schema files updated via `/db-modelling` under `packages/contracts/db/schema/`
- New table exported from `packages/contracts/db/schema/index.ts`

## Process

### Step 1: Generate the migration

```bash
bun migrate:create
```

`drizzle-kit generate` with `packages/contracts/db/schema/drizzle.config.ts`, writing SQL +
snapshot into `packages/contracts/db/schema/migrations/`. With no schema change it prints
`No schema changes, nothing to generate` and writes nothing — the command is idempotent.

### Step 2: Review the generated SQL

- CREATE/ALTER correctness, and data-loss risk (column drops, type changes).
- **SQLite has no `ALTER COLUMN`.** Changing a column's type or constraints makes drizzle emit a
  table REBUILD (`create new → copy → drop → rename`). Read those migrations line by line; they are
  the ones that lose data quietly.
- **Closed sets are CHECK constraints**, not native enums: `text().$type<Enum>()` + `enumCheck(...)`.
  A rebuild has to carry the CHECK across, or the value-set stops being enforced in the database.
- Namespacing is by **table-name prefix** (`terminal_*`, `shared_*`) — the flat dialect has no
  `CREATE SCHEMA`, so there is nothing to make idempotent at the schema level.

### Step 3: Mirror the SQL into the Go embed

```bash
bun run --cwd packages/contracts db:sync-go
```

The `//go:embed` directory is a **derived copy**, never hand-edited, and must stay byte-identical to
the contracts source: the shared ledger is keyed by **filename**, so a copy that drifted in content
while keeping its name is silently skipped by whichever process boots second — the two processes
then disagree about the shape of the database, with nothing in the logs.

### Step 4: Verify

```bash
bun run --cwd packages/contracts db:check-go   # byte-equality gate (also inside bun test:tooling)
bun tsc
( cd packages/api/typescript && bun test core/src/db/drivers/LibsqlDriver.test.ts )
( cd packages/api/go && go test ./core/db/sqlite/... )
```

The driver/store tests are what actually prove the SQL applies: they migrate a temp file from cold
and assert the second pass applies zero migrations.

## Troubleshooting

### The gateway and the daemon disagree about a table

Almost always a drifted embed copy. Run `db:check-go`. If it reports `content`, re-run `db:sync-go`
**and rebuild the Go binary** — an already-compiled gateway carries the OLD bytes.

### "table already exists" on boot

Two migrations with the same filename, or a file renamed after it was applied. The ledger keys on
filename, so renaming applied SQL makes it look new. Never rename an applied migration.

### Migration history

```sql
-- against $CODEDM_DATA_DIR/codedm.db
SELECT * FROM _sqlite_migrations ORDER BY name;
```

## Checklist

- [ ] Schema files updated via `/db-modelling`, table exported from `schema/index.ts`
- [ ] Migration generated: `bun migrate:create`
- [ ] SQL reviewed — rebuild statements checked for data loss, CHECK constraints carried across
- [ ] Go embed mirrored: `bun run --cwd packages/contracts db:sync-go`
- [ ] Byte-equality gate green: `bun run --cwd packages/contracts db:check-go`
- [ ] Applies from cold and no-ops on a second pass (driver + store tests)
- [ ] Types compile: `bun tsc`

## Bad Practices

### bp-01: Destructive Migration Without Plan

**Severidade:** 🔴 Crítico

Dropping columns or tables without a safety plan risks data loss — and on SQLite the drop is often a
full table rebuild, so "just the column" is not what actually happens.

```sql
-- ❌ WRONG — dropping directly
ALTER TABLE owner_users DROP COLUMN phone_number;
```

```sql
-- ✅ CORRECT — phased
-- Step 1: remove code references to the column
-- Step 2: ship the code without the column usage
-- Step 3: drop the column in a separate migration after verification
ALTER TABLE owner_users DROP COLUMN phone_number;
```

### bp-02: Hand-editing the Go embed copy

**Severidade:** 🔴 Crítico

`packages/api/go/core/db/sqlite/migrations/` is DERIVED. Editing it makes the two migrators apply
different DDL under the same ledger key — a divergence that raises no error, only wrong reads. Edit
the contracts source and re-run `db:sync-go`.

### bp-03: Reintroducing a second LEDGER

**Severidade:** 🔴 Crítico

`drizzle-kit migrate` and an ad-hoc `drizzle-kit push` each bring their own ledger
(`__drizzle_migrations`) and re-apply DDL the boot migrators already applied — a divergence that
raises no error, only wrong reads.

The test is the ledger, not the entry point. `bun migrate:dev` is fine because it delegates to
`migrateEmbeddedDatabase()` and therefore writes `_sqlite_migrations` like the boot path; a script
that reaches for drizzle-kit to do the same job is not. If you add another way to apply migrations,
it must end up in `_sqlite_migrations`, keyed by filename, reading the contracts migrations dir.

## References

- `.claude/skills/db-modelling/SKILL.md` — schema design (tables, columns, indexes, VO persistence)
- `scripts/db/sync-sqlite-migrations.ts` — the source→derived copy gate, with the full rationale
- `packages/contracts/db/schema/drizzle.config.ts` — why there is no `drizzle:migrate`
- Drizzle ORM Documentation: https://orm.drizzle.team/docs
- `docs/BACKEND.md` — architecture principles
