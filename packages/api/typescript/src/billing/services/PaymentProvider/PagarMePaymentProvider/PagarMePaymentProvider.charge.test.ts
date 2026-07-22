import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { MockLoggingService } from '@template/core-typescript'
import { PagarMePaymentProvider } from './PagarMePaymentProvider'

// Same fetch-stub idiom as PagarMePaymentProvider.checkout.test.ts — carry `preconnect` over so the
// stub is assignable to the FULL `typeof fetch`, capture the last call.
const fetchStub = (handler: (url: string, init?: RequestInit) => Promise<Response> | Response): typeof fetch => {
	const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
		return handler(url, init)
	}
	impl.preconnect = globalThis.fetch.preconnect
	return impl
}

function providerReturning(response: unknown, status = 200) {
	spyOn(globalThis, 'fetch').mockImplementation(fetchStub(() => new Response(JSON.stringify(response), { status })))
	return new PagarMePaymentProvider(new MockLoggingService())
}

const chargeParams = {
	pmRef: 'card_1',
	ownerId: 'owner-1',
	amountCents: 29900,
	engineInvoiceId: 'native:owner-1:1',
	idemKey: 'native:owner-1:1:0',
}

describe('PagarMePaymentProvider — charge result mapping (settlement matrix)', () => {
	afterEach(() => {
		spyOn(globalThis, 'fetch').mockRestore()
	})

	it("maps a 'processing' order to { ok:true, pending:true } — accepted, settlement async (never a premature SUCCEEDED)", async () => {
		const provider = providerReturning({ id: 'or_1', status: 'processing', charges: [{ id: 'ch_1', status: 'processing' }] })

		const result = await provider.chargeStoredOnSession(chargeParams)

		expect(result).toEqual({ ok: true, gatewayTxId: 'ch_1', pending: true })
	})

	it("maps a 'pending' order to { ok:true, pending:true }", async () => {
		const provider = providerReturning({ id: 'or_1', status: 'pending', charges: [{ id: 'ch_1', status: 'pending' }] })

		const result = await provider.chargeOffSession({ pmRef: 'card_1', amountCents: 29900, idemKey: 'k:1', code: 'native:owner-1:1' })

		expect(result).toEqual({ ok: true, gatewayTxId: 'ch_1', pending: true })
	})

	it("maps a settled 'paid' order to { ok:true } with NO pending flag (synchronous capture)", async () => {
		const provider = providerReturning({ id: 'or_1', status: 'paid', charges: [{ id: 'ch_1', status: 'paid' }] })

		const result = await provider.chargeStoredOnSession(chargeParams)

		expect(result).toEqual({ ok: true, gatewayTxId: 'ch_1' })
		expect('pending' in result && result.pending).toBeFalsy()
	})

	it("keeps mapping a 'failed' order to ok:false (decline mapping unchanged)", async () => {
		const provider = providerReturning({
			id: 'or_1',
			status: 'failed',
			charges: [{ id: 'ch_1', status: 'failed', last_transaction: { status: 'not_authorized', acquirer_message: 'saldo insuficiente' } }],
		})

		const result = await provider.chargeStoredOnSession(chargeParams)

		expect(result.ok).toBe(false)
	})
})
