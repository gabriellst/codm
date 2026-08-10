import type { DependencyContainer } from 'tsyringe-neo'
import type { ContextModule } from './contexts'
import {
	type InstanceRegistry,
	expandBindings,
	LibsqlDriver,
	DrizzleDatabaseDriver,
	DrizzleClient,
	UnitOfWorkFactory,
	DomainEventRepository,
	DrizzleDomainEventRepository,
	InternalMediator,
	ExternalMediator,
	EventEmitter2Mediator,
	MockExternalMediator,
	SqlExternalMediator,
	OutboxDispatcher,
	DrizzleOutboxDispatcher,
	MockOutboxDispatcher,
	LoggingService,
	MockLoggingService,
	DefaultLoggingService,
	MailSender,
	ConsoleMailSender,
	HttpRouter,
	FastifyHttpRouter,
	IdempotencyGuard,
	DrizzleIdempotencyGuard,
	MockIdempotencyGuard,
	CommandQueue,
	MockCommandQueue,
	SqliteCommandQueue,
	AgentIdentityService,
	InMemoryAgentIdentityService,
	HEALTH_CHECKS,
	HealthService,
	healthChecksFrom,
	DatabaseHealthCheck,
	MigrationsHealthCheck,
	PollingHealthCheck,
} from '@codm/core-typescript'
import { ChannelStatusHealthCheck } from './services'
import { FileLibsqlDriver } from './db/FileLibsqlDriver'
import * as schema from '@codm/contracts/db'
import { migrationsDir } from '@codm/contracts/db/migrations'

import { INSTANCE_REGISTRY as authRegistry } from '@auth/registry'
import { INSTANCE_REGISTRY as ownerRegistry } from '@owner/registry'
import { INSTANCE_REGISTRY as agentRegistry } from '@agent/registry'
import { INSTANCE_REGISTRY as workspaceRegistry } from '@workspace/registry'
import { INSTANCE_REGISTRY as threadRegistry } from '@thread/registry'
import { INSTANCE_REGISTRY as issueRegistry } from '@issue/registry'
import { INSTANCE_REGISTRY as artifactRegistry } from '@artifact/registry'
import { INSTANCE_REGISTRY as uiRegistry } from '@ui/registry'
import { INSTANCE_REGISTRY as externalRegistry } from '@external/registry'

// MEMOIZATION IS MANDATORY ON EVERY PATH — tsyringe-neo invokes a `useFactory` on EVERY resolve, with
// no caching. Under the old in-memory engine an extra resolve in mock/integration minted a cheap,
// disposable database and the cost was invisible. Under LibsqlDriver it is NOT: every extra resolve
// does a `mkdtemp` — a real directory and a real file on disk that nobody removes (and nobody may
// remove; see `close()` in LibsqlDriver) — and hands back an EMPTY, UN-MIGRATED database to anything
// that resolves outside TestBed's `registerInstance`. Two silent failure modes: leaked temp dirs per
// resolve, and queries against a schema that does not exist. Hence a module-scope memo here for
// `mock`/`integration`, which stay `useFactory` (test-only, no lifecycle owner needed beyond the
// process). The `real` driver below does NOT need this: it is a bare class binding, and
// `expandBindings`/`registerAll` turns that into `container.registerSingleton` — the container itself
// is the memoization, per-token, per-resolve, with no module-scope var required.
let testDriverSingleton: LibsqlDriver | undefined
function getTestDatabaseDriver(): LibsqlDriver {
	if (!testDriverSingleton) testDriverSingleton = new LibsqlDriver({ schema, migrationsDir })
	return testDriverSingleton
}
const libsqlDriver = { useFactory: () => getTestDatabaseDriver() }

const drizzleClient = { useFactory: (c: DependencyContainer) => (c.resolve(DrizzleDatabaseDriver as any) as any).db }
const unitOfWorkFactory = { useFactory: (c: DependencyContainer) => (c.resolve(DrizzleDatabaseDriver as any) as any).unitOfWorkFactory }

// The aggregator is the SAME in every env — what differs is how many checks answer it. `resolveAll`
// over the multi-inject token is not expressable as injection-by-type, which is why this is a
// factory and `HealthService` is not `@injectable()`.
const healthServiceFactory = { useFactory: (c: DependencyContainer) => new HealthService(healthChecksFrom(c)) }
const resolveDriver = (c: DependencyContainer) => c.resolve(DrizzleDatabaseDriver as any) as DrizzleDatabaseDriver

