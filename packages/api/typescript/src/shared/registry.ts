import type { DependencyContainer } from 'tsyringe-neo'
import {
	type InstanceRegistry,
	expandBindings,
	LibSqlDriver,
	LibSqlDatabaseDriver,
	DomainEventRepository,
	LibSqlDomainEventRepository,
	InternalMediator,
	ExternalMediator,
	EventEmitter2Mediator,
	MockExternalMediator,
	SqlExternalMediator,
	OutboxDispatcher,
	LibSqlOutboxDispatcher,
	MockOutboxDispatcher,
	LoggingService,
	MockLoggingService,
	DefaultLoggingService,
	MailSender,
	ConsoleMailSender,
	HttpRouter,
	FastifyHttpRouter,
	IdempotencyGuard,
	LibSqlIdempotencyGuard,
	MockIdempotencyGuard,
	CommandQueue,
	MockCommandQueue,
	LibSqlCommandQueue,
	AgentIdentityService,
	InMemoryAgentIdentityService,
	HEALTH_CHECKS,
	HealthService,
	healthChecksFrom,
	DatabaseHealthCheck,
	MigrationsHealthCheck,
	PollingHealthCheck,
	resolve,
	asPollingService,
	DatabaseDriver,
	PgDatabaseDriver,
	PgDatabaseHealthCheck,
	PgDriver,
	PGliteDriver,
	PgDomainEventRepository,
	PgOutboxDispatcher,
	PgIdempotencyGuard,
	PgCommandQueue,
} from '@codm/core-typescript'
import { CloudSession, FileCloudSession, MockCloudSession } from './services/CloudSession'
import { ChannelStatusHealthCheck } from './services/ChannelStatusHealthCheck'
import { OutboxDeadLetterHealthCheck } from './services/OutboxDeadLetterHealthCheck'
import { FileLibsqlDriver } from './db/FileLibsqlDriver'
import * as schema from '@codm/contracts/db'
import { migrationsDir } from '@codm/contracts/db/migrations'

// MEMOIZATION IS MANDATORY ON EVERY PATH — tsyringe-neo invokes a `useFactory` on EVERY resolve, with
// no caching. Under the old in-memory engine an extra resolve in mock/integration minted a cheap,
// disposable database and the cost was invisible. Under LibSqlDriver it is NOT: every extra resolve
// does a `mkdtemp` — a real directory and a real file on disk that nobody removes (and nobody may
// remove; see `close()` in LibSqlDriver) — and hands back an EMPTY, UN-MIGRATED database to anything
// that resolves outside TestBed's `registerInstance`. Two silent failure modes: leaked temp dirs per
// resolve, and queries against a schema that does not exist. Hence a module-scope memo here for
// `mock`/`integration`, which stay `useFactory` (test-only, no lifecycle owner needed beyond the
// process). The `real` driver below does NOT need this: it is a bare class binding, and
// `expandBindings`/`registerAll` turns that into `container.registerSingleton` — the container itself
// is the memoization, per-token, per-resolve, with no module-scope var required.
let testDriverSingleton: LibSqlDriver | undefined
function getTestDatabaseDriver(): LibSqlDriver {
	if (!testDriverSingleton) testDriverSingleton = new LibSqlDriver({ schema, migrationsDir })
	return testDriverSingleton
}
const libsqlDriver = { useFactory: () => getTestDatabaseDriver() }

// The aggregator is the SAME in every env — what differs is how many checks answer it. `resolveAll`
// over the multi-inject token is not expressable as injection-by-type, which is why this is a
// factory and `HealthService` is not `@injectable()`.
// A thunk, não a lista: `resolveAll` roda a CADA `report()`, sobre o container já completo. Ver o
// docblock de `HealthService` para o ponto cego que a captura antecipada produzia.
const healthServiceFactory = { useFactory: (c: DependencyContainer) => new HealthService(() => healthChecksFrom(c)) }

