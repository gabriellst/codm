import 'reflect-metadata'
import { container } from 'tsyringe-neo'
import { DrizzleDatabaseDriver } from '@codm/core-typescript'
import { OPERATOR_ID } from '@auth/operator'
import { start, type RunningServer } from '../../src/server'
import type { TestingSurface } from '../../testing'
import {
	givenUser as rawGivenUser,
	givenAccount as rawGivenAccount,
	givenUserWithAccount as rawGivenUserWithAccount,
	givenActiveSession as rawGivenActiveSession,
	givenOwner as rawGivenOwner,
	givenOwnerWithResponsible as rawGivenOwnerWithResponsible,
	givenWorkspace as rawGivenWorkspace,
	givenThread as rawGivenThread,
	GIVEN_MENTION_TAG,
	givenChannel as rawGivenChannel,
	givenRemote as rawGivenRemote,
	givenRemoteMembership as rawGivenRemoteMembership,
	givenIssue as rawGivenIssue,
	givenStop as rawGivenStop,
	givenDomainEvent as rawGivenDomainEvent,
	givenUserProfile as rawGivenUserProfile,
} from './given'

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

export interface TestBedLike {
	resolve<T>(token: unknown): T
	readonly ownerId: string
}

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

/**
 * Every `given*` in `./given` types its `testBed` parameter as the CONCRETE `TestBed` class
 * (`../TestBed.ts`) — which carries private fields (`mode`, `testContainer`, …), so TypeScript
 * nominal-types it: no structurally-compatible object can stand in for it without a cast. But every
 * given helper (verified: `users.ts`, `owners.ts`, `workspaces.ts`, `threads.ts`, `channels.ts`,
 * `remotes.ts`, `issues.ts`, `stops.ts`, `events.ts`, `identity.ts`, `sessions.ts`) calls ONLY
 * `testBed.resolve(...)` on it — never `.given`, `.spy`, `.mode`, or any private field. `TestBedLike`
 * IS that narrower real dependency; `asTestBed()` above already hands out exactly that shape. This
 * is the ONE cast that bridges the two (same convention as `resolveToken`'s single escape hatch
 * above), so no given file needs its parameter type widened and no external caller needs its own
 * cast — every wrapped export below keeps the given's real logic, typed by `TestBedLike` outward.
 */
function withTestBedLike<TB, Args extends unknown[], R>(fn: (testBed: TB, ...args: Args) => R): (testBed: TestBedLike, ...args: Args) => R {
	return (testBed, ...args) => fn(testBed as unknown as TB, ...args)
}

// THE COMPLETE CATALOG (spec Decision 8) — the bare `givenX` helpers, never the deprecated
// `createGivenHelpers` facade (TST-18; it does not enter this public surface).
export const givenUser = withTestBedLike(rawGivenUser)
export const givenAccount = withTestBedLike(rawGivenAccount)
export const givenUserWithAccount = withTestBedLike(rawGivenUserWithAccount)
export const givenActiveSession = withTestBedLike(rawGivenActiveSession)
export const givenOwner = withTestBedLike(rawGivenOwner)
export const givenOwnerWithResponsible = withTestBedLike(rawGivenOwnerWithResponsible)
export const givenWorkspace = withTestBedLike(rawGivenWorkspace)
export const givenThread = withTestBedLike(rawGivenThread)
export { GIVEN_MENTION_TAG }
export const givenChannel = withTestBedLike(rawGivenChannel)
export const givenRemote = withTestBedLike(rawGivenRemote)
export const givenRemoteMembership = withTestBedLike(rawGivenRemoteMembership)
export const givenIssue = withTestBedLike(rawGivenIssue)
export const givenStop = withTestBedLike(rawGivenStop)
/**
 * NOT `withTestBedLike` — `givenDomainEvent`'s real `event` parameter is `BaseDomainEvent` at its
 * DEFAULT generic (`typeof BaseDomainEventSchema`), whose `payload` Zod infers as `Record<string,
 * never>` (an empty-schema artifact, not a meaningful domain shape — see `testing.d.ts`'s
 * `SeedDomainEvent.payload` doc). Real callers (`given/events.test.ts`) pass a concrete subclass
 * (`OwnerCreatedEvent`, its own payload shape) directly to the raw given and that already works via
 * ordinary class covariance; only THIS wrapper's boundary — bridging the public `SeedDomainEvent`
 * contract to the real class type — needs the second cast alongside `testBed`'s.
 */
export const givenDomainEvent = (testBed: TestBedLike, event: Parameters<TestingSurface['givenDomainEvent']>[1]): Promise<void> =>
	rawGivenDomainEvent(
		testBed as unknown as Parameters<typeof rawGivenDomainEvent>[0],
		event as unknown as Parameters<typeof rawGivenDomainEvent>[1],
	)
export const givenUserProfile = withTestBedLike(rawGivenUserProfile)

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
