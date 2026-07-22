import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenUser } from '@test/support'
import { DomainEventRepository } from '@template/core-typescript'
import { IdentityAuthHooks } from './IdentityAuthHooks'
import { UserProfileRepository } from '../repositories/UserProfileRepository'
import {
	PasswordChangedEvent,
	PasswordResetEvent,
	PasswordResetRequestedEvent,
	UserRegisteredEvent,
	UserSignedInEvent,
	UserSignedOutEvent,
} from '../events'

describe('IdentityAuthHooks (BetterAuth lifecycle adapter)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let hooks: IdentityAuthHooks
	let profileRepo: UserProfileRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		hooks = testBed.resolve(IdentityAuthHooks)
		profileRepo = testBed.resolve(UserProfileRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function readRegisteredEvents() {
		return testBed.resolve(DomainEventRepository).findByType(UserRegisteredEvent)
	}

	async function readSignedInEvents() {
		return testBed.resolve(DomainEventRepository).findByType(UserSignedInEvent)
	}

	async function readSignedOutEvents() {
		return testBed.resolve(DomainEventRepository).findByType(UserSignedOutEvent)
	}

	it('onUserCreated: creates the default profile + emits UserRegistered', async () => {
		const user = await givenUser(testBed, { email: 'reg@b.com' })
		const userId = user.id.value

		await hooks.onUserCreated({ userId, email: 'reg@b.com' })

		const profile = await profileRepo.findByUserId(userId)
		expect(profile).toBeDefined()

		const regEvts = await readRegisteredEvents()
		expect(regEvts).toHaveLength(1)
		expect(regEvts[0]!.payload.userId).toBe(userId)
		expect(regEvts[0]!.payload.email).toBe('reg@b.com')
	})

	it('onSessionCreated emits UserSignedIn with signedInAt timestamp', async () => {
		const { id } = await givenUser(testBed, { email: 'si@b.com' })
		const userId = id.value

		await hooks.onSessionCreated({ userId })

		const evts = await readSignedInEvents()
		expect(evts).toHaveLength(1)
		expect(evts[0]!.payload.userId).toBe(userId)
		expect(typeof evts[0]!.payload.signedInAt).toBe('string')
	})

	it('onSessionDeleted emits UserSignedOut with signedOutAt timestamp', async () => {
		const { id } = await givenUser(testBed, { email: 'so@b.com' })
		const userId = id.value

		await hooks.onSessionDeleted({ userId })

		const evts = await readSignedOutEvents()
		expect(evts).toHaveLength(1)
		expect(evts[0]!.payload.userId).toBe(userId)
		expect(typeof evts[0]!.payload.signedOutAt).toBe('string')
	})

	it('onPasswordResetRequested / onPasswordReset / onAccountUpdated each persist their event', async () => {
		const user = await givenUser(testBed, { email: 'pw@b.com' })
		const userId = user.id.value
		const events = testBed.resolve(DomainEventRepository)

		await hooks.onPasswordResetRequested({ userId, email: 'pw@b.com', name: 'PW', url: 'https://x.test/reset' })
		expect(await events.findByType(PasswordResetRequestedEvent)).toHaveLength(1)

		await hooks.onPasswordReset({ userId })
		expect(await events.findByType(PasswordResetEvent)).toHaveLength(1)

		await hooks.onAccountUpdated({ providerId: 'credential', userId })
		expect(await events.findByType(PasswordChangedEvent)).toHaveLength(1)
	})

	it('onAccountUpdated: non-credential providers never emit PasswordChanged (the filter is adapter logic)', async () => {
		const user = await givenUser(testBed, { email: 'oauth@b.com' })
		await hooks.onAccountUpdated({ providerId: 'google', userId: user.id.value })
		expect(await testBed.resolve(DomainEventRepository).findByType(PasswordChangedEvent)).toHaveLength(0)
	})

	it('DomainEventRepository is resolvable in integration mode (sanity check for hook plumbing)', () => {
		const repo = testBed.resolve(DomainEventRepository)
		expect(repo).toBeDefined()
	})

	it('BetterAuth constructs cleanly with IdentityAuthHooks injected (DI wiring sanity)', async () => {
		const { BetterAuth } = await import('@auth/services/Authentication/BetterAuth')
		const betterAuth = testBed.resolve(BetterAuth)
		expect(betterAuth.auth).toBeDefined()
	})
})
