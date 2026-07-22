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
} from '@template/core-typescript'

// Composition root — all context routers wired + checked against the manifest. Importing this
// pulls in every context's side-effect module (starting with @shared/index, which creates the
// root BoundedContext, applies ALL_REGISTRIES, starts the outbox dispatcher + the in-process
// EventEmitter2 external mediator, registers external handlers).
import { ALL_ROUTERS } from './routers'
import { container } from 'tsyringe-neo'

// Prevent concurrent shutdown attempts.
let isShuttingDown = false

async function start(): Promise<void> {
	// Trace all framework classes for OpenTelemetry span injection.
	traceClass([Controller, HttpRouter, Middleware, Router, MainRouter])

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
