import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Config, DomainEventRepository } from '@template/core-typescript'
import { BetterAuth } from './BetterAuth'
import { UserRegisteredEvent, UserSignedInEvent } from '@auth/events'

describe('BetterAuth → Identity event emission (integration bridge, P1 Task 15)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let betterAuth: BetterAuth

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
		betterAuth = testBed.resolve(BetterAuth)
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

	it('successful sign-up emits UserRegistered via outbox', async () => {
		const req = new Request(`${Config.env.BETTER_AUTH_URL}/sign-up/email`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				email: 'newbie@b.com',
				password: 'StrongPass1!',
				name: 'Newbie',
			}),
		})

		const res = await betterAuth.auth.handler(req)
		expect(res.status).toBeLessThan(500)

		const reg = await readRegisteredEvents()
		expect(reg).toHaveLength(1)
		expect(reg[0]!.payload.email).toBe('newbie@b.com')
	})

	it('successful sign-up + sign-in path emits UserSignedIn', async () => {
		// Sign up first so the user exists.
		await betterAuth.auth.handler(
			new Request(`${Config.env.BETTER_AUTH_URL}/sign-up/email`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					email: 'signin@b.com',
					password: 'StrongPass1!',
					name: 'SignIn',
				}),
			}),
		)
		// Sign-up auto-creates a session in BetterAuth — UserSignedIn already
		// emitted once. Capture baseline.
		const baseline = (await readSignedInEvents()).length

		// Explicit sign-in via email/password.
		const res = await betterAuth.auth.handler(
			new Request(`${Config.env.BETTER_AUTH_URL}/sign-in/email`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					email: 'signin@b.com',
					password: 'StrongPass1!',
				}),
			}),
		)
		expect(res.status).toBeLessThan(500)

		const after = await readSignedInEvents()
		expect(after.length).toBeGreaterThan(baseline)
	})
})
