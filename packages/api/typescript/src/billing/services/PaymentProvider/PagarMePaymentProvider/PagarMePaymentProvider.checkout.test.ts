import { describe, expect, it, spyOn } from 'bun:test'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { MockLoggingService } from '@template/core-typescript'
import { PagarMePaymentProvider } from './PagarMePaymentProvider'
import { CheckoutIntent } from '@template/contracts-typescript/wire/enums'

// `spyOn(globalThis, 'fetch').mockImplementation(...)` requires an argument assignable to the
// FULL `typeof fetch` (Bun attaches a static `preconnect`, not just the call signature) — build
// the stub as a real `typeof fetch` by carrying the original `preconnect` over instead of casting
// (same pattern as this suite's other fetchStub helpers).
const fetchStub = (handler: (url: string, init?: RequestInit) => Promise<Response> | Response): typeof fetch => {
	const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
		return handler(url, init)
	}
	impl.preconnect = globalThis.fetch.preconnect
	return impl
}

// Stub apenas `fetch` — o mesmo `this.call` (Basic auth + Idempotency-Key + withResilience) usado
// por todo o resto do provider. Captura path/body/headers da última chamada.
function providerWithStub(response: unknown, status = 200) {
	const capture: { path?: string; body?: unknown; headers?: Record<string, string> } = {}
	const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
		fetchStub((url, init) => {
			capture.path = url
			capture.headers = init?.headers as Record<string, string> | undefined
			capture.body = init?.body ? JSON.parse(init.body as string) : undefined
			return new Response(JSON.stringify(response), { status })
		}),
	)
	return { provider: new PagarMePaymentProvider(new MockLoggingService()), capture, fetchSpy }
}

describe('PagarMePaymentProvider.createCheckoutSession', () => {
	it('intent=payment: POSTs /core/v5/paymentlinks com cart/payment/customer settings e retorna url + sessionRef', async () => {
		const { provider, capture, fetchSpy } = providerWithStub({
			id: 'pl_abc123',
			url: 'https://payment-link.pagar.me/pl_abc123',
			status: 'active',
			expires_in: 86400,
		})

		const result = await provider.createCheckoutSession({
			ownerId: 'owner-1',
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv-1',
			amountCents: 29900,
			successUrl: 'https://app.test/account?checkout=success',
			cancelUrl: 'https://app.test/account?checkout=canceled',
			idemKey: 'checkout:inv-1',
		})

		expect(result.url).toBe('https://payment-link.pagar.me/pl_abc123')
		expect(result.sessionRef).toBe('pl_abc123')
		expect(result.expiresAt).toEqual(new Date(Date.now() + 86400 * 1000))

		expect(capture.path).toBe('https://api.pagar.me/core/v5/paymentlinks')
		expect(capture.headers?.['Idempotency-Key']).toBe('checkout:inv-1')
		const body = capture.body as {
			type: string
			cart_settings: { items: { amount: number; name: string }[] }
			payment_settings: { accepted_payment_methods: string[]; credit_card_settings: { operation_type: string } }
			customer_settings: { customer: { code: string } }
			success_url: string
		}
		expect(body.type).toBe('order')
		expect(body.cart_settings.items).toEqual([{ amount: 29900, name: 'Fatura inv-1' }])
		expect(body.payment_settings.accepted_payment_methods).toEqual(['credit_card', 'pix'])
		expect(body.payment_settings.credit_card_settings.operation_type).toBe('auth_and_capture')
		expect(body.customer_settings.customer.code).toBe('owner-1')
		expect(body.success_url).toBe('https://app.test/account?checkout=success')

		fetchSpy.mockRestore()
	})

	it('usa presentation.title quando fornecido, em vez do título genérico da fatura', async () => {
		const { provider, capture, fetchSpy } = providerWithStub({ id: 'pl_1', url: 'https://payment-link.pagar.me/pl_1' })

		await provider.createCheckoutSession({
			ownerId: 'owner-1',
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv-2',
			amountCents: 1000,
			presentation: { title: 'Plano Pro' },
			successUrl: 'https://app.test/s',
			cancelUrl: 'https://app.test/c',
			idemKey: 'k',
		})

		const body = capture.body as { cart_settings: { items: { amount: number; name: string }[] } }
		expect(body.cart_settings.items[0]?.name).toBe('Plano Pro')

		fetchSpy.mockRestore()
	})

	it('sem expires_in na resposta → expiresAt fica undefined (não inventa uma data)', async () => {
		const { provider, fetchSpy } = providerWithStub({ id: 'pl_2', url: 'https://payment-link.pagar.me/pl_2' })

		const result = await provider.createCheckoutSession({
			ownerId: 'owner-1',
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv-3',
			amountCents: 500,
			successUrl: 'https://app.test/s',
			cancelUrl: 'https://app.test/c',
			idemKey: 'k',
		})

		expect(result.expiresAt).toBeUndefined()

		fetchSpy.mockRestore()
	})

	it('intent=setup lança — paymentlinks do Pagar.me não têm equivalente vault-only', async () => {
		const { provider, fetchSpy } = providerWithStub({})

		expect(
			provider.createCheckoutSession({
				ownerId: 'owner-1',
				intent: CheckoutIntent.SETUP,
				successUrl: 'https://app.test/s',
				cancelUrl: 'https://app.test/c',
				idemKey: 'k',
			}),
		).rejects.toThrow()

		fetchSpy.mockRestore()
	})

	it('intent=payment sem amountCents lança', async () => {
		const { provider, fetchSpy } = providerWithStub({})

		expect(
			provider.createCheckoutSession({
				ownerId: 'owner-1',
				intent: CheckoutIntent.PAYMENT,
				engineInvoiceId: 'inv-4',
				successUrl: 'https://app.test/s',
				cancelUrl: 'https://app.test/c',
				idemKey: 'k',
			}),
		).rejects.toThrow()

		fetchSpy.mockRestore()
	})

	it('moeda != BRL lança (Pagar.me é BRL-implícito)', async () => {
		const { provider, fetchSpy } = providerWithStub({})

		expect(
			provider.createCheckoutSession({
				ownerId: 'owner-1',
				intent: CheckoutIntent.PAYMENT,
				engineInvoiceId: 'inv-5',
				amountCents: 1000,
				currency: CurrencyCode.USD,
				successUrl: 'https://app.test/s',
				cancelUrl: 'https://app.test/c',
				idemKey: 'k',
			}),
		).rejects.toThrow()

		fetchSpy.mockRestore()
	})

	it('shape inválido na resposta (sem id) lança PROVIDER_ERROR em vez de aceitar silenciosamente', async () => {
		// Missing `id` — the one invariant PagarMePaymentLinkResponseSchema requires — must fail
		// loud via parseGatewayResponse rather than let `r.id` resolve to `undefined` downstream.
		const { provider, fetchSpy } = providerWithStub({ url: 'https://payment-link.pagar.me/pl_bad' })

		await expect(
			provider.createCheckoutSession({
				ownerId: 'owner-1',
				intent: CheckoutIntent.PAYMENT,
				engineInvoiceId: 'inv-6',
				amountCents: 1000,
				successUrl: 'https://app.test/s',
				cancelUrl: 'https://app.test/c',
				idemKey: 'k',
			}),
		).rejects.toMatchObject({ name: 'PROVIDER_ERROR' })

		fetchSpy.mockRestore()
	})
})
