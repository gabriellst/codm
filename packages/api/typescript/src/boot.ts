/**
 * EARLY boot side-effects — imported by `src/index.ts` BEFORE the composition root.
 *
 * Lives as a bare `src/*.ts` file (same composition-root exemption class as `routers.ts` — see its
 * docblock): it belongs to no bounded context and must evaluate before ANY `BoundedContext.create`.
 *
 * 1. SINGLE-INSTANCE LOCK — acquire the CODEDM_DATA_DIR lock before `./routers` triggers context
 *    creation, so a dir already held by a live daemon fails with ONE legible DataDirLockedError
 *    instead of a cascade of buried "Failed to resolve controller" traces. Idempotent per pid (the
 *    file-backed driver re-acquires as a no-op). Skipped under EMIT_OPENAPI (codegen never boots
 *    the real daemon and binds the in-memory driver).
 *
 * 2. E2E FAIL-CLOSED GUARD — refuse `CODEDM_E2E=true` under NODE_ENV=production before anything
 *    reads the flag: it binds an in-process ExternalMediator (silently severing the Go gateway)
 *    and mounts the unauthenticated test-ingress endpoint — hermetic-test-only seams.
 */
import { Config, acquireDataDirLock, resolveDataDir } from '@codedm/core-typescript'

if (process.env.EMIT_OPENAPI !== 'true') {
	acquireDataDirLock(resolveDataDir(Config.env.CODEDM_DATA_DIR))
}

if (process.env.CODEDM_E2E === 'true' && Config.env.NODE_ENV === 'production') {
	throw new Error(
		'CODEDM_E2E=true is refused under NODE_ENV=production — it binds an in-process ExternalMediator and ' +
			'mounts an unauthenticated test ingress endpoint, both hermetic-test-only seams. Unset CODEDM_E2E to boot production.',
	)
}
