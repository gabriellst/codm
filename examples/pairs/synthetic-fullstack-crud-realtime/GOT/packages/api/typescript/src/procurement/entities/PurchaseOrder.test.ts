import { describe, it, expect } from 'bun:test'
import { CurrencyCode } from '@codedm/contracts-typescript/wire/enums'
import { PurchaseOrder } from './PurchaseOrder'

const base = {
	storeId: '00000000-0000-0000-0000-000000000001',
	supplierName: 'Supplier ACME',
	totalAmount: { amountCents: 10000, currency: CurrencyCode.BRL },
}

describe('PurchaseOrder', () => {
	it('creates with DRAFT status', () => {
		const po = PurchaseOrder.create(base)
		expect(po.status).toBe('DRAFT')
	})

	it('cancel() sets CANCELLED', () => {
		const po = PurchaseOrder.create(base)
		po.cancel()
		expect(po.status).toBe('CANCELLED')
	})

	it('cancel() twice throws PURCHASE_ORDER_ALREADY_CANCELLED', () => {
		const po = PurchaseOrder.create(base)
		po.cancel()
		expect(() => po.cancel()).toThrow(expect.objectContaining({ name: 'PURCHASE_ORDER_ALREADY_CANCELLED' }))
	})

	it('place() on CANCELLED throws PURCHASE_ORDER_ALREADY_CANCELLED', () => {
		const po = PurchaseOrder.create(base)
		po.cancel()
		expect(() => po.place()).toThrow(expect.objectContaining({ name: 'PURCHASE_ORDER_ALREADY_CANCELLED' }))
	})
})
