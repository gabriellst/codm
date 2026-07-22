import { describe, it, expect } from 'bun:test'
import { CheckoutSession } from './CheckoutSession'
import { BillingPlatform, CheckoutIntent, CheckoutSessionStatus } from '@template/contracts-typescript/wire/enums'

describe('CheckoutSession', () => {
	const make = (overrides?: Partial<Parameters<typeof CheckoutSession.create>[0]>) =>
		CheckoutSession.create({
			sessionRef: 'cs_test_123',
			ownerId: 'owner-1',
			platform: BillingPlatform.STRIPE,
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv-1',
			...overrides,
		})

	it('is minted PENDING', () => {
		const session = make()
		expect(session.status).toBe(CheckoutSessionStatus.PENDING)
		expect(session.sessionRef).toBe('cs_test_123')
		expect(session.engineInvoiceId?.value).toBe('inv-1')
	})

	it('allows a SETUP-intent session with no engineInvoiceId', () => {
		const session = make({ intent: CheckoutIntent.SETUP, engineInvoiceId: undefined })
		expect(session.intent).toBe(CheckoutIntent.SETUP)
		expect(session.engineInvoiceId).toBeUndefined()
	})

	it('defaults mintedAt to now when not provided', () => {
		const before = new Date()
		const session = make()
		const after = new Date()
		expect(session.mintedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
		expect(session.mintedAt.getTime()).toBeLessThanOrEqual(after.getTime())
	})

	describe('complete()', () => {
		it('moves PENDING -> COMPLETED', () => {
			const session = make()
			session.complete()
			expect(session.status).toBe(CheckoutSessionStatus.COMPLETED)
		})

		it('throws when already COMPLETED (absorbing)', () => {
			const session = make()
			session.complete()
			expect(() => session.complete()).toThrow()
		})

		it('throws when already EXPIRED (absorbing)', () => {
			const session = make()
			session.expire()
			expect(() => session.complete()).toThrow()
		})
	})

	describe('expire()', () => {
		it('moves PENDING -> EXPIRED', () => {
			const session = make()
			session.expire()
			expect(session.status).toBe(CheckoutSessionStatus.EXPIRED)
		})

		it('throws when already EXPIRED (absorbing)', () => {
			const session = make()
			session.expire()
			expect(() => session.expire()).toThrow()
		})

		it('throws when already COMPLETED (absorbing)', () => {
			const session = make()
			session.complete()
			expect(() => session.expire()).toThrow()
		})
	})

	it('rejects an empty sessionRef', () => {
		expect(() => make({ sessionRef: '' })).toThrow()
	})
})