// The `real` health checks, hoisted so the `e2e` column can DECLARE the same value instead of
// inheriting `integration`'s declared absence. e2e is a REAL boot — same driver, same outbox
// dispatcher, same lane poller, same mailbox dispatcher — so `/health` there must answer with the
// same six checks a production daemon answers with; the `null` in mock/integration is about TestBed
// suites building HealthService by hand (Health.test.ts), which the harness does not do.
const databaseHealthCheck = {
	useFactory: (c: DependencyContainer) => new DatabaseHealthCheck(resolve(c, LibSqlDatabaseDriver)),
}
const migrationsHealthCheck = {
	// TOPO NEUTRO: este check só chama `readMigrations()`, que é ciclo de vida, e a pergunta que ele
	// faz — "o schema está em dia?" — é a MESMA nas duas famílias. Resolver o nível-meio da libsql
	// aqui matava o boot da nuvem com `readMigrations is not a function`.
	useFactory: (c: DependencyContainer) => new MigrationsHealthCheck(resolve(c, DatabaseDriver)),
}
const outboxDispatcherHealthCheck = {
	useFactory: (c: DependencyContainer) =>
		new PollingHealthCheck('outboxDispatcher', () => asPollingService('outboxDispatcher', resolve(c, OutboxDispatcher))),
}
const externalMediatorHealthCheck = {
	useFactory: (c: DependencyContainer) =>
		new PollingHealthCheck('sqlExternalMediator', () => asPollingService('sqlExternalMediator', resolve(c, ExternalMediator))),
}
const channelStatusHealthCheck = {
	useFactory: (c: DependencyContainer) => new ChannelStatusHealthCheck(resolve(c, LibSqlDatabaseDriver).db),
}
const outboxDeadLettersHealthCheck = {
	useFactory: (c: DependencyContainer) => new OutboxDeadLetterHealthCheck(resolve(c, LibSqlDatabaseDriver).db),
}

// ── HELPERS DAS FAMÍLIAS ─────────────────────────────────────────────────────────────────────────

/**
 * O `PGliteDriver` das colunas de teste, memoizado por processo.
 *
 * Memoizar é obrigatório pela mesma razão que vale para o libsql (ver o comentário acima), mais uma
 * própria: o `PGliteDriver` é `lifetime = 'process'` e guarda um SNAPSHOT pós-migração em escopo de
 * módulo. Uma instância nova por `resolve` jogaria fora o snapshot e faria toda suíte repetir a
 * migração inteira — a otimização morreria em silêncio, sem nenhum teste ficar vermelho.
 */
let pgTestDriverSingleton: PGliteDriver | undefined
const pgTestDriver = {
	useFactory: () => {
		if (!pgTestDriverSingleton) pgTestDriverSingleton = new PGliteDriver()
		return pgTestDriverSingleton
	},
}

/** O ping da família pg. `.db.execute`, e não o `.db.run` do gêmeo libsql — APIs diferentes. */
const pgDatabaseHealthCheck = {
	useFactory: (c: DependencyContainer) => new PgDatabaseHealthCheck(resolve(c, PgDatabaseDriver)),
}

/**
 * A PROJEÇÃO do topo neutro sobre a instância do nível-meio.
 *
 * Um driver por processo, visto por dois níveis (ADR 0006). Sem isto, quem injeta só ciclo de vida
 * (`MigrationsHealthCheck`, o boot) resolveria um token não ligado e o processo morreria no boot —
 * exatamente o oposto do que a hierarquia existe para dar.
 */
const neutralTopFromLibSql = { useFactory: (c: DependencyContainer) => resolve(c, LibSqlDatabaseDriver) }
const neutralTopFromPg = { useFactory: (c: DependencyContainer) => resolve(c, PgDatabaseDriver) }

