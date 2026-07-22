import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, injectable, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Config, DomainEventRepository, DrizzleClient, MailSender, type MailMessage } from '@template/core-typescript'
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

const post = (auth: BetterAuth, path: string, body: unknown) =>
	auth.auth.handler(
		new Request(`${Config.env.BETTER_AUTH_URL}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}),
	)

describe('BetterAuth password reset round-trip (integration, AC-4)', () => {
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

	it('reset with the emailed token updates the password and lets the user sign in', async () => {
		// 1. Sign up the user
		await post(betterAuth, '/sign-up/email', { email: 'rt@b.com', password: 'OldPass1!', name: 'Round Trip' })
		spy.sent.length = 0

		// 2. Request password reset
		await post(betterAuth, '/request-password-reset', {
			email: 'rt@b.com',
			redirectTo: 'http://localhost:5173/reset-password',
		})

		// 3. Find the reset email and extract the path-segment token
		// better-auth builds: http://localhost:3030/v1/authentication/reset-password/<TOKEN>?callbackURL=...
		const resetEmail = spy.sent.find(m => m.to === 'rt@b.com')
		expect(resetEmail).toBeDefined()
		const m = resetEmail!.body.match(/reset-password\/([^?\s"'&<]+)/)
		expect(m).toBeTruthy()
		const token = m![1]
		expect(token).toBeTruthy()

		// 4. POST /reset-password with the token and the new password
		const reset = await post(betterAuth, '/reset-password', { token, newPassword: 'NewPass1!' })
		expect(reset.status).toBeLessThan(500)

		// 5. Sign in with the NEW password → must succeed
		const withNew = await post(betterAuth, '/sign-in/email', { email: 'rt@b.com', password: 'NewPass1!' })
		expect(withNew.status).toBe(200)

		// 6. Sign in with the OLD password → must fail
		const withOld = await post(betterAuth, '/sign-in/email', { email: 'rt@b.com', password: 'OldPass1!' })
		expect(withOld.status).toBeGreaterThanOrEqual(400)
	})
})
