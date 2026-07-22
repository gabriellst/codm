import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { ProductConfig } from '@shared/config'
import { AsaasWebhookVerifier } from './AsaasWebhookVerifier'

const request = (accessToken?: string) =>
	new Request('https://api.example.com/billing/webhooks/asaas', {
		method: 'POST',
		headers: accessToken !== undefined ? { 'asaas-access-token': accessToken } : {},
		body: '{}',
	})

describe('AsaasWebhookVerifier', () => {
	let verifier: AsaasWebhookVerifier
	const original = ProductConfig.env.ASAAS_WEBHOOK_TOKEN

	beforeEach(() => {
		verifier = new AsaasWebhookVerifier()
	})

	afterEach(() => {
		Object.assign(ProductConfig.env, { ASAAS_WEBHOOK_TOKEN: original })
	})

	it('returns true when the asaas-access-token header matches the configured token', async () => {
		Object.assign(ProductConfig.env, { ASAAS_WEBHOOK_TOKEN: 'whtok_correct' })

		expect(await verifier.verify(request('whtok_correct'))).toBe(true)
	})

	it('returns false when the header does not match the configured token', async () => {
		Object.assign(ProductConfig.env, { ASAAS_WEBHOOK_TOKEN: 'whtok_correct' })

		expect(await verifier.verify(request('whtok_wrong'))).toBe(false)
	})

	it('returns false when the header is missing entirely', async () => {
		Object.assign(ProductConfig.env, { ASAAS_WEBHOOK_TOKEN: 'whtok_correct' })

		expect(await verifier.verify(request())).toBe(false)
	})

	it('fails closed (does not fall back to an empty-string match) when the configured token is empty', async () => {
		Object.assign(ProductConfig.env, { ASAAS_WEBHOOK_TOKEN: '' })

		expect(await verifier.verify(request(''))).toBe(false)
	})

	it('rejects a header of different length than the configured token (no accidental prefix match)', async () => {
		Object.assign(ProductConfig.env, { ASAAS_WEBHOOK_TOKEN: 'whtok_correct' })

		expect(await verifier.verify(request('whtok_correct_but_longer'))).toBe(false)
	})
})
