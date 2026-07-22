import type { DependencyContainer } from 'tsyringe-neo'
import type { ContextModule } from './contexts'
import {
	type InstanceRegistry,
	expandBindings,
	PGliteDriver,
	resolveDataDir,
	DrizzleDatabaseDriver,
	DrizzleClient,
	UnitOfWorkFactory,
	DomainEventRepository,
	DrizzleDomainEventRepository,
	InternalMediator,
	ExternalMediator,
	EventEmitter2Mediator,
	MockExternalMediator,
	OutboxDispatcher,
	DrizzleOutboxDispatcher,
	MockOutboxDispatcher,
	LoggingService,
	MockLoggingService,
	createLoggingServiceFactory,
	MailSender,
	ConsoleMailSender,
	HttpRouter,
	FastifyHttpRouter,
	IdempotencyGuard,
	DrizzleIdempotencyGuard,
	MockIdempotencyGuard,
	CommandQueue,
	MockCommandQueue,
	PostgresCommandQueue,
	Config,
} from '@codedm/core-typescript'
import * as schema from '@codedm/contracts/db'
import { migrationsDir } from '@codedm/contracts/db/migrations'
import { Client } from '@codedm/client-typescript'
import type { RequestConfig, ResponseConfig } from '@codedm/client-typescript/http'

/**
 * Test request stub for the SDK `Client`. The generated operations call
 * `client(config)` and expect a `{ data, status, statusText }` envelope;
 * for hermetic mock/integration tests we short-circuit with an empty 204
 * so cross-service calls never touch the network. Real mode uses the
 * default ky transport via the configured base URLs.
 */
const stubRequest = async <TData>(_config: RequestConfig): Promise<ResponseConfig<TData>> => ({
	data: undefined as TData,
	status: 204,
	statusText: 'No Content',
})

function mockSdkClient(): Client {
	const fetchStub = stubRequest as unknown as typeof fetch
	return Client.create({
		go: { baseUrl: 'http://stub.local', fetch: fetchStub },
		typescript: { baseUrl: 'http://stub.local', fetch: fetchStub },
	})
}

function realSdkClient(): Client {
	return Client.create({
		// The kernel Config has no GO_* topology key yet (the first Go BC landed in parallel);
		// until the kernel env seam grows one, mirror .env.example's API_GO_PORT default.
		go: { baseUrl: Config.env.API_GO_URL },
		typescript: { baseUrl: Config.env.API_URL },
	})
}

// `Client` has a private constructor (built via `Client.create`), so the class
// object isn't directly assignable to RegistryToken's `abstract new (...)`.
// The runtime reference is still the DI key use cases resolve by type, so cast
// it to a usable token shape — same object, satisfies the registry typing.
const ClientToken = Client as unknown as abstract new (...args: any[]) => Client

import { INSTANCE_REGISTRY as authRegistry } from '@auth/registry'
import { INSTANCE_REGISTRY as ownerRegistry } from '@owner/registry'
import { INSTANCE_REGISTRY as terminalRegistry } from '@terminal/registry'
import { INSTANCE_REGISTRY as workspaceRegistry } from '@workspace/registry'
import { INSTANCE_REGISTRY as threadRegistry } from '@thread/registry'
import { INSTANCE_REGISTRY as issueRegistry } from '@issue/registry'
import { INSTANCE_REGISTRY as artifactRegistry } from '@artifact/registry'
import { INSTANCE_REGISTRY as uiRegistry } from '@ui/registry'

// Lazy singleton resolver for the `real` LoggingService binding below — see LoggingBinding.ts for why
// this can't be a plain `{ instance: OtlpLoggingService }` binding (constructor args come from Config,
// and boot must fall back to MockLoggingService when OTEL_COLLECTOR_LOG_URL is unset).
const resolveRealLoggingService = createLoggingServiceFactory()

// Factories shared by more than one env column below.
const pgliteDriver = { useFactory: () => new PGliteDriver({ schema, migrationsDir }) }
// Real persistence: embedded, FILE-BACKED PGlite rooted at CODEDM_DATA_DIR (founder decision 3 —
// 2 processes, embedded DB, no external Postgres). Migrations apply on boot (see shared/index.ts).
//
// CODEGEN CARVE-OUT — under EMIT_OPENAPI the real driver must be INERT: `bun sdk`/emit-openapi
// imports the composition root only to collect routers, and Router.registerControllers eagerly
// resolves every controller (→ its query use cases → this driver). Constructing the file-backed
// driver there calls resolveDataDir (mkdir CODEDM_DATA_DIR) + acquireDataDirLock — and with a live
// `bun dev` daemon holding the lock on the default dir, the lock throws DataDirLockedError, which
// Router's try/catch swallows → the controller is silently DROPPED from openapi.json + the SDK.
// So during emission we fall back to the in-memory driver (no dataDir → no lock, no mkdir), exactly
// as the pre-phase-2 NodePgDriver was inert during codegen. The shared/index setup guard already
// skips migrations/memoization under EMIT_OPENAPI, but it cannot cover controller resolution — this
// binding-level carve-out is what keeps codegen from ever touching the real persistence path.
const filePgliteDriver = {
	useFactory: () =>
		process.env.EMIT_OPENAPI === 'true'
			? new PGliteDriver({ schema, migrationsDir })
			: new PGliteDriver({ schema, migrationsDir, dataDir: resolveDataDir(Config.env.CODEDM_DATA_DIR) }),
}
const drizzleClient = { useFactory: (c: DependencyContainer) => (c.resolve(DrizzleDatabaseDriver as any) as any).db }
const unitOfWorkFactory = { useFactory: (c: DependencyContainer) => (c.resolve(DrizzleDatabaseDriver as any) as any).unitOfWorkFactory }
const stubSdkClient = { useFactory: () => mockSdkClient() }

