// api-ts — root bootstrap. Boots every context declared in @shared/contexts:
// routers come from src/routers.ts (ALL_ROUTERS, manifest-checked composition
// root) — this file names no individual context. All controller paths are version-relative (e.g. /session,
// /feed) so MainRouter prepends the version prefix: /v1/session, /v1/feed, etc.
//
// shared/index.ts is the root BoundedContext: applies ALL_REGISTRIES, starts
// the outbox dispatcher, starts the in-process EventEmitter2 external mediator
// (no Redis transport exists in this repo — the real ExternalMediator binding is
// EventEmitter2Mediator), and registers external handlers.
//
// ref: dev:packages/api/src/shared/index.ts (root BoundedContext pattern)

// Register reflect-metadata first (required by tsyringe-neo decorators).
import 'reflect-metadata'

// EARLY boot side-effects (single-instance data-dir lock + e2e fail-closed guard) — must sit
// above the composition-root import below; see src/boot.ts.
import './boot'

import {
	Config,
	MainRouter,
	OutboxDispatcher,
	InternalMediator,
	ExternalMediator,
	closeDatabase,
	openapi,
	startTelemetry,
	traceClass,
	Controller,
	HttpRouter,
	Middleware,
	Router,
} from '@codm/core-typescript'

// The embedded-database migration step — a plain function, NOT a side-effect import: it must run
// BEFORE the composition root, and awaiting a top-level-await side-effect module does NOT serialize
// against a statically-imported `./routers` (ESM evaluates both async branches concurrently, so the
// contexts create — and a `registerJobs` enqueue races the migration — before the await resolves).
// Calling it explicitly in start(), then DYNAMICALLY importing `./routers` after it, is what forces
// the ordering: migrate → then contexts create against the already-migrated singleton.
import { migrateEmbeddedDatabase } from '@shared/registry'
// The agent runtime's WIRING token, imported for SHUTDOWN only (see the 'agent runs' step below).
// Statically: a pure type + abstract class module with no DB reach, so it does not need the deferral
// that `./routers` does, and a dynamic import here is what forced the duck-typed `any` this phase
// removes. It is the FACTORY rather than the seam because `AgentRunner` is no longer a token — the
// factory owns every runner it handed out, and is the only thing that can reach them to kill them.
import { AgentRunnerFactory } from '@agent/services/AgentRunnerFactory/AgentRunnerFactory'
import { MailboxDispatcher } from '@agent/services/MailboxDispatcher'
import { container } from 'tsyringe-neo'

// Prevent concurrent shutdown attempts.
let isShuttingDown = false

