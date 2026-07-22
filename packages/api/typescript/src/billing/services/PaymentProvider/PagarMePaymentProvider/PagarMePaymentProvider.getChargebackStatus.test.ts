import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { MockLoggingService } from '@template/core-typescript'
import { PagarMePaymentProvider } from './PagarMePaymentProvider'

// Same fetch-stub idiom as PagarMePaymentProvider.getRefundStatus.test.ts — carry `preconnect` over
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

describe('PagarMePaymentProvider.getChargebackStatus', () => {
	afterEach(() => {
		spyOn(globalThis, 'fetch').mockRestore()
	})

	it('order-authoritative: a charge row status of chargedback counts even when the order itself is paid (AC-6)', async () => {
		const { provider } = providerReturning({
			id: 'or_1',
			status: 'paid',
			charges: [
				{ id: 'ch_1', status: 'paid' },
				{ id: 'ch_2', status: 'chargedback' },
			],
		})

		const result = await provider.getChargebackStatus('or_1')

		expect(result).toEqual({ chargedBack: true })
	})

	it('single-charge GET (flat) with status chargedback → true', async () => {
		const { provider } = providerReturning({ id: 'ch_1', status: 'chargedback' })

		const result = await provider.getChargebackStatus('ch_1')

		expect(result).toEqual({ chargedBack: true })
	})

	it('order status itself chargedback (no charges[]) → true', async () => {
		const { provider } = providerReturning({ id: 'or_1', status: 'chargedback' })

		const result = await provider.getChargebackStatus('or_1')

		expect(result).toEqual({ chargedBack: true })
	})

	it('paid charge, no dispute → false', async () => {
		const { provider } = providerReturning({ id: 'ch_1', status: 'paid' })

		const result = await provider.getChargebackStatus('ch_1')

		expect(result).toEqual({ chargedBack: false })
	})

	it('routes GET by prefix, same as getRefundStatus/getChargeStatus: ch_… → /charges/{id}', async () => {
		const { provider, calls } = providerReturning({ id: 'ch_1', status: 'paid', charges: [] })

		await provider.getChargebackStatus('ch_1')

		expect(calls.at(-1)?.url).toBe('https://api.pagar.me/core/v5/charges/ch_1')
		expect(calls.at(-1)?.init?.method).toBe('GET')
	})
})
