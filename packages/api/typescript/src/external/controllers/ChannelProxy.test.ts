import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { BaseError, Config, GlobalErrorMapper, HttpStatusCode } from '@codm/core-typescript'
// Side-effect import: registers GATEWAY_UNAVAILABLE → 502 in the GlobalErrorMapper (the
// controller itself only `import type`s the error union, which does not run the registration).
import '../errors'
import { ChannelProxy } from './ChannelProxy'

const OWNER_ID = '00000000-0000-4000-8000-000000000001'

/**
 * Pairing smoke, fast-suite edition: the browser-facing proxy hop must surface a dead Go gateway
 * as the typed GATEWAY_UNAVAILABLE (502) — never a raw fetch error / 500 soup. The e2e stack
 * exercises this same path implicitly (gateway absent → conn-refused); this colocated test pins
 * the error contract without booting Playwright.
 */
describe('ChannelProxy — gateway unreachable', () => {
	// TCP port 9 (discard) is unassigned on dev/CI hosts — connecting refuses immediately.
	const DEAD_GATEWAY_URL = 'http://127.0.0.1:9'
	let originalApiGoUrl: string

	beforeAll(() => {
		originalApiGoUrl = Config.env.API_GO_URL
		;(Config.env as { API_GO_URL: string }).API_GO_URL = DEAD_GATEWAY_URL
	})

	afterAll(() => {
		;(Config.env as { API_GO_URL: string }).API_GO_URL = originalApiGoUrl
	})

	const proxyRequest = (init?: RequestInit) =>
		({
			ctx: { ownerId: OWNER_ID },
			raw: new Request('http://localhost:3030/v1/external/channel/channel/channels/resolve', init),
		}) as unknown as ChannelProxy['input']

	it('a dead gateway (connection refused) surfaces as GATEWAY_UNAVAILABLE', async () => {
		const proxy = new ChannelProxy()
		try {
			await proxy.handle(proxyRequest())
			throw new Error('expected handle() to reject')
		} catch (error) {
			expect(error).toBeInstanceOf(BaseError)
			expect((error as BaseError<string>).name).toBe('GATEWAY_UNAVAILABLE')
		}
	})

	it('GATEWAY_UNAVAILABLE is mapped to 502 Bad Gateway', () => {
		expect(GlobalErrorMapper.GATEWAY_UNAVAILABLE).toBe(HttpStatusCode.BAD_GATEWAY)
	})

	it('a client-initiated abort is rethrown untouched (not a gateway failure)', async () => {
		const proxy = new ChannelProxy()
		const aborted = AbortSignal.abort()
		try {
			await proxy.handle(proxyRequest({ signal: aborted }))
			throw new Error('expected handle() to reject')
		} catch (error) {
			expect(error).toBeInstanceOf(DOMException)
			expect((error as DOMException).name).toBe('AbortError')
		}
	})
})
