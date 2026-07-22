/**
 * Side-effecting EARLY boot step — imported by src/index.ts BEFORE the composition root (`./routers`).
 *
 * Why here and not just in the driver constructor: importing `./routers` triggers every context's
 * top-level-await `BoundedContext.create`, and each context's `Router.registerControllers` eagerly
 * resolves controllers → repos → the file-backed PGliteDriver, whose constructor calls
 * acquireDataDirLock(). On a dir already held by a LIVE daemon that throw is caught by Router's
 * try/catch, so a locked second boot emits a CASCADE of "Failed to resolve controller …" stack
 * traces (one per DB-backed controller) before the real DataDirLockedError finally surfaces from
 * @shared/index's setup — buried, illegible operator ergonomics.
 *
 * Acquiring the lock HERE — before any BoundedContext.create runs — turns a locked dir into a single
 * legible refusal (one DataDirLockedError, exit 1) at the earliest possible point. acquireDataDirLock
 * is idempotent for the same pid, so the later driver construction re-acquires as a no-op.
 *
 * Skipped under EMIT_OPENAPI (codegen never boots the real daemon and binds the in-memory driver).
 */
import { Config, acquireDataDirLock, resolveDataDir } from '@template/core-typescript'

if (process.env.EMIT_OPENAPI !== 'true') {
	acquireDataDirLock(resolveDataDir(Config.env.CODEDM_DATA_DIR))
}
