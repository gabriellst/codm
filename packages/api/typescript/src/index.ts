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

import { Config, acquireDataDirLock, armStdinShutdown, resolveDataDir, startParentWatchdog, startTelemetry } from '@codm/core-typescript'
import { criteriaFromEnv } from '@shared/deployment'
import { start } from '../composition/server'
import { formatBootError } from './bootError'

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
	// The data dir is a DESKTOP fact: it is where the daemon and the gateway share the SQLite file.
	// The cloud deployment (auth + owner on Postgres, ADR 0001/0005) has no SQLite and no sibling
	// process to fence — resolving a dir there only ever produced an EACCES at boot on a read-only
	// image home (Railway, 2026-08-25: `mkdir '/app/.codm/data'` under USER 1000). Same literal
	// `CODM_PROFILE === 'cloud'` read the deployment table uses — no second parse of the flag.
	const desktop = criteriaFromEnv().deployment === 'local'
	if (Config.env.EMIT_OPENAPI !== 'true' && desktop) acquireDataDirLock(resolveDataDir(Config.env.CODM_DATA_DIR))

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

	// PARENT WATCHDOG — handed THE SAME `shutdown` the signal handlers run, so the whole drain runs and
	// the provider CLI process trees die with us. Not a SIGTERM to ourselves: on Windows a self-signal
	// is an unconditional TerminateProcess (no listener runs, every agent leaks); calling the drain is
	// the same drain on every OS. The signal handlers above never arrive on Windows at all — there,
	// this watchdog (ppid frozen at spawn, so the liveness probe half of its condition) is the ONLY
	// path from "the shell is gone" to a clean exit.
	//
	// No-op unless a desktop shell stamped CODM_PARENT_PID on this process. See core's Watchdog.
	startParentWatchdog({ onOrphaned: () => shutdown('CODM_PARENT_PID') })

	// SHELL→DAEMON STDIN CHANNEL — o shell escreve SHUTDOWN_SENTINEL_LINE no nosso stdin no passo
	// GRACIOSO da propria escalacao de shutdown dele (`src-tauri/src/sidecars/lifecycle.rs`,
	// `Supervised::terminate`), em TODA plataforma. O POSIX ainda recebe SIGTERM tambem — isto e
	// cinto-e-suspensorio la. No Windows `send_sigterm` e um no-op (nao existe sinal para um processo
	// sem console) e esta linha e o UNICO aviso antes do `force_kill` do shell (`CommandChild::kill` =
	// TerminateProcess) — um kill duro que pularia este drain inteiro. Mesmo `shutdown` de todo
	// outro gatilho, entao o comportamento e identico em qualquer SO; o guard `enabled` de
	// `armStdinShutdown` (default `Boolean(CODM_PARENT_PID)`) evita que um terminal de `bun dev` seja
	// confundido com um pedido de shutdown.
	armStdinShutdown({ onShutdown: () => shutdown('stdin-sentinel') })
}

main().catch(error => {
	// See ./bootError — an EADDRINUSE (the shell's own pre-spawn port check lost a race, or the
	// daemon was launched by hand onto a busy port) collapses to ONE actionable line instead of the
	// raw Bun/Node stack trace, so the persisted stderr the boot-error splash renders reads as "a
	// port is taken" and not "something is badly broken".
	console.error(`❌ Failed to start api-ts: ${formatBootError(error, Config.env.API_PORT)}`)
	process.exit(1)
})
