# SQL Migrations

Drizzle (TypeScript, `packages/contracts/`) is the canonical migration source for this monorepo.
All schema migrations are defined there and applied via `bun migrate:dev`.

This directory is reserved for **SQL test fixtures only** — seed data or DDL helpers
used by Go integration tests that need a known database state without running the full
Drizzle migration pipeline.

Do NOT add Drizzle-owned schema migrations here. If you need a new table, add it to
`packages/contracts/db/schema/` and run `bun migrate:dev`.
