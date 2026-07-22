import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Config, DrizzleClient } from '@template/core-typescript'
import { IdentityAuthHooks } from '@auth/services/IdentityAuthHooks'
import { UserRepository } from '@auth/repositories'
import { BetterAuth } from './BetterAuth'

const post = (auth: BetterAuth, path: string, body: unknown) =>
	auth.auth.handler(
		new Request(`${Config.env.BETTER_AUTH_URL}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}),
	)

describe('BetterAuth sign-up: no phone in the user-creation path (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let betterAuth: BetterAuth
	let users: UserRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
		// Direct construction bypasses the @singleton cache so this suite is order-independent.
		betterAuth = new BetterAuth(testBed.resolve(DrizzleClient), testBed.resolve(IdentityAuthHooks))
		users = testBed.resolve(UserRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('sign-up succeeds with name/email/password only — no phone field exists on the created user', async () => {
		const res = await post(betterAuth, '/sign-up/email', { email: 'nophone@b.com', password: 'StrongPass1!', name: 'No Phone' })
		expect(res.status).toBeLessThan(400)
		const user = await users.findByEmail('nophone@b.com')
		expect(user).toBeDefined()
		expect((user as unknown as { phone?: unknown }).phone).toBeUndefined()
	})

	it('a stray phone field in the sign-up body is neither accepted nor persisted', async () => {
		const res = await post(betterAuth, '/sign-up/email', {
			email: 'strayphone@b.com',
			password: 'StrongPass1!',
			name: 'Stray Phone',
			phone: '+5511999999999',
		})
		// No additionalFields declaration → better-auth ignores the extra key; sign-up still succeeds.
		expect(res.status).toBeLessThan(400)
		const user = await users.findByEmail('strayphone@b.com')
		expect(user).toBeDefined()
		expect((user as unknown as { phone?: unknown }).phone).toBeUndefined()
	})
})
