import 'reflect-metadata'
import { container } from 'tsyringe-neo'
import { DrizzleDatabaseDriver } from '@codm/core-typescript'
import { OPERATOR_ID } from '@auth/operator'
import { start, type RunningServer } from '../../src/server'
import type { TestingSurface } from '../../testing'
import type { TestBedLike } from './given/types'
import {
	givenUser,
	givenAccount,
	givenUserWithAccount,
	givenActiveSession,
	givenOwner,
	givenOwnerWithResponsible,
	givenWorkspace,
	givenThread,
	GIVEN_MENTION_TAG,
	givenChannel,
	givenRemote,
	givenRemoteMembership,
	givenIssue,
	givenStop,
	givenDomainEvent,
	givenUserProfile,
} from './given'

export type { TestBedLike } from './given/types'

/**
 * THE TEST SHELL over the production boot (spec Decision 5, T7). `start({ env: 'integration',
 * port: 0 })` — `src/server.ts` — is the SAME function `src/index.ts` calls for production and
 * that Playwright's `CODM_ENV=e2e` calls for e2e. Nothing here re-enacts the migrate→import→mount
 * choreography the deleted `tests/support/integration-server.ts` used to hand-roll (its own
 * docblock confessed each divergence one by one — see git history if the reasoning is ever needed
 * again). What remains is genuinely test-only: one backend cached per `bun test` process, `reset()`
 * (truncate between tests), and the duck-typed `asTestBed()` adapter the `givenX` helpers below
 * (and any suite calling them directly) consume.
 *
 * Public types are DERIVED — from the CONTRACT, not the implementation (spec Decision 9 fallback:
 * `dts-bundle-generator` choked on this repo's extensionless-import + `moduleResolution: "bundler"`
 * convention — see `../../testing.d.ts`'s docblock for the full verdict). `../../testing.d.ts` is
 * hand-written and COMMITTED; the `satisfies TestingSurface` check at the bottom of this file is
 * the freshness gate — this module's actual exports must stay assignable to that committed
 * contract, or backend `tsc` fails right there. A consumer (the react harness, T8) imports types
 * from `@codm/api-typescript/testing` and never redeclares this shape locally.
 */

export interface IntegrationBackend {
	url: string
	container: RunningServer['container']
	asTestBed(): TestBedLike
	reset(): Promise<void>
	stop(): Promise<void>
}

/**
 * tsyringe-neo's container methods require a CONCRETE constructor type; several tokens resolved
 * through this shell (`DrizzleDatabaseDriver`, and whatever a given-helper resolves via
 * `testBed.resolve(...)`) are abstract classes, which structurally cannot satisfy that signature
 * even though resolution works fine at runtime. One cast, here, so no call site below — or in a
 * given helper — needs its own.
 */
function resolveToken<T>(token: unknown): T {
	// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo can't type an abstract class as an injection token.
	return container.resolve(token as any) as T
}

let booted: IntegrationBackend | null = null
let booting: Promise<IntegrationBackend> | null = null

export async function startIntegrationBackend(options?: { ownerId?: string }): Promise<IntegrationBackend> {
	if (booted) return booted
	if (!booting) booting = boot(options)
	booted = await booting
	booting = null
	return booted
}

async function boot(options?: { ownerId?: string }): Promise<IntegrationBackend> {
	const server = await start({ env: 'integration', port: 0 })
	const driver = resolveToken<DrizzleDatabaseDriver>(DrizzleDatabaseDriver)
	// The single-operator app has no sign-up/session lookup (every request IS the operator —
	// `@auth/operator`), so the default seed owner mirrors what `OperatorMiddleware` stamps on every
	// request in production. A caller passing its own `ownerId` opts into a different tenant.
	const ownerId = options?.ownerId ?? OPERATOR_ID

	return {
		url: server.url,
		container: server.container,
		asTestBed: () => ({ resolve: resolveToken, ownerId }),
		reset: () => driver.reset(),
		stop: async () => {
			await server.stop()
			booted = null
		},
	}
}

// THE COMPLETE CATALOG (spec Decision 8) — the bare `givenX` helpers, never the deprecated
// `createGivenHelpers` facade (TST-18; it does not enter this public surface). Every given in
// `./given` already declares its `testBed` parameter as `TestBedLike` at the SOURCE (interface
// segregation, not a boundary bridge — see `./given/types.ts`), so these are PLAIN re-exports: no
// wrapper, no cast. `asTestBed()` above hands out exactly `TestBedLike`, and a `TestBed` instance
// (the suites that still pass the concrete class) satisfies it structurally for free.
export {
	givenUser,
	givenAccount,
	givenUserWithAccount,
	givenActiveSession,
	givenOwner,
	givenOwnerWithResponsible,
	givenWorkspace,
	givenThread,
	GIVEN_MENTION_TAG,
	givenChannel,
	givenRemote,
	givenRemoteMembership,
	givenIssue,
	givenStop,
	givenDomainEvent,
	givenUserProfile,
} from './given'

/**
 * THE FRESHNESS GATE (spec Decision 9 fallback — see `../../testing.d.ts`'s docblock for why this
 * exists instead of a generate-and-byte-compare script). Every export this module hands out for
 * `@codm/api-typescript/testing` must stay assignable to the COMMITTED, hand-written contract — if
 * a given's signature drifts (a param renamed, an override added, a return field dropped) without
 * `testing.d.ts` being updated to match, this line is exactly where backend `tsc` turns red.
 */
const _testingSurface = {
	startIntegrationBackend,
	givenUser,
	givenAccount,
	givenUserWithAccount,
	givenActiveSession,
	givenOwner,
	givenOwnerWithResponsible,
	givenWorkspace,
	GIVEN_MENTION_TAG,
	givenThread,
	givenChannel,
	givenRemote,
	givenRemoteMembership,
	givenIssue,
	givenStop,
	givenDomainEvent,
	givenUserProfile,
} satisfies TestingSurface
void _testingSurface
