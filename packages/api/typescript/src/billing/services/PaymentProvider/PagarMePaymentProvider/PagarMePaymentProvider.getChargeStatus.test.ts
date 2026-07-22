import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { MockLoggingService } from '@template/core-typescript'
import { PagarMePaymentProvider } from './PagarMePaymentProvider'

// Same fetch-stub idiom as PagarMePaymentProvider.charge.test.ts — carry `preconnect` over so the
// stub is assignable to the FULL `typeof fetch`, capture the last call so routing can be asserted.
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
): { provider: PagarMePaymentProvider; calls: { url: string; init?: RequestInit }[]; loggingService: MockLoggingService } {
	const calls: { url: string; init?: RequestInit }[] = []
	spyOn(globalThis, 'fetch').mockImplementation(
		fetchStub((url, init) => {
			calls.push({ url, init })
			return new Response(JSON.stringify(response), { status })
		}),
	)
	const loggingService = new MockLoggingService()
	return { provider: new PagarMePaymentProvider(loggingService), calls, loggingService }
}

describe('PagarMePaymentProvider.getChargeStatus', () => {
	afterEach(() => {
		spyOn(globalThis, 'fetch').mockRestore()
	})

	it('order-authoritative: canceled order with a lagging pending charge → failed', async () => {
		const { provider } = providerReturning({ id: 'or_1', status: 'canceled', charges: [{ id: 'ch_1', status: 'pending' }] })

		const result = await provider.getChargeStatus('or_1')

		expect(result).toBe('failed')
	})

	it('any captured charge wins → settled ([failed, paid] order-level failed with a paid charge)', async () => {
		const { provider } = providerReturning({
			id: 'or_1',
			status: 'failed',
			charges: [
				{ id: 'ch_1', status: 'failed' },
				{ id: 'ch_2', status: 'paid' },
			],
		})

		const result = await provider.getChargeStatus('or_1')

		expect(result).toBe('settled')
	})

	it('any captured charge wins → settled ([paid, failed] — array position never decides money)', async () => {
		const { provider } = providerReturning({
			id: 'or_1',
			status: 'failed',
			charges: [
				{ id: 'ch_1', status: 'paid' },
				{ id: 'ch_2', status: 'failed' },
			],
		})

		const result = await provider.getChargeStatus('or_1')

		expect(result).toBe('settled')
	})

	it('processing → pending', async () => {
		const { provider } = providerReturning({ id: 'or_1', status: 'processing', charges: [{ id: 'ch_1', status: 'processing' }] })

		const result = await provider.getChargeStatus('or_1')

		expect(result).toBe('pending')
	})

	it('unknown status → pending (+ warn)', async () => {
		const { provider, loggingService } = providerReturning({ id: 'or_1', status: 'some_new_gateway_status', charges: [] })

		const result = await provider.getChargeStatus('or_1')

		expect(result).toBe('pending')
		expect(loggingService.getLogsByLevel('warn')).toHaveLength(1)
	})

	it('routes GET by prefix: or_… → /orders/{id}', async () => {
		const { provider, calls } = providerReturning({ id: 'or_1', status: 'paid', charges: [{ id: 'ch_1', status: 'paid' }] })

		await provider.getChargeStatus('or_1')

		expect(calls.at(-1)?.url).toBe('https://api.pagar.me/core/v5/orders/or_1')
		expect(calls.at(-1)?.init?.method).toBe('GET')
	})

	it('routes GET by prefix: ch_… → /charges/{id}', async () => {
		const { provider, calls } = providerReturning({ id: 'ch_1', status: 'paid', charges: [{ id: 'ch_1', status: 'paid' }] })

		await provider.getChargeStatus('ch_1')

		expect(calls.at(-1)?.url).toBe('https://api.pagar.me/core/v5/charges/ch_1')
		expect(calls.at(-1)?.init?.method).toBe('GET')
	})
})
