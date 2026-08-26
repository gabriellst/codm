import type { Bindings } from '../core/container'
import {
	AutostartToken,
	BadgeToken,
	CloudSessionToken,
	FilePickerToken,
	HostInfoToken,
	LoggingToken,
	NotificationToken,
	AnalyticsToken,
	SecretsToken,
	SupervisionToken,
	UpdateToken,
	SystemPreconditionsToken,
	WindowToken,
} from '../tokens'
import type { AutostartService } from '../AutostartService/AutostartService'
import type { BadgeService } from '../BadgeService/BadgeService'
import type { CloudSessionService } from '../CloudSessionService/CloudSessionService'
import type { FilePickerService } from '../FilePickerService/FilePickerService'
import type { HostInfoService, NativePlatform } from '../HostInfoService/HostInfoService'
import type { LoggingService } from '../LoggingService/LoggingService'
import type { NotificationService } from '../NotificationService/NotificationService'
import type { AnalyticsService } from '../AnalyticsService/AnalyticsService'
import type {
	SystemPreconditionId,
	SystemPreconditionStatus,
	SystemPreconditionsService,
} from '../SystemPreconditionsService/SystemPreconditionsService'
import type { SecretsService } from '../SecretsService/SecretsService'
import type { SupervisionService, SupervisionState } from '../SupervisionService/SupervisionService'
import type { UpdateService } from '../UpdateService/UpdateService'
import type { WindowChrome, WindowService } from '../WindowService/WindowService'

/**
 * Test composition root — in-memory fakes, no host present. The frontend analogue
 * of the backend's `mock` env (MockUnitOfWorkFactory & friends): a Container +
 * the default bindings below gives a suite the exact DI wiring the app uses, and a
 * test overrides any single token (e.g. FilePickerToken) with a purpose-built fake
 * by `load`-ing a one-entry record after the defaults.
 *
 * NOT in ENVIRONMENTS — `detectEnvironment` never picks it; tests import the default
 * bindings directly, mirroring how the backend picks `mock`/`integration` explicitly.
 *
 * DECLARATIVE like the other envs: the default export is a `[Token, Class]` record,
 * ZERO `new` (the Container constructs). The Fakes take OPTIONAL ctor args (seed
 * values) so the default `new Fake()` is valid; a test that needs a seeded fake binds
 * a tiny seeded subclass — `class SeededPicker extends FakeFilePickerService { constructor(){ super('/seed') } }`
 * — via a one-entry `load`, keeping `new` out of the test too (see ServicesProvider.test.tsx).
 */

export class FakeFilePickerService implements FilePickerService {
	readonly calls: Array<{ title?: string } | undefined> = []
	constructor(
		private readonly result: string | null = null,
		private readonly supported = true,
	) {}

	async supportsFolderPicker(): Promise<boolean> {
		return this.supported
	}

	async pickFolder(options?: { title?: string }): Promise<string | null> {
		this.calls.push(options)
		return this.result
	}
}

export class FakeNotificationService implements NotificationService {
	readonly notified: Array<{ title: string; body?: string }> = []
	async notify(input: { title: string; body?: string }): Promise<void> {
		this.notified.push(input)
	}
}

export class FakeBadgeService implements BadgeService {
	last: number | null = null
	async set(count: number | null): Promise<void> {
		this.last = count
	}
}

export class FakeSecretsService implements SecretsService {
	readonly store = new Map<string, string>()
	async get(key: string): Promise<string | null> {
		return this.store.get(key) ?? null
	}
	async set(key: string, value: string): Promise<void> {
		this.store.set(key, value)
	}
	async delete(key: string): Promise<void> {
		this.store.delete(key)
	}
}

export class FakeAutostartService implements AutostartService {
	enabled = false
	async isEnabled(): Promise<boolean> {
		return this.enabled
	}
	async enable(): Promise<void> {
		this.enabled = true
	}
	async disable(): Promise<void> {
		this.enabled = false
	}
}

export class FakeHostInfoService implements HostInfoService {
	constructor(
		private readonly value: NativePlatform = 'browser',
		private readonly baseUrl: string | null = null,
	) {}
	async platform(): Promise<NativePlatform> {
		return this.value
	}
	async apiBaseUrl(): Promise<string | null> {
		return this.baseUrl
	}
}

/**
 * Seeded with the state a console would find on mount (the PULL); `emit` drives the subscribers the
 * way the host's event does (the PUSH). Those are the two halves a supervision consumer has to get
 * right, so the fake exposes both rather than only the easy one.
 */
export class FakeSupervisionService implements SupervisionService {
	readonly listeners = new Set<(state: SupervisionState) => void>()
	restarts = 0
	constructor(private state: SupervisionState = { kind: 'healthy' }) {}

	async current(): Promise<SupervisionState> {
		return this.state
	}

