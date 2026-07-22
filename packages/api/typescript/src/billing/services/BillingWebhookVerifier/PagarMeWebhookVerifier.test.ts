import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { ProductConfig } from '@shared/config'
import { PagarMeWebhookVerifier } from './PagarMeWebhookVerifier'

const request = (authorization?: string) =>
	new Request('https://api.example.com/billing/webhooks/pagarme', {
		method: 'POST',
		headers: authorization ? { authorization } : {},
		body: '{}',
	})

const basicAuth = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`

describe('PagarMeWebhookVerifier', () => {
	let verifier: PagarMeWebhookVerifier
	const original = { user: ProductConfig.env.PAGARME_WEBHOOK_USER, password: ProductConfig.env.PAGARME_WEBHOOK_PASSWORD }

	beforeEach(() => {
		verifier = new PagarMeWebhookVerifier()
	})

	afterEach(() => {
		Object.assign(ProductConfig.env, { PAGARME_WEBHOOK_USER: original.user, PAGARME_WEBHOOK_PASSWORD: original.password })
	})

	it('returns true for a correct Basic-Auth header when both secrets are set', async () => {
		Object.assign(ProductConfig.env, { PAGARME_WEBHOOK_USER: 'whsec_user', PAGARME_WEBHOOK_PASSWORD: 'whsec_pass' })

		expect(await verifier.verify(request(basicAuth('whsec_user', 'whsec_pass')))).toBe(true)
	})

	it('returns false for a wrong Basic-Auth header when both secrets are set', async () => {
		Object.assign(ProductConfig.env, { PAGARME_WEBHOOK_USER: 'whsec_user', PAGARME_WEBHOOK_PASSWORD: 'whsec_pass' })

		expect(await verifier.verify(request(basicAuth('whsec_user', 'wrong_pass')))).toBe(false)
	})

	it('fails closed (does not fall back to guessable Basic base64(":")) when the user secret is empty', async () => {
		Object.assign(ProductConfig.env, { PAGARME_WEBHOOK_USER: '', PAGARME_WEBHOOK_PASSWORD: 'whsec_pass' })

		expect(await verifier.verify(request(basicAuth('', '')))).toBe(false)
	})

	it('fails closed when the password secret is empty', async () => {
		Object.assign(ProductConfig.env, { PAGARME_WEBHOOK_USER: 'whsec_user', PAGARME_WEBHOOK_PASSWORD: '' })

		expect(await verifier.verify(request(basicAuth('', '')))).toBe(false)
	})

	it('fails closed when both secrets are empty', async () => {
		Object.assign(ProductConfig.env, { PAGARME_WEBHOOK_USER: '', PAGARME_WEBHOOK_PASSWORD: '' })

		expect(await verifier.verify(request(basicAuth('', '')))).toBe(false)
	})
})
