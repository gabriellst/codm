// shared/index.ts — root BoundedContext for api-ts.
// Applies ALL_REGISTRIES to rootContainer, starts outbox dispatcher, starts the
// external mediator (concrete impls self-bootstrap inside .start()), and
// registers external handlers that span contexts.
// Must be imported (side-effect) before any child context module.
//
// Adapted from: dev:packages/api/src/shared/index.ts
// ref: .claude/skills/bounded-context/SKILL.md

import {
	BoundedContext,
	OutboxDispatcher,
	ExternalMediator,
	DrizzleDatabaseDriver,
	DrizzleClient,
	LoggingService,
	openapi,
} from '@codedm/core-typescript'
import { ALL_REGISTRIES } from './registry'
// Context-local (non-wire) enums: spread each context's enum barrel so any
// controller-facing enum is auto-registered. Adding an enum to a context's
// `enums/index.ts` is enough — no need to remember to list it here.
import * as wireEnums from '@codedm/contracts-typescript/wire/enums'
import * as sharedEnums from './enums'
import * as authEnums from '@auth/enums'
import * as uiEnums from '@ui/enums'
import * as sharedObjects from './objects'
import { TestIngressController } from './controllers'

// TEST-ONLY gateway ingress seam — mounted ONLY under CODEDM_E2E (the Playwright harness), refused
// under NODE_ENV=production by src/boot.ts, and never emitted to the SDK/OpenAPI
// (emission runs under EMIT_OPENAPI with CODEDM_E2E unset). Lets a spec simulate the Go gateway's side
// effects (seed a connected channel / inject an inbound message) against the TS-only daemon.
const testControllers: Record<string, typeof TestIngressController> = process.env.CODEDM_E2E === 'true' ? { TestIngressController } : {}

const ctx = await BoundedContext.create({
	name: 'shared',
	root: true,
	controllers: testControllers,
	registry: ALL_REGISTRIES,
	setup: async container => {
		// Spec emission (bun sdk / emit-openapi) imports the composition root ONLY to collect routers —
		// booting infra there would spin up the embedded PGlite (WASM + data dir) and poll an empty DB.
		// Same guard as BoundedContext.registerJobs.
		if (process.env.EMIT_OPENAPI === 'true') return

		// Migrations apply ON BOOT, before any context serves a request or the outbox polls: the real
		// driver is embedded file-backed PGlite (see shared/registry.ts) whose runMigrations() is
		// idempotent + ordered. This is the daemon's only migration step — there is no external Postgres
		// to `bun migrate` against.
		const databaseDriver = container.resolve(DrizzleDatabaseDriver as any) as DrizzleDatabaseDriver
		// CRITICAL — memoize the ONE process-wide driver instance. The real binding is a per-resolve
		// `useFactory` (shared/registry.ts filePgliteDriver), and tsyringe-neo invokes factories on
		// EVERY resolve with no caching — so without this, each repo / the outbox dispatcher / this boot
		// path would each mint a SEPARATE `new PGlite(dataDir)`. Live PGlite instances over one data dir
		// DIVERGE (they load from disk at open but do not share state), leaving the outbox dispatcher
		// polling an instance that never sees request-path writes — the entire event-driven write-side
		// dead. Pinning the resolved driver + its db here (before migrations, outbox, or any context
		// serves) makes DrizzleClient / UnitOfWorkFactory factories resolve this same instance forever.
		// Mirrors TestBed.ts:92-93.
		container.registerInstance(DrizzleDatabaseDriver as any, databaseDriver)
		container.registerInstance(DrizzleClient as any, databaseDriver.db)
		await databaseDriver.runMigrations()
		const loggingService = container.resolve(LoggingService as any) as LoggingService
		loggingService.info({ content: { message: 'Migrations applied (embedded PGlite)' } })

		const externalMediator = container.resolve(ExternalMediator as any) as ExternalMediator
		const outboxDispatcher = container.resolve(OutboxDispatcher as any) as OutboxDispatcher
		await externalMediator.start()
		outboxDispatcher.start()
	},
})

// Register enums so controller schemas can resolve enum component names
// by matching sorted value lists (handleEnumSchema → resolveEnumName). Without this,
// enum components get generated names like `ReactionType2` whenever the path-based
// fallback collides with a sibling field. See cc-bp-13.
openapi.registerEnums({ ...wireEnums, ...sharedEnums, ...authEnums, ...uiEnums })

// Register the SHARED value objects + read atoms as named `$ref` components, so any
// controller body/response that embeds them emits a `$ref: '#/components/schemas/<Name>'`
// instead of inlining.
//
// SCOPE — shared/* ONLY. Context-owned objects (auth/finance/sales/catalog) are NOT
// blanket-registered. The SDK/OpenAPI is effectively public (it ships in the browser
// bundle), so a context's value objects are domain-internal by default — publishing them
// risks leaking sensitive shapes (cost basis, audit timelines, proprietary invariants).
// A context VO that genuinely belongs on the wire surfaces the moment a controller
// references it (it inlines at the use-site) — an explicit, per-endpoint decision rather
// than a blanket export. This also retires the former per-schema exclusion list
// (ShippingFee / OrderOverride / ProductCostOption*), which only existed to carve
// write-model VOs back out of an over-broad "register every objects/" rule.
//
// Non-schema exports in these barrels (factory functions, classes, plain types) carry no
// _zod / ~standard marker and are silently skipped by registerSchemas.
openapi.registerSchemas({
	...sharedObjects,
})

export default ctx.router
