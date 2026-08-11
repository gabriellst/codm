// FIRST, above every import that can reach the kernel — see `./harnessDataDir`'s docblock: the
// kernel's `Config.env` is parsed at module import, so this module's assignment only lands if it
// evaluates before it. Moving this line down is a silent regression, which is why the boot below
// re-checks the OUTCOME.
import { HARNESS_DATA_DIR } from './harnessDataDir'
import 'reflect-metadata'
import { rmSync } from 'node:fs'
import { container } from 'tsyringe-neo'
import { Config, DrizzleDatabaseDriver } from '@codm/core-typescript'
import { OPERATOR_ID } from '@auth/operator'
import { start, type RunningServer } from '../../src/server'
import type { TestingSurface } from '../../testing'
import type { TestBedLike } from './given/types'
import { bootService, type RunningService } from './testBoot'
import type { TestBootWorkspaceId } from '../../../../../template.config'
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
	givenConnectedGatewayChannel,
	givenRemote,
	givenRemoteMembership,
	givenIssue,
	givenStop,
	givenDomainEvent,
	givenUserProfile,
} from './given'

export type { TestBedLike } from './given/types'
export type { GatewayChannelSeed } from './given'

/**
 * THE TEST SHELL over the production boot (spec Decision 5, T7). `start({ env, port: 0 })` —
 * `src/server.ts` — is the SAME function `src/index.ts` calls for production and that Playwright's
 * `CODM_ENV=e2e` calls for e2e; only the COLUMN differs here (`integration` by default, `e2e` when
 * the caller asks for co-tenant services — see `IntegrationBackendOptions.services`), and `start`
 * itself is untouched by this shell. Nothing here re-enacts the migrate→import→mount
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
	/** Base URLs of the co-tenant services this backend booted, keyed by workspace id. Empty on the
	 *  default path — the shape stays the same either way, so a consumer never branches on presence. */
	services: Readonly<Partial<Record<TestBootWorkspaceId, string>>>
}

export interface IntegrationBackendOptions {
	ownerId?: string
	/**
	 * Workspaces to boot as co-tenant subprocesses over the SAME database file (spec D9/AC-6). Ids
	 * come from the manifest, and only workspaces that DECLARE a `testBoot` recipe are nameable —
	 * `template.config.ts` derives the type from the recipes themselves.
	 *
	 * SERVICES MODE IS THE E2E TOPOLOGY, and that is a DECLARATION, not a shortcut: with services
	 * the TS side boots the `e2e` column rather than `integration`, because the `e2e` column is
	 * where cross-process already lives (`src/shared/registry.ts`, landed in 52ebc462) —
	 * `FileLibsqlDriver` (the file at `CODM_DATA_DIR`, which is what a second process can open at
	 * all), `SqlExternalMediator` (the shared-outbox lanes; `integration`'s in-process
	 * `EventEmitter2Mediator` has no poller, so every integration event the gateway wrote would sit
	 * in the table forever), and `E2eAgentRunnerFactory` (deterministic, spawns no provider CLI).
	 * Booting `integration` with a second process attached would be a topology that exists nowhere.
	 */
	services?: readonly TestBootWorkspaceId[]
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

export async function startIntegrationBackend(options?: IntegrationBackendOptions): Promise<IntegrationBackend> {
	if (booted) {
		// ONE backend per process is not a cache policy, it is the truth: the axis column, the kernel
		// Config, and the DI root container are all process-global. So a later caller cannot be handed
		// a backend that lacks a service it asked for — a silent 404 against a gateway that was never
		// booted is exactly the failure mode this whole front exists to delete.
		const missing = (options?.services ?? []).filter(id => !(id in booted!.services))
		if (missing.length > 0) {
			throw new Error(
				`startIntegrationBackend: this process already booted without service(s) ${missing.join(', ')}. ` +
					`Services must be requested on the FIRST call in a process (the boot column and the kernel Config are process-global).`,
			)
		}
		return booted
	}
	if (!booting) booting = boot(options)
	booted = await booting
	booting = null
	return booted
}

async function boot(options?: IntegrationBackendOptions): Promise<IntegrationBackend> {
	const requested = options?.services ?? []
	const withServices = requested.length > 0

	if (withServices && Config.env.CODM_DATA_DIR !== HARNESS_DATA_DIR) {
		// The outcome of `./harnessDataDir`, checked rather than trusted: if the kernel froze its
		// config before that module ran, the `e2e` column's FileLibsqlDriver would open the OPERATOR'S
		// real data dir and the co-tenant subprocess a scratch one — two databases, and a test suite
		// writing into a live daemon's file. Fail here, legibly, instead.
		throw new Error(
			`startIntegrationBackend: CODM_DATA_DIR froze as '${Config.env.CODM_DATA_DIR}' instead of the harness scratch dir ` +
				`'${HARNESS_DATA_DIR}'. tests/support/harnessDataDir must be the FIRST import of tests/support/testing.ts.`,
		)
	}

	// FRESH, before anything opens the file. The scratch dir is named after this process's pid, and
	// pids are REUSED: a run killed hard (SIGKILL leaves no `stop()` behind, exactly like the e2e
	// runner's own scratch dir) leaves a populated dir that a future process with the same pid would
	// otherwise inherit as its starting state — old rows, presented as a clean boot.
	if (withServices) rmSync(HARNESS_DATA_DIR, { recursive: true, force: true })

	// Column: `integration` on the default path (unchanged), `e2e` with services — see
	// IntegrationBackendOptions.services for why the topology decides the column.
	const server = await start({ env: withServices ? 'e2e' : 'integration', port: 0 })
	const driver = resolveToken<DrizzleDatabaseDriver>(DrizzleDatabaseDriver)

	const running: RunningService[] = []
	for (const id of requested) {
		const service = await bootService(id, { dataDir: HARNESS_DATA_DIR })
		// One line per service, per process. The first opted-in suite in a process pays a build; the
		// rest pay a spawn — printing both is what keeps that from reading as an unexplained stall.
		console.log(
			`[harness] ${service.id} ready on ${service.url} (build ${service.buildMs.toFixed(0)}ms, spawn→health ${service.readyMs.toFixed(0)}ms)`,
		)
		running.push(service)
	}
	const services = Object.fromEntries(running.map(service => [service.id, service.url])) as Partial<Record<TestBootWorkspaceId, string>>
	// The single-operator app has no sign-up/session lookup (every request IS the operator —
	// `@auth/operator`), so the default seed owner mirrors what `OperatorMiddleware` stamps on every
	// request in production. A caller passing its own `ownerId` opts into a different tenant.
	const ownerId = options?.ownerId ?? OPERATOR_ID

	return {
		url: server.url,
		container: server.container,
		services,
		asTestBed: () => ({ resolve: resolveToken, ownerId }),
		reset: () => driver.reset(),
		stop: async () => {
			// Co-tenants first: they write to the same file the next step closes.
			for (const service of running) await service.stop()
			await server.stop()
			// Only what services mode created — the default path never touched this dir.
			if (withServices) rmSync(HARNESS_DATA_DIR, { recursive: true, force: true })
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
	givenConnectedGatewayChannel,
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
	givenConnectedGatewayChannel,
	givenRemote,
	givenRemoteMembership,
	givenIssue,
	givenStop,
	givenDomainEvent,
	givenUserProfile,
} satisfies TestingSurface
void _testingSurface
