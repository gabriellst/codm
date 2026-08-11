import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * THE HARNESS'S DATA DIR, declared BEFORE the kernel freezes its config (spec D10, T7).
 *
 * `Config.env` is `EnvSchema.parse(process.env)` evaluated at MODULE IMPORT (core/src/utils/
 * Config.ts) — a single parse, once, for the life of the process. So `CODM_DATA_DIR` is not a
 * runtime knob: whatever `process.env` holds when `@codm/core-typescript` first evaluates is what
 * `FileLibsqlDriver` will open forever after. MEASURED, not assumed (probe run 2026-08-10): a
 * module whose FIRST import is this one sees `Config.env.CODM_DATA_DIR` equal to the value set
 * here, while the same assignment written in that module's BODY — after its import list — is read
 * by nobody, because ESM evaluates a module's dependencies, in source order, before its body.
 *
 * Hence the ONE rule this module carries: `tests/support/testing.ts` must import it FIRST, above
 * every import that can reach the kernel. That single position is also what makes the react-side
 * harness correct for free — it reaches this module through `import('@codm/api-typescript/testing')`,
 * so the assignment still happens before the kernel evaluates in THAT process too, with nothing to
 * duplicate on the consumer side. `startIntegrationBackend` re-checks the outcome (not the
 * assignment) before booting a services-mode backend, so a future import reshuffle fails loudly
 * instead of silently pointing a co-tenant subprocess at the operator's real `~/.codm/data`.
 *
 * PER PROCESS, and a PATH ONLY — nothing is created on disk here. `resolveDataDir` mkdirs it at
 * the moment a file-backed driver is actually constructed, which happens only in services mode
 * (the `e2e` column's `FileLibsqlDriver`). The default `integration` boot never reads this value:
 * its driver is the temp-file `LibsqlDriver`, its `CloudSession` is `MockCloudSession`, its
 * `ContactAvatarStore` is `MockContactAvatarStore` — checked, that is the complete set of
 * `CODM_DATA_DIR` readers reachable from that column, plus `GetSettings`, which only REPORTS the
 * value. So the default path stays byte-for-byte the boot it always was, and the assignment costs
 * one string.
 *
 * The pid keeps parallel test processes (nx runs workspace targets concurrently) from sharing a
 * scratch dir — and therefore from sharing a database.
 */
export const HARNESS_DATA_DIR = join(tmpdir(), `codm-harness-${process.pid}`)

process.env.CODM_DATA_DIR = HARNESS_DATA_DIR
