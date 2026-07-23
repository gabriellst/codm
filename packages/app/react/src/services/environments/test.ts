import type { Container } from '../core/container'
import { AutostartToken, BadgeToken, FilePickerToken, HostInfoToken, NotificationToken, SecretsToken } from '../tokens'
import type { AutostartService } from '../AutostartService/AutostartService'
import type { BadgeService } from '../BadgeService/BadgeService'
import type { FilePickerService } from '../FilePickerService/FilePickerService'
import type { HostInfoService, NativePlatform } from '../HostInfoService/HostInfoService'
import type { NotificationService } from '../NotificationService/NotificationService'
import type { SecretsService } from '../SecretsService/SecretsService'

/**
 * Test composition root — in-memory fakes, no host present. The frontend analogue
 * of the backend's `mock` env (MockUnitOfWorkFactory & friends): a Container +
 * registerTest gives a suite the exact DI wiring the app uses, and a test overrides
 * any single token (e.g. FilePickerToken) with a purpose-built fake before resolving.
 *
 * NOT in ENVIRONMENTS — `detectEnvironment` never picks it; tests import it directly,
 * mirroring how the backend picks `mock`/`integration` explicitly per suite.
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

export const registerTest = (c: Container): void => {
	c.register(FilePickerToken, () => new FakeFilePickerService())
	c.register(NotificationToken, () => new FakeNotificationService())
	c.register(BadgeToken, () => new FakeBadgeService())
	c.register(SecretsToken, () => new FakeSecretsService())
	c.register(AutostartToken, () => new FakeAutostartService())
	c.register(HostInfoToken, () => new FakeHostInfoService())
}
