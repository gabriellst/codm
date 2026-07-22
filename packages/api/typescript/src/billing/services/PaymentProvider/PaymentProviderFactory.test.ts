import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'

import { ProductConfig } from '@shared/config'
import { PaymentProviderFactory } from './PaymentProviderFactory'
import { BillingPlatform, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

describe('PaymentProviderFactory', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let factory: PaymentProviderFactory

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'o1' })
		factory = testBed.resolve(PaymentProviderFactory)
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	it('resolves the provider registered for a known platform', () => {
		const provider = factory.for(BillingPlatform.PAGARME)

		expect(provider.platform).toBe(BillingPlatform.PAGARME)
	})

	it('resolves the Stripe provider for the STRIPE platform', () => {
		const provider = factory.for(BillingPlatform.STRIPE)

		expect(provider.platform).toBe(BillingPlatform.STRIPE)
	})

	it('throws a clear error for a platform with no registered provider', () => {
		expect(() => factory.for('BOLETO_BANCARIO' as BillingPlatform)).toThrow(/BOLETO_BANCARIO/)
	})

	describe('decideForPaymentMethod', () => {
		const originalPix = ProductConfig.env.BILLING_GATEWAY_PIX
		const originalCard = ProductConfig.env.BILLING_GATEWAY_CARD
		const originalDefault = ProductConfig.env.BILLING_DEFAULT_GATEWAY

		afterAll(() => {
			Object.assign(ProductConfig.env, {
				BILLING_GATEWAY_PIX: originalPix,
				BILLING_GATEWAY_CARD: originalCard,
				BILLING_DEFAULT_GATEWAY: originalDefault,
			})
		})

		it('roteia o método para o gateway configurado por-método (Pix → PAGARME) mesmo com default diferente', async () => {
			Object.assign(ProductConfig.env, { BILLING_DEFAULT_GATEWAY: 'STRIPE', BILLING_GATEWAY_PIX: 'PAGARME' })

			const pixProvider = await factory.decideForPaymentMethod(PaymentMethodType.PIX, { ownerId: 'o1' })
			const cardProvider = await factory.decideForPaymentMethod(PaymentMethodType.CARD, { ownerId: 'o1' })

			expect(pixProvider.platform).toBe(BillingPlatform.PAGARME) // override por-método
			expect(cardProvider.platform).toBe(BillingPlatform.STRIPE) // sem override → default
		})

		it('cai no BILLING_DEFAULT_GATEWAY quando não há override para o método', async () => {
			Object.assign(ProductConfig.env, { BILLING_DEFAULT_GATEWAY: 'STRIPE', BILLING_GATEWAY_PIX: '' })

			const pixProvider = await factory.decideForPaymentMethod(PaymentMethodType.PIX, { ownerId: 'o1' })

			expect(pixProvider.platform).toBe(BillingPlatform.STRIPE)
		})

		it('ignora um override inválido (não é BillingPlatform) e cai no default', async () => {
			Object.assign(ProductConfig.env, { BILLING_DEFAULT_GATEWAY: 'STRIPE', BILLING_GATEWAY_PIX: 'NOT_A_GATEWAY' })

			const pixProvider = await factory.decideForPaymentMethod(PaymentMethodType.PIX, { ownerId: 'o1' })

			expect(pixProvider.platform).toBe(BillingPlatform.STRIPE)
		})

		// Finding [1]: a stale BILLING_GATEWAY_PIX/BILLING_GATEWAY_CARD/BILLING_DEFAULT_GATEWAY
		// pointing at a DECOMMISSIONED BillingPlatform member (GETNET/INFINITEPAY/REDE) must never
		// pass narrowing silently — it must throw LOUDLY at resolution time instead of surfacing
		// later as an opaque "No PaymentProvider registered" from for() at charge time.
		it('rejects a BILLING_GATEWAY_PIX pointing at a decommissioned platform — throws a named error instead of falling back', async () => {
			Object.assign(ProductConfig.env, { BILLING_DEFAULT_GATEWAY: 'STRIPE', BILLING_GATEWAY_PIX: 'INFINITEPAY' })

			await expect(factory.decideForPaymentMethod(PaymentMethodType.PIX, { ownerId: 'o1' })).rejects.toThrow(/BILLING_GATEWAY_PIX/)
			await expect(factory.decideForPaymentMethod(PaymentMethodType.PIX, { ownerId: 'o1' })).rejects.toThrow(/INFINITEPAY/)
		})

		it('rejects a BILLING_GATEWAY_CARD pointing at a decommissioned platform — throws a named error instead of falling back', async () => {
			Object.assign(ProductConfig.env, { BILLING_DEFAULT_GATEWAY: 'STRIPE', BILLING_GATEWAY_CARD: 'GETNET' })

			await expect(factory.decideForPaymentMethod(PaymentMethodType.CARD, { ownerId: 'o1' })).rejects.toThrow(/BILLING_GATEWAY_CARD/)
			await expect(factory.decideForPaymentMethod(PaymentMethodType.CARD, { ownerId: 'o1' })).rejects.toThrow(/GETNET/)
		})

		it('rejects a BILLING_DEFAULT_GATEWAY pointing at a decommissioned platform — throws a named error instead of falling back to PAGARME', async () => {
			Object.assign(ProductConfig.env, { BILLING_DEFAULT_GATEWAY: 'REDE', BILLING_GATEWAY_PIX: '', BILLING_GATEWAY_CARD: '' })

			await expect(factory.decide({ ownerId: 'o1' })).rejects.toThrow(/BILLING_DEFAULT_GATEWAY/)
			await expect(factory.decide({ ownerId: 'o1' })).rejects.toThrow(/REDE/)
		})

		it('defaultPlatform() throws synchronously for a decommissioned BILLING_DEFAULT_GATEWAY', () => {
			Object.assign(ProductConfig.env, { BILLING_DEFAULT_GATEWAY: 'GETNET' })

			expect(() => factory.defaultPlatform()).toThrow(/GETNET/)
		})
	})
})
