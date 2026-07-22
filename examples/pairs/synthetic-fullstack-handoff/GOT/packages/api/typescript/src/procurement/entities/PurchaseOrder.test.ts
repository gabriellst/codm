import { describe, it, expect } from 'bun:test'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { PurchaseOrder } from './PurchaseOrder'

const seed = () =>
	PurchaseOrder.create({
		storeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
		supplierName: 'Acme Supplies',
		totalAmount: { amountCents: 50_000, currency: CurrencyCode.BRL },
	})

describe('PurchaseOrder', () => {
	describe('create', () => {
		it('creates a PLACED order with the given fields', () => {
			const po = seed()
			expect(po.status).toBe('PLACED')
			expect(po.supplierName).toBe('Acme Supplies')
			expect(po.totalAmount.amountCents).toBe(50_000)
		})
	})

	describe('cancel', () => {
		it('sets status to CANCELLED', () => {
			const po = seed()
			po.cancel()
			expect(po.status).toBe('CANCELLED')
			expect(po.isCancelled).toBe(true)
		})

		it('throws PURCHASE_ORDER_ALREADY_CANCELLED when cancelling a cancelled order', () => {
			const po = seed()
			po.cancel()
			expect(() => po.cancel()).toThrow(expect.objectContaining({ name: 'PURCHASE_ORDER_ALREADY_CANCELLED' }))
		})
	})
})
