// Recipe: dev:packages/api/tests/support/TestBed.ts
// Simplified: no allUseCases/allHandlers aggregation — video-streaming has fewer contexts;
// handlers are registered per-context when needed.
import 'reflect-metadata'
import { type DependencyContainer } from 'tsyringe-neo'
import {
	InternalMediator,
	ExternalMediator,
	EventEmitter2Mediator,
	SpyMediator,
	OutboxDispatcher,
	MockOutboxDispatcher,
	LibSqlDatabaseDriver,
	DatabaseDriver,
	registerAll,
	DomainEventRepository,
	OutboxAwareMockDomainEventRepository,
	Handler,
	resolve,
	type Token,
} from '@codm/core-typescript'
import { LIBSQL_DB_REGISTRY, PG_DB_REGISTRY } from '@shared/registry'
// O merge saiu do `shared/registry.ts` na F2 e agora é DERIVADO — ver o docblock do gerado.
import { ALL_REGISTRIES } from '@generated/registries.generated'
import type { DatabaseFamily } from '@codm/contracts/placement'

/**
 * O TestBed é um banco LIBSQL, e agora ele DIZ isso.
 *
 * Os bindings de família saíram do `ALL_REGISTRIES` quando a família `pg` entrou (ADR 0005/0006):
 * qual família um deployment usa passou a ser decisão da `PLACEMENT`, aplicada pelo laço de
 * composição. Quem monta um container SEM compor — este harness, e o rail de resolução real —
 * escolhe a família explicitamente. É mais verboso e é o ponto: antes, "qual banco este teste usa"
 * era uma resposta que ninguém dava porque só havia uma.
 */
const withFamily = (entries: typeof ALL_REGISTRIES.mock, family: typeof LIBSQL_DB_REGISTRY.mock) => [...entries, ...family]

/**
 * A família de banco DESTE harness — e por que ela deixou de ser uma constante.
 *
 * `libsql` continua sendo o default porque é o mundo do desktop, onde mora a maioria dos contextos.
 * Mas `auth` e `owner` são CLOUD-ONLY (ADR 0002) e suas tabelas vivem no tronco `db/cloud`, servido
 * pela família pg (ADR 0005). Enquanto este arquivo cravava libsql, uma suíte de `owner` recebia um
 * repositório sobre um tronco que não tem as tabelas dela — e, pior, uma `UnitOfWorkFactory` da
 * família errada, de modo que a escrita ia por uma transação libsql enquanto a leitura vinha do
 * Postgres. O sintoma era `findById` devolvendo `undefined` logo depois de um `save` que "funcionou".
 *
 * Escolher a família é explícito de propósito: antes, "qual banco este teste usa" era uma pergunta
 * que ninguém fazia porque só havia uma resposta.
 */
const FAMILY_REGISTRY = { libsql: LIBSQL_DB_REGISTRY, pg: PG_DB_REGISTRY } as const
import { GivenHelpers, createGivenHelpers } from './given'
import { PersistenceProbe } from './PersistenceProbe'

export type TestBedMode = 'mock' | 'integration'

export interface TestBedOptions {
	testContainer: DependencyContainer
	ownerId?: string
	/** A família de banco a compor. Default `libsql` — ver `FAMILY_REGISTRY`. */
	db?: DatabaseFamily
}

export class TestBed {
	private _destroyFn?: () => Promise<void>
	private _resetFn?: () => Promise<void>
	readonly given: GivenHelpers

	private constructor(
		readonly spy: SpyMediator,
		readonly externalSpy: SpyMediator,
		private mode: TestBedMode,
		private testContainer: DependencyContainer,
		private defaultOwnerId?: string,
	) {
		this.given = createGivenHelpers(this)
	}

	static async create(mode: TestBedMode, options: TestBedOptions): Promise<TestBed> {
		if (mode === 'integration') {
			return TestBed.createIntegrationMode(options)
		}
		return TestBed.createMockMode(options)
	}

	// --- Mock Mode ---

	private static async createMockMode(options: TestBedOptions): Promise<TestBed> {
		const { testContainer } = options

		registerAll(testContainer, withFamily(ALL_REGISTRIES.mock, FAMILY_REGISTRY[options.db ?? 'libsql'].mock))

		const spyMediator = TestBed.createSpyMediator(testContainer, InternalMediator, true)
		const externalSpy = TestBed.createSpyMediator(testContainer, ExternalMediator)
		const mockOutbox = new MockOutboxDispatcher(spyMediator, externalSpy)
		const domainEventRepository = new OutboxAwareMockDomainEventRepository(mockOutbox)

		testContainer.registerInstance(MockOutboxDispatcher as any, mockOutbox)
		testContainer.registerInstance(OutboxDispatcher as any, mockOutbox)
		testContainer.registerInstance(DomainEventRepository as any, domainEventRepository)

		const testBed = new TestBed(spyMediator, externalSpy, 'mock', testContainer, options.ownerId)
		testBed._resetFn = async () => {
			spyMediator.reset()
			externalSpy.reset()
			mockOutbox.reset()
		}

		return testBed
	}

	private static databaseDriver: LibSqlDatabaseDriver | null = null

