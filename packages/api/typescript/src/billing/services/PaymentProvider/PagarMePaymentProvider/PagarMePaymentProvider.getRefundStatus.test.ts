import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { MockLoggingService } from '@template/core-typescript'
import { PagarMePaymentProvider } from './PagarMePaymentProvider'

// Same fetch-stub idiom as PagarMePaymentProvider.getChargeStatus.test.ts — carry `preconnect` over
// so the stub is assignable to the FULL `typeof fetch`, capture the last call so routing can be asserted.
const fetchStub = (handler: (url: string, init?: RequestInit) => Promise<Response> | Response): typeof fetch => {
	const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
		return handler(url, init)
	}
	impl.preconnect = globalThis.fetch.preconnect
	return impl
}

function providerReturning(
	response: unknown,
	status = 200,
): { provider: PagarMePaymentProvider; calls: { url: string; init?: RequestInit }[] } {
	const calls: { url: string; init?: RequestInit }[] = []
	spyOn(globalThis, 'fetch').mockImplementation(
		fetchStub((url, init) => {
			calls.push({ url, init })
			return new Response(JSON.stringify(response), { status })
		}),
	)
	return { provider: new PagarMePaymentProvider(new MockLoggingService()), calls }
}

describe('PagarMePaymentProvider.getRefundStatus', () => {
	afterEach(() => {
		spyOn(globalThis, 'fetch').mockRestore()
	})

	it('single-charge GET (flat, canceled) → total from root canceled_amount + canonical last_transaction.id', async () => {
		const { provider } = providerReturning({
			id: 'ch_1',
			status: 'canceled',
			canceled_amount: 5000,
			last_transaction: { id: 'tran_refund_1', status: 'canceled', transaction_type: 'credit_card', amount: 5000 },
		})
		const result = await provider.getRefundStatus('ch_1')
		expect(result.refundedTotalCents).toBe(5000)
		expect(result.refunds).toEqual([{ gatewayRef: 'tran_refund_1', amountCents: 5000 }])
	})

	it('paid charge, no cancellation → zero refunded, no refunds', async () => {
		const { provider } = providerReturning({
			id: 'ch_1',
			status: 'paid',
			last_transaction: { id: 'tran_1', status: 'captured', transaction_type: 'credit_card' },
		})
		const result = await provider.getRefundStatus('ch_1')
		expect(result).toEqual({ refundedTotalCents: 0, refunds: [] })
	})

	it('order GET (or_…) sums canceled_amount across charges[]', async () => {
		const { provider } = providerReturning({
			id: 'or_1',
			charges: [
				{
					id: 'ch_1',
					status: 'canceled',
					canceled_amount: 3000,
					last_transaction: { id: 'tran_r', status: 'canceled', transaction_type: 'pix', amount: 3000 },
				},
			],
		})
		const result = await provider.getRefundStatus('or_1')
		expect(result.refundedTotalCents).toBe(3000)
		expect(result.refunds).toEqual([{ gatewayRef: 'tran_r', amountCents: 3000 }])
	})

	it('routes GET by prefix, same as getChargeStatus: ch_… → /charges/{id}', async () => {
		const { provider, calls } = providerReturning({ id: 'ch_1', status: 'paid', charges: [] })

		await provider.getRefundStatus('ch_1')

		expect(calls.at(-1)?.url).toBe('https://api.pagar.me/core/v5/charges/ch_1')
		expect(calls.at(-1)?.init?.method).toBe('GET')
	})
})
