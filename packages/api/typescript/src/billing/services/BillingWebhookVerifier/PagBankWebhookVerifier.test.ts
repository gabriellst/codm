import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import crypto from 'node:crypto'
import { ProductConfig } from '@shared/config'
import { PagBankWebhookVerifier } from './PagBankWebhookVerifier'

const request = (body: string, authenticityToken?: string) =>
	new Request('https://api.example.com/billing/webhooks/pagbank', {
		method: 'POST',
		headers: authenticityToken ? { 'x-authenticity-token': authenticityToken } : {},
		body,
	})

const signatureFor = (token: string, rawBody: string) => crypto.createHash('sha256').update(`${token}-${rawBody}`).digest('hex')

describe('PagBankWebhookVerifier', () => {
	let verifier: PagBankWebhookVerifier
	const original = ProductConfig.env.PAGBANK_API_TOKEN

	beforeEach(() => {
		verifier = new PagBankWebhookVerifier()
	})

	afterEach(() => {
		Object.assign(ProductConfig.env, { PAGBANK_API_TOKEN: original })
	})

	it('returns true against a precomputed SHA-256 vector — sha256("pagbank_test_token-{...}")', async () => {
		Object.assign(ProductConfig.env, { PAGBANK_API_TOKEN: 'pagbank_test_token' })
		const rawBody = '{"id":"ORDE_1","reference_id":"inv_1"}'
		// Vector computed independently (node:crypto, outside the implementation under test) for
		// `pagbank_test_token-{"id":"ORDE_1","reference_id":"inv_1"}`.
		const precomputed = '6294afe38f23937bd34d5506370448229918da43b15b7136627828239c358d0c'

		expect(await verifier.verify(request(rawBody, precomputed))).toBe(true)
	})

	it('returns true for a correct signature computed from the current secret + raw body', async () => {
		Object.assign(ProductConfig.env, { PAGBANK_API_TOKEN: 'whsec_pagbank' })
		const rawBody = JSON.stringify({ id: 'ORDE_2', reference_id: 'inv_2', charges: [] })

		expect(await verifier.verify(request(rawBody, signatureFor('whsec_pagbank', rawBody)))).toBe(true)
	})

	it('returns false when the token does not match the body that was actually sent', async () => {
		Object.assign(ProductConfig.env, { PAGBANK_API_TOKEN: 'whsec_pagbank' })
		const signedBody = JSON.stringify({ id: 'ORDE_3' })
		const tamperedBody = JSON.stringify({ id: 'ORDE_3_TAMPERED' })

		expect(await verifier.verify(request(tamperedBody, signatureFor('whsec_pagbank', signedBody)))).toBe(false)
	})

	it('returns false when the header is missing', async () => {
		Object.assign(ProductConfig.env, { PAGBANK_API_TOKEN: 'whsec_pagbank' })

		expect(await verifier.verify(request('{}'))).toBe(false)
	})

	it('fails closed when PAGBANK_API_TOKEN is empty (never falls back to a guessable hash)', async () => {
		Object.assign(ProductConfig.env, { PAGBANK_API_TOKEN: '' })
		const rawBody = '{}'

		expect(await verifier.verify(request(rawBody, signatureFor('', rawBody)))).toBe(false)
	})

	it('leaves the request body readable afterwards (verifier reads a clone, not the original stream)', async () => {
		Object.assign(ProductConfig.env, { PAGBANK_API_TOKEN: 'whsec_pagbank' })
		const rawBody = JSON.stringify({ id: 'ORDE_4' })
		const req = request(rawBody, signatureFor('whsec_pagbank', rawBody))

		await verifier.verify(req)

		expect(await req.text()).toBe(rawBody)
	})
})