	async subscribe(listener: (state: SupervisionState) => void): Promise<() => void> {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	async restart(): Promise<void> {
		this.restarts += 1
	}

	/** Drive a transition, as the host would. */
	emit(state: SupervisionState): void {
		this.state = state
		for (const listener of this.listeners) listener(state)
	}
}

/**
 * `emit` simulates the OS handing the `codm://` deep link back to the running process — the PUSH
 * half a real test drives (`useLoopbackAuth` tests mount the hook, call `fake.emit(url)`, assert
 * the exchange/persist/store-flip that followed), mirroring `FakeSupervisionService.emit`.
 * `openBrowser` records calls instead of doing anything — no host to open a URL against in a test.
 */
export class FakeCloudSessionService implements CloudSessionService {
	readonly opened: string[] = []

	async openBrowser(url: string): Promise<void> {
		this.opened.push(url)
	}
}

/** Records calls instead of touching `window.console` — a unit test suite shares ONE process
 *  (bun:test), so actually monkey-patching console here would leak into every other file's output. */
export class FakeLoggingService implements LoggingService {
	attached = 0
	async attachConsole(): Promise<void> {
		this.attached += 1
	}
}

/**
 * Seeded with the pending version a console would find on mount (the PULL); `emit` drives the
 * subscriber the way the shell's `UpdateReady` event does (the PUSH) — same split as
 * `FakeSupervisionService`.
 */
export class FakeUpdateService implements UpdateService {
	readonly listeners = new Set<(version: string) => void>()
	restarts = 0
	constructor(private version: string | null = null) {}

	async pending(): Promise<string | null> {
		return this.version
	}

	async subscribe(listener: (version: string) => void): Promise<() => void> {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	async restart(): Promise<void> {
		this.restarts += 1
	}

	/** Drive an install completing, as the shell would. */
	emit(version: string): void {
		this.version = version
		for (const listener of this.listeners) listener(version)
	}
}

/** Records every call instead of touching the real `posthog-js` singleton — the seam that makes
 *  opt-out (and identify/reset/pageview wiring) testable without a network boundary to mock. */
export class FakeAnalyticsService implements AnalyticsService {
	readonly identified: Array<{ userId: string; properties?: Record<string, unknown> }> = []
	resets = 0
	readonly personProperties: Record<string, unknown>[] = []
	readonly pageviews: string[] = []
	/** Mirrors posthog-js's own default (opted IN) — flips via `optIn`/`optOut`, the same verbs the
	 *  Settings toggle and `useAnalyticsConsent` call on the real service. */
	optedOut = false

	identify(userId: string, properties?: Record<string, unknown>): void {
		this.identified.push({ userId, properties })
	}

	reset(): void {
		this.resets += 1
	}

	setPersonProperties(properties: Record<string, unknown>): void {
		this.personProperties.push(properties)
	}

	capturePageview(url: string): void {
		this.pageviews.push(url)
	}

	optIn(): void {
		this.optedOut = false
	}

	optOut(): void {
		this.optedOut = true
	}
}

/**
 * Semeado com o que uma máquina reportaria no mount (o PULL), e `set` reencena o que muda quando o
 * operador volta dos Ajustes — as duas metades que um consumidor de pré-condição tem que acertar,
 * do mesmo jeito que `FakeSupervisionService` expõe PULL e PUSH em vez de só o fácil. `repaired`
 * registra as chamadas porque "o botão realmente pediu o reparo" é a asserção que interessa: um
 * teste não pode executar `tccutil`.
 */
export class FakeSystemPreconditionsService implements SystemPreconditionsService {
	readonly repaired: SystemPreconditionId[] = []
	constructor(private current: SystemPreconditionStatus[] = []) {}

	async statuses(): Promise<SystemPreconditionStatus[]> {
		return this.current
	}

	async repair(id: SystemPreconditionId): Promise<void> {
		this.repaired.push(id)
	}

	/** Reencena o que a sonda passaria a reportar — como o host faria depois de uma concessão. */
	set(statuses: SystemPreconditionStatus[]): void {
		this.current = statuses
	}
}

/**
 * Semeado com o chrome que o host reportaria — `native` por default, a MESMA resposta que
 * `BrowserWindowService` dá (uma aba não sobrepõe nada ao console). Um teste que precisa dos
 * semáforos sobrepostos liga uma subclasse semeada com `{ titleBar: 'overlay' }`, como
 * `SeededPicker` faz em ServicesProvider.test.tsx — `new` continua fora do teste.
 */
export class FakeWindowService implements WindowService {
	constructor(private readonly value: WindowChrome = { titleBar: 'native' }) {}

	async chrome(): Promise<WindowChrome> {
		return this.value
	}
}

export default [
	[FilePickerToken, FakeFilePickerService],
	[NotificationToken, FakeNotificationService],
	[BadgeToken, FakeBadgeService],
	[SecretsToken, FakeSecretsService],
	[AutostartToken, FakeAutostartService],
	[HostInfoToken, FakeHostInfoService],
	[SupervisionToken, FakeSupervisionService],
	[CloudSessionToken, FakeCloudSessionService],
	[LoggingToken, FakeLoggingService],
	[UpdateToken, FakeUpdateService],
	[AnalyticsToken, FakeAnalyticsService],
	[SystemPreconditionsToken, FakeSystemPreconditionsService],
	[WindowToken, FakeWindowService],
] as const satisfies Bindings
