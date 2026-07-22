import { describe, it, expect, afterEach } from 'bun:test'
import crypto from 'node:crypto'
import { ProductConfig } from '@shared/config'
import { MercadoPagoWebhookVerifier } from './MercadoPagoWebhookVerifier'

// Builds a REAL MercadoPago `x-signature` header value for a given (dataId, requestId, ts, secret)
// tuple — mirrors what MercadoPago itself computes, so the verifier is exercised end-to-end
// (same posture as StripeWebhookVerifier.test.ts's `signStripe` helper).
const sign = (dataId: string, requestId: string, ts: string, secret: string): string => {
	const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
	const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
	return `ts=${ts},v1=${v1}`
}

const request = (opts: { dataId?: string; signature?: string; requestId?: string; body?: string } = {}) => {
	const url = new URL('https://api.example.com/billing/webhooks/mercadopago')
	url.searchParams.set('type', 'payment')
	if (opts.dataId !== undefined) url.searchParams.set('data.id', opts.dataId)
	const headers: Record<string, string> = {}
	if (opts.signature) headers['x-signature'] = opts.signature
	if (opts.requestId !== undefined) headers['x-request-id'] = opts.requestId
	return new Request(url.toString(), { method: 'POST', headers, body: opts.body ?? '{"data":{"id":"123456"}}' })
}

describe('MercadoPagoWebhookVerifier', () => {
	const verifier = new MercadoPagoWebhookVerifier()
	const original = ProductConfig.env.MERCADOPAGO_WEBHOOK_SECRET

	afterEach(() => {
		Object.assign(ProductConfig.env, { MERCADOPAGO_WEBHOOK_SECRET: original })
	})

	it('returns true for a correctly signed request', async () => {
		Object.assign(ProductConfig.env, { MERCADOPAGO_WEBHOOK_SECRET: 'mp_secret' })
		const ts = String(Math.floor(Date.now() / 1000))
		const signature = sign('123456', 'req-1', ts, 'mp_secret')

		expect(await verifier.verify(request({ dataId: '123456', requestId: 'req-1', signature }))).toBe(true)
	})

	it('lowercases the resource id before computing the manifest (per MercadoPago docs)', async () => {
		Object.assign(ProductConfig.env, { MERCADOPAGO_WEBHOOK_SECRET: 'mp_secret' })
		const ts = String(Math.floor(Date.now() / 1000))
		// Manifest computed on the LOWERCASED id — an uppercase id in the URL must still verify.
		const signature = sign('abc123', 'req-1', ts, 'mp_secret')

		expect(await verifier.verify(request({ dataId: 'ABC123', requestId: 'req-1', signature }))).toBe(true)
	})

	it('does not consume the body — the mapper can still read it afterwards', async () => {
		Object.assign(ProductConfig.env, { MERCADOPAGO_WEBHOOK_SECRET: 'mp_secret' })
		const ts = String(Math.floor(Date.now() / 1000))
		const signature = sign('123456', 'req-1', ts, 'mp_secret')
		const req = request({ dataId: '123456', requestId: 'req-1', signature, body: '{"data":{"id":"123456"}}' })

		await verifier.verify(req)

		expect(await req.text()).toBe('{"data":{"id":"123456"}}')
	})

	it('returns false when the resource id (data.id) is tampered with', async () => {
		Object.assign(ProductConfig.env, { MERCADOPAGO_WEBHOOK_SECRET: 'mp_secret' })
		const ts = String(Math.floor(Date.now() / 1000))
		const signature = sign('123456', 'req-1', ts, 'mp_secret')

		expect(await verifier.verify(request({ dataId: '999999', requestId: 'req-1', signature }))).toBe(false)
	})

	it('returns false when x-request-id is tampered with', async () => {
		Object.assign(ProductConfig.env, { MERCADOPAGO_WEBHOOK_SECRET: 'mp_secret' })
		const ts = String(Math.floor(Date.now() / 1000))
		const signature = sign('123456', 'req-1', ts, 'mp_secret')

		expect(await verifier.verify(request({ dataId: '123456', requestId: 'req-OTHER', signature }))).toBe(false)
	})

	it('returns false with the wrong secret', async () => {
		Object.assign(ProductConfig.env, { MERCADOPAGO_WEBHOOK_SECRET: 'mp_secret' })
		const ts = String(Math.floor(Date.now() / 1000))
		const signature = sign('123456', 'req-1', ts, 'wrong_secret')

		expect(await verifier.verify(request({ dataId: '123456', requestId: 'req-1', signature }))).toBe(false)
	})

	it('fails closed when MERCADOPAGO_WEBHOOK_SECRET is empty', async () => {
		Object.assign(ProductConfig.env, { MERCADOPAGO_WEBHOOK_SECRET: '' })
		const ts = String(Math.floor(Date.now() / 1000))
		const signature = sign('123456', 'req-1', ts, 'mp_secret')

		expect(await verifier.verify(request({ dataId: '123456', requestId: 'req-1', signature }))).toBe(false)
	})

	it('fails closed when x-signature is missing', async () => {
		Object.assign(ProductConfig.env, { MERCADOPAGO_WEBHOOK_SECRET: 'mp_secret' })

		expect(await verifier.verify(request({ dataId: '123456', requestId: 'req-1' }))).toBe(false)
	})

	it('fails closed when x-request-id is missing', async () => {
		Object.assign(ProductConfig.env, { MERCADOPAGO_WEBHOOK_SECRET: 'mp_secret' })
		const ts = String(Math.floor(Date.now() / 1000))
		const signature = sign('123456', 'req-1', ts, 'mp_secret')

		expect(await verifier.verify(request({ dataId: '123456', signature }))).toBe(false)
	})

	it('fails closed when the data.id query param is missing from the notification URL', async () => {
		Object.assign(ProductConfig.env, { MERCADOPAGO_WEBHOOK_SECRET: 'mp_secret' })
		const ts = String(Math.floor(Date.now() / 1000))
		const signature = sign('123456', 'req-1', ts, 'mp_secret')

		expect(await verifier.verify(request({ requestId: 'req-1', signature }))).toBe(false)
	})

	it('fails closed when the x-signature header is malformed (missing ts/v1)', async () => {
		Object.assign(ProductConfig.env, { MERCADOPAGO_WEBHOOK_SECRET: 'mp_secret' })

		expect(await verifier.verify(request({ dataId: '123456', requestId: 'req-1', signature: 'garbage' }))).toBe(false)
	})
})