// Kernel bindings — one declaration per token, envs as columns (divergence is visible, absence is
// a declared null, `integration` omitted mirrors `real`).
const CORE_REGISTRY: InstanceRegistry = expandBindings([
	{
		token: DrizzleDatabaseDriver,
		mock: libsqlDriver,
		integration: libsqlDriver,
		// real = the SHARED, file-backed SQLite database, co-tenanted with the Go gateway. A bare
		// class value (not `useFactory`) — expandBindings/registerAll turns this into
		// `container.registerSingleton(DrizzleDatabaseDriver, FileLibsqlDriver)`, so the container is
		// the ONE owner of the instance's lifecycle; every resolver (migrateEmbeddedDatabase,
		// drizzleClient, unitOfWorkFactory, resolveDriver, HEALTH_CHECKS factories below) gets the
		// SAME instance from the SAME root container. See FileLibsqlDriver.ts for the EMIT_OPENAPI
		// carve-out this replaces.
		real: FileLibsqlDriver,
	},
	// The SHAPE of this binding is unchanged; its MEANING is not. `driver.db` is now the driver's
	// dedicated READ connection, never the write one — which is precisely why this stayed a
	// one-line change instead of touching the 58 files that inject DrizzleClient. Do NOT "improve"
	// it by pointing at the write handle: that reopens cross-request dirty reads, and the only
	// thing that would complain is the dirty-read case in LibsqlDriver.test.ts.
	{ token: DrizzleClient, mock: drizzleClient, real: drizzleClient },
	{ token: UnitOfWorkFactory, mock: unitOfWorkFactory, real: unitOfWorkFactory },
	// mock: declared absence — flow tests wire OutboxAwareMockDomainEventRepository per-suite (TestBed).
	{ token: DomainEventRepository, mock: null, real: DrizzleDomainEventRepository },
	// Boot resolves the abstract HttpRouter token (src/index.ts) — bind the Fastify transport here
	// so the composition root never names the concrete class. mock-only absence: flow/unit suites
	// never boot the server. `integration`/`e2e` declare the SAME Fastify transport as `real` (spec
	// D4) — the harness/e2e boot a real HTTP server too; binding is lazy, so declaring it here costs
	// nothing when a TestBed suite never resolves the token.
	{ token: HttpRouter, mock: null, integration: FastifyHttpRouter, e2e: FastifyHttpRouter, real: FastifyHttpRouter },
	{ token: InternalMediator, mock: EventEmitter2Mediator, real: EventEmitter2Mediator },
	// mock: capture-only mediator — flow tests assert integration events without publishing.
	//
	// real: SqlExternalMediator — the `integration` lane of the SHARED outbox table. Egress is the
	// Go gateway writing rows; ingress is this class claiming them by lease and dispatching to the
	// registered external handlers. There is no socket and no broker: the transport IS the shared
	// database file. That is also why the old e2e-only carve-out (which swapped in the in-process
	// EventEmitter2Mediator because the Playwright harness boots no gateway and therefore had
	// nothing on the other end of Redis) is GONE — its justification was purely about transport, and
	// the justification evaporated. Keeping it would have left `bun e2e` exercising a mediator that
	// no longer exists in production, and never touching the lane filter, the date reviver, or the
	// 2s poll cap — the three riskiest pieces of the ingress.
	//
	// integration is still PINNED to the in-process EventEmitter2Mediator, but NOT for the old
	// reason (there is no socket to avoid any more). The new reason: SqlExternalMediator POLLS.
	// A stray non-TestBed resolve inside an integration suite would arm a 2s timer against the
	// driver's temp file that outlives the suite's afterAll — writes into a torn-down world, log
	// noise, flakiness. TestBed swaps in a SpyMediator for both mock and integration anyway, so the
	// pin only ever guards that stray resolve.
	{ token: ExternalMediator, mock: MockExternalMediator, integration: EventEmitter2Mediator, real: SqlExternalMediator },
	{ token: OutboxDispatcher, mock: MockOutboxDispatcher, real: DrizzleOutboxDispatcher },
	// DefaultLoggingService (spec D13): a single declared class whose constructor reads Config and
	// picks the transport — OTLP when OTEL_COLLECTOR_LOG_URL is present, console otherwise. A bare
	// class value, same singleton mechanism as the driver above; no useFactory indirection needed.
	{
		token: LoggingService,
		mock: MockLoggingService,
		integration: MockLoggingService,
		real: DefaultLoggingService,
	},
	{ token: MailSender, mock: ConsoleMailSender, real: ConsoleMailSender },
	{ token: IdempotencyGuard, mock: MockIdempotencyGuard, real: DrizzleIdempotencyGuard },
	// Repeatable jobs (BoundedContext.registerJobs) resolve this — an UNBOUND abstract silently
	// constructs a method-less instance and crashes boot (found by the first real e2e run).
	// In-memory queue in tests; database-backed in production (origin-faithful: medscall runs the
	// DB poller — no broker dependency).
	{ token: CommandQueue, mock: MockCommandQueue, real: SqliteCommandQueue },
	// HEALTH — multi-inject: N declarações do MESMO token, agregadas por resolveAll (core
	// healthChecksFrom). `mock`/`integration` são ausência DECLARADA: os testes de health constroem
	// HealthService à mão (Health.test.ts), e registrar checks reais num container de teste só criaria
	// um segundo caminho, pior, para provar a mesma coisa.
	{ token: HealthService, mock: healthServiceFactory, integration: healthServiceFactory, real: healthServiceFactory },
	{
		token: HEALTH_CHECKS,
		mock: null,
		integration: null,
		real: { useFactory: (c: DependencyContainer) => new DatabaseHealthCheck(resolveDriver(c)) },
	},
	{
		token: HEALTH_CHECKS,
		mock: null,
		integration: null,
		real: { useFactory: (c: DependencyContainer) => new MigrationsHealthCheck(resolveDriver(c)) },
	},
	{
		token: HEALTH_CHECKS,
		mock: null,
		integration: null,
		real: {
			useFactory: (c: DependencyContainer) =>
				new PollingHealthCheck('outboxDispatcher', c.resolve(OutboxDispatcher as any) as DrizzleOutboxDispatcher),
		},
	},
	{
		token: HEALTH_CHECKS,
		mock: null,
		integration: null,
		real: {
			useFactory: (c: DependencyContainer) =>
				new PollingHealthCheck('sqlExternalMediator', c.resolve(ExternalMediator as any) as SqlExternalMediator),
		},
	},
	{
		token: HEALTH_CHECKS,
		mock: null,
		integration: null,
		real: { useFactory: (c: DependencyContainer) => new ChannelStatusHealthCheck(c.resolve(DrizzleClient as any) as DrizzleClient) },
	},
	// The agent run identity — the SINGLE source of "on whose behalf" for every MCP tool call.
	//
	// It lives HERE and not in `agent/registry.ts` for a mechanical reason: `AgentIdentityMiddleware`
	// is auto-applied by `Controller.executeMiddlewares`, which resolves from the ROOT container
	// (`container.resolve(middlewareOrClass)`) — so a binding scoped to one context's child container
	// would resolve in production and throw in any suite that exercises a controller directly. Same
	// shelf as `CommandQueue` and `IdempotencyGuard`: a core seam the whole process shares.
	//
	// One in-memory instance per process in EVERY env: a token's lifetime is one run inside one
	// daemon, and a persisted one would outlive the process it authorizes. Bound in all three because
	// the integration and mock suites exercise the 401/403 boundary directly, and a double would be a
	// second implementation of the thing under test.
	{
		token: AgentIdentityService,
		mock: InMemoryAgentIdentityService,
		integration: InMemoryAgentIdentityService,
		real: InMemoryAgentIdentityService,
	},
])

// One entry PER CONTEXT, compile-checked against the CONTEXTS spine — forgetting a context here is
// a tsc error, not a runtime DI hole (the old hand-ordered spread compiled clean with one missing).
// `shared` maps to the core entries (this file IS the shared context's registry).
const CONTEXT_REGISTRIES = {
	shared: CORE_REGISTRY,
	auth: authRegistry,
	owner: ownerRegistry,
	agent: agentRegistry,
	workspace: workspaceRegistry,
	thread: threadRegistry,
	issue: issueRegistry,
	artifact: artifactRegistry,
	ui: uiRegistry,
	external: externalRegistry,
} satisfies Record<ContextModule, InstanceRegistry>

// Mechanical merge — shared (core) first so context bindings may override kernel defaults.
const merge = (env: keyof InstanceRegistry) => Object.values(CONTEXT_REGISTRIES).flatMap(r => r[env])
export const ALL_REGISTRIES: InstanceRegistry = {
	mock: merge('mock'),
	integration: merge('integration'),
	real: merge('real'),
	e2e: merge('e2e'),
}
