import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Container, ServicesProvider } from '@/services'
import { CloudSessionToken, SecretsToken } from '@/services/tokens'
import testBindings, { FakeCloudSessionService, FakeSecretsService } from '@/services/registry/test'
import { useCloudSessionStore } from '@/stores'
import { useDeepLinkAuth } from './useDeepLinkAuth'

/**
 * AC-3 — THE DEEP LINK DESTRAVA O CONSOLE SEM RESTART.
 *
 * Same wiring-proof shape as `useThreadRealtime.test.tsx`/`SupervisionGate.test.tsx`: mount the
 * REAL hook against a REAL Container (test bindings), drive the arrival the host would
 * (`FakeCloudSessionService.emit`, the deep-link analogue of `FakeSupervisionService.emit`), and
 * assert what actually happened at the network boundary (`fetch`) and in the stores — not a spy on
 * the hook's own internals, which would keep passing even if the wiring quietly broke.
 *
 * Both calls the hook makes — `useExchangeDeviceCode` AND (post-T7) the generated `setCloudToken`
 * — are asserted at THIS boundary rather than by stubbing the SDK functions themselves: a stub on
 * the function would keep passing even if the hook stopped calling it correctly (wrong body, wrong
 * baseURL), exactly the regression `ProvidersSection.test.tsx`'s own doc comment calls out ("um
 * teste que dublasse o hook continuaria verde com o [argumento] perdido no caminho").
 */

const CODE = '019e4d24-6524-7041-9e1c-8108180cddae'
const TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** ky (the exchange call) hands `fetch` a `Request` instance, not a bare string — `.toString()` on
 *  one gives `"[object Request]"`, so the URL has to come off `.url`. Routes the two calls the hook
 *  can make (exchange on the cloud, best-effort push to the local daemon) by URL — everything else
 *  is unexpected and fails loud. */
function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === 'string') return input
	if (input instanceof Request) return input.url
	return input.toString()
}

function mockFetch(onExchange: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>) {
	return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = requestUrl(input)
		if (url.includes('/v1/cloud/devices/exchange')) return onExchange(input, init)
		if (url.includes('/v1/session/cloud-token')) return jsonResponse({})
		throw new Error(`unexpected fetch: ${url}`)
	}
}

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
	const start = Date.now()
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 5))
		})
	}
}

describe('useDeepLinkAuth', () => {
	let root: Root | null = null
	let host: HTMLElement | null = null
	let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>
	let container: Container
	let cloudSession: FakeCloudSessionService
	let secrets: FakeSecretsService

	beforeEach(() => {
		useCloudSessionStore.setState({ status: 'checking' })
		container = new Container()
		container.load(testBindings)
		cloudSession = container.resolve(CloudSessionToken) as FakeCloudSessionService
		secrets = container.resolve(SecretsToken) as FakeSecretsService
	})

	afterEach(async () => {
		await act(async () => {
			root?.unmount()
			await new Promise(resolve => setTimeout(resolve, 10))
		})
		root = null
		host = null
		fetchSpy?.mockRestore()
	})

	function Probe() {
		useDeepLinkAuth()
		return null
	}

	/**
	 * `CloudSessionService.onAuthCallback` is `Promise<() => void>` (same shape as
	 * `SupervisionService.subscribe`) — even the fake's synchronous-bodied implementation resolves
	 * via a microtask, one tick after the synchronous `act()` this render runs inside returns. Emitting
	 * before that microtask drains would fire into an empty listener set, so `mount` settles it before
	 * handing control back — the async analogue of `SupervisionGate.test.tsx`'s multi-pass `settle()`.
	 */
	async function mount(): Promise<void> {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
		host = document.createElement('div')
		document.body.appendChild(host)
		root = createRoot(host)
		act(() => {
			root!.render(
				<QueryClientProvider client={queryClient}>
					<ServicesProvider container={container}>
						<Probe />
					</ServicesProvider>
				</QueryClientProvider>,
			)
		})
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 0))
		})
	}

	it('AC-3: an arriving deep link exchanges the code, keys the keychain, pushes to the daemon, and unlocks the store', async () => {
		fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(mockFetch(() => jsonResponse({ token: TOKEN })))
		await mount()

		act(() => cloudSession.emit(`codm://auth?code=${CODE}`))
		await waitFor(() => useCloudSessionStore.getState().status === 'authenticated')

		expect(await secrets.get('codm.cloud.deviceToken')).toBe(TOKEN)

		const urls = fetchSpy.mock.calls.map(([input]) => requestUrl(input))
		expect(urls.some(u => u.includes('/v1/cloud/devices/exchange'))).toBe(true)

		// The generated `setCloudToken` (Task T7) actually reached the wire with the exchanged token
		// as its body — proves pushToDaemon calls the REAL SDK function with the REAL shape, not just
		// that some POST landed on the right path.
		const pushCall = fetchSpy.mock.calls.find(([input]) => requestUrl(input).includes('/v1/session/cloud-token'))
		expect(pushCall).toBeDefined()
		const pushRequest = pushCall![0] as Request
		expect(await pushRequest.clone().json()).toEqual({ token: TOKEN })
	})

	it('a deep link with no `code` query param is ignored — no exchange, no store change', async () => {
		fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(mockFetch(() => jsonResponse({ token: TOKEN })))
		await mount()

		act(() => cloudSession.emit('codm://auth'))
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 20))
		})

		expect(fetchSpy).not.toHaveBeenCalled()
		expect(useCloudSessionStore.getState().status).toBe('checking')
	})

	it('an invalid/reused code (exchange fails) leaves the console locked, not crashed', async () => {
		fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(mockFetch(() => jsonResponse({ code: 'DEVICE_CODE_INVALID' }, 400)))
		await mount()

		act(() => cloudSession.emit(`codm://auth?code=${CODE}`))
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 50))
		})

		expect(useCloudSessionStore.getState().status).toBe('checking')
		expect(await secrets.get('codm.cloud.deviceToken')).toBeNull()
	})

	it('unmounting stops the subscription — a deep link after teardown exchanges nothing', async () => {
		fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(mockFetch(() => jsonResponse({ token: TOKEN })))
		await mount()
		await act(async () => {
			root?.unmount()
			await new Promise(resolve => setTimeout(resolve, 10))
		})
		root = null

		cloudSession.emit(`codm://auth?code=${CODE}`)
		await new Promise(resolve => setTimeout(resolve, 20))

		expect(fetchSpy).not.toHaveBeenCalled()
	})
})
