import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { DomainEventRepository } from '@template/core-typescript'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { CreatePurchaseOrder } from './CreatePurchaseOrder'
import { PurchaseOrderRepository } from '../repositories/PurchaseOrderRepository'
import { PurchaseOrderCreatedEvent } from '../events'

const STORE = testId('store', '1')
const USER = testId('user', '1')

describe('CreatePurchaseOrder', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let create: CreatePurchaseOrder
	let repo: PurchaseOrderRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		create = testBed.resolve(CreatePurchaseOrder)
		repo = testBed.resolve(PurchaseOrderRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('persists the purchase order + emits PurchaseOrderCreatedEvent', async () => {
		const { purchaseOrderId } = await create.execute({
			userId: USER,
			storeId: STORE,
			supplierName: 'ACME Supplies',
			totalAmount: { amountCents: 50000, currency: CurrencyCode.BRL },
		})

		const saved = await repo.findById(purchaseOrderId)
		expect(saved?.supplierName).toBe('ACME Supplies')
		expect(saved?.status).toBe('DRAFT')

		const emitted = await testBed.resolve(DomainEventRepository).findByType(PurchaseOrderCreatedEvent)
		expect(emitted).toHaveLength(1)
		expect(emitted[0]!.payload.purchaseOrder.storeId).toBe(STORE)
	})
})
