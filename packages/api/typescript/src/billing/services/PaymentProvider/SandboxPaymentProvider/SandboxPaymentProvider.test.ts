import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { Config, MockLoggingService } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { PagarMeWebhookSchema, type PagarMeWebhook } from '@billing/services/BillingWebhookMapper/PagarMeWebhookMapper/PagarMeWebhookSchema'
import { SandboxPaymentProvider } from './SandboxPaymentProvider'

// Outcome matrix + self-emission contract. Fetch is intercepted (never sleeps, never hits the
// network): `webhookDelayMs = 0` + `flushWebhooks()` make delivery deterministic, and every
// captured body must round-trip through PagarMeWebhookSchema — the same parse the mapper runs.
describe('SandboxPaymentProvider', () => {
	let provider: SandboxPaymentProvider
	let fetchSpy: ReturnType<typeof spyOn>
	const original = { user: ProductConfig.env.PAGARME_WEBHOOK_USER, password: ProductConfig.env.PAGARME_WEBHOOK_PASSWORD }

	const capturedWebhooks = (): { url: string; auth: string; body: PagarMeWebhook }[] =>
		fetchSpy.mock.calls.map((call: unknown[]) => {
			const [url, init] = call as [string, { headers: Record<string, string>; body: string }]
			return {
				url,
				auth: init.headers.authorization,
				// The emission contract: the self-emitted payload must validate against the SAME
				// schema the real PagarMeWebhookMapper parses inbound webhooks with.
				body: PagarMeWebhookSchema.parse(JSON.parse(init.body)),
			}
		})

	beforeEach(() => {
		Object.assign(ProductConfig.env, { PAGARME_WEBHOOK_USER: 'sandbox-user', PAGARME_WEBHOOK_PASSWORD: 'sandbox-password' })
		provider = new SandboxPaymentProvider(new MockLoggingService())
		provider.webhookDelayMs = 0
		fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"accepted":1}', { status: 202 }))
	})

	afterEach(() => {
		fetchSpy.mockRestore()
		Object.assign(ProductConfig.env, { PAGARME_WEBHOOK_USER: original.user, PAGARME_WEBHOOK_PASSWORD: original.password })
	})

	it('chargeStoredOnSession (CIT) succeeds and self-emits a schema-valid charge.paid to our Pagar.me webhook with Basic auth', async () => {
		const result = await provider.chargeStoredOnSession({
			pmRef: 'pm_sandbox_4242',
			ownerId: 'o1',
			amountCents: 29900,
			engineInvoiceId: 'inv_sandbox_first',
			idemKey: 'inv_sandbox_first',
		})

		expect(result.ok).toBe(true)
		if (result.ok) expect(result.gatewayTxId).toStartWith('ch_sandbox_')

		await provider.flushWebhooks()
		const [webhook] = capturedWebhooks()
		expect(webhook?.url).toBe(`http://localhost:${Config.env.API_PORT}/api/billing/webhooks/pagarme`)
		expect(webhook?.auth).toBe(`Basic ${Buffer.from('sandbox-user:sandbox-password').toString('base64')}`)
		expect(webhook?.body.type).toBe('charge.paid')
		expect(webhook?.body.data).toMatchObject({
			code: 'inv_sandbox_first',
			amount: 29900,
			status: 'paid',
			payment_method: 'credit_card',
		})
		// The card block rides last_transaction so the mapper can build the vaultable instrument.
		const charge = webhook!.body.data as Extract<PagarMeWebhook['data'], { object?: 'charge' }>
		expect(charge.last_transaction?.card?.last_four_digits).toBe('4242')
	})

	it('chargeOffSession (MIT renewal) succeeds carrying the code as engine invoice id', async () => {
		const result = await provider.chargeOffSession({
			pmRef: 'pm_sandbox_4242',
			amountCents: 29900,
			idemKey: 'inv_sandbox_renewal',
			code: 'inv_sandbox_renewal',
		})

		expect(result.ok).toBe(true)

		await provider.flushWebhooks()
		const [webhook] = capturedWebhooks()
		expect(webhook?.body.type).toBe('charge.paid')
		expect(webhook?.body.data.code).toBe('inv_sandbox_renewal')
	})

	it('the magic 0002 marker declines synchronously (with a reason) and self-emits charge.payment_failed', async () => {
		const result = await provider.chargeStoredOnSession({
			pmRef: 'pm_sandbox_0002',
			ownerId: 'o1',
			amountCents: 29900,
			engineInvoiceId: 'inv_sandbox_decline',
			idemKey: 'inv_sandbox_decline',
		})

		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toContain('declined')

		await provider.flushWebhooks()
		const [webhook] = capturedWebhooks()
		expect(webhook?.body.type).toBe('charge.payment_failed')
		expect(webhook?.body.data).toMatchObject({ code: 'inv_sandbox_decline', status: 'failed' })
	})

	it('the 0002 marker also declines MIT renewals off the pmRef', async () => {
		const result = await provider.chargeOffSession({
			pmRef: 'pm_sandbox_0002',
			amountCents: 29900,
			idemKey: 'inv_sandbox_decline_mit',
			code: 'inv_sandbox_decline_mit',
		})

		expect(result.ok).toBe(false)

		// Drain the scheduled charge.payment_failed so it can't leak into the next test's spy.
		await provider.flushWebhooks()
		const [webhook] = capturedWebhooks()
		expect(webhook?.body.type).toBe('charge.payment_failed')
	})

	it('createPix returns the fake artifact and self-emits a schema-valid pix charge.paid', async () => {
		const pix = await provider.createPix({ externalReference: 'inv_sandbox_pix', amountCents: 29900, idemKey: 'pix:inv_sandbox_pix' })

		expect(pix).toMatchObject({
			pixId: 'pix_sandbox_inv_sandbox_pix',
			qr: 'sandbox-qr-inv_sandbox_pix',
			copyPaste: 'sandbox-pix-copy-paste-inv_sandbox_pix',
		})
		expect(pix.expiresAt.getTime()).toBeGreaterThan(Date.now())

		await provider.flushWebhooks()
		const [webhook] = capturedWebhooks()
		expect(webhook?.body.type).toBe('charge.paid')
		expect(webhook?.body.data).toMatchObject({ code: 'inv_sandbox_pix', payment_method: 'pix', amount: 29900 })
	})

	it('cancelCharge resolves without any self-emission', async () => {
		await provider.cancelCharge({ gatewayTxId: 'ch_sandbox_x', idemKey: 'cancel:ch_sandbox_x' })
		await provider.flushWebhooks()
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it('a failed self-delivery never throws (dropped-webhook semantics)', async () => {
		fetchSpy.mockRejectedValueOnce(new Error('connection refused'))

		const result = await provider.chargeStoredOnSession({
			pmRef: 'pm_sandbox_4242',
			ownerId: 'o1',
			amountCents: 100,
			engineInvoiceId: 'inv_sandbox_drop',
			idemKey: 'inv_sandbox_drop',
		})
		expect(result.ok).toBe(true)

		await expect(provider.flushWebhooks()).resolves.toBeUndefined()
	})
})
