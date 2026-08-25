// api-ts — root process shell. The boot CHOREOGRAPHY lives in `start()` (src/server.ts, spec
// Decision 1) — production, the console's integration test harness, and e2e all inherit it. This
// file owns only what is genuinely PROCESS-level: the single-instance lock, signal handlers, the
// parent watchdog, telemetry, and translating a failed `start()`/`stop()` into an exit code.
//
// ref: dev:packages/api/src/shared/index.ts (root BoundedContext pattern)

// ── FIRST, AND THE ORDER IS LOAD-BEARING ────────────────────────────────────────────────────────
//
// `./polyfill` installs the reflect polyfill tsyringe-neo needs before any decorated module is
// evaluated. It is a RELATIVE import on purpose: under `bun build` the bundler does not preserve the
// order between a bare package side-effect import and a bare package value import, so
// `import 'reflect-metadata'` here would be hoisted below `@codm/core-typescript` and the shipped
// bundle would die at startup. See that file for the measurement.
import './polyfill'

import { Config, acquireDataDirLock, resolveDataDir, startParentWatchdog, startTelemetry } from '@codm/core-typescript'
import { start } from '../composition/server'

/**
 * THE SINGLE-INSTANCE LOCK — an explicit step, not an import side-effect.
 *
 * It used to live in `src/boot.ts`, whose whole job was to be imported for its side effect, above the
 * `start()` import, with a comment in TWO files saying it "must sit above" — correctness that
 * depended on import ORDER and was guarded by nothing but prose.
 *
 * WHY IT STAYS IN THE PROCESS SHELL and does not move into `start()`: `start()` is also what the
 * integration harness and the e2e runner call, and they boot many times over `HARNESS_DATA_DIR`.
 * Locking there would change the behaviour of ~79 suites for the benefit of one caller. The lock is a
 * PROCESS-level fact — "this daemon owns this data dir" — and this file is the process shell.
 *
 * WHY IT MUST STILL BE FIRST: a dir already held by a live daemon has to fail with ONE legible
 * `DATA_DIR_LOCKED`, before anything resolves a driver. `start()` runs bindContexts →
 * composeContexts, and composeContexts resolves EVERY controller; a locked dir discovered there
 * surfaces as a cascade of "Failed to resolve controller" traces with the real cause buried.
 *
 * Skipped under EMIT_OPENAPI: codegen never boots the real daemon, and binds the in-memory driver.
 */
async function main(): Promise<void> {
	if (Config.env.EMIT_OPENAPI !== 'true') acquireDataDirLock(resolveDataDir(Config.env.CODM_DATA_DIR))

	const server = await start({ env: Config.env.CODM_ENV, port: Config.env.API_PORT })
	await startTelemetry()
	console.log(`✅ api-ts listening on ${server.url}`)

	let isShuttingDown = false
	const shutdown = async (signal: string): Promise<void> => {
		if (isShuttingDown) return
		isShuttingDown = true
		console.log(`\n🛑 Received ${signal} — shutting down gracefully…`)
		try {
			await server.stop()
			console.log('✅ Graceful shutdown completed')
			process.exit(0)
		} catch (error) {
			console.error('❌ Graceful shutdown completed with failed step(s):', error)
			process.exit(1)
		}
	}

	process.on('SIGTERM', () => shutdown('SIGTERM'))
	process.on('SIGINT', () => shutdown('SIGINT'))
	process.on('SIGUSR2', () => shutdown('SIGUSR2'))

	// PARENT WATCHDOG — started HERE, and not before the handlers, precisely because it needs them to
	// already exist: its reaction is a SIGTERM to ourselves, so the whole drain runs and the provider
	// CLI process groups die with us. Started earlier it would only find the DataDirLock listener,
	// which releases the lockfile and re-raises — a hard exit that leaks every agent.
	//
	// No-op unless a desktop shell stamped CODM_PARENT_PID on this process. See core's Watchdog.
	startParentWatchdog()
}

main().catch(error => {
	console.error('❌ Failed to start api-ts:', error)
	process.exit(1)
})
