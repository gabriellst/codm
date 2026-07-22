// Task 6 — GET /v1/session integration test.
// Tests: 401 on missing session; shape assertion on the output schema.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { GetSessionController } from './GetSession'
import { BetterAuth } from '@auth/services/Authentication/BetterAuth'
import { HttpControllerError, type HttpControllerRequest } from '@template/core-typescript'

/** Mock BetterAuth that always rejects the session (simulates no cookie). */
function makeMockBetterAuth(): BetterAuth {
	return {
		auth: {
			api: {
				getSession: async () => ({ ok: false }),
			},
		},
	} as unknown as BetterAuth
}

describe('GET /v1/session', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		// Override BetterAuth so AuthAccountMiddleware returns 401 without hitting a real server.
		testBed.override(BetterAuth, makeMockBetterAuth())
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('returns 401 when no session cookie is present', async () => {
		const controller = testBed.resolve(GetSessionController)
		const request: HttpControllerRequest<unknown> = {
			url: 'http://localhost/v1/session',
			ctx: {},
			headers: {},
			params: {},
			body: {},
			raw: new Request('http://localhost/v1/session'),
		}
		await expect(controller.executeController(request)).rejects.toBeInstanceOf(HttpControllerError)
	})

	it('output schema has session key, not account key', () => {
		// Verifies the controller declares SessionSchema as its outputSchema.
		const controller = testBed.resolve(GetSessionController)
		const outputShape = Object.keys((controller.outputSchema as unknown as { shape: Record<string, unknown> }).shape)
		expect(outputShape).not.toContain('account')
		expect(outputShape).toContain('session')
		expect(outputShape).toContain('user')
	})

	it('given helpers create resolvable entities (fixture sanity)', async () => {
		const { user, account } = await testBed.given.userWithAccount({
			user: { email: 'gabriel@example.com', name: 'Gabriel' },
		})
		expect(user.email).toBe('gabriel@example.com')
		expect(user.name).toBe('Gabriel')
		// account exists for auth wiring even though GetSession no longer returns it
		expect(account.providerId).toBe('credential')
	})
})
