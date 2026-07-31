import type { Bindings } from '../core/container'
import { AutostartToken, BadgeToken, FilePickerToken, HostInfoToken, NotificationToken, SecretsToken, SupervisionToken } from '../tokens'
import type { AutostartService } from '../AutostartService/AutostartService'
import type { BadgeService } from '../BadgeService/BadgeService'
import type { FilePickerService } from '../FilePickerService/FilePickerService'
import type { HostInfoService, NativePlatform } from '../HostInfoService/HostInfoService'
import type { NotificationService } from '../NotificationService/NotificationService'
import type { SecretsService } from '../SecretsService/SecretsService'
import type { SupervisionService, SupervisionState } from '../SupervisionService/SupervisionService'

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
	constructor(private readonly value: NativePlatform = 'browser') {}
	async platform(): Promise<NativePlatform> {
		return this.value
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

export default [
	[FilePickerToken, FakeFilePickerService],
	[NotificationToken, FakeNotificationService],
	[BadgeToken, FakeBadgeService],
	[SecretsToken, FakeSecretsService],
	[AutostartToken, FakeAutostartService],
	[HostInfoToken, FakeHostInfoService],
	[SupervisionToken, FakeSupervisionService],
] as const satisfies Bindings
