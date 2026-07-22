import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { ProductConfig } from '@shared/config'
import { _resetBreaker } from '@template/core-typescript'

import { AsaasPaymentProvider } from './AsaasPaymentProvider'
import { BillingPlatform, CheckoutIntent, DeclineReason, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const errorResponse = (detail: string, status = 400) => new Response(detail, { status })

interface Call {
	url: string
	method: string
	accessToken: string | null
	body: unknown
}

const calls = (fetchSpy: ReturnType<typeof spyOn>): Call[] =>
	fetchSpy.mock.calls.map((call: unknown[]) => {
		const [url, init] = call as [string, RequestInit & { headers: Record<string, string> }]
		return {
			url,
			method: init.method,
			accessToken: init.headers?.access_token ?? null,
			body: init.body ? JSON.parse(init.body as string) : undefined,
		}
	})

describe('AsaasPaymentProvider', () => {
	let provider: AsaasPaymentProvider
	let fetchSpy: ReturnType<typeof spyOn>
	const originalApiKey = ProductConfig.env.ASAAS_API_KEY

	beforeEach(() => {
		Object.assign(ProductConfig.env, { ASAAS_API_KEY: 'platform_key' })
		provider = new AsaasPaymentProvider()
		fetchSpy = spyOn(globalThis, 'fetch')
		// The circuit breaker is a module-level singleton keyed by label ('asaas') — reset so a
		// decline test earlier in the file can't trip the breaker for a later, unrelated test.
		_resetBreaker('asaas')
	})

	afterEach(() => {
		fetchSpy.mockRestore()
		Object.assign(ProductConfig.env, { ASAAS_API_KEY: originalApiKey })
	})

	it('exposes the ASAAS platform + FULL-tier capabilities + CARD/PIX methods', () => {
		expect(provider.platform).toBe(BillingPlatform.ASAAS)
		expect(provider.capabilities).toEqual({ hostedCardCheckout: true, cardVaulting: true })
		expect([...provider.supportedMethods]).toEqual([PaymentMethodType.CARD, PaymentMethodType.PIX])
	})

	describe('ensureCustomer', () => {
		it('creates a customer keyed by ownerId externalReference when none is found', async () => {
			fetchSpy.mockResolvedValueOnce(jsonResponse({ data: [] })).mockResolvedValueOnce(jsonResponse({ id: 'cus_new' }))

			await provider.ensureCustomer({ ownerId: 'o1', owner: { name: 'Ana', email: 'ana@x.com', document: '123.456.789-09' } })

			const [search, create] = calls(fetchSpy)
			expect(search?.url).toBe('https://api.asaas.com/v3/customers?externalReference=o1')
			expect(search?.method).toBe('GET')
			expect(create?.url).toBe('https://api.asaas.com/v3/customers')
			expect(create?.method).toBe('POST')
			expect(create?.body).toMatchObject({ name: 'Ana', email: 'ana@x.com', externalReference: 'o1', cpfCnpj: '12345678909' })
		})

		it('updates the existing customer (POST /customers/{id}) when the search resolves one', async () => {
			fetchSpy
				.mockResolvedValueOnce(jsonResponse({ data: [{ id: 'cus_existing' }] }))
				.mockResolvedValueOnce(jsonResponse({ id: 'cus_existing' }))

			await provider.ensureCustomer({ ownerId: 'o1', owner: { name: 'Ana', email: 'ana@x.com' } })

			const [, update] = calls(fetchSpy)
			expect(update?.url).toBe('https://api.asaas.com/v3/customers/cus_existing')
			expect(update?.method).toBe('POST')
			expect(update?.body).toEqual({ name: 'Ana', email: 'ana@x.com' })
		})

		it('sends the per-call credential apiKey as access_token, overriding the platform key', async () => {
			fetchSpy.mockResolvedValueOnce(jsonResponse({ data: [] })).mockResolvedValueOnce(jsonResponse({ id: 'cus_new' }))

			await provider.ensureCustomer({
				ownerId: 'o1',
				owner: { name: 'Ana', email: 'ana@x.com' },
				credentials: { apiKey: 'per_call_key' },
			})

			for (const call of calls(fetchSpy)) expect(call.accessToken).toBe('per_call_key')
		})

		it('throws PROVIDER_ERROR when the gateway response has an invalid shape (e.g. numeric id)', async () => {
			fetchSpy.mockResolvedValueOnce(jsonResponse({ data: [] })).mockResolvedValueOnce(jsonResponse({ id: 123 }))

			await expect(provider.ensureCustomer({ ownerId: 'o1', owner: { name: 'Ana', email: 'ana@x.com' } })).rejects.toMatchObject({
				name: 'PROVIDER_ERROR',
			})
		})
	})

	describe('createCheckoutSession', () => {
		it('mints a DETACHED checkout for intent=payment, converting cents to REAIS and deriving the hosted url', async () => {
			fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'checkout_abc' }))

			const result = await provider.createCheckoutSession({
				ownerId: 'o1',
				owner: { name: 'Ana', email: 'ana@x.com', document: '123.456.789-09' },
				intent: CheckoutIntent.PAYMENT,
				engineInvoiceId: 'lago_inv_1',
				amountCents: 29900,
				successUrl: 'https://app.test/account?checkout=success',
				cancelUrl: 'https://app.test/account?checkout=canceled',
				idemKey: 'checkout:lago_inv_1',
			})

			expect(result.url).toBe('https://www.asaas.com/checkoutSession/show?id=checkout_abc')
			expect(result.sessionRef).toBe('checkout_abc')
			expect(result.expiresAt).toBeInstanceOf(Date)

			const [create] = calls(fetchSpy)
			expect(create?.url).toBe('https://api.asaas.com/v3/checkouts')
			expect(create?.body).toMatchObject({
				billingTypes: ['CREDIT_CARD', 'PIX'],
				chargeTypes: ['DETACHED'],
				items: [{ description: 'Fatura lago_inv_1', quantity: 1, value: 299 }],
				customerData: { name: 'Ana', email: 'ana@x.com', cpfCnpj: '12345678909' },
				callback: { successUrl: 'https://app.test/account?checkout=success' },
				externalReference: 'lago_inv_1',
			})
		})

		it('rejects intent=setup — Asaas has no vault-without-charge checkout surface', async () => {
			await expect(
				provider.createCheckoutSession({
					ownerId: 'o1',
					intent: CheckoutIntent.SETUP,
					successUrl: 'https://app.test/account?checkout=success',
					cancelUrl: 'https://app.test/account?checkout=canceled',
					idemKey: 'checkout-setup:o1',
				}),
			).rejects.toMatchObject({ name: 'PROVIDER_CAPABILITY_UNSUPPORTED' })
			expect(fetchSpy).not.toHaveBeenCalled()
		})

		it('throws when intent=payment is missing engineInvoiceId/amountCents', async () => {
			await expect(
				provider.createCheckoutSession({
					ownerId: 'o1',
					intent: CheckoutIntent.PAYMENT,
					successUrl: 'https://app.test/account?checkout=success',
					cancelUrl: 'https://app.test/account?checkout=canceled',
					idemKey: 'checkout:missing',
				}),
			).rejects.toThrow()
			expect(fetchSpy).not.toHaveBeenCalled()
		})
	})

	describe('chargeOffSession / chargeStoredOnSession', () => {
		it('chargeOffSession splits the composite pmRef and posts customer + creditCardToken', async () => {
			fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'pay_1', status: 'CONFIRMED' }))

			const result = await provider.chargeOffSession({
				pmRef: 'cus_42:tok_abc',
				amountCents: 29900,
				idemKey: 'renewal_1',
				code: 'lago_inv_2',
			})

			expect(result).toEqual({ ok: true, gatewayTxId: 'pay_1' })
			const [charge] = calls(fetchSpy)
			expect(charge?.url).toBe('https://api.asaas.com/v3/payments')
			expect(charge?.body).toMatchObject({
				customer: 'cus_42',
				billingType: 'CREDIT_CARD',
				value: 299,
				creditCardToken: 'tok_abc',
				externalReference: 'lago_inv_2',
			})
		})

		it('chargeStoredOnSession posts the same shape, carrying engineInvoiceId as externalReference', async () => {
			fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'pay_2', status: 'CONFIRMED' }))

			const result = await provider.chargeStoredOnSession({
				pmRef: 'cus_7:tok_xyz',
				ownerId: 'o1',
				amountCents: 5000,
				engineInvoiceId: 'lago_inv_3',
				idemKey: 'first_charge_1',
			})

			expect(result).toEqual({ ok: true, gatewayTxId: 'pay_2' })
			const [charge] = calls(fetchSpy)
			expect(charge?.body).toMatchObject({ customer: 'cus_7', creditCardToken: 'tok_xyz', value: 50, externalReference: 'lago_inv_3' })
		})

		it('rejects a malformed pmRef (missing the customerId:token composite) instead of silently charging', async () => {
			await expect(provider.chargeOffSession({ pmRef: 'tok_only', amountCents: 100, idemKey: 'k' })).rejects.toMatchObject({
				name: 'PROVIDER_ERROR',
			})
			expect(fetchSpy).not.toHaveBeenCalled()
		})

		it('maps a synchronous decline (non-2xx) to ok:false with a classified declineCode', async () => {
			fetchSpy.mockResolvedValueOnce(errorResponse('saldo insuficiente na operadora do cartão'))

			const result = await provider.chargeOffSession({ pmRef: 'cus_1:tok_1', amountCents: 100, idemKey: 'k' })

			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.reason).toContain('saldo insuficiente')
				expect(result.declineCode).toBe(DeclineReason.INSUFFICIENT_FUNDS)
			}
		})

		it('falls back to CARD_DECLINED for an unclassifiable decline reason', async () => {
			fetchSpy.mockResolvedValueOnce(errorResponse('operação recusada pela operadora'))

			const result = await provider.chargeOffSession({ pmRef: 'cus_1:tok_1', amountCents: 100, idemKey: 'k' })

			expect(result.ok).toBe(false)
			if (!result.ok) expect(result.declineCode).toBe(DeclineReason.CARD_DECLINED)
		})
	})

	it('cancelCharge posts a partial refund converting cents to REAIS, and an empty body for a full refund', async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'ref_1' })).mockResolvedValueOnce(jsonResponse({ id: 'ref_2' }))

		await provider.cancelCharge({ gatewayTxId: 'pay_1', amountCents: 1000, idemKey: 'refund_1' })
		await provider.cancelCharge({ gatewayTxId: 'pay_2', idemKey: 'refund_2' })

		const [partial, full] = calls(fetchSpy)
		expect(partial?.url).toBe('https://api.asaas.com/v3/payments/pay_1/refund')
		expect(partial?.body).toEqual({ value: 10 })
		expect(full?.url).toBe('https://api.asaas.com/v3/payments/pay_2/refund')
		expect(full?.body).toEqual({})
	})

	describe('createPix', () => {
		it('creates a fresh customer, a PIX payment, and resolves the QR code as a data URI', async () => {
			fetchSpy
				.mockResolvedValueOnce(jsonResponse({ id: 'cus_pix' }))
				.mockResolvedValueOnce(jsonResponse({ id: 'pay_pix' }))
				.mockResolvedValueOnce(
					jsonResponse({ encodedImage: 'ZmFrZQ==', payload: '00020126-emv-copy-paste', expirationDate: '2026-08-01 10:00:00' }),
				)

			const pix = await provider.createPix({
				externalReference: 'lago_inv_4',
				amountCents: 19900,
				idemKey: 'pix_1',
				payer: { name: 'Ana', email: 'ana@x.com', document: '123.456.789-09' },
			})

			expect(pix.pixId).toBe('pay_pix')
			expect(pix.qr).toBe('data:image/png;base64,ZmFrZQ==')
			expect(pix.copyPaste).toBe('00020126-emv-copy-paste')
			expect(pix.expiresAt).toEqual(new Date('2026-08-01 10:00:00'))

			const [createCustomer, createPayment, qrCode] = calls(fetchSpy)
			expect(createCustomer?.url).toBe('https://api.asaas.com/v3/customers')
			expect(createPayment?.body).toMatchObject({ customer: 'cus_pix', billingType: 'PIX', value: 199, externalReference: 'lago_inv_4' })
			expect(qrCode?.url).toBe('https://api.asaas.com/v3/payments/pay_pix/pixQrCode')
			expect(qrCode?.method).toBe('GET')
		})

		it('falls back to a default expiry when the QR response omits expirationDate', async () => {
			fetchSpy
				.mockResolvedValueOnce(jsonResponse({ id: 'cus_pix2' }))
				.mockResolvedValueOnce(jsonResponse({ id: 'pay_pix2' }))
				.mockResolvedValueOnce(jsonResponse({}))

			const pix = await provider.createPix({
				externalReference: 'lago_inv_5',
				amountCents: 100,
				idemKey: 'pix_2',
				payer: { name: 'Ana', email: 'ana@x.com' },
			})

			expect(pix.qr).toBe('')
			expect(pix.copyPaste).toBe('')
			expect(pix.expiresAt.getTime()).toBeGreaterThan(Date.now())
		})

		it('rejects createPix without a payer — Asaas requires an existing customer id to create a payment', async () => {
			await expect(provider.createPix({ externalReference: 'lago_inv_6', amountCents: 100, idemKey: 'pix_3' })).rejects.toMatchObject({
				name: 'PROVIDER_ERROR',
			})
			expect(fetchSpy).not.toHaveBeenCalled()
		})
	})

	describe('getRefundStatus', () => {
		it('counts a DONE refund into the total and lists it by its stable endToEndIdentifier', async () => {
			fetchSpy.mockResolvedValueOnce(
				jsonResponse({
					id: 'pay_1',
					refunds: [{ value: 50, status: 'DONE', endToEndIdentifier: 'E1234', id: 'unstable_internal_id' }],
				}),
			)

			const result = await provider.getRefundStatus('pay_1')

			expect(result).toEqual({ refundedTotalCents: 5000, refunds: [{ gatewayRef: 'E1234', amountCents: 5000 }] })
			const call = calls(fetchSpy)[0]!
			expect(call.url).toBe('https://api.asaas.com/v3/payments/pay_1')
			expect(call.method).toBe('GET')
		})

		it('PENDING/CANCELLED/unknown-status refunds stay OUT of both the total and the list (only DONE is effectuated)', async () => {
			fetchSpy.mockResolvedValueOnce(
				jsonResponse({
					id: 'pay_2',
					refunds: [
						{ value: 10, status: 'PENDING', endToEndIdentifier: 'E1' },
						{ value: 20, status: 'CANCELLED', endToEndIdentifier: 'E2' },
						{ value: 30, status: 'SOME_UNMAPPED_STATUS', endToEndIdentifier: 'E3' },
					],
				}),
			)

			const result = await provider.getRefundStatus('pay_2')

			expect(result).toEqual({ refundedTotalCents: 0, refunds: [] })
		})

		it('a DONE refund missing endToEndIdentifier is counted in the total but excluded from the per-refund list (fail-safe: never fabricate an id)', async () => {
			fetchSpy.mockResolvedValueOnce(
				jsonResponse({
					id: 'pay_3',
					refunds: [
						{ value: 15, status: 'DONE', endToEndIdentifier: 'E-KNOWN' },
						{ value: 25, status: 'DONE' }, // DONE but no canonical id on this delivery
					],
				}),
			)

			const result = await provider.getRefundStatus('pay_3')

			expect(result.refundedTotalCents).toBe(4000) // 15 + 25 reais — both DONE, both counted
			expect(result.refunds).toEqual([{ gatewayRef: 'E-KNOWN', amountCents: 1500 }]) // only the identifiable one listed
		})

		it('zero refunds → { refundedTotalCents: 0, refunds: [] }', async () => {
			fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'pay_4' }))

			const result = await provider.getRefundStatus('pay_4')

			expect(result).toEqual({ refundedTotalCents: 0, refunds: [] })
		})

		it('unexpected gateway shape (missing invariant id) throws PROVIDER_ERROR — never a lying zero', async () => {
			fetchSpy.mockResolvedValueOnce(jsonResponse({ refunds: [] }))

			await expect(provider.getRefundStatus('pay_5')).rejects.toMatchObject({ name: 'PROVIDER_ERROR' })
		})

		it('a DONE refund missing `value` throws PROVIDER_ERROR — never a lying zero amount', async () => {
			fetchSpy.mockResolvedValueOnce(
				jsonResponse({
					id: 'pay_6',
					refunds: [{ status: 'DONE', endToEndIdentifier: 'E-NO-VALUE' }],
				}),
			)

			await expect(provider.getRefundStatus('pay_6')).rejects.toMatchObject({ name: 'PROVIDER_ERROR' })
		})

		it('refunds[] absent on a payment NOT reported as REFUNDED → normal zero-refunds result (the common unrefunded case)', async () => {
			fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'pay_7', status: 'RECEIVED' }))

			const result = await provider.getRefundStatus('pay_7')

			expect(result).toEqual({ refundedTotalCents: 0, refunds: [] })
		})

		it('refunds[] absent while payment status is REFUNDED throws PROVIDER_ERROR — contradiction is shape drift', async () => {
			fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'pay_8', status: 'REFUNDED' }))

			await expect(provider.getRefundStatus('pay_8')).rejects.toMatchObject({ name: 'PROVIDER_ERROR' })
		})
	})

	describe('getChargebackStatus', () => {
		it.each([
			'CHARGEBACK_REQUESTED',
			'CHARGEBACK_DISPUTE',
			'AWAITING_CHARGEBACK_REVERSAL',
		])('status %s → { chargedBack: true }, GET /payments/{id} (AC-6)', async status => {
			fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'pay_cb_1', status }))

			const result = await provider.getChargebackStatus('pay_cb_1')

			expect(result).toEqual({ chargedBack: true })
			const call = calls(fetchSpy)[0]!
			expect(call.url).toBe('https://api.asaas.com/v3/payments/pay_cb_1')
			expect(call.method).toBe('GET')
		})

		it('any other payment status → { chargedBack: false } — never inferred from an unrecognized status', async () => {
			fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'pay_cb_2', status: 'RECEIVED' }))

			const result = await provider.getChargebackStatus('pay_cb_2')

			expect(result).toEqual({ chargedBack: false })
		})

		it('missing status → { chargedBack: false }', async () => {
			fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'pay_cb_3' }))

			const result = await provider.getChargebackStatus('pay_cb_3')

			expect(result).toEqual({ chargedBack: false })
		})

		it('unexpected gateway shape (missing invariant id) throws PROVIDER_ERROR — never a lying false', async () => {
			fetchSpy.mockResolvedValueOnce(jsonResponse({ status: 'CHARGEBACK_REQUESTED' }))

			await expect(provider.getChargebackStatus('pay_cb_4')).rejects.toMatchObject({ name: 'PROVIDER_ERROR' })
		})
	})
})
