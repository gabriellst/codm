import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { Config } from '@codm/core-typescript'
import { TestBed } from '@test/support'
import { BetterAuth } from './BetterAuth'

describe('BetterAuth (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let betterAuth: BetterAuth

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		betterAuth = testBed.resolve(BetterAuth)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('mounts a working handler — GET /api/auth/ok responds', async () => {
		const request = new Request(`${Config.env.CODM_CLOUD_URL}/api/auth/ok`)
		const response = await betterAuth.auth.handler(request)

		expect(response.status).toBe(200)
	})

	it('GitHub is configured — signInSocial returns an authorize URL carrying the env client id', async () => {
		const result = await betterAuth.auth.api.signInSocial({
			body: { provider: 'github', callbackURL: `${Config.env.CODM_CLOUD_URL}/v1/cloud/desktop-callback` },
		})

		expect(result.url).toContain('github.com/login/oauth/authorize')
		expect(result.url).toContain(`client_id=${Config.env.GITHUB_CLIENT_ID}`)
	})

	it('Google is configured — signInSocial returns an authorize URL carrying the env client id', async () => {
		const result = await betterAuth.auth.api.signInSocial({
			body: { provider: 'google', callbackURL: `${Config.env.CODM_CLOUD_URL}/v1/cloud/desktop-callback` },
		})

		expect(result.url).toContain('accounts.google.com/o/oauth2/v2/auth')
		expect(result.url).toContain(`client_id=${Config.env.GOOGLE_CLIENT_ID}`)
	})
})