	private static async createIntegrationMode(options: TestBedOptions): Promise<TestBed> {
		const { testContainer } = options

		registerAll(testContainer, withFamily(ALL_REGISTRIES.integration, FAMILY_REGISTRY[options.db ?? 'libsql'].integration))

		if ((options.db ?? 'libsql') === 'pg') {
			// A família pg migra por INSTÂNCIA: o `PGliteDriver` guarda um snapshot pós-migração por
			// processo e o `reset()` volta a ele. Não há o singleton de ARQUIVO que o caminho libsql
			// abaixo protege — lá, duas instâncias sobre o mesmo `.db` disputariam o mesmo disco.
			await resolve(testContainer, DatabaseDriver).runMigrations()
		} else if (!TestBed.databaseDriver) {
			TestBed.databaseDriver = resolve(testContainer, LibSqlDatabaseDriver)
			await TestBed.databaseDriver.runMigrations()
			testContainer.registerInstance(LibSqlDatabaseDriver as any, TestBed.databaseDriver)
		} else {
			testContainer.registerInstance(LibSqlDatabaseDriver as any, TestBed.databaseDriver)
		}

		// O TOPO NEUTRO, e não o driver de uma família: `reset`/`close` são lifecycle que as duas
		// declaram (ADR 0006). Fechar sobre o singleton libsql fazia o caminho pg estourar com
		// `null is not an object` no primeiro `reset()` — o harness sabia de UMA família só.
		const databaseDriver = resolve(testContainer, DatabaseDriver)

		const spyMediator = TestBed.createSpyMediator(testContainer, InternalMediator, true)
		const externalSpy = TestBed.createSpyMediator(testContainer, ExternalMediator)

		const testBed = new TestBed(spyMediator, externalSpy, 'integration', testContainer, options.ownerId)
		testBed._resetFn = async () => {
			spyMediator.reset()
			externalSpy.reset()
			await databaseDriver.reset()
		}
		testBed._destroyFn = async () => {
			await databaseDriver.close()
		}

		return testBed
	}

	// --- Shared helpers ---

	private static createSpyMediator(
		container: DependencyContainer,
		token: typeof InternalMediator | typeof ExternalMediator,
		registerClassToken = false,
	): SpyMediator {
		const innerMediator = new EventEmitter2Mediator()
		const spyMediator = new SpyMediator(innerMediator)

		if (registerClassToken) {
			container.registerInstance(SpyMediator as any, spyMediator)
		}
		container.registerInstance(token as any, spyMediator)

		return spyMediator
	}

	// --- Public API ---

	/**
	 * Identidade é DECISÃO DO CHAMADOR, não default do maquinário (F3/T3).
	 *
	 * Isto devolvia `'integration-tenant'` quando ninguém declarava. O default era silencioso e por
	 * isso perigoso: os givens semeiam sob `testBed.ownerId`, e o caso sob teste lê sob o dono que a
	 * `CloudSession` carimba. Divergindo os dois, a suíte não quebra — ela passa a verificar o nada,
	 * porque a query não acha a linha que o given escreveu e a asserção de "vazio" vira verdadeira
	 * pelo motivo errado. Um teste que sempre passa não é um teste.
	 *
	 * Lançar aqui não custa cobertura: das 95 chamadas de `TestBed.create`, 91 já declaram `ownerId`,
	 * e nenhuma das 4 restantes lê esta propriedade — elas ou criam o próprio dono (`CreateOwner`) ou
	 * não têm dono nenhum (`LibSqlIdempotencyGuard`). Quem não precisa de identidade segue sem
	 * declará-la; quem precisa passa a dizer qual, em vez de herdar um literal do mecanismo.
	 *
	 * Vale igualmente para o alvo da W2: um core portável não pode ter opinião sobre o tenant do
	 * produto que o hospeda.
	 */
	get ownerId(): string {
		if (this.defaultOwnerId === undefined) {
			throw new Error(
				'TestBed: `ownerId` foi lido mas não declarado. Passe `ownerId` em `TestBed.create(mode, { ... })` — ' +
					'o maquinário de teste não tem identidade default (F3/T3).',
			)
		}
		return this.defaultOwnerId
	}

	resolve<T>(token: Token<T>): T {
		const resolved = resolve(this.testContainer, token)

		if (resolved instanceof Handler) {
			return resolved.bindContainer(this.testContainer) as T
		}

		return resolved as T
	}

	/**
	 * The ONLY sanctioned way to swap a binding in a test. Use it for the rare
	 * case the registry can't provide — a controllable collaborator double (e.g. a
	 * Mock query service fed test data), a clock, a third-party stub. Call AFTER
	 * create() and BEFORE resolving the consumer. NEVER override infra TestBed owns
	 * (DomainEventRepository, LibSqlDatabaseDriver, InternalMediator/ExternalMediator,
	 * OutboxDispatcher) — that removes the spy + outbox wiring; assert events via
	 * testBed.spy instead. The `as any` (tsyringe registration limitation) lives
	 * here once, so tests never cast.
	 */
	override<T>(token: abstract new (...args: any[]) => T, instance: T): this {
		this.testContainer.registerInstance(token as any, instance)
		return this
	}

	/**
	 * The only sanctioned seam for reading persisted events/outbox rows and cross-table invariant
	 * snapshots in a test — see `PersistenceProbe` and `tests/architecture/README.md` ("Reading
	 * Persisted State"). Integration-mode only: mock mode has no real database driver to read from,
	 * so this throws instead of handing back a probe that would fail confusingly on first query.
	 */
	probe(): PersistenceProbe {
		if (this.mode !== 'integration') {
			throw new Error('testBed.probe() requires integration mode — mock mode has no real database driver to read from.')
		}
		return new PersistenceProbe(this.resolve(LibSqlDatabaseDriver).db)
	}

	async reset(): Promise<void> {
		if (this._resetFn) await this._resetFn()
	}

	async destroy(): Promise<void> {
		if (this._destroyFn) await this._destroyFn()
	}
}
