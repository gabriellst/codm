/**
 * SQLite-dialect drizzle-kit config — ADDITIVE, isolated from the pg config at
 * db/drizzle.config.ts. The pg schema (db/schema/) stays the canonical source for
 * the running TS daemon; this sqlite substrate is the go-domain port target
 * (go-domain-design.md decision (a), Option A: one flat dialect, pgSchema
 * namespaces → table-name prefixes).
 *
 * Run from packages/contracts/:
 *   bun x drizzle-kit generate --config=db/schema-sqlite/drizzle.config.ts
 *
 * `drizzle-kit migrate` for sqlite needs better-sqlite3/@libsql; this workspace
 * carries neither. The migration SQL is applied by the Go SqliteStore via
 * //go:embed (modernc.org/sqlite) — the .scratch db below is only a generate-time
 * convenience and is gitignored.
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
