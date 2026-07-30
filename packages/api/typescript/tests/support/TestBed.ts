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
	DrizzleDatabaseDriver,
	DrizzleClient,
	registerAll,
	DomainEventRepository,
	OutboxAwareMockDomainEventRepository,
	Handler,
} from '@codm/core-typescript'
import { ALL_REGISTRIES } from '@shared/registry'
import { GivenHelpers, createGivenHelpers } from './given'
import { PersistenceProbe } from './PersistenceProbe'

export type TestBedMode = 'mock' | 'integration'

export interface TestBedOptions {
	testContainer: DependencyContainer
	ownerId?: string
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

		registerAll(testContainer, ALL_REGISTRIES.mock)

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

	private static databaseDriver: DrizzleDatabaseDriver | null = null

	private static async createIntegrationMode(options: TestBedOptions): Promise<TestBed> {
		const { testContainer } = options

		registerAll(testContainer, ALL_REGISTRIES.integration)

		if (!TestBed.databaseDriver) {
			TestBed.databaseDriver = testContainer.resolve(DrizzleDatabaseDriver as any) as DrizzleDatabaseDriver
			await TestBed.databaseDriver.runMigrations()
		}

		const databaseDriver = TestBed.databaseDriver
		testContainer.registerInstance(DrizzleDatabaseDriver as any, databaseDriver)
		testContainer.registerInstance(DrizzleClient as any, databaseDriver.db)

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

	get ownerId(): string {
		return this.defaultOwnerId ?? 'integration-tenant'
	}

	resolve<T>(token: abstract new (...args: any[]) => T): T {
		const resolved = this.testContainer.resolve(token as any)

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
	 * (DomainEventRepository, UnitOfWorkFactory, InternalMediator/ExternalMediator,
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
	 * Persisted State"). Integration-mode only: mock mode has no real `DrizzleClient` to read from,
	 * so this throws instead of handing back a probe that would fail confusingly on first query.
	 */
	probe(): PersistenceProbe {
		if (this.mode !== 'integration') {
			throw new Error('testBed.probe() requires integration mode — mock mode has no real DrizzleClient to read from.')
		}
		return new PersistenceProbe(this.resolve(DrizzleClient))
	}

	async reset(): Promise<void> {
		if (this._resetFn) await this._resetFn()
	}

	async destroy(): Promise<void> {
		if (this._destroyFn) await this._destroyFn()
	}
}
