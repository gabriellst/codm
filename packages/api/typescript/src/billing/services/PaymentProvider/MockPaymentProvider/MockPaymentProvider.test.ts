import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { PaymentProvider } from '../PaymentProvider'
import { MockPaymentProvider } from './MockPaymentProvider'

describe('MockPaymentProvider', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'o1' })
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	it('stored-credential CIT charge + cancelCharge are recorded; MIT carries the code', async () => {
		const p = testBed.resolve(PaymentProvider) as MockPaymentProvider

		const cit = await p.chargeStoredOnSession({
			pmRef: 'card_1',
			ownerId: 'o1',
			amountCents: 29900,
			engineInvoiceId: 'lago_inv_1',
			idemKey: 'k1',
		})
		expect(cit.ok).toBe(true)

		await p.chargeOffSession({ pmRef: 'card_1', amountCents: 29900, idemKey: 'lago_inv_2', code: 'lago_inv_2' })
		expect(p.offSessionCharges.at(-1)?.code).toBe('lago_inv_2')

		await p.cancelCharge({ gatewayTxId: 'gw_1', idemKey: 'cancel:gw_1' })
		expect(p.canceledCharges).toContainEqual(expect.objectContaining({ gatewayTxId: 'gw_1' }))
	})

	it('cancel/pix each carry the idemKey passed by the caller', async () => {
		const p = testBed.resolve(PaymentProvider) as MockPaymentProvider

		await p.cancelCharge({ gatewayTxId: 'gw_2', idemKey: 'cancel:gw_2' })
		expect(p.canceledCharges.at(-1)?.idemKey).toBe('cancel:gw_2')

		await p.createPix({ externalReference: 'lago_inv_3', amountCents: 1000, idemKey: 'pix:lago_inv_3' })
		expect(p.pixCalls.at(-1)?.idemKey).toBe('pix:lago_inv_3')
	})

	it('a declined charge preserves the gateway reason instead of collapsing to a bare ok:false', async () => {
		const p = testBed.resolve(PaymentProvider) as MockPaymentProvider

		p.declineNextCharge('insufficient_funds')
		const result = await p.chargeStoredOnSession({
			pmRef: 'card_declined',
			ownerId: 'o1',
			amountCents: 5000,
			engineInvoiceId: 'lago_inv_4',
			idemKey: 'k4',
		})

		expect(result.ok).toBe(false)
		expect(result.ok === false && result.reason).toBe('insufficient_funds')
	})
})
