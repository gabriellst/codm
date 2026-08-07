import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { Config } from '@codm/core-typescript'
import { TestBed } from '@test/support'
import { INTEGRATION_SOCIAL_PROVIDERS_FIXTURE } from '@auth/registry'
import { BetterAuth } from './BetterAuth'

// Hermetic — this asserts against the KNOWN fixture the `integration` env binds for
// BetterAuthSocialProviders (auth/registry.ts), not the ambient GITHUB_/GOOGLE_CLIENT_ID from
// Config.env. Asserting on the real env passes on a machine with a filled-in `.env` and fails on
// CI, which boots from `.env.example` (empty placeholders). The behavior actually under test — "the
// configured client id is threaded into better-auth's socialProviders and shows up in the authorize
// URL" — doesn't care what the value IS, only that OUR wiring carries it through, so BetterAuth is
// resolved normally via the DI registry (testBed.resolve) and the test imports the SAME fixture
// constant the registry's `integration` binding uses, instead of duplicating the literal.
const TEST_SOCIAL_PROVIDERS = INTEGRATION_SOCIAL_PROVIDERS_FIXTURE

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

	it('GitHub is configured — signInSocial returns an authorize URL carrying the injected client id', async () => {
		const result = await betterAuth.auth.api.signInSocial({
			body: { provider: 'github', callbackURL: `${Config.env.CODM_CLOUD_URL}/v1/cloud/desktop-callback` },
		})

		expect(result.url).toContain('github.com/login/oauth/authorize')
		expect(result.url).toContain(`client_id=${TEST_SOCIAL_PROVIDERS.githubClientId}`)
	})

	it('Google is configured — signInSocial returns an authorize URL carrying the injected client id', async () => {
		const result = await betterAuth.auth.api.signInSocial({
			body: { provider: 'google', callbackURL: `${Config.env.CODM_CLOUD_URL}/v1/cloud/desktop-callback` },
		})

		expect(result.url).toContain('accounts.google.com/o/oauth2/v2/auth')
		expect(result.url).toContain(`client_id=${TEST_SOCIAL_PROVIDERS.googleClientId}`)
	})
})
