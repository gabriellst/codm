import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Absolute path to the Drizzle migrations directory (the `db/sqlite/migrations` output).
//
// Resolution order:
//   1. `CODM_MIGRATIONS_DIR` env override — the escape hatch for any packaging where the
//      migrations do not sit next to this module (e.g. a container that stages them elsewhere).
//   2. `<dirname(this file)>/sqlite/migrations`.
//
// The SQLite migrations are THE migrations: `packages/contracts/src/db/sqlite/migrations/*.sql`
// is the source of truth for both the TS daemon and the Go gateway (the `//go:embed` copy under
// `packages/api/go/core/db/sqlite/migrations/` is GENERATED from it and gated byte-for-byte by
// `scripts/db/sync-sqlite-migrations.ts`). The legacy pg output under `db/migrations` is dead.
//
// Why the env override matters: when this module is consumed FROM SOURCE (Bun dev, `bun:test`,
// the e2e webServer), `import.meta.url` points at `packages/contracts/src/db/migrations.ts`, so the
// fallback resolves to the real `packages/contracts/src/db/sqlite/migrations` — correct. But
// when it is pulled into a `bun build --target=node` bundle, the bundler REWRITES
// `import.meta.url` to the OUTPUT file (`dist/server.js`), so the fallback would resolve to a
// nonexistent `dist/sqlite/migrations`. The node-target build copies the migrations next to
// the bundle AND callers may set `CODM_MIGRATIONS_DIR` to stage them anywhere.
export const migrationsDir =
	process.env.CODM_MIGRATIONS_DIR ??
	join(dirname(fileURLToPath(import.meta.url)), 'sqlite', 'migrations')
