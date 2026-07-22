import { describe, it, expect } from 'bun:test'
import { Charge } from './Charge'
import { BillingPlatform, ChargeStatus, DeclineReason, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

const make = () =>
	Charge.create({
		ownerId: 'o1',
		invoiceId: 'inv1',
		platform: BillingPlatform.STRIPE,
		method: PaymentMethodType.CARD,
		amountCents: 500,
		attemptNo: 0,
	})

describe('Charge.markFailed(declineCode)', () => {
	it('records the declineCode when failing', () => {
		const c = make()
		c.markFailed(DeclineReason.INSUFFICIENT_FUNDS)
		expect(c.status).toBe(ChargeStatus.FAILED)
		expect(c.declineCode).toBe(DeclineReason.INSUFFICIENT_FUNDS)
	})

	it('markFailed without a code leaves declineCode undefined (unclassified synchronous failure)', () => {
		const c = make()
		c.markFailed()
		expect(c.declineCode).toBeUndefined()
	})
})

describe('Charge — absorbing terminal states (loop-freedom)', () => {
	it('is created PENDING and moves PENDING → SUCCEEDED exactly once', () => {
		const c = make()
		expect(c.status).toBe(ChargeStatus.PENDING)
		c.markSucceeded('tx_1')
		expect(c.status).toBe(ChargeStatus.SUCCEEDED)
		expect(c.gatewayTxId).toBe('tx_1')
	})

	it('SUCCEEDED never leaves — re-marking throws INVALID_CHARGE_TRANSITION', () => {
		const c = make()
		c.markSucceeded('tx_1')
		expect(() => c.markFailed()).toThrow(expect.objectContaining({ name: 'INVALID_CHARGE_TRANSITION' }))
		expect(() => c.markSucceeded('tx_2')).toThrow(expect.objectContaining({ name: 'INVALID_CHARGE_TRANSITION' }))
		expect(c.status).toBe(ChargeStatus.SUCCEEDED)
	})

	it('FAILED never leaves — re-marking throws INVALID_CHARGE_TRANSITION', () => {
		const c = make()
		c.markFailed(DeclineReason.CARD_DECLINED)
		expect(() => c.markSucceeded('tx_1')).toThrow(expect.objectContaining({ name: 'INVALID_CHARGE_TRANSITION' }))
		expect(() => c.markFailed()).toThrow(expect.objectContaining({ name: 'INVALID_CHARGE_TRANSITION' }))
		expect(c.status).toBe(ChargeStatus.FAILED)
	})
})
