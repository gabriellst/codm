// server.ts — the ENTIRE boot choreography (spec Decisions 1/2 — .specs/2026-08-10-eixo-unico-
// ambiente-design.md), lived here as ONE function so production (src/index.ts), the console's
// integration test harness (tests/support/testing.ts, T7), and e2e (`CODM_ENV=e2e`) all INHERIT
// the same sequence instead of re-enacting it. Before T4 this file only held `assembleMainRouter`
// (extracted so the harness wouldn't re-declare `new MainRouter({...})`); T4 pulls the rest of what
// used to be `src/index.ts`'s `start()` down here, generalized by `options.env`, so index.ts is
// reduced to a process shell (signals, watchdog, telemetry) and the harness stops re-implementing
// the migration-ordering dance its own docblock (now deleted) confessed line by line.
import {
	Config,
	OutboxDispatcher,
	InternalMediator,
	ExternalMediator,
	closeDatabase,
	openapi,
	Controller,
	HttpRouter,
	Middleware,
	Router,
	MainRouter,
	DrizzleDatabaseDriver,
	traceClass,
	setBoundedContextEnvironment,
	registerAll,
	type BoundedContextEnvironment,
} from '@codm/core-typescript'
import { container } from 'tsyringe-neo'
import { ALL_REGISTRIES } from '@shared/registry'
import { isCloudProfile, filterRoutersForCloudProfile } from '@shared/cloud-profile'
// The agent runtime's WIRING tokens, imported for SHUTDOWN (AgentRunnerFactory) and boot+shutdown
// (MailboxDispatcher) — STATIC, not dynamic: both are pure type + abstract-class modules with no DB
// reach, so unlike `./routers` they need no deferral relative to the migration below. This mirrors
// the pre-T4 `src/index.ts`, which imported both the same way for the same documented reason.
import { AgentRunnerFactory } from '@agent/services/AgentRunnerFactory/AgentRunnerFactory'
import { MailboxDispatcher } from '@agent/services/MailboxDispatcher'

export interface RunningServer {
	url: string
	container: typeof container
	stop(): Promise<void>
}

/**
 * Resolve the transport (whatever `HttpRouter` is bound to in the caller's active environment) and
 * assemble the `MainRouter` that mounts `routers` on it. Does NOT call `.start()` — the caller
 * decides when to listen. Kept EXPORTED (not folded fully private into `start()`) — `start()` itself
 * calls it below, and it stays a usable seam for anything that needs the router assembled without
 * also starting the listener.
 */
export function assembleMainRouter(routers: Router[]): MainRouter {
	// Resolvido UMA vez aqui (não inline dentro de `new MainRouter(...)`) — a mesma instância é
	// compartilhada com o MainRouter, que monta as rotas dos contextos e sobe o servidor.
	// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo can't type an abstract class as an injection token — resolve is narrowed on the same expression.
	const httpRouter = container.resolve(HttpRouter as any) as HttpRouter

	return new MainRouter({
		httpRouter,
		version: Config.version,
		routers,
	})
}

/**
 * THE boot function. `options.env` selects the axis column (`real` for production, `integration`
 * for the console harness, `e2e` for Playwright); `options.port` overrides `Config.env.API_PORT`
 * (the harness/e2e pass `0` for an OS-assigned ephemeral port — see `MainRouter.start`).
 */
