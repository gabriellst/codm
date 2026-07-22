import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'

import { PaymentMethod } from '../../entities'
import { PaymentMethodRepository } from '../../repositories'
import { CaptureOrigin } from '../../enums/CaptureOrigin'
import { BillingPlatform, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

describe('DrizzlePaymentMethodRepository — captureOrigin roundtrip', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repository: PaymentMethodRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		repository = testBed.resolve(PaymentMethodRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('persists and rehydrates captureOrigin + originGatewayTxId', async () => {
		const pm = PaymentMethod.create({
			ownerId: 'integration-tenant',
			platform: BillingPlatform.STRIPE,
			mandate: { acceptedAt: new Date(), ip: null, userAgent: null, consentVersion: null },
			instrument: {
				type: PaymentMethodType.CARD,
				pmRef: 'pm_origin_test',
				supportsOffSession: true,
				captureOrigin: CaptureOrigin.CHECKOUT_PAYMENT,
				originGatewayTxId: 'pi_origin_123',
				brand: 'visa',
				last4: '4242',
				expMonth: 12,
				expYear: 2030,
			},
		})
		await repository.save(pm)

		const found = await repository.findDefaultByOwnerId('integration-tenant')
		expect(found?.instrument.captureOrigin).toBe(CaptureOrigin.CHECKOUT_PAYMENT)
		expect(found?.instrument.originGatewayTxId).toBe('pi_origin_123')
	})

	it('a legacy instrument (no origin) rehydrates with the fields absent', async () => {
		const pm = PaymentMethod.create({
			ownerId: 'integration-tenant',
			platform: BillingPlatform.STRIPE,
			mandate: { acceptedAt: new Date(), ip: null, userAgent: null, consentVersion: null },
			instrument: {
				type: PaymentMethodType.CARD,
				pmRef: 'pm_legacy',
				supportsOffSession: true,
				brand: 'visa',
				last4: '1111',
				expMonth: 1,
				expYear: 2031,
			},
		})
		await repository.save(pm)

		const found = await repository.findDefaultByOwnerId('integration-tenant')
		expect(found?.instrument.captureOrigin).toBeUndefined()
		expect(found?.instrument.originGatewayTxId).toBeUndefined()
	})
})
