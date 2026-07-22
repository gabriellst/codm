import { describe, it, expect, afterEach } from 'bun:test'
import crypto from 'node:crypto'
import Stripe from 'stripe'
import { ProductConfig } from '@shared/config'
import { StripeWebhookVerifier } from './StripeWebhookVerifier'

const request = (signature?: string, body = '{"id":"evt_1"}') =>
	new Request('https://api.example.com/billing/webhooks/stripe', {
		method: 'POST',
		headers: signature ? { 'stripe-signature': signature } : {},
		body,
	})

// A fake SDK whose constructEventAsync is scripted: resolve for a valid signature, throw otherwise
// (matching the real SDK's SignatureVerificationError). ASYNC on purpose — the verifier must use
// constructEventAsync, since Bun's SubtleCrypto-backed HMAC is async-only.
class FakeStripe {
	constructor(private validSignature: string) {}
	webhooks = {
		constructEventAsync: async (rawBody: string, signature: string, secret: string) => {
			if (signature !== this.validSignature || !secret) throw new Error('signature mismatch')
			return { id: 'evt_1', body: rawBody }
		},
	}
}

class TestableVerifier extends StripeWebhookVerifier {
	constructor(private fake: unknown) {
		super()
	}
	protected override stripe(): Stripe {
		return this.fake as Stripe
	}
}

// Build a real Stripe-Signature header with node:crypto (sync HMAC works in Bun), so the REAL SDK's
// constructEventAsync can verify it end-to-end. Current timestamp to stay within Stripe's tolerance.
const signStripe = (payload: string, secret: string): string => {
	const t = Math.floor(Date.now() / 1000)
	const v1 = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
	return `t=${t},v1=${v1}`
}

describe('StripeWebhookVerifier', () => {
	const original = ProductConfig.env.STRIPE_WEBHOOK_SECRET

	afterEach(() => {
		Object.assign(ProductConfig.env, { STRIPE_WEBHOOK_SECRET: original })
	})

	it('returns true when the async signature check accepts the signature', async () => {
		Object.assign(ProductConfig.env, { STRIPE_WEBHOOK_SECRET: 'whsec_test' })
		const verifier = new TestableVerifier(new FakeStripe('good-sig'))

		expect(await verifier.verify(request('good-sig'))).toBe(true)
	})

	it('verifies a REAL Stripe signature via the async HMAC path (Bun SubtleCrypto is async-only)', async () => {
		const secret = 'whsec_test_secret_abc123'
		Object.assign(ProductConfig.env, { STRIPE_WEBHOOK_SECRET: secret })
		// The REAL SDK — this is what exercises constructEventAsync; the sync constructEvent throws
		// "SubtleCryptoProvider cannot be used in a synchronous context" in Bun and would fail here.
		const realVerifier = new TestableVerifier(new Stripe('sk_test_dummy'))
		const body = '{"id":"evt_real","type":"payment_intent.succeeded"}'

		expect(await realVerifier.verify(request(signStripe(body, secret), body))).toBe(true)
		// A tampered body no longer matches the signature.
		expect(await realVerifier.verify(request(signStripe(body, secret), `${body} `))).toBe(false)
		// Wrong secret → reject.
		expect(await realVerifier.verify(request(signStripe(body, 'whsec_wrong'), body))).toBe(false)
	})

	it('does not consume the body — the mapper can still read it afterwards', async () => {
		Object.assign(ProductConfig.env, { STRIPE_WEBHOOK_SECRET: 'whsec_test' })
		const verifier = new TestableVerifier(new FakeStripe('good-sig'))
		const req = request('good-sig', '{"id":"evt_body"}')

		await verifier.verify(req)

		expect(await req.text()).toBe('{"id":"evt_body"}')
	})

	it('returns false when the async check throws (invalid signature)', async () => {
		Object.assign(ProductConfig.env, { STRIPE_WEBHOOK_SECRET: 'whsec_test' })
		const verifier = new TestableVerifier(new FakeStripe('good-sig'))

		expect(await verifier.verify(request('bad-sig'))).toBe(false)
	})

	it('fails closed when STRIPE_WEBHOOK_SECRET is empty, even with a signature header', async () => {
		Object.assign(ProductConfig.env, { STRIPE_WEBHOOK_SECRET: '' })
		const verifier = new TestableVerifier(new FakeStripe('good-sig'))

		expect(await verifier.verify(request('good-sig'))).toBe(false)
	})

	it('returns false when the stripe-signature header is missing', async () => {
		Object.assign(ProductConfig.env, { STRIPE_WEBHOOK_SECRET: 'whsec_test' })
		const verifier = new TestableVerifier(new FakeStripe('good-sig'))

		expect(await verifier.verify(request())).toBe(false)
	})
})