export async function start(options: { env: BoundedContextEnvironment; port?: number }): Promise<RunningServer> {
	setBoundedContextEnvironment(options.env)
	traceClass([Controller, HttpRouter, Middleware, Router, MainRouter])

	// THE SACRED ORDER (measured regression if broken: `SQLITE_ERROR: no such table
	// shared_scheduled_commands`) — replicated from the now-deleted `tests/support/
	// integration-server.ts` note 4, generalized by `options.env`:
	//
	//   1. select the environment (above)
	//   2. REGISTER this env's kernel bindings on the root container
	//   3. resolve the driver + migrate
	//   4. ONLY THEN dynamically import `./routers`
	//
	// Step 4 pulls in every context module as an import SIDE-EFFECT, starting with
	// `@shared/index.ts` — whose own `BoundedContext.create({ root: true, registry: ALL_REGISTRIES,
	// jobs: [...] })` runs `registerJobs` (which ENQUEUES `PruneOutbox` into
	// `shared_scheduled_commands`) BEFORE its `setup()` callback gets to migrate, inside that SAME
	// call. Registering + migrating here, before that import, means `registerJobs`'s enqueue lands on
	// an already-migrated schema; `@shared/index.ts`'s own `registerAll` + `runMigrations()` become
	// idempotent no-ops over the same `_sqlite_migrations` ledger (and the same container-owned driver
	// singleton, since `registerAll` on an already-registered token just re-applies the identical
	// binding — see `core/src/types/Registry.ts` `registerAll`).
	//
	// `setBoundedContextEnvironment` itself is what makes skipping this safe to reason about: T1's
	// falsifier (`core/src/types/BoundedContext.environment.test.ts`, "e2e sob NODE_ENV=production é
	// recusado") proves the selector refuses ANY non-real env under production — which is why the old
	// raw-flag guard that used to live in `src/boot.ts` is gone; this call is the single fail-closed
	// gate now.
	registerAll(container, ALL_REGISTRIES[options.env])

	// Spec emission (`bun sdk` / `emit-openapi`) imports the composition root ONLY to collect routers —
	// booting infra there would open the real data dir and poll an empty DB. Same guard the deleted
	// `migrateEmbeddedDatabase()` wrapper carried (src/shared/registry.ts, pre-T4).
	if (Config.env.EMIT_OPENAPI !== 'true') {
		// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo can't type an abstract class as an injection token.
		await (container.resolve(DrizzleDatabaseDriver as any) as DrizzleDatabaseDriver).runMigrations()
	}

	// Composition root — all context routers wired + checked against the manifest. Dynamically
	// imported (not static) so it evaluates strictly after the registration + migration above.
	const { ALL_ROUTERS } = await import('./routers')

	// CLOUD PROFILE — CODM_PROFILE=cloud narrows the mounted/emitted routers to auth+owner+shared
	// (see src/shared/cloud-profile.ts for the filter + its documented scope). A no-op without it:
	// `routers` is exactly `ALL_ROUTERS`, unchanged.
	const routers = filterRoutersForCloudProfile(ALL_ROUTERS, Config.env.CODM_PROFILE || undefined)

	// Build OpenAPI spec (used by scripts/emit-openapi.ts when EMIT_OPENAPI=true). Reuses the SAME
	// filtered `routers` — a cloud-profile emission (if ever run) documents only what it serves.
	await openapi.generateSpecification(routers)

	// If we only need the spec (emit-openapi mode), exit after writing. Boot behavior, not
	// process-shell behavior — stays inside `start()` (spec scope fence).
	if (Config.env.EMIT_OPENAPI === 'true' && Config.env.START_SERVER !== 'true') {
		console.log('✅ openapi.json written — exiting (emit-only mode)')
		process.exit(0)
	}

	// HTTP router — resolved by the abstract `HttpRouter` DI token, not the Fastify concrete class.
	// `options.port` overrides `Config.env.API_PORT` when given (the harness/e2e ask for `0`); the
	// EFFECTIVE bound port comes back from `MainRouter.start` (relevant when the OS assigns one).
	const mainRouter = assembleMainRouter(routers)
	const effectivePort = await mainRouter.start(options.port)

	// THE MAILBOX DISPATCHER — the single consumer of queued turns (orchestrator pivot §7.4). Skipped
	// under the cloud profile: the mailbox is an `agent`-context table no cloud request ever writes to
	// (the profile filter above already keeps `agent`'s router unmounted).
	if (!isCloudProfile()) {
		// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo can't type an abstract class as an injection token.
		;(container.resolve(MailboxDispatcher as any) as MailboxDispatcher).bind(container).start()
	}

	let stopped = false

	// The production `shutdown()` sequence WITHOUT `process.exit` — the caller (src/index.ts) exits;
	// the harness (tests/support/testing.ts, T7) calls this and stays alive for the next test. Mirror
	// of the origin sequence (medscall api): stop accepting HTTP → drain the outbox → drop mediator
	// subscriptions → stop the external transport → close DB pools LAST, after every writer is quiet.
	// Each step is guarded so a failed resource never aborts the rest of the drain.
	async function stop(): Promise<void> {
		if (stopped) return
		stopped = true

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
		// Agent runtime + mailbox dispatcher: SKIPPED under the cloud profile, mirroring the boot-side
		// guard above — neither was ever started there.
		if (!isCloudProfile()) {
			// biome-ignore lint/suspicious/noExplicitAny: abstract class as tsyringe token.
			await step('agent runs', () => (container.resolve(AgentRunnerFactory as any) as AgentRunnerFactory).shutdown())
			// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo can't type an abstract class as an injection token.
			await step('mailbox dispatcher', () => (container.resolve(MailboxDispatcher as any) as MailboxDispatcher).stop())
		}
		// biome-ignore lint/suspicious/noExplicitAny: abstract tokens.
		await step('outbox dispatcher', () => (container.resolve(OutboxDispatcher as any) as OutboxDispatcher).stop())
		await step('mediator listeners', () => {
			// biome-ignore lint/suspicious/noExplicitAny: abstract tokens.
			;(container.resolve(InternalMediator as any) as InternalMediator).removeAllListeners()
			// biome-ignore lint/suspicious/noExplicitAny: abstract tokens.
			;(container.resolve(ExternalMediator as any) as ExternalMediator).removeAllListeners()
		})
		// biome-ignore lint/suspicious/noExplicitAny: abstract tokens.
		await step('external mediator transport', () => (container.resolve(ExternalMediator as any) as ExternalMediator).stop())
		await step('database connections', () => closeDatabase())

		// The exit-code-1-on-failed-step behavior of the old `shutdown()` is preserved at the SHELL
		// level: index.ts wraps its `await server.stop()` in try/catch and exits 1 on rejection, rather
		// than this function calling `process.exit` itself — `stop()` must be safe for the harness to
		// call too, which never wants the test process to exit.
		if (failed) throw new Error('Graceful shutdown completed with failed step(s) — see warnings above')
	}

	return { url: `http://localhost:${effectivePort}`, container, stop }
}
