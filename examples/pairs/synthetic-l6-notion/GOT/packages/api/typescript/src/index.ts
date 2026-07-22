// api-ts — root bootstrap. Wires auth + notifications + ui contexts into a
// single HTTP server. All controller paths are version-relative (e.g. /session,
// /feed) so MainRouter prepends the version prefix: /v1/session, /v1/feed, etc.
//
// shared/index.ts is the root BoundedContext: applies ALL_REGISTRIES, starts
// outbox dispatcher, connects Redis external mediator, registers external handlers.
//
// ref: dev:packages/api/src/shared/index.ts (root BoundedContext pattern)

// Register reflect-metadata first (required by tsyringe-neo decorators).
import 'reflect-metadata'

import {
	Config,
	MainRouter,
	FastifyHttpRouter,
	OutboxDispatcher,
	ExternalMediator,
	openapi,
	startTelemetry,
	traceClass,
	Controller,
	HttpRouter,
	Middleware,
	Router,
} from '@template/core-typescript'

// Root context — side-effect import: creates root BoundedContext, applies ALL_REGISTRIES,
// starts outbox/redis, registers external handlers. Must come before child context imports.
import SharedRouter from '@shared/index'
import AuthRouter from '@auth/index'
import IdentityRouter from '@identity/index'
import TenancyRouter from '@tenancy/index'
import BillingRouter from '@billing/index'
import IntegrationRouter from './integration/index'
import SalesRouter from '@sales/index'
import TrackingRouter from './tracking/index'
import AnalyticsRouter from './analytics/index'
import FinanceRouter from './finance/index'
import CatalogRouter from './catalog/index'
import MarketingRouter from './marketing/index'
import NotificationsRouter from '@notifications/index'
import UiRouter from '@ui/index'
import WorkspaceRouter from './workspace/index'
import PageRouter from './page/index'
import { container } from 'tsyringe-neo'

// Prevent concurrent shutdown attempts.
let isShuttingDown = false

async function start(): Promise<void> {
	// Trace all framework classes for OpenTelemetry span injection.
	traceClass([Controller, HttpRouter, Middleware, Router, MainRouter])

	// Collect routers from all contexts.
	const routers = [
		SharedRouter,
		AuthRouter,
		IdentityRouter,
		TenancyRouter,
		BillingRouter,
		IntegrationRouter,
		SalesRouter,
		TrackingRouter,
		AnalyticsRouter,
		FinanceRouter,
		CatalogRouter,
		MarketingRouter,
		NotificationsRouter,
		UiRouter,
		WorkspaceRouter,
		PageRouter,
	]

	// Build OpenAPI spec (used by scripts/emit-openapi.ts when EMIT_OPENAPI=true).
	await openapi.generateSpecification(routers)

	// If we only need the spec (emit-openapi mode), exit after writing.
	if (process.env.EMIT_OPENAPI === 'true' && process.env.START_SERVER !== 'true') {
		console.log('✅ openapi.json written — exiting (emit-only mode)')
		process.exit(0)
	}

	// HTTP router — controllers already have full version-relative paths (/session, /feed, …).
	const httpRouter = new FastifyHttpRouter()

	const mainRouter = new MainRouter({
		httpRouter,
		version: Config.version,
		routers,
	})

	// Start HTTP server.
	await mainRouter.start()

	// Start OpenTelemetry tracer (no-op when OTEL_COLLECTOR_TRACE_URL is empty).
	await startTelemetry()

	console.log(`✅ api-ts listening on port ${Config.env.API_PORT}`)

	// Graceful shutdown.
	async function shutdown(signal: string): Promise<void> {
		if (isShuttingDown) return
		isShuttingDown = true
		console.log(`\n🛑 Received ${signal} — shutting down gracefully…`)
		try {
			await mainRouter.stop()

			const outboxDispatcher = container.resolve(OutboxDispatcher as any) as OutboxDispatcher
			await outboxDispatcher.stop()

			const externalMediator = container.resolve(ExternalMediator as any) as ExternalMediator
			await externalMediator.stop()

			console.log('✅ Graceful shutdown completed')
			process.exit(0)
		} catch (error) {
			console.error('❌ Error during shutdown:', error)
			process.exit(1)
		}
	}

	process.on('SIGTERM', () => shutdown('SIGTERM'))
	process.on('SIGINT', () => shutdown('SIGINT'))
	process.on('SIGUSR2', () => shutdown('SIGUSR2'))
}

start().catch(error => {
	console.error('❌ Failed to start api-ts:', error)
	process.exit(1)
})