/**
 * ── OS MÓDULOS DE FAMÍLIA (ADR 0005 + ADR 0006) ──────────────────────────────────────────────────
 *
 * Estes bindings NÃO moram mais no `INSTANCE_REGISTRY`, e a razão é o desenho inteiro: qual família de
 * banco um deployment usa é decisão da `PLACEMENT`, e o laço de composição aplica o módulo da
 * família ESCOLHIDA. Enquanto viviam no registry monolítico, todo deployment ganhava o driver libsql
 * quisesse ou não — e o `db: 'pg'` da tabela seria uma declaração que ninguém lê.
 *
 * O que entra num módulo de família é o que MUDA com o dialeto: o driver, o repositório de eventos,
 * o despachante de outbox, a trava de idempotência, a fila de comandos, e os health checks que
 * tocam `.db`. O que NÃO muda (mediators, roteador HTTP, logging, o check de migrações — que agora
 * depende do topo neutro) fica no `INSTANCE_REGISTRY`.
 *
 * Cada módulo também PROJETA o topo neutro sobre a mesma instância: um driver por processo, visto
 * por dois níveis. Sem isso, quem injeta só ciclo de vida (`DatabaseDriver`) não resolveria nada.
 */
const LIBSQL_DB_BINDINGS = [
	{
		token: LibSqlDatabaseDriver,
		mock: libsqlDriver,
		integration: libsqlDriver,
		// real = the SHARED, file-backed SQLite database, co-tenanted with the Go gateway. A bare
		// class value (not `useFactory`) — expandBindings/registerAll turns this into
		// `container.registerSingleton(LibSqlDatabaseDriver, FileLibsqlDriver)`, so the container is
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
	{ token: DomainEventRepository, mock: null, real: LibSqlDomainEventRepository },
	{ token: OutboxDispatcher, mock: MockOutboxDispatcher, real: LibSqlOutboxDispatcher },
	{ token: IdempotencyGuard, mock: MockIdempotencyGuard, real: LibSqlIdempotencyGuard },
	{ token: CommandQueue, mock: MockCommandQueue, real: LibSqlCommandQueue },
	{ token: HEALTH_CHECKS, mock: null, integration: null, real: databaseHealthCheck, e2e: databaseHealthCheck },
	{ token: HEALTH_CHECKS, mock: null, integration: null, real: channelStatusHealthCheck, e2e: channelStatusHealthCheck },
	{ token: HEALTH_CHECKS, mock: null, integration: null, real: outboxDeadLettersHealthCheck, e2e: outboxDeadLettersHealthCheck },
	// A projeção do TOPO sobre a MESMA instância (ver docblock acima).
	{
		token: DatabaseDriver,
		mock: neutralTopFromLibSql,
		integration: neutralTopFromLibSql,
		real: neutralTopFromLibSql,
		e2e: neutralTopFromLibSql,
	},
]

export const LIBSQL_DB_REGISTRY: InstanceRegistry = expandBindings(LIBSQL_DB_BINDINGS)

/**
 * A família `pg` — o deployment de NUVEM (ADR 0005).
 *
 * `PGliteDriver` nas colunas de teste e `PgDriver` nas de produção: o primeiro APLICA migração
 * (banco em processo, nasce vazio, não há passo de deploy que pudesse ter rodado), o segundo
 * CONFERE E RECUSA. Os dois honram a mesma porta; o que difere é o fato do mundo que cada um
 * descreve — ver os docblocks dos concretos.
 */
export const PG_DB_REGISTRY: InstanceRegistry = expandBindings([
	// e2e = PGlite, e a assimetria com a coluna irmã é DELIBERADA (F7).
	//
	// Isto dizia `e2e: PgDriver`, escrito por analogia com `real` — e nunca rodou: a família `pg` só
	// monta sob `cloud`, e até a F7 nenhuma execução do e2e subia perfil cloud. Era declaração que
	// jamais tinha sido confrontada com um boot. O `PgDriver` CONFERE E RECUSA migração, então essa
	// coluna teria exigido um Postgres real E migrações já implantadas — um passo de deploy dentro do
	// runner, num repo cujo compose sobe só redis.
	//
	// Por que a família libsql pode declarar `e2e: FileLibsqlDriver` e esta não precisa: lá o driver
	// REAL é obrigatório porque o compartilhamento do arquivo com o gateway Go **é a propriedade sob
	// teste** (ver o docblock daquela linha). Aqui não há análogo — nenhuma spec do e2e assere coisa
	// alguma sobre Postgres. O daemon cloud entra na topologia para responder QUEM É O OPERADOR, e o
	// que está sob teste é o handshake de login (`CloudSession`), não o substrato de armazenamento.
	// A razão que torna o driver real obrigatório ali torna-o desnecessário aqui.
	//
	// O que se perde: a prova de que a migração de nuvem foi implantada. Ela nunca foi do e2e — é do
	// deploy, e o `PgDriver` continua guardando-a nas colunas `real`.
	{ token: PgDatabaseDriver, mock: pgTestDriver, integration: pgTestDriver, real: PgDriver, e2e: pgTestDriver },
	{ token: DomainEventRepository, mock: null, real: PgDomainEventRepository },
	{ token: OutboxDispatcher, mock: MockOutboxDispatcher, real: PgOutboxDispatcher },
	{ token: IdempotencyGuard, mock: MockIdempotencyGuard, real: PgIdempotencyGuard },
	{ token: CommandQueue, mock: MockCommandQueue, real: PgCommandQueue },
	{ token: HEALTH_CHECKS, mock: null, integration: null, real: pgDatabaseHealthCheck, e2e: pgDatabaseHealthCheck },
	{
		token: DatabaseDriver,
		mock: neutralTopFromPg,
		integration: neutralTopFromPg,
		real: neutralTopFromPg,
		e2e: neutralTopFromPg,
	},
])

// Kernel bindings — one declaration per token, envs as columns (divergence is visible, absence is
// a declared null, `integration` omitted mirrors `real`).
/**
 * O registry DO CONTEXTO `shared` — o kernel, e só ele.
 *
 * Exportado porque o descritor de `shared` carrega ESTE, e não o merge de todos. A diferença não é
 * estética: `BoundedContext.create` aplica o registry de cada contexto no container RAIZ, e os nove
 * contextos já carregam o seu. Com `ALL_REGISTRIES` na raiz, TODO binding era registrado duas vezes
 * — e re-registrar um token singleton descarta a instância em cache do tsyringe, sem erro e sem
 * aviso.
 *
 * Três defeitos medidos em 2026-08-15 saíram daí: o `mailboxDispatcher` reportando `down` para
 * sempre (o health guardava a instância de antes do reset), o boot da nuvem carregando um GATE de um
 * contexto que ela não monta, e o pin de driver que existia para contornar o mesmo reset.
 */
export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	// mock: declared absence — flow tests wire OutboxAwareMockDomainEventRepository per-suite (TestBed).
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
	// A SESSÃO DA NUVEM. MUDOU DE CONTEXTO em 2026-08-14 (W3, Task 4a): vivia em `auth/registry.ts`.
	// O ADR 0001 leva `auth` inteiro para a nuvem, e o daemon LOCAL continua precisando da sessão —
	// então ela pertence a `shared`, o único contexto que vive nos dois deployments.
	//
	// O consumidor que provou a necessidade não é do auth: `agent/services/MailboxDispatcher` importa
	// `CloudSession` para gatear `claimNext` (sem sessão viva, nenhum turno começa). Um import de
	// `@auth/...` ali sobreviveria à migração apontando para um contexto que não monta mais aqui.
	//
	// REFERENCE em vez de `useFactory` para seguir singleton de verdade — ver o docblock do
	// FileCloudSession. e2e = REAL: o harness sobe o próprio portão de login do daemon sobre seu data
	// dir de rascunho, igual a um install de desktop; declarado porque a cadeia herdaria
	// MockCloudSession e removeria em silêncio o portão que o e2e existe para exercitar.
	{ token: CloudSession, mock: MockCloudSession, integration: MockCloudSession, real: FileCloudSession, e2e: FileCloudSession },
	{ token: MailSender, mock: ConsoleMailSender, real: ConsoleMailSender },
	// Repeatable jobs (BoundedContext.registerJobs) resolve this — an UNBOUND abstract silently
	// constructs a method-less instance and crashes boot (found by the first real e2e run).
	// In-memory queue in tests; database-backed in production (origin-faithful: the origin fork runs the
	// DB poller — no broker dependency).
	// HEALTH — multi-inject: N declarações do MESMO token, agregadas por resolveAll (core
	// healthChecksFrom). `mock`/`integration` são ausência DECLARADA: os testes de health constroem
	// HealthService à mão (Health.test.ts), e registrar checks reais num container de teste só criaria
	// um segundo caminho, pior, para provar a mesma coisa.
	{ token: HealthService, mock: healthServiceFactory, integration: healthServiceFactory, real: healthServiceFactory },
	{ token: HEALTH_CHECKS, mock: null, integration: null, real: migrationsHealthCheck, e2e: migrationsHealthCheck },
	{ token: HEALTH_CHECKS, mock: null, integration: null, real: outboxDispatcherHealthCheck, e2e: outboxDispatcherHealthCheck },
	{ token: HEALTH_CHECKS, mock: null, integration: null, real: externalMediatorHealthCheck, e2e: externalMediatorHealthCheck },
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

// O MAPA DE REGISTRIES SAIU DAQUI (F2) — ele agora é DERIVADO, em `src/registries.generated.ts`.
//
// Ficava aqui como `CONTEXT_REGISTRIES` + `ALL_REGISTRIES`, escritos à mão. O `satisfies` garantia a
// COBERTURA (um contexto faltando era erro de compilação) mas não o PAREAMENTO: `auth: billingRegistry`
// compilava limpo. No gerador, a chave, o alias e o especificador de módulo interpolam o MESMO
// binding na mesma iteração — o defeito deixou de PODER existir, em vez de ser detectado.
//
// Sem re-export de compatibilidade, e isso foi MEDIDO: um `export { ALL_REGISTRIES } from '<gerado>'`
// aqui fecharia um ciclo de 2 nós, e não é aviso — é `ReferenceError: Cannot access 'KERNEL' before
// initialization`, porque o merge é computado no eval do módulo.

/**
 * O EIXO DE BANCO, por família (ADR 0005 + ADR 0006) — o mapa eixo→família→bindings deste contexto.
 *
 * Morava no descritor em `shared/index.ts`, sob a chave `infra`. Veio para cá na DC2 porque é
 * BINDING: a tabela de alocação diz QUAL família cada contexto usa sob dados critérios, e isto diz
 * QUAIS bindings cada família traz. Um registro de bindings pertence ao arquivo de registro.
 *
 * `shared` é o único contexto que declara isto, e não é um vazio nos outros nove: só a RAIZ liga
 * driver, repositório de eventos, outbox, idempotência e fila. Um `auth` que diz `db: 'pg'` na
 * `PLACEMENT` está dizendo *"minhas tabelas moram no Postgres"*, não *"eu trago os bindings do
 * Postgres"* — e fazê-lo declarar `infra` criaria uma segunda cópia dos mesmos módulos.
 *
 * É também por isto que `shared` é o único DUAL da tabela de alocação: ele é a raiz de infra dos
 * dois deployments, e o laço de composição aplica o módulo da família que os critérios escolherem.
 * `assertFamiliesProvided` cobra que a família escolhida seja fornecida por alguém que monta — sem
 * isso, `db: 'pg'` seria uma frase sobre um mundo que ninguém constrói.
 */
export const INFRA_MODULES = { db: { libsql: LIBSQL_DB_REGISTRY, pg: PG_DB_REGISTRY } }
