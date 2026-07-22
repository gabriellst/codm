import { describe, it, expect } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { Dispute } from './Dispute'
import { BillingPlatform, DisputeStatus } from '@template/contracts-typescript/wire/enums'

describe('Dispute', () => {
	const make = (overrides?: Partial<Parameters<typeof Dispute.create>[0]>) =>
		Dispute.create({
			gatewayDisputeRef: 'dp_test_123',
			platform: BillingPlatform.STRIPE,
			ownerId: 'owner-1',
			gatewayTxId: 'ch_test_123',
			invoiceId: 'inv-1',
			amountCents: 1000,
			...overrides,
		})

	it('is opened OPEN', () => {
		const dispute = make()
		expect(dispute.status).toBe(DisputeStatus.OPEN)
		expect(dispute.gatewayDisputeRef).toBe('dp_test_123')
		expect(dispute.invoiceId.value).toBe('inv-1')
		expect(dispute.closedAt).toBeUndefined()
	})

	it('defaults openedAt to now when not provided', () => {
		const before = new Date()
		const dispute = make()
		const after = new Date()
		expect(dispute.openedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
		expect(dispute.openedAt.getTime()).toBeLessThanOrEqual(after.getTime())
	})

	describe('won()', () => {
		it('moves OPEN -> WON and sets closedAt', () => {
			const dispute = make()
			dispute.won()
			expect(dispute.status).toBe(DisputeStatus.WON)
			expect(dispute.closedAt).toBeInstanceOf(Date)
		})

		it('throws INVALID_DISPUTE_TRANSITION when already WON (absorbing)', () => {
			const dispute = make()
			dispute.won()
			expect.assertions(2)
			try {
				dispute.won()
			} catch (error) {
				expect(error).toBeInstanceOf(BaseError)
				expect((error as BaseError).name).toBe('INVALID_DISPUTE_TRANSITION')
			}
		})

		it('throws INVALID_DISPUTE_TRANSITION when already LOST (absorbing)', () => {
			const dispute = make()
			dispute.lose()
			expect.assertions(2)
			try {
				dispute.won()
			} catch (error) {
				expect(error).toBeInstanceOf(BaseError)
				expect((error as BaseError).name).toBe('INVALID_DISPUTE_TRANSITION')
			}
		})
	})

	describe('lose()', () => {
		it('moves OPEN -> LOST and sets closedAt', () => {
			const dispute = make()
			dispute.lose()
			expect(dispute.status).toBe(DisputeStatus.LOST)
			expect(dispute.closedAt).toBeInstanceOf(Date)
		})

		it('throws INVALID_DISPUTE_TRANSITION when already LOST (absorbing)', () => {
			const dispute = make()
			dispute.lose()
			expect.assertions(2)
			try {
				dispute.lose()
			} catch (error) {
				expect(error).toBeInstanceOf(BaseError)
				expect((error as BaseError).name).toBe('INVALID_DISPUTE_TRANSITION')
			}
		})

		it('throws INVALID_DISPUTE_TRANSITION when already WON (absorbing)', () => {
			const dispute = make()
			dispute.won()
			expect.assertions(2)
			try {
				dispute.lose()
			} catch (error) {
				expect(error).toBeInstanceOf(BaseError)
				expect((error as BaseError).name).toBe('INVALID_DISPUTE_TRANSITION')
			}
		})
	})

	it('rejects an empty gatewayDisputeRef', () => {
		expect.assertions(2)
		try {
			make({ gatewayDisputeRef: '' })
		} catch (error) {
			expect(error).toBeInstanceOf(BaseError)
			expect((error as BaseError).message).toBe('DISPUTE_REF_REQUIRED')
		}
	})
})
