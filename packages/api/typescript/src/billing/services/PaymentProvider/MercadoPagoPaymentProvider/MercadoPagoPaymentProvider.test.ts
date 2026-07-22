import { describe, it, expect, beforeEach } from 'bun:test'

import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { MercadoPagoPaymentProvider } from './MercadoPagoPaymentProvider'
import { BillingPlatform, CheckoutIntent, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

// A recording stub for the provider's `call` seam — the same override pattern
// StripePaymentProvider tests use for `stripe()` (see StripePaymentProvider.test.ts /
// StripePaymentProvider.checkout.test.ts): subclass, override the protected accessor, capture
// what the provider sent, script what comes back.
interface PreferenceBody {
	items: { unit_price: number; quantity: number; currency_id: string; title: string }[]
	external_reference: string
	back_urls: { success: string; failure: string }
	auto_return: string
}

interface PixBody {
	payment_method_id: string
	transaction_amount: number
	external_reference: string
	payer?: { email: string; first_name: string; identification: { type: string; number: string } }
}

interface Call {
	path: string
	body: unknown
	idemKey: string
	apiKey: string | undefined
	method: string
}

class TestableMercadoPagoProvider extends MercadoPagoPaymentProvider {
	calls: Call[] = []
	response: unknown = {}

	protected override async call(
		path: string,
		body: unknown,
		idemKey: string,
		apiKey?: string,
		method: 'POST' | 'GET' = 'POST',
	): Promise<unknown> {
		this.calls.push({ path, body, idemKey, apiKey, method })
		return this.response
	}
}

describe('MercadoPagoPaymentProvider', () => {
	let provider: TestableMercadoPagoProvider

	beforeEach(() => {
		provider = new TestableMercadoPagoProvider()
	})

	it('exposes the MERCADOPAGO platform, CHECKOUT-ONLY capabilities (no card vaulting) + CARD/PIX methods', () => {
		expect(provider.platform).toBe(BillingPlatform.MERCADOPAGO)
		expect(provider.capabilities).toEqual({ hostedCardCheckout: true, cardVaulting: false })
		expect([...provider.supportedMethods]).toEqual([PaymentMethodType.CARD, PaymentMethodType.PIX])
	})

	describe('ensureCustomer', () => {
		it('is a documented no-op — Checkout Pro needs no pre-created customer resource', async () => {
			await provider.ensureCustomer({ ownerId: 'o1', owner: { name: 'Ada', email: 'ada@test.dev' } })
			expect(provider.calls).toEqual([])
		})
	})

	describe('createCheckoutSession', () => {
		it('mints a preference: title/quantity/currency, external_reference, back_urls, mandatory X-Idempotency-Key', async () => {
			provider.response = { id: 'pref_123', init_point: 'https://mercadopago.com.br/checkout/v1/redirect?pref_id=pref_123' }

			const result = await provider.createCheckoutSession({
				ownerId: 'owner-1',
				intent: CheckoutIntent.PAYMENT,
				engineInvoiceId: 'inv-1',
				amountCents: 29900,
				successUrl: 'https://app.test/account?checkout=success',
				cancelUrl: 'https://app.test/account?checkout=canceled',
				idemKey: 'checkout:inv-1',
			})

			expect(result).toEqual({ url: 'https://mercadopago.com.br/checkout/v1/redirect?pref_id=pref_123', sessionRef: 'pref_123' })
			expect(provider.calls).toHaveLength(1)
			const call = provider.calls[0]!
			expect(call.path).toBe('/checkout/preferences')
			expect(call.idemKey).toBe('checkout:inv-1')
			const body = call.body as PreferenceBody
			// MercadoPago wants decimal REAIS, not cents — 29900 cents → 299.
			expect(body.items[0]!.unit_price).toBe(299)
			expect(body.items[0]!.quantity).toBe(1)
			expect(body.items[0]!.currency_id).toBe('BRL')
			expect(body.items[0]!.title).toBe('Fatura inv-1')
			expect(body.external_reference).toBe('inv-1')
			expect(body.back_urls).toEqual({
				success: 'https://app.test/account?checkout=success',
				failure: 'https://app.test/account?checkout=canceled',
			})
			expect(body.auto_return).toBe('approved')
		})

		it('uses the caller-provided presentation title over the generic invoice fallback', async () => {
			provider.response = { id: 'pref_1', init_point: 'https://mp.test/redirect' }

			await provider.createCheckoutSession({
				ownerId: 'owner-1',
				intent: CheckoutIntent.PAYMENT,
				engineInvoiceId: 'inv-1',
				amountCents: 1000,
				presentation: { title: 'Plano PRO' },
				successUrl: 'https://app.test/s',
				cancelUrl: 'https://app.test/c',
				idemKey: 'k',
			})

			expect((provider.calls[0]!.body as PreferenceBody).items[0]!.title).toBe('Plano PRO')
		})

		it('rejects intent=setup — MercadoPago has no vault-only checkout (no card vaulting)', async () => {
			expect(
				provider.createCheckoutSession({
					ownerId: 'owner-1',
					intent: CheckoutIntent.SETUP,
					successUrl: 'https://app.test/s',
					cancelUrl: 'https://app.test/c',
					idemKey: 'k',
				}),
			).rejects.toThrow()
			expect(provider.calls).toEqual([])
		})

		it('rejects intent=payment without engineInvoiceId/amountCents', async () => {
			expect(
				provider.createCheckoutSession({
					ownerId: 'owner-1',
					intent: CheckoutIntent.PAYMENT,
					successUrl: 'https://app.test/s',
					cancelUrl: 'https://app.test/c',
					idemKey: 'k',
				}),
			).rejects.toThrow()
		})

		it('rejects a non-BRL currency', async () => {
			expect(
				provider.createCheckoutSession({
					ownerId: 'owner-1',
					intent: CheckoutIntent.PAYMENT,
					engineInvoiceId: 'inv-1',
					amountCents: 1000,
					currency: CurrencyCode.USD,
					successUrl: 'https://app.test/s',
					cancelUrl: 'https://app.test/c',
					idemKey: 'k',
				}),
			).rejects.toThrow()
		})

		it('per-call credentials override the platform key', async () => {
			provider.response = { id: 'pref_1', init_point: 'https://mp.test/redirect' }

			await provider.createCheckoutSession({
				ownerId: 'owner-1',
				intent: CheckoutIntent.PAYMENT,
				engineInvoiceId: 'inv-1',
				amountCents: 1000,
				credentials: { apiKey: 'APP_USR-other-account' },
				successUrl: 'https://app.test/s',
				cancelUrl: 'https://app.test/c',
				idemKey: 'k',
			})

			expect(provider.calls[0]!.apiKey).toBe('APP_USR-other-account')
		})

		it('surfaces a gateway response with an invalid shape as PROVIDER_ERROR', async () => {
			// Missing the invariant `init_point` — parseGatewayResponse must reject this instead of
			// letting `r.init_point` silently resolve to `undefined`.
			provider.response = { id: 'pref_123' }

			await expect(
				provider.createCheckoutSession({
					ownerId: 'owner-1',
					intent: CheckoutIntent.PAYMENT,
					engineInvoiceId: 'inv-1',
					amountCents: 1000,
					successUrl: 'https://app.test/s',
					cancelUrl: 'https://app.test/c',
					idemKey: 'k',
				}),
			).rejects.toMatchObject({ name: 'PROVIDER_ERROR' })
		})
	})

	describe('capability-gated methods', () => {
		it('chargeOffSession throws PROVIDER_CAPABILITY_UNSUPPORTED', async () => {
			expect(provider.chargeOffSession({ pmRef: 'pm_1', amountCents: 1000, idemKey: 'k' })).rejects.toThrow()
			expect(provider.calls).toEqual([])
		})

		it('chargeStoredOnSession throws PROVIDER_CAPABILITY_UNSUPPORTED', async () => {
			expect(
				provider.chargeStoredOnSession({ pmRef: 'pm_1', ownerId: 'o1', amountCents: 1000, engineInvoiceId: 'inv-1', idemKey: 'k' }),
			).rejects.toThrow()
			expect(provider.calls).toEqual([])
		})
	})

	describe('cancelCharge', () => {
		it('posts a full refund (no amount) when amountCents is absent', async () => {
			provider.response = { id: 'ref_1', status: 'approved' }

			await provider.cancelCharge({ gatewayTxId: 'pay_123', idemKey: 'refund:pay_123' })

			const call = provider.calls[0]!
			expect(call.path).toBe('/v1/payments/pay_123/refunds')
			expect(call.body).toEqual({})
			expect(call.idemKey).toBe('refund:pay_123')
		})

		it('posts a partial refund converted to decimal REAIS', async () => {
			provider.response = { id: 'ref_2', status: 'approved' }

			await provider.cancelCharge({ gatewayTxId: 'pay_123', amountCents: 15000, idemKey: 'refund:pay_123:partial' })

			expect(provider.calls[0]!.body).toEqual({ amount: 150 })
		})
	})

	describe('createPix', () => {
		it('creates a pix payment: decimal amount, external_reference, payer identification', async () => {
			provider.response = {
				id: 987654321,
				date_of_expiration: '2026-07-11T00:00:00.000-04:00',
				point_of_interaction: { transaction_data: { qr_code: '00020126...copiaecola...6304ABCD', qr_code_base64: 'iVBORw0KGgoAAAANS==' } },
			}

			const result = await provider.createPix({
				externalReference: 'inv-2',
				amountCents: 19900,
				idemKey: 'pix:inv-2',
				payer: { name: 'Ada Lovelace', email: 'ada@test.dev', document: '123.456.789-09' },
			})

			expect(result.pixId).toBe('987654321')
			expect(result.qr).toBe('data:image/png;base64,iVBORw0KGgoAAAANS==')
			expect(result.copyPaste).toBe('00020126...copiaecola...6304ABCD')
			expect(result.expiresAt).toEqual(new Date('2026-07-11T00:00:00.000-04:00'))

			const call = provider.calls[0]!
			expect(call.path).toBe('/v1/payments')
			const body = call.body as PixBody
			expect(body.payment_method_id).toBe('pix')
			expect(body.transaction_amount).toBe(199)
			expect(body.external_reference).toBe('inv-2')
			expect(body.payer?.email).toBe('ada@test.dev')
			expect(body.payer?.first_name).toBe('Ada Lovelace')
			expect(body.payer?.identification).toEqual({ type: 'CPF', number: '12345678909' })
		})

		it('omits payer when no payer identity is provided', async () => {
			provider.response = { id: 1, point_of_interaction: { transaction_data: {} } }

			await provider.createPix({ externalReference: 'inv-3', amountCents: 1000, idemKey: 'pix:inv-3' })

			expect((provider.calls[0]!.body as PixBody).payer).toBeUndefined()
		})

		it('falls back to empty qr/copyPaste and a 24h expiry when the gateway omits transaction_data', async () => {
			provider.response = { id: 2 }

			const before = Date.now()
			const result = await provider.createPix({ externalReference: 'inv-4', amountCents: 1000, idemKey: 'pix:inv-4' })

			expect(result.qr).toBe('')
			expect(result.copyPaste).toBe('')
			expect(result.expiresAt.getTime()).toBeGreaterThan(before)
		})
	})

	describe('getRefundStatus', () => {
		it('single refund: total + gatewayRef from GET /v1/payments/{id}', async () => {
			provider.response = {
				id: 'pay_1',
				status: 'refunded',
				transaction_amount_refunded: 50,
				refunds: [{ id: 'ref_1', amount: 50 }],
			}

			const result = await provider.getRefundStatus('pay_1')

			expect(result).toEqual({ refundedTotalCents: 5000, refunds: [{ gatewayRef: 'ref_1', amountCents: 5000 }] })
			expect(provider.calls).toHaveLength(1)
			const call = provider.calls[0]!
			expect(call.path).toBe('/v1/payments/pay_1')
			expect(call.method).toBe('GET')
		})

		it('multiple refunds preserve gateway order (oldest → newest)', async () => {
			provider.response = {
				id: 'pay_2',
				transaction_amount_refunded: 30,
				refunds: [
					{ id: 'ref_a', amount: 10 },
					{ id: 'ref_b', amount: 20 },
				],
			}

			const result = await provider.getRefundStatus('pay_2')

			expect(result.refundedTotalCents).toBe(3000)
			expect(result.refunds).toEqual([
				{ gatewayRef: 'ref_a', amountCents: 1000 },
				{ gatewayRef: 'ref_b', amountCents: 2000 },
			])
		})

		it('zero refunds → { refundedTotalCents: 0, refunds: [] } when transaction_amount_refunded is explicitly 0', async () => {
			provider.response = { id: 'pay_3', status: 'approved', transaction_amount_refunded: 0 }

			const result = await provider.getRefundStatus('pay_3')

			expect(result).toEqual({ refundedTotalCents: 0, refunds: [] })
		})

		it('unexpected gateway shape (missing invariant id) throws PROVIDER_ERROR — never a lying zero', async () => {
			provider.response = { status: 'refunded', transaction_amount_refunded: 0 }

			await expect(provider.getRefundStatus('pay_4')).rejects.toMatchObject({ name: 'PROVIDER_ERROR' })
		})

		it('missing transaction_amount_refunded throws PROVIDER_ERROR — the field is documented as always present, never a lying zero', async () => {
			provider.response = { id: 'pay_9', status: 'approved' }

			await expect(provider.getRefundStatus('pay_9')).rejects.toMatchObject({ name: 'PROVIDER_ERROR' })
		})

		it('a refund entry missing its own id is excluded from refunds[] but the total still comes from transaction_amount_refunded (never fabricate an id)', async () => {
			provider.response = {
				id: 'pay_10',
				transaction_amount_refunded: 30,
				refunds: [
					{ id: 'ref_known', amount: 10 },
					{ amount: 20 }, // no id on this delivery
				],
			}

			const result = await provider.getRefundStatus('pay_10')

			expect(result.refundedTotalCents).toBe(3000) // from transaction_amount_refunded, not from summing refunds[]
			expect(result.refunds).toEqual([{ gatewayRef: 'ref_known', amountCents: 1000 }])
		})

		it('converts reais → cents exactly (10.01 → 1001), no float drift', async () => {
			provider.response = {
				id: 'pay_5',
				transaction_amount_refunded: 10.01,
				refunds: [{ id: 'ref_5', amount: 10.01 }],
			}

			const result = await provider.getRefundStatus('pay_5')

			expect(result.refundedTotalCents).toBe(1001)
			expect(result.refunds[0]!.amountCents).toBe(1001)
		})
	})

	describe('getChargebackStatus', () => {
		it("status: 'charged_back' → { chargedBack: true }, GET /v1/payments/{id} (AC-6)", async () => {
			provider.response = { id: 'pay_cb_1', status: 'charged_back' }

			const result = await provider.getChargebackStatus('pay_cb_1')

			expect(result).toEqual({ chargedBack: true })
			expect(provider.calls).toHaveLength(1)
			const call = provider.calls[0]!
			expect(call.path).toBe('/v1/payments/pay_cb_1')
			expect(call.method).toBe('GET')
		})

		it('any other status → { chargedBack: false } — never inferred from an unrecognized status', async () => {
			provider.response = { id: 'pay_cb_2', status: 'approved' }

			const result = await provider.getChargebackStatus('pay_cb_2')

			expect(result).toEqual({ chargedBack: false })
		})

		it('missing status → { chargedBack: false }', async () => {
			provider.response = { id: 'pay_cb_3' }

			const result = await provider.getChargebackStatus('pay_cb_3')

			expect(result).toEqual({ chargedBack: false })
		})

		it('unexpected gateway shape (missing invariant id) throws PROVIDER_ERROR — never a lying false', async () => {
			provider.response = { status: 'charged_back' }

			await expect(provider.getChargebackStatus('pay_cb_4')).rejects.toMatchObject({ name: 'PROVIDER_ERROR' })
		})
	})
})
