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
 * The former E2E FAIL-CLOSED GUARD (refusing the e2e boot flag under NODE_ENV=production) is GONE from
 * HERE (T4) — its job is subsumed by `setBoundedContextEnvironment` (called inside `start()`,
 * src/server.ts): T1's falsifier (`core/src/types/BoundedContext.environment.test.ts`, "e2e sob
 * NODE_ENV=production é recusado") proves the selector refuses ANY non-real `BoundedContextEnvironment`
 * — `e2e` included — under production, so this file no longer needs its own copy of that check. The
 * raw flag that used to select the e2e hermetic swaps is dead (T5): its read sites — testControllers,
 * agent runner factory, provider detector, the thread ChannelSender — are now the declared `e2e`
 * registry column, selected by `Config.env.CODM_ENV` instead of a raw flag.
 */
import { Config, acquireDataDirLock, resolveDataDir } from '@codm/core-typescript'

if (Config.env.EMIT_OPENAPI !== 'true') {
	acquireDataDirLock(resolveDataDir(Config.env.CODM_DATA_DIR))
}