// Kernel bindings — one declaration per token, envs as columns (divergence is visible, absence is
// a declared null, `integration` omitted mirrors `real`).
const CORE_REGISTRY: InstanceRegistry = expandBindings([
	{
		token: DrizzleDatabaseDriver,
		mock: pgliteDriver,
		integration: pgliteDriver,
		// real = embedded file-backed PGlite (was NodePgDriver + external Postgres). NodePgDriver/pg
		// stay in the tree (unused in real) — the swap is a one-line binding change.
		real: filePgliteDriver,
	},
	{ token: DrizzleClient, mock: drizzleClient, real: drizzleClient },
	{ token: UnitOfWorkFactory, mock: unitOfWorkFactory, real: unitOfWorkFactory },
	// mock: declared absence — flow tests wire OutboxAwareMockDomainEventRepository per-suite (TestBed).
	{ token: DomainEventRepository, mock: null, real: DrizzleDomainEventRepository },
	// Boot resolves the abstract HttpRouter token (src/index.ts) — bind the Fastify transport here
	// so the composition root never names the concrete class. real-only: tests never boot the server.
	{ token: HttpRouter, mock: null, integration: null, real: FastifyHttpRouter },
	{ token: InternalMediator, mock: EventEmitter2Mediator, real: EventEmitter2Mediator },
	// mock: capture-only mediator — flow tests assert integration events without publishing.
	{ token: ExternalMediator, mock: MockExternalMediator, real: EventEmitter2Mediator },
	{ token: OutboxDispatcher, mock: MockOutboxDispatcher, real: DrizzleOutboxDispatcher },
	// OTLP-backed in production; falls back to MockLoggingService if OTEL_COLLECTOR_LOG_URL is
	// unset. useFactory (not a class) because construction needs Config-derived args and must
	// stay a lazy singleton — see resolveRealLoggingService / LoggingBinding.ts.
	{
		token: LoggingService,
		mock: MockLoggingService,
		integration: MockLoggingService,
		real: { useFactory: () => resolveRealLoggingService() },
	},
	{ token: MailSender, mock: ConsoleMailSender, real: ConsoleMailSender },
	{ token: IdempotencyGuard, mock: MockIdempotencyGuard, real: DrizzleIdempotencyGuard },
	// Repeatable jobs (BoundedContext.registerJobs) resolve this — an UNBOUND abstract silently
	// constructs a method-less instance and crashes boot (found by the first real e2e run).
	// In-memory queue in tests; Postgres-backed in production (origin-faithful: medscall runs the
	// Postgres poller — no broker dependency).
	{ token: CommandQueue, mock: MockCommandQueue, real: PostgresCommandQueue },
	// Hermetic SDK client stub outside real (no network in tests) — see stubRequest above.
	{ token: ClientToken, mock: stubSdkClient, integration: stubSdkClient, real: { useFactory: () => realSdkClient() } },
])

// One entry PER CONTEXT, compile-checked against the CONTEXTS spine — forgetting a context here is
// a tsc error, not a runtime DI hole (the old hand-ordered spread compiled clean with one missing).
// `shared` maps to the core entries (this file IS the shared context's registry).
const CONTEXT_REGISTRIES = {
	shared: CORE_REGISTRY,
	auth: authRegistry,
	owner: ownerRegistry,
	terminal: terminalRegistry,
	workspace: workspaceRegistry,
	thread: threadRegistry,
	issue: issueRegistry,
	artifact: artifactRegistry,
	ui: uiRegistry,
} satisfies Record<ContextModule, InstanceRegistry>

// Mechanical merge — shared (core) first so context bindings may override kernel defaults.
const merge = (env: keyof InstanceRegistry) => Object.values(CONTEXT_REGISTRIES).flatMap(r => r[env])
export const ALL_REGISTRIES: InstanceRegistry = {
	mock: merge('mock'),
	integration: merge('integration'),
	real: merge('real'),
}
