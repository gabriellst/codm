import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { Config } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'

import { PagBankPaymentProvider } from './PagBankPaymentProvider'
import { BillingPlatform, CheckoutIntent, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('PagBankPaymentProvider', () => {
	let provider: PagBankPaymentProvider
	let fetchSpy: ReturnType<typeof spyOn>
	const original = { token: ProductConfig.env.PAGBANK_API_TOKEN, apiUrl: Config.env.API_URL }

	const lastCall = (): { url: string; init: { method: string; headers: Record<string, string>; body: string } } => {
		const [url, init] = fetchSpy.mock.calls.at(-1) as [string, { method: string; headers: Record<string, string>; body: string }]
		return { url, init }
	}

	beforeEach(() => {
		Object.assign(ProductConfig.env, { PAGBANK_API_TOKEN: 'pagbank_platform_token' })
		Object.assign(Config.env, { API_URL: 'https://engine.example.com' })
		provider = new PagBankPaymentProvider()
	})

	afterEach(() => {
		fetchSpy?.mockRestore()
		Object.assign(ProductConfig.env, { PAGBANK_API_TOKEN: original.token })
		Object.assign(Config.env, { API_URL: original.apiUrl })
	})

	it('declares platform + CHECKOUT-ONLY capabilities (hosted checkout, no vault) + CARD/PIX methods', () => {
		expect(provider.platform).toBe(BillingPlatform.PAGBANK)
		expect(provider.capabilities).toEqual({ hostedCardCheckout: true, cardVaulting: false })
		expect([...provider.supportedMethods]).toEqual([PaymentMethodType.CARD, PaymentMethodType.PIX])
	})

	it('ensureCustomer no-ops without any network call (no gateway customer record to upsert)', async () => {
		fetchSpy = spyOn(globalThis, 'fetch')
		await provider.ensureCustomer({ ownerId: 'o1', owner: { name: 'Jane', email: 'jane@example.com' } })
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	describe('createCheckoutSession', () => {
		it('mints a checkout with the PAY link, sending amount in cents + our webhook notification URL', async () => {
			fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
				jsonResponse({
					id: 'ORDE_1',
					links: [
						{ rel: 'SELF', href: 'https://api.pagseguro.com/checkouts/ORDE_1' },
						{ rel: 'PAY', href: 'https://pagseguro.uol.com.br/checkout/payment/ORDE_1' },
					],
				}),
			)

			const result = await provider.createCheckoutSession({
				ownerId: 'o1',
				intent: CheckoutIntent.PAYMENT,
				engineInvoiceId: 'inv_1',
				amountCents: 29900,
				presentation: { title: 'Plano Pro' },
				successUrl: 'https://app.example.com/success',
				cancelUrl: 'https://app.example.com/cancel',
				idemKey: 'idem_checkout_1',
			})

			expect(result).toEqual({
				url: 'https://pagseguro.uol.com.br/checkout/payment/ORDE_1',
				sessionRef: 'ORDE_1',
				expiresAt: expect.any(Date),
			})

			const { url, init } = lastCall()
			expect(url).toBe('https://api.pagseguro.com/checkouts')
			expect(init.method).toBe('POST')
			expect(init.headers.authorization).toBe('Bearer pagbank_platform_token')
			expect(init.headers['x-idempotency-key']).toBe('idem_checkout_1')

			const body = JSON.parse(init.body)
			expect(body.reference_id).toBe('inv_1')
			expect(body.items).toEqual([{ name: 'Plano Pro', quantity: 1, unit_amount: 29900 }])
			expect(body.payment_methods).toEqual([{ type: 'CREDIT_CARD' }, { type: 'PIX' }])
			expect(body.redirect_url).toBe('https://app.example.com/success')
			expect(body.payment_notification_urls).toEqual(['https://engine.example.com/api/billing/webhooks/pagbank'])
			expect(typeof body.expiration_date).toBe('string')
		})

		it('falls back to a generic invoice title when no presentation is given', async () => {
			fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
				jsonResponse({ id: 'ORDE_2', links: [{ rel: 'PAY', href: 'https://pagseguro.uol.com.br/checkout/payment/ORDE_2' }] }),
			)

			await provider.createCheckoutSession({
				ownerId: 'o1',
				intent: CheckoutIntent.PAYMENT,
				engineInvoiceId: 'inv_2',
				amountCents: 1000,
				successUrl: 'https://app.example.com/success',
				cancelUrl: 'https://app.example.com/cancel',
				idemKey: 'idem_checkout_2',
			})

			const { init } = lastCall()
			const body = JSON.parse(init.body)
			expect(body.items[0].name).toBe('Fatura inv_2')
		})

		it('overrides the platform token with per-call credentials when provided', async () => {
			fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
				jsonResponse({ id: 'ORDE_3', links: [{ rel: 'PAY', href: 'https://pagseguro.uol.com.br/checkout/payment/ORDE_3' }] }),
			)

			await provider.createCheckoutSession({
				ownerId: 'o1',
				intent: CheckoutIntent.PAYMENT,
				engineInvoiceId: 'inv_3',
				amountCents: 5000,
				successUrl: 'https://app.example.com/success',
				cancelUrl: 'https://app.example.com/cancel',
				idemKey: 'idem_checkout_3',
				credentials: { apiKey: 'clinic_own_token' },
			})

			const { init } = lastCall()
			expect(init.headers.authorization).toBe('Bearer clinic_own_token')
		})

		it('rejects intent=setup — no vault surface to establish (capabilities.cardVaulting is false)', async () => {
			fetchSpy = spyOn(globalThis, 'fetch')

			await expect(
				provider.createCheckoutSession({
					ownerId: 'o1',
					intent: CheckoutIntent.SETUP,
					successUrl: 'https://app.example.com/success',
					cancelUrl: 'https://app.example.com/cancel',
					idemKey: 'idem_setup_1',
				}),
			).rejects.toThrow()
			expect(fetchSpy).not.toHaveBeenCalled()
		})

		it('requires engineInvoiceId + amountCents for intent=payment', async () => {
			fetchSpy = spyOn(globalThis, 'fetch')

			await expect(
				provider.createCheckoutSession({
					ownerId: 'o1',
					intent: CheckoutIntent.PAYMENT,
					successUrl: 'https://app.example.com/success',
					cancelUrl: 'https://app.example.com/cancel',
					idemKey: 'idem_missing',
				}),
			).rejects.toThrow()
			expect(fetchSpy).not.toHaveBeenCalled()
		})

		it('rejects a non-BRL currency (PagBank is BRL-only)', async () => {
			fetchSpy = spyOn(globalThis, 'fetch')

			await expect(
				provider.createCheckoutSession({
					ownerId: 'o1',
					intent: CheckoutIntent.PAYMENT,
					engineInvoiceId: 'inv_4',
					amountCents: 1000,
					currency: CurrencyCode.USD,
					successUrl: 'https://app.example.com/success',
					cancelUrl: 'https://app.example.com/cancel',
					idemKey: 'idem_usd',
				}),
			).rejects.toThrow()
			expect(fetchSpy).not.toHaveBeenCalled()
		})

		it('throws PROVIDER_ERROR when the checkout response carries no PAY link', async () => {
			fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'ORDE_5', links: [{ rel: 'SELF', href: 'x' }] }))

			await expect(
				provider.createCheckoutSession({
					ownerId: 'o1',
					intent: CheckoutIntent.PAYMENT,
					engineInvoiceId: 'inv_5',
					amountCents: 1000,
					successUrl: 'https://app.example.com/success',
					cancelUrl: 'https://app.example.com/cancel',
					idemKey: 'idem_5',
				}),
			).rejects.toThrow()
		})

		it('surfaces a non-2xx PagBank response as PROVIDER_ERROR', async () => {
			fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('invalid reference_id', { status: 400 }))

			await expect(
				provider.createCheckoutSession({
					ownerId: 'o1',
					intent: CheckoutIntent.PAYMENT,
					engineInvoiceId: 'inv_6',
					amountCents: 1000,
					successUrl: 'https://app.example.com/success',
					cancelUrl: 'https://app.example.com/cancel',
					idemKey: 'idem_6',
				}),
			).rejects.toThrow()
		})

		it('throws PROVIDER_ERROR when the checkout response fails the gateway schema (missing id)', async () => {
			fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
				jsonResponse({ links: [{ rel: 'PAY', href: 'https://pagseguro.uol.com.br/checkout/payment/ORDE_7' }] }),
			)

			await expect(
				provider.createCheckoutSession({
					ownerId: 'o1',
					intent: CheckoutIntent.PAYMENT,
					engineInvoiceId: 'inv_7',
					amountCents: 1000,
					successUrl: 'https://app.example.com/success',
					cancelUrl: 'https://app.example.com/cancel',
					idemKey: 'idem_7',
				}),
			).rejects.toMatchObject({ name: 'PROVIDER_ERROR' })
		})
	})

	describe('createPix', () => {
		it('mints a one-off Pix order and returns the copy-paste + QR png', async () => {
			fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
				jsonResponse({
					id: 'ORDE_pix_1',
					qr_codes: [
						{
							text: '00020126580014BR.GOV.BCB.PIX...',
							expiration_date: '2026-08-01T12:00:00Z',
							links: [
								{ rel: 'QRCODE.PNG', href: 'https://api.pagseguro.com/qrcodes/ORDE_pix_1.png' },
								{ rel: 'SELF', href: 'https://api.pagseguro.com/orders/ORDE_pix_1' },
							],
						},
					],
				}),
			)

			const result = await provider.createPix({ externalReference: 'inv_pix_1', amountCents: 5000, idemKey: 'idem_pix_1' })

			expect(result).toEqual({
				pixId: 'ORDE_pix_1',
				qr: 'https://api.pagseguro.com/qrcodes/ORDE_pix_1.png',
				copyPaste: '00020126580014BR.GOV.BCB.PIX...',
				expiresAt: new Date('2026-08-01T12:00:00Z'),
			})

			const { url, init } = lastCall()
			expect(url).toBe('https://api.pagseguro.com/orders')
			expect(init.headers['x-idempotency-key']).toBe('idem_pix_1')
			const body = JSON.parse(init.body)
			expect(body.reference_id).toBe('inv_pix_1')
			expect(body.qr_codes).toEqual([{ amount: { value: 5000 }, expiration_date: expect.any(String) }])
		})

		it('throws PROVIDER_ERROR when the order carries no qr_code text', async () => {
			fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'ORDE_pix_2', qr_codes: [] }))

			await expect(provider.createPix({ externalReference: 'inv_pix_2', amountCents: 5000, idemKey: 'idem_pix_2' })).rejects.toThrow()
		})

		it('rejects a non-BRL currency', async () => {
			fetchSpy = spyOn(globalThis, 'fetch')

			await expect(
				provider.createPix({ externalReference: 'inv_pix_3', amountCents: 5000, currency: CurrencyCode.USD, idemKey: 'idem_pix_3' }),
			).rejects.toThrow()
			expect(fetchSpy).not.toHaveBeenCalled()
		})

		it('throws PROVIDER_ERROR when the order response fails the gateway schema (missing id)', async () => {
			fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ qr_codes: [{ text: '00020126...' }] }))

			await expect(provider.createPix({ externalReference: 'inv_pix_4', amountCents: 5000, idemKey: 'idem_pix_4' })).rejects.toMatchObject({
				name: 'PROVIDER_ERROR',
			})
		})
	})

	describe('cancelCharge', () => {
		it('cancels/refunds a charge with a partial amount', async () => {
			fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'CHAR_1', status: 'CANCELED' }))

			await provider.cancelCharge({ gatewayTxId: 'CHAR_1', amountCents: 1000, idemKey: 'idem_cancel_1' })

			const { url, init } = lastCall()
			expect(url).toBe('https://api.pagseguro.com/charges/CHAR_1/cancel')
			expect(JSON.parse(init.body)).toEqual({ amount: { value: 1000 } })
		})

		it('cancels the full charge when no amount is given', async () => {
			fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'CHAR_2', status: 'CANCELED' }))

			await provider.cancelCharge({ gatewayTxId: 'CHAR_2', idemKey: 'idem_cancel_2' })

			const { init } = lastCall()
			expect(JSON.parse(init.body)).toEqual({})
		})
	})

	it('getCheckoutSessionStatus is NOT overridden — falls to the base PROVIDER_CAPABILITY_UNSUPPORTED (PagBank descope: CHEC_/ORDE_ id mismatch, see class doc)', async () => {
		fetchSpy = spyOn(globalThis, 'fetch')

		await expect(provider.getCheckoutSessionStatus('CHEC_1')).rejects.toMatchObject({ name: 'PROVIDER_CAPABILITY_UNSUPPORTED' })
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	describe('unsupported MIT capability', () => {
		it('chargeOffSession throws PROVIDER_CAPABILITY_UNSUPPORTED without any network call', async () => {
			fetchSpy = spyOn(globalThis, 'fetch')

			await expect(provider.chargeOffSession({ pmRef: 'card_x', amountCents: 1000, idemKey: 'idem_off' })).rejects.toThrow()
			expect(fetchSpy).not.toHaveBeenCalled()
		})

		it('chargeStoredOnSession throws PROVIDER_CAPABILITY_UNSUPPORTED without any network call', async () => {
			fetchSpy = spyOn(globalThis, 'fetch')

			await expect(
				provider.chargeStoredOnSession({
					pmRef: 'card_x',
					ownerId: 'o1',
					amountCents: 1000,
					engineInvoiceId: 'inv_1',
					idemKey: 'idem_stored',
				}),
			).rejects.toThrow()
			expect(fetchSpy).not.toHaveBeenCalled()
		})
	})
})
