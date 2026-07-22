import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, injectable, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Config, DomainEventRepository, DrizzleClient, MailSender, ConsoleMailSender, type MailMessage } from '@template/core-typescript'
import { IdentityAuthHooks } from '@auth/services/IdentityAuthHooks'
import { UserProfileRepository } from '@auth/repositories'
import { BetterAuth } from './BetterAuth'

@injectable()
class SpyMailSender extends MailSender {
	readonly sent: MailMessage[] = []
	async sendMail(message: MailMessage): Promise<void> {
		this.sent.push(message)
	}
}

describe('BetterAuth → transactional emails (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let betterAuth: BetterAuth
	let spy: SpyMailSender

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
		// Construct BetterAuth directly with the spy so each test file gets its
		// own instance regardless of the @singleton cache order.
		spy = new SpyMailSender()
		const client = testBed.resolve(DrizzleClient)
		// The spy plugs into IdentityAuthHooks — ALL side-effect logic (emails included) lives on
		// the adapter now; BetterAuth is pure wiring.
		const identityHooks = new IdentityAuthHooks(testBed.resolve(DomainEventRepository), testBed.resolve(UserProfileRepository), spy, client)
		betterAuth = new BetterAuth(client, identityHooks)
	})
	beforeEach(async () => {
		await testBed.reset()
		spy.sent.length = 0
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('binds MailSender to core ConsoleMailSender in the real registry (AC-6)', async () => {
		// Fresh container with no spy override → production binding from shared/registry.
		const prodContainer = container.createChildContainer()
		const prodBed = await TestBed.create('integration', { testContainer: prodContainer })
		expect(prodBed.resolve(MailSender)).toBeInstanceOf(ConsoleMailSender)
		await prodBed.destroy()
	})

	it('sign-up sends an account-created email to the new user (AC-2)', async () => {
		await betterAuth.auth.handler(
			new Request(`${Config.env.BETTER_AUTH_URL}/sign-up/email`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: 'welcome@b.com', password: 'StrongPass1!', name: 'Welcomed' }),
			}),
		)
		const welcome = spy.sent.find(m => m.to === 'welcome@b.com')
		expect(welcome).toBeDefined()
		expect(welcome!.body).toContain('Welcomed')
	})

	it('request-password-reset sends a reset email with the reset url (AC-3)', async () => {
		await betterAuth.auth.handler(
			new Request(`${Config.env.BETTER_AUTH_URL}/sign-up/email`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: 'reset@b.com', password: 'StrongPass1!', name: 'Reset Me' }),
			}),
		)
		spy.sent.length = 0

		const res = await betterAuth.auth.handler(
			new Request(`${Config.env.BETTER_AUTH_URL}/request-password-reset`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: 'reset@b.com', redirectTo: 'http://localhost:5173/reset-password' }),
			}),
		)
		expect(res.status).toBeLessThan(500)
		const reset = spy.sent.find(m => m.to === 'reset@b.com')
		expect(reset).toBeDefined()
		expect(reset!.body).toContain('callbackURL=')
		expect(reset!.body).toContain('reset-password')
	})
})
