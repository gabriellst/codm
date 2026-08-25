# scripts/

Repo-level tooling. Most entry points are exposed as root `package.json` scripts (`bun review`,
`bun detect`, `bun cli`, `bun check:generated`, `bun test:tooling`); the ones below are worth
knowing about directly.

| script | what it is |
|---|---|
| `scripts/probe-sqlite-interop.ts` | Cross-process SQLite interop + libsql concurrency probe. Measures WAL interop between `@libsql/client` (TS daemon) and `modernc.org/sqlite` (Go gateway) over ONE file, plus pragma survival, the `client.transaction()` fd leak, dirty reads and post-commit visibility. It is the evidence behind the four closed decisions of `.plans/2026-07-26-daemon-sqlite-migration.md` and the input to that plan's T07C gate. Its Go half is `packages/api/go/scripts/probe_sqlite_interop.go`. Run with a redirect, never `\| tee` (a pipeline reports tee's exit code): `bun scripts/probe-sqlite-interop.ts > /tmp/probe.out` |
| `scripts/db/sync-sqlite-migrations.ts` | Copies (`bun run --cwd packages/contracts db:sync-go`) or asserts (`db:check-go`) that the `//go:embed` migrations dir is byte-identical to the contracts source. Gated by `bun test:tooling`. |
