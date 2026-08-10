// api-ts — root process shell. The boot CHOREOGRAPHY lives in `start()` (src/server.ts, spec
// Decision 1) — production, the console's integration test harness, and e2e all inherit it. This
// file owns only what is genuinely PROCESS-level: signal handlers, the parent watchdog, telemetry,
// and translating a failed `start()`/`stop()` into an exit code.
//
// ref: dev:packages/api/src/shared/index.ts (root BoundedContext pattern)

// Register reflect-metadata first (required by tsyringe-neo decorators).
import 'reflect-metadata'

// EARLY boot side-effects (single-instance data-dir lock) — must sit above the `start()` import
// below; see src/boot.ts.
import './boot'

// The desktop shell's dead-man's switch, armed AFTER the signal handlers exist — see the call site
// below for why (src/watchdog.ts docblock has the full reasoning).
import { startParentWatchdog } from './watchdog'

import { Config, startTelemetry } from '@codm/core-typescript'
import { start } from './server'

async function main(): Promise<void> {
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

	// PARENT WATCHDOG — started HERE, and not in `./boot`, precisely because it needs the handlers
	// above to already exist: its reaction is a SIGTERM to ourselves, so the whole drain runs and the
	// provider CLI process groups die with us. Started earlier it would only find the DataDirLock
	// listener, which releases the lockfile and re-raises — a hard exit that leaks every agent.
	//
	// No-op unless a desktop shell stamped CODM_PARENT_PID on this process. See ./watchdog.
	startParentWatchdog()
}

main().catch(error => {
	console.error('❌ Failed to start api-ts:', error)
	process.exit(1)
})
