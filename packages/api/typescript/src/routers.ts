/**
 * Composition root for the app's HTTP routers.
 *
 * This file lives at `src/` root — NOT under `src/shared/` — because it imports every bounded
 * context's `Router` (`@auth`, `@ui`, …). Placing it under `shared/` would make the
 * context-boundary rail flag `@shared` importing from every other context; a bare `src/*.ts` file
 * that belongs to no bounded context is composition-root exempt.
 *
 * `ROUTERS` is checked against the context manifest (`@shared/contexts`) via `satisfies
 * Record<ContextModule, Router>`. Adding a context to `CONTEXTS` without wiring its router here is
 * a COMPILE ERROR, not a silent gap — and dropping one is too. This is the entire point of this file.
 *
 * Both `src/index.ts` (server boot) and `scripts/emit-openapi.ts` (ad-hoc OpenAPI emission) import
 * `ALL_ROUTERS` from here instead of each maintaining its own copy of the router imports + array
 * literal.
 *
 * ref: medscall@0d0fa480 (single router composition root, checked against the manifest)
 */
import type { Router } from '@template/core-typescript'
import type { ContextModule } from '@shared/contexts'

// Import each context Router — order matters: @shared boots first (DI side effects: applies
// ALL_REGISTRIES, starts outbox/redis), the rest preserve the original src/index.ts /
// scripts/emit-openapi.ts ordering.
import SharedRouter from '@shared/index'
import AuthRouter from '@auth/index'
import OwnerRouter from '@owner/index'
import TerminalRouter from '@terminal/index'
import UiRouter from '@ui/index'

const ROUTERS = {
	shared: SharedRouter,
	auth: AuthRouter,
	owner: OwnerRouter,
	terminal: TerminalRouter,
	ui: UiRouter,
} satisfies Record<ContextModule, Router>

/**
 * Flat router list, insertion-order preserved (= `Object.values` order, ECMAScript-guaranteed for
 * string keys) to keep the OpenAPI output (tag ordering, spec generation) byte-identical to the
 * previous hand-written arrays.
 */
export const ALL_ROUTERS: Router[] = Object.values(ROUTERS)
