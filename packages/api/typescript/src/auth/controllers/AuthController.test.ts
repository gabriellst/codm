import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Config } from '@template/core-typescript'
import type { HttpControllerRequest } from '@template/core-typescript'
import { AuthController } from './AuthController'

// Build the HttpControllerRequest shape the router passes to executeController.
// Only `.raw` (the Web Request) matters for the passthrough.
function controllerRequest(raw: Request): HttpControllerRequest<unknown> {
	return { raw, ctx: {}, body: undefined, query: {}, params: {}, headers: {}, cookies: {} } as unknown as HttpControllerRequest<unknown>
}

describe('AuthController (better-auth passthrough)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let controller: AuthController

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
		controller = testBed.resolve(AuthController)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('forwards sign-up then sign-in to better-auth and returns a session', async () => {
		const signUp = await controller.handle(
			controllerRequest(
				new Request(`${Config.env.BETTER_AUTH_URL}/sign-up/email`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email: 'pass@b.com', password: 'StrongPass1!', name: 'Pass Through' }),
				}),
			),
		)
		expect(signUp).toBeInstanceOf(Response)
		expect((signUp as unknown as Response).status).toBeLessThan(500)

		const signIn = (await controller.handle(
			controllerRequest(
				new Request(`${Config.env.BETTER_AUTH_URL}/sign-in/email`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email: 'pass@b.com', password: 'StrongPass1!' }),
				}),
			),
		)) as unknown as Response
		expect(signIn).toBeInstanceOf(Response)
		expect(signIn.status).toBe(200)
		const body = (await signIn.json()) as { token?: string; user?: { email: string } }
		expect(body.user?.email).toBe('pass@b.com')
	})
})
