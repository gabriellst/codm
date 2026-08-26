import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CLOUD_DEVICE_TOKEN_SECRET_KEY, Container, ServicesProvider } from '@/services'
import { AnalyticsToken, SecretsToken } from '@/services/tokens'
import testBindings, { type FakeAnalyticsService, type FakeSecretsService } from '@/services/registry/test'
import { useCloudSessionStore } from '@/stores'
import { fetchStub } from '../../../../tests/support/fetchStub'
import { useAnalyticsIdentity } from './useAnalyticsIdentity'

/**
 * AC-3 — "identify(userId) dispara pós-login". Same wiring-proof shape as `useLoopbackAuth.test.tsx`:
 * mount the REAL hook against a REAL Container (test bindings), drive the status transition the way
 * `useLoopbackAuth`/`CloudSessionGate` would, and assert what actually reached the fetch boundary
 * AND the fake PostHog service — not a spy on the hook's own internals.
 */

const TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
const USER_ID = '019e4d24-6524-7041-9e1c-8108180cddae'

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** ky hands `fetch` a `Request` instance, not a bare string — `.toString()` on one gives
 *  "[object Request]", so the URL has to come off `.url` (same helper as useLoopbackAuth.test.tsx). */
function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === 'string') return input
	if (input instanceof Request) return input.url
	return input.toString()
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

describe('useAnalyticsIdentity', () => {
	let root: Root | null = null
	let host: HTMLElement | null = null
	let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>
	let container: Container
	let secrets: FakeSecretsService
	let analytics: FakeAnalyticsService

	beforeEach(() => {
		useCloudSessionStore.setState({ status: 'checking' })
		container = new Container()
		container.load(testBindings)
		secrets = container.resolve(SecretsToken) as FakeSecretsService
		analytics = container.resolve(AnalyticsToken) as FakeAnalyticsService
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
		useAnalyticsIdentity()
		return null
	}

	async function mount(): Promise<void> {
		host = document.createElement('div')
		document.body.appendChild(host)
		root = createRoot(host)
		act(() => {
			root!.render(
				<ServicesProvider container={container}>
					<Probe />
				</ServicesProvider>,
			)
		})
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 0))
		})
	}

	it('AC-3: an authenticated status resolves the SESSION and identifies the userId', async () => {
		await secrets.set(CLOUD_DEVICE_TOKEN_SECRET_KEY, TOKEN)
		fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
			fetchStub(async input => {
				const url = requestUrl(input)
				// `/session`, e não mais `/cloud/entitlement`: a rota de entitlement foi removida
				// porque respondia `{ active: true, plan: 'free', userId }` — uma constante mais o
				// `userId` que a própria sessão já traz. Uma pergunta, uma porta.
				if (url.includes('/session'))
					return jsonResponse({
						user: { id: USER_ID, email: 'operator@example.test', name: 'Operator', emailVerified: true },
						session: { id: 'session-1', userId: USER_ID, expiresAt: '2999-12-31T00:00:00.000Z', ownerId: null },
					})
				throw new Error(`unexpected fetch: ${url}`)
			}),
		)
		await mount()

		act(() => useCloudSessionStore.getState().setAuthenticated())
		await waitFor(() => analytics.identified.length > 0)

		expect(analytics.identified).toEqual([{ userId: USER_ID, properties: undefined }])

		// The session lookup carried the STORED session token as a Bearer header, not a hardcoded
		// or missing one — proves the hook reads the SAME keychain key `useLoopbackAuth` writes.
		const call = fetchSpy.mock.calls.find(([input]) => requestUrl(input).includes('/session'))
		expect(call).toBeDefined()
		const request = call![0] as Request
		expect(request.headers.get('authorization')).toBe(`Bearer ${TOKEN}`)
	})

	it('an unauthenticated status resets the identified person', async () => {
		await mount()
		act(() => useCloudSessionStore.getState().setUnauthenticated())
		expect(analytics.resets).toBe(1)
	})

	it('a failed entitlement lookup is tolerated — best effort, never throws', async () => {
		await secrets.set(CLOUD_DEVICE_TOKEN_SECRET_KEY, TOKEN)
		fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(fetchStub(async () => jsonResponse({ code: 'DEVICE_TOKEN_INVALID' }, 401)))
		const restoreWarn = console.warn
		console.warn = () => undefined
		await mount()

		act(() => useCloudSessionStore.getState().setAuthenticated())
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 50))
		})
		console.warn = restoreWarn

		expect(analytics.identified.length).toBe(0)
	})
})
