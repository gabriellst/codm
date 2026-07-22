// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-order-detail-read
// task:        synthetic-order-detail-read
// stamp:       agent-wave1-38ff876
// docTreeHash: c7182ff522b7
// model:       default
// graded:      2026-07-21T18:31:33.664Z
// source:      packages/api/typescript/src/ui/usecases/GetOrder.test.ts (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { testId } from '@test/support'
import { givenOrder } from '@test/support/given'
import { OrderStatus, CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { GetOrder } from './GetOrder'

describe('GetOrder', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let query: GetOrder

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		query = testBed.resolve(GetOrder)
	})
	beforeEach(async () => { await testBed.reset() })
	afterAll(async () => { await testBed.destroy() })

	it('returns the order detail DTO for an order owned by the caller', async () => {
		const order = await givenOrder(testBed, { status: OrderStatus.PAID, totalCents: 4990, currency: CurrencyCode.BRL })

		const result = await query.execute({ ownerId: testBed.ownerId, orderId: order.id })

		expect(result).toEqual({
			id: order.id,
			status: OrderStatus.PAID,
			totalCents: 4990,
			currency: CurrencyCode.BRL,
			createdAt: order.createdAt,
		})
	})

	it('signals ORDER_NOT_FOUND when the id does not exist', async () => {
		await expect(query.execute({ ownerId: testBed.ownerId, orderId: testId() })).rejects.toMatchObject({ name: 'ORDER_NOT_FOUND' })
	})

	it("signals ORDER_NOT_FOUND for another owner's order — no cross-tenant existence leak", async () => {
		const foreign = await givenOrder(testBed, { ownerId: testId() })

		await expect(query.execute({ ownerId: testBed.ownerId, orderId: foreign.id })).rejects.toMatchObject({ name: 'ORDER_NOT_FOUND' })
	})
})
