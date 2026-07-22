import { describe, it, expect } from 'bun:test'
import type Stripe from 'stripe'
import { Language } from '@template/contracts-typescript/wire/enums'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { StripePaymentProvider } from './StripePaymentProvider'
import { CheckoutIntent } from '@template/contracts-typescript/wire/enums'

// Stub apenas o que o caminho usa — customers.search (ensureCustomerId) + checkout.sessions.create.
// `apiKeys` registra a chave que cada chamada resolveu (credenciais por chamada).
function providerWithStub(capture: {
	params?: Stripe.Checkout.SessionCreateParams
	options?: Stripe.RequestOptions
	apiKeys?: (string | undefined)[]
}) {
	const stub = {
		customers: {
			search: async () => ({ data: [{ id: 'cus_test' }] }),
			// Tests that pass `owner` exercise the upsert branch (update on the found customer).
			update: async () => ({ id: 'cus_test' }),
		},
		checkout: {
			sessions: {
				create: async (params: Stripe.Checkout.SessionCreateParams, options?: Stripe.RequestOptions) => {
					capture.params = params
					capture.options = options
					return { id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/cs_test_123', expires_at: 1_900_000_000 }
				},
			},
		},
	} as unknown as Stripe

	return new (class extends StripePaymentProvider {
		protected override stripe(apiKey?: string): Stripe {
			capture.apiKeys ??= []
			capture.apiKeys.push(apiKey)
			return stub
		}
	})()
}

describe('StripePaymentProvider.createCheckoutSession', () => {
	it('payment intent: mode=payment com setup_future_usage off_session e metadata do invoice', async () => {
		const capture: { params?: Stripe.Checkout.SessionCreateParams; options?: Stripe.RequestOptions } = {}
		const provider = providerWithStub(capture)

		const result = await provider.createCheckoutSession({
			ownerId: 'owner-1',
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'native:owner-1:123',
			amountCents: 29900,
			successUrl: 'https://app.test/account?checkout=success',
			cancelUrl: 'https://app.test/account?checkout=canceled',
			idemKey: 'checkout:native:owner-1:123',
		})

		expect(result.url).toBe('https://checkout.stripe.com/c/pay/cs_test_123')
		expect(result.sessionRef).toBe('cs_test_123')
		expect(result.expiresAt).toEqual(new Date(1_900_000_000 * 1000))
		// Stripe's `mode` is its own API literal (lowercase), NOT our CheckoutIntent enum value.
		expect(capture.params?.mode).toBe('payment')
		expect(capture.params?.customer).toBe('cus_test')
		expect(capture.params?.payment_intent_data?.setup_future_usage).toBe('off_session')
		expect(capture.params?.payment_intent_data?.metadata?.engineInvoiceId).toBe('native:owner-1:123')
		expect(capture.params?.metadata?.ownerId).toBe('owner-1')
		expect(capture.params?.metadata?.intent).toBe(CheckoutIntent.PAYMENT)
		expect(capture.options?.idempotencyKey).toBe('checkout:native:owner-1:123')
	})

	it('setup intent: mode=setup sem line_items', async () => {
		const capture: { params?: Stripe.Checkout.SessionCreateParams } = {}
		const provider = providerWithStub(capture)

		const result = await provider.createCheckoutSession({
			ownerId: 'owner-1',
			intent: CheckoutIntent.SETUP,
			successUrl: 'https://app.test/account?checkout=success',
			cancelUrl: 'https://app.test/account?checkout=canceled',
			idemKey: 'checkout-setup:owner-1:abc',
		})

		expect(result.sessionRef).toBe('cs_test_123')
		// Stripe's `mode` is its own API literal (lowercase), NOT our CheckoutIntent enum value.
		expect(capture.params?.mode).toBe('setup')
		expect(capture.params?.line_items).toBeUndefined()
		expect(capture.params?.metadata?.intent).toBe(CheckoutIntent.SETUP)
	})

	it('payment sem engineInvoiceId lança', async () => {
		const provider = providerWithStub({})
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

	it('default: moeda BRL e título genérico da fatura quando nada é parametrizado', async () => {
		const capture: { params?: Stripe.Checkout.SessionCreateParams } = {}
		const provider = providerWithStub(capture)

		await provider.createCheckoutSession({
			ownerId: 'owner-1',
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv-1',
			amountCents: 1000,
			successUrl: 'https://app.test/s',
			cancelUrl: 'https://app.test/c',
			idemKey: 'k',
		})

		const item = capture.params?.line_items?.[0]
		expect(item?.price_data?.currency).toBe('brl')
		expect(item?.price_data?.product_data?.name).toBe('Fatura inv-1')
	})

	it('currency parametrizada chega no line item', async () => {
		const capture: { params?: Stripe.Checkout.SessionCreateParams } = {}
		const provider = providerWithStub(capture)

		await provider.createCheckoutSession({
			ownerId: 'owner-1',
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv-1',
			amountCents: 1000,
			currency: CurrencyCode.USD,
			successUrl: 'https://app.test/s',
			cancelUrl: 'https://app.test/c',
			idemKey: 'k',
		})

		expect(capture.params?.line_items?.[0]?.price_data?.currency).toBe('usd')
	})

	it('presentation parametrizada (título, descrição, imagem) substitui o default do checkout', async () => {
		const capture: { params?: Stripe.Checkout.SessionCreateParams } = {}
		const provider = providerWithStub(capture)

		await provider.createCheckoutSession({
			ownerId: 'owner-1',
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv-1',
			amountCents: 1000,
			presentation: { title: 'Plano PRO', description: 'Assinatura mensal', imageUrl: 'https://cdn.test/pro.png' },
			successUrl: 'https://app.test/s',
			cancelUrl: 'https://app.test/c',
			idemKey: 'k',
		})

		const product = capture.params?.line_items?.[0]?.price_data?.product_data
		expect(product?.name).toBe('Plano PRO')
		expect(product?.description).toBe('Assinatura mensal')
		expect(product?.images).toEqual(['https://cdn.test/pro.png'])
	})

	it('locale da página vem do idioma do owner (PT→pt-BR, EN→en, ausente→auto)', async () => {
		const cases: Array<{ language?: Language; expected: string }> = [
			{ language: Language.PT_BR, expected: 'pt-BR' },
			{ language: Language.EN_US, expected: 'en' },
			{ expected: 'auto' },
		]
		for (const { language, expected } of cases) {
			const capture: { params?: Stripe.Checkout.SessionCreateParams } = {}
			const provider = providerWithStub(capture)
			await provider.createCheckoutSession({
				ownerId: 'owner-1',
				owner: language ? { name: 'Ada', email: 'ada@test.dev', language } : undefined,
				intent: CheckoutIntent.SETUP,
				successUrl: 'https://app.test/s',
				cancelUrl: 'https://app.test/c',
				idemKey: 'k',
			})
			expect(capture.params?.locale).toBe(expected as Stripe.Checkout.SessionCreateParams.Locale)
		}
	})

	it('título fallback da fatura é localizado pelo idioma do owner', async () => {
		const capture: { params?: Stripe.Checkout.SessionCreateParams } = {}
		const provider = providerWithStub(capture)
		await provider.createCheckoutSession({
			ownerId: 'owner-1',
			owner: { name: 'Ada', email: 'ada@test.dev', language: Language.EN_US },
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv-1',
			amountCents: 1000,
			successUrl: 'https://app.test/s',
			cancelUrl: 'https://app.test/c',
			idemKey: 'k',
		})
		expect(capture.params?.line_items?.[0]?.price_data?.product_data?.name).toBe('Invoice inv-1')
	})

	it('credentials por chamada resolvem o client da conta certa (multi-conta)', async () => {
		const capture: { params?: Stripe.Checkout.SessionCreateParams; apiKeys?: (string | undefined)[] } = {}
		const provider = providerWithStub(capture)

		await provider.createCheckoutSession({
			ownerId: 'owner-1',
			intent: CheckoutIntent.SETUP,
			credentials: { apiKey: 'sk_clinic_other_account' },
			successUrl: 'https://app.test/s',
			cancelUrl: 'https://app.test/c',
			idemKey: 'k',
		})

		// Toda resolução de client nesta chamada (ensureCustomerId + sessions.create) usa a chave passada.
		expect(capture.apiKeys?.length).toBeGreaterThan(0)
		for (const key of capture.apiKeys ?? []) expect(key).toBe('sk_clinic_other_account')
	})
})
