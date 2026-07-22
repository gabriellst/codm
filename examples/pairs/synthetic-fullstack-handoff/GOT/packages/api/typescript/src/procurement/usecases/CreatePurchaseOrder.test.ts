import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { DomainEventRepository } from '@codedm/core-typescript'
import { CurrencyCode } from '@codedm/contracts-typescript/wire/enums'
import { CreatePurchaseOrder } from './CreatePurchaseOrder'
import { CancelPurchaseOrder } from './CancelPurchaseOrder'
import { PurchaseOrderRepository } from '../repositories/PurchaseOrderRepository'
import { PurchaseOrderCreatedEvent, PurchaseOrderCancelledEvent } from '../events'

const STORE = testId('store', '1')
const USER = testId('user', '1')

describe('PurchaseOrder (create + cancel)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let create: CreatePurchaseOrder
	let cancel: CancelPurchaseOrder
	let repo: PurchaseOrderRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		create = testBed.resolve(CreatePurchaseOrder)
		cancel = testBed.resolve(CancelPurchaseOrder)
		repo = testBed.resolve(PurchaseOrderRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	function eventRepo() {
		return testBed.resolve(DomainEventRepository)
	}

	async function seed(): Promise<string> {
		const { purchaseOrderId } = await create.execute({
			userId: USER,
			storeId: STORE,
			supplierName: 'Acme Supplies',
			totalAmount: { amountCents: 100_000, currency: CurrencyCode.BRL },
		})
		return purchaseOrderId
	}

	it('Create persists + emits PurchaseOrderCreatedEvent', async () => {
		const id = await seed()

		const saved = await repo.findById(id)
		expect(saved?.supplierName).toBe('Acme Supplies')
		expect(saved?.totalAmount.amountCents).toBe(100_000)
		expect(saved?.status).toBe('PLACED')

		const emitted = await eventRepo().findByType(PurchaseOrderCreatedEvent)
		expect(emitted).toHaveLength(1)
		expect(emitted[0]!.payload.purchaseOrder.storeId).toBe(STORE)
	})

	it('Cancel transitions status + emits PurchaseOrderCancelledEvent', async () => {
		const id = await seed()
		await cancel.execute({ userId: USER, storeId: STORE, purchaseOrderId: id })

		const saved = await repo.findById(id)
		expect(saved?.status).toBe('CANCELLED')

		const emitted = await eventRepo().findByType(PurchaseOrderCancelledEvent)
		expect(emitted).toHaveLength(1)
	})

	it('Cancel throws PURCHASE_ORDER_NOT_FOUND for unknown id', async () => {
		await expect(
			cancel.execute({ userId: USER, storeId: STORE, purchaseOrderId: testId('po', 'missing') }),
		).rejects.toMatchObject({ name: 'PURCHASE_ORDER_NOT_FOUND' })
	})

	it('Cancel twice throws PURCHASE_ORDER_ALREADY_CANCELLED', async () => {
		const id = await seed()
		await cancel.execute({ userId: USER, storeId: STORE, purchaseOrderId: id })
		await expect(
			cancel.execute({ userId: USER, storeId: STORE, purchaseOrderId: id }),
		).rejects.toMatchObject({ name: 'PURCHASE_ORDER_ALREADY_CANCELLED' })
	})
})
