import type { DependencyContainer } from 'tsyringe-neo'
import type { ContextModule } from './contexts'
import {
	type InstanceRegistry,
	expandBindings,
	LibsqlDriver,
	DrizzleDatabaseDriver,
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

// The aggregator is the SAME in every env — what differs is how many checks answer it. `resolveAll`
// over the multi-inject token is not expressable as injection-by-type, which is why this is a
// factory and `HealthService` is not `@injectable()`.
const healthServiceFactory = { useFactory: (c: DependencyContainer) => new HealthService(healthChecksFrom(c)) }

// The `real` health checks, hoisted so the `e2e` column can DECLARE the same value instead of
// inheriting `integration`'s declared absence. e2e is a REAL boot — same driver, same outbox
// dispatcher, same lane poller, same mailbox dispatcher — so `/v1/health` there must answer with the
// same five checks a production daemon answers with; the `null` in mock/integration is about TestBed
// suites building HealthService by hand (Health.test.ts), which the harness does not do.
const databaseHealthCheck = {
	useFactory: (c: DependencyContainer) => new DatabaseHealthCheck(c.resolve(DrizzleDatabaseDriver as any) as DrizzleDatabaseDriver),
}
const migrationsHealthCheck = {
	useFactory: (c: DependencyContainer) => new MigrationsHealthCheck(c.resolve(DrizzleDatabaseDriver as any) as DrizzleDatabaseDriver),
}
const outboxDispatcherHealthCheck = {
	useFactory: (c: DependencyContainer) =>
		new PollingHealthCheck('outboxDispatcher', c.resolve(OutboxDispatcher as any) as DrizzleOutboxDispatcher),
}
const externalMediatorHealthCheck = {
	useFactory: (c: DependencyContainer) =>
		new PollingHealthCheck('sqlExternalMediator', c.resolve(ExternalMediator as any) as SqlExternalMediator),
}
const channelStatusHealthCheck = {
	useFactory: (c: DependencyContainer) =>
		new ChannelStatusHealthCheck((c.resolve(DrizzleDatabaseDriver as any) as DrizzleDatabaseDriver).db),
}

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
		// every repository/use-case that injects the driver, the HEALTH_CHECKS factories below) gets
		// the SAME instance from the SAME root container. See FileLibsqlDriver.ts for the
		// EMIT_OPENAPI carve-out this replaces.
		real: FileLibsqlDriver,
		// e2e = REAL. Declared, not inherited: the chain (`e2e → integration → real`) would hand this
		// column the `integration` temp-file driver, and the Playwright harness is the ONE test that
		// must NOT get one. `run-e2e.ts` mints a scratch `CODM_DATA_DIR`, `src/boot.ts` locks THAT dir,
		// and the runner drops it on exit — all three are statements about `<CODM_DATA_DIR>/codm.db`,
		// which only FileLibsqlDriver opens. Inheriting the temp driver moved the daemon's database
		// OUT of the locked scratch dir (a `mkdtemp` nobody removes, leaked per run) and left the e2e
		// suite with zero evidence for the shared-file/WAL path it exists to exercise — the exact
		// "two databases" split FileLibsqlDriver's docblock warns about.
		e2e: FileLibsqlDriver,
	},
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
	//
	// e2e = REAL, and this one is LOAD-BEARING (measured: without it, 04-inbound-issue and
	// 07-issue-archive-restore time out with an empty issue list). `TestIngressController` simulates the
	// Go gateway by INSERTING a `source = 'integration'` outbox row — deliberately the row, not an
	// in-process publish, so the e2e run exercises lane filter → lease → raw-TEXT payload → date
	// reviver. SqlExternalMediator is the ONLY claimant of that lane; EventEmitter2Mediator has no
	// poller at all, so under the inherited `integration` binding every injected inbound message sat in
	// the table forever and no orchestrator turn ever ran. The `integration` pin exists to stop a stray
	// resolve from arming a 2s timer inside a TestBed suite — the e2e daemon is a REAL boot that WANTS
	// that poller, which is why the pin must not reach it.
	{
		token: ExternalMediator,
		mock: MockExternalMediator,
		integration: EventEmitter2Mediator,
		e2e: SqlExternalMediator,
		real: SqlExternalMediator,
	},
	{ token: OutboxDispatcher, mock: MockOutboxDispatcher, real: DrizzleOutboxDispatcher },
	// DefaultLoggingService (spec D13): a single declared class whose constructor reads Config and
	// picks the transport — OTLP when OTEL_COLLECTOR_LOG_URL is present, console otherwise. A bare
	// class value, same singleton mechanism as the driver above; no useFactory indirection needed.
	// e2e = REAL: the harness boots the production logging class and lets ITS constructor decide the
	// transport, exactly like a real daemon. (With no OTEL_COLLECTOR_LOG_URL configured that decision
	// lands on the console path anyway — so this is behaviour-identical to the inherited
	// MockLoggingService here, and faithful to production wiring when the operator does configure one.)
	{
		token: LoggingService,
		mock: MockLoggingService,
		integration: MockLoggingService,
		real: DefaultLoggingService,
		e2e: DefaultLoggingService,
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
	{ token: HEALTH_CHECKS, mock: null, integration: null, real: databaseHealthCheck, e2e: databaseHealthCheck },
	{ token: HEALTH_CHECKS, mock: null, integration: null, real: migrationsHealthCheck, e2e: migrationsHealthCheck },
	{ token: HEALTH_CHECKS, mock: null, integration: null, real: outboxDispatcherHealthCheck, e2e: outboxDispatcherHealthCheck },
	{ token: HEALTH_CHECKS, mock: null, integration: null, real: externalMediatorHealthCheck, e2e: externalMediatorHealthCheck },
	{ token: HEALTH_CHECKS, mock: null, integration: null, real: channelStatusHealthCheck, e2e: channelStatusHealthCheck },
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
