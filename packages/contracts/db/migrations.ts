import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Absolute path to the Drizzle migrations directory (the `db/migrations` output).
//
// Resolution order:
//   1. `CODEDM_MIGRATIONS_DIR` env override — the escape hatch for any packaging where the
//      migrations do not sit next to this module (e.g. a container that stages them elsewhere).
//   2. `<dirname(this file)>/migrations`.
//
// Why the env override matters: when this module is consumed FROM SOURCE (Bun dev, `bun:test`,
// the e2e webServer), `import.meta.url` points at `packages/contracts/db/migrations.ts`, so the
// fallback resolves to the real `packages/contracts/db/migrations` — correct. But when it is
// pulled into a `bun build --target=node` bundle, the bundler REWRITES `import.meta.url` to the
// OUTPUT file (`dist/server.js`), so the fallback would resolve to a nonexistent `dist/migrations`.
// The node-target build copies the migrations to `dist/migrations` (so the fallback still works)
// AND callers may set `CODEDM_MIGRATIONS_DIR` to stage them anywhere.
export const migrationsDir =
	process.env.CODEDM_MIGRATIONS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'migrations')