async function start(): Promise<void> {
	// Trace all framework classes for OpenTelemetry span injection.
	traceClass([Controller, HttpRouter, Middleware, Router, MainRouter])

	// EARLY, SERIALIZED migration: apply the shared-SQLite schema on the ONE real driver singleton
	// before any BoundedContext.create runs. The dynamic `import('./routers')` below is what pulls in
	// every context's side-effect module (starting with @shared/index) — deferring it until AFTER this
	// await guarantees the schema exists before any context (or its jobs) touches the DB.
	await migrateEmbeddedDatabase()

	// Composition root — all context routers wired + checked against the manifest. Dynamically imported
	// (not static) so it evaluates strictly after the migration above.
	const { ALL_ROUTERS } = await import('./routers')

	// Collect routers from all contexts (composition root — checked against the manifest).
	const routers = ALL_ROUTERS

	// Build OpenAPI spec (used by scripts/emit-openapi.ts when EMIT_OPENAPI=true).
	await openapi.generateSpecification(routers)

	// If we only need the spec (emit-openapi mode), exit after writing.
	if (process.env.EMIT_OPENAPI === 'true' && process.env.START_SERVER !== 'true') {
		console.log('✅ openapi.json written — exiting (emit-only mode)')
		process.exit(0)
	}

	// HTTP router — resolved by the abstract `HttpRouter` DI token, not the Fastify concrete class.
	// The real registry binds `{ token: HttpRouter, instance: FastifyHttpRouter }`, so swapping the
	// transport is a one-line registry change and the composition root never names the impl.
	const mainRouter = new MainRouter({
		// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo can't type an abstract class as an injection token — resolve is narrowed on the same expression.
		httpRouter: container.resolve(HttpRouter as any) as HttpRouter,
		version: Config.version,
		routers,
	})

	// Start HTTP server.
	await mainRouter.start()

	// THE MAILBOX DISPATCHER — the single consumer of queued turns (orchestrator pivot §7.4).
	//
	// Without this line the whole pivot is INERT in exactly the way that is hardest to notice: ingest
	// still queues, tsc is green, every unit test passes, and the product simply never answers. It was
	// caught by the e2e suite, not by any gate above it, which is the same shape as the bug that left
	// this product dead for weeks. Its first act is the boot sweep, so a turn stranded by a crashed
	// process is picked up here.
	// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo can't type an abstract class as an injection token.
	;(container.resolve(MailboxDispatcher as any) as MailboxDispatcher).bind(container).start()

	// Start OpenTelemetry tracer (no-op when OTEL_COLLECTOR_TRACE_URL is empty).
	await startTelemetry()

	console.log(`✅ api-ts listening on port ${Config.env.API_PORT}`)

	// Graceful shutdown — mirror of the origin sequence (medscall api). Each step is guarded so a
	// failed resource never aborts the rest of the drain: stop accepting HTTP → drain the outbox →
	// drop mediator subscriptions → stop the external transport (disconnects networked impls via
	// the Mediator lifecycle contract) → close DB pools LAST, after every writer is quiet.
	async function shutdown(signal: string): Promise<void> {
		if (isShuttingDown) return
		isShuttingDown = true
		console.log(`\n🛑 Received ${signal} — shutting down gracefully…`)
		let failed = false
		const step = async (label: string, fn: () => Promise<void> | void): Promise<void> => {
			try {
				await fn()
			} catch (error) {
				failed = true
				console.warn(`⚠️ shutdown step failed (${label}):`, error)
			}
		}

		await step('http server', () => mainRouter.stop())
		// Agent runtime: kill every live provider PROCESS GROUP before the outbox/db drain, so no CLI —
		// nor any child it spawned — outlives the daemon. `shutdown()` is DECLARED on the `AgentRunner`
		// seam (§4.11) and FANNED OUT by the factory, which is exactly what removed the duck-typing this
		// step used to need: it dynamically imported the old token and probed `typeof runner.shutdown ===
		// 'function'` because only one of four implementations had the method. The factory is a container
		// SINGLETON, so the runners it shuts down are the same instances it handed to the agents.
		// biome-ignore lint/suspicious/noExplicitAny: abstract class as tsyringe token — same pattern as the resolves below.
		await step('agent runs', () => (container.resolve(AgentRunnerFactory as any) as AgentRunnerFactory).shutdown())
		// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo can't type an abstract class as an injection token.
		await step('mailbox dispatcher', () => (container.resolve(MailboxDispatcher as any) as MailboxDispatcher).stop())
		await step('outbox dispatcher', () => (container.resolve(OutboxDispatcher as any) as OutboxDispatcher).stop())
		await step('mediator listeners', () => {
			;(container.resolve(InternalMediator as any) as InternalMediator).removeAllListeners()
			;(container.resolve(ExternalMediator as any) as ExternalMediator).removeAllListeners()
		})
		await step('external mediator transport', () => (container.resolve(ExternalMediator as any) as ExternalMediator).stop())
		await step('database connections', () => closeDatabase())

		if (failed) {
			console.error('❌ Graceful shutdown completed with failed step(s)')
			process.exit(1)
		}
		console.log('✅ Graceful shutdown completed')
		process.exit(0)
	}

	process.on('SIGTERM', () => shutdown('SIGTERM'))
	process.on('SIGINT', () => shutdown('SIGINT'))
	process.on('SIGUSR2', () => shutdown('SIGUSR2'))
}

start().catch(error => {
	console.error('❌ Failed to start api-ts:', error)
	process.exit(1)
})
