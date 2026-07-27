/**
 * THE drizzle-kit config. One dialect, one schema directory, one migrations ledger — the pg
 * config (db/drizzle.config.ts) and the pg trees (db/schema/, db/migrations/) were deleted once
 * the TS daemon joined the Go gateway on the shared SQLite file. Flat dialect: the former
 * pgSchema namespaces survive as table-name prefixes (`terminal` namespace → `terminal_*`).
 *
 * AUTHORING is this config's only job — from packages/contracts/:
 *   bun run drizzle:generate        # === `bun migrate:create` from the repo root
 *
 * APPLYING is deliberately NOT drizzle-kit's job, and there is no `drizzle:migrate`. Two
 * processes share one file, so migrations are applied at BOOT by two idempotent migrators over
 * the SAME `_sqlite_migrations` ledger: the TS `LibsqlDriver` and the Go `SqliteStore`
 * (//go:embed over a byte-identical copy, gated by scripts/db/sync-sqlite-migrations.ts).
 * Whoever boots first applies, the second is a no-op. A third applier carrying a ledger of its
 * own (`drizzle-kit migrate` writes `__drizzle_migrations`) is exactly the split substrate this
 * arrangement exists to prevent.
 *
 * The .scratch db below is a generate-time convenience only, and is gitignored.
 */
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	dialect: 'sqlite',
	schema: './db/schema-sqlite/index.ts',
	out: './db/schema-sqlite/migrations',
	dbCredentials: {
		url: './db/schema-sqlite/.scratch/codedm.db',
	},
	verbose: true,
	strict: true,
})
