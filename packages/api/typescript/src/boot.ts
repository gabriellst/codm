/**
 * EARLY boot side-effects — imported by `src/index.ts` BEFORE the composition root.
 *
 * Lives as a bare `src/*.ts` file (same composition-root exemption class as `routers.ts` — see its
 * docblock): it belongs to no bounded context and must evaluate before ANY `BoundedContext.create`.
 *
 * SINGLE-INSTANCE LOCK — acquire the CODM_DATA_DIR lock before `./routers` triggers context
 * creation, so a dir already held by a live daemon fails with ONE legible `DATA_DIR_LOCKED` error
 * instead of a cascade of buried "Failed to resolve controller" traces. Idempotent per pid (the
 * file-backed driver re-acquires as a no-op). Skipped under EMIT_OPENAPI (codegen never boots the
 * real daemon and binds the in-memory driver).
 *
 * The former E2E FAIL-CLOSED GUARD (refusing `CODM_E2E=true` under NODE_ENV=production) is GONE from
 * HERE (T4) — its job is subsumed by `setBoundedContextEnvironment` (called inside `start()`,
 * src/server.ts): T1's falsifier (`core/src/types/BoundedContext.environment.test.ts`, "e2e sob
 * NODE_ENV=production é recusado") proves the selector refuses ANY non-real `BoundedContextEnvironment`
 * — `e2e` included — under production, so this file no longer needs its own copy of that check. The
 * `CODM_E2E` env var ITSELF (its 6 other read sites — testControllers, agent runner factory,
 * provider detector, etc.) is still alive; retiring it in favor of the `e2e` registry column is T5's
 * job, not this file's.
 */
import { Config, acquireDataDirLock, resolveDataDir } from '@codm/core-typescript'

if (process.env.EMIT_OPENAPI !== 'true') {
	acquireDataDirLock(resolveDataDir(Config.env.CODM_DATA_DIR))
}
