import { configureClient } from '@codm/client-typescript/http'
import { useHealth } from '@codm/client-typescript/typescript'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { type Bindings, Container, ServicesProvider, type SupervisionService, type SupervisionState } from '@/services'
import { BrowserSupervisionService } from '@/services/SupervisionService/BrowserSupervisionService'
import testBindings, { FakeSupervisionService } from '@/services/registry/test'
import { SupervisionToken } from '@/services/tokens'
import { queriesCanRun, SupervisionGate } from './SupervisionGate'

/**
 * DOES THE REQUEST LEAVE? — counted at `fetch`, which is the only place that question has an answer.
 *
 * The founder's report: "deveria só rodar quando os sidecars estivessem prontos". Everything cheaper
 * than a fetch spy would let the bug back in — a spy on a hook proves the hook was called (it is, and
 * it should be: a paused query is a MOUNTED query), and a spy on `onlineManager` proves we made a
 * call, not that TanStack honoured it. So these cases mount the REAL generated SDK hook (`useHealth`
 * → `client/health.ts` → the ky instance) and count what reaches the network boundary.
 *
 * Every case also asserts the probe is in the DOM. Without it the suite would be vacuous in the worst
 * possible direction: a gate that never releases its children renders zero components and therefore
 * makes zero requests, which is indistinguishable from a gate that works — and would let "the whole
 * console never loads" pass as "no doomed requests".
 */

// A real absolute base URL so ky builds a real Request; the spy below is what stops it from leaving.
configureClient({ typescript: 'http://127.0.0.1:65535' })

/** Supervision that cannot answer at all — the state the port has no vocabulary for. */
class UnavailableSupervisionService implements SupervisionService {
	async current(): Promise<SupervisionState> {
		throw new Error('no host answered')
	}
	async subscribe(): Promise<() => void> {
		throw new Error('no host answered')
	}
	async restart(): Promise<void> {}
}

function containerWith(Service: new () => SupervisionService): Container {
	const container = new Container()
	container.load(testBindings)
	container.load([[SupervisionToken, Service]] as unknown as Bindings)
	return container
}

function seeded(state: SupervisionState): { container: Container; fake: FakeSupervisionService } {
	class Seeded extends FakeSupervisionService {
		constructor() {
			super(state)
		}
	}
	const container = containerWith(Seeded)
	return { container, fake: container.resolve(SupervisionToken) as FakeSupervisionService }
}

describe('SupervisionGate', () => {
	let root: Root | null = null
	let host: HTMLElement | null = null
	let client: QueryClient | null = null
	let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>

	beforeEach(() => {
		fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
			async () => new Response('{"status":"ok"}', { status: 200, headers: { 'content-type': 'application/json' } }),
		)
	})

	// Unmounting LIFTS the pause (the gate's cleanup restores the default), which resumes whatever the
	// case left paused — so teardown has to stay inside an act window long enough for that last
	// resumed request to settle, or React reports the update as unwrapped.
	afterEach(async () => {
		await act(async () => {
			root?.unmount()
			await new Promise(resolve => setTimeout(resolve, 20))
		})
		root = null
		host = null
		client = null
		fetchSpy.mockRestore()
		onlineManager.setOnline(true)
	})

	/** The real generated hook, so the assertion sits on the path the console actually uses. */
	function Probe() {
		useHealth()
		return <span data-testid="probe" />
	}

	function render(container: Container): QueryClient {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		client = queryClient
		host = document.createElement('div')
		document.body.appendChild(host)
		root = createRoot(host)
		act(() => {
			root!.render(
				<QueryClientProvider client={queryClient}>
					<ServicesProvider container={container}>
						<SupervisionGate>
							<Probe />
						</SupervisionGate>
					</ServicesProvider>
				</QueryClientProvider>,
			)
		})
		return queryClient
	}

	/**
	 * Drive one supervision event all the way to the network boundary.
	 *
	 * THREE act windows, not one, and the reason is the gate's whole point: `act` flushes the effects
	 * a state update scheduled when its callback EXITS, so the work lands one window at a time — pass 1
	 * releases the gate (`setReady`), pass 2 is where the children finally mount and their query
	 * effects run, pass 3 is where the request that started in pass 2 finishes. A single window (fixed
	 * sleep or not) leaves the last step landing outside `act`, which React reports as an unwrapped
	 * update — measured, twice, before this loop existed.
	 *
	 * Inside each window the wait is on the CLIENT, not on a clock: how many hops ky takes to build a
	 * Request and parse a body is not something a test should be betting on.
	 */
	async function settle(fire?: () => void) {
		for (let pass = 0; pass < 3; pass++) {
			await act(async () => {
				if (pass === 0) fire?.()
				for (let i = 0; i < 40; i++) {
					await new Promise(resolve => setTimeout(resolve, 5))
					if (client?.isFetching() === 0) break
				}
			})
		}
	}

	const mounted = () => host?.querySelector('[data-testid="probe"]')

	/**
	 * (d) THE CASE THE BANNER'S `current()` WAS BORN FOR, one layer down. No transition will ever be
	 * emitted to a console that opened after the fact, so a PUSH-only binding would let this operator
	 * fire the entire opening burst into a dead daemon before learning anything.
	 */
	it('mounting with the daemon ALREADY down starts paused — not one request leaves', async () => {
		const { container } = seeded({ kind: 'down', sidecar: 'daemon' })
		render(container)
		await settle()

		expect(mounted()).not.toBeNull() // the console is up …
		expect(fetchSpy).not.toHaveBeenCalled() // … and it never got to ask
		expect(onlineManager.isOnline()).toBe(false)
	})

	/** (a) The death mid-session — the half the boot gate never covered, since it ends at reveal. */
	it('the daemon dying mid-session stops the console from asking again', async () => {
		const { container, fake } = seeded({ kind: 'healthy' })
		const queryClient = render(container)
		await settle()
		expect(fetchSpy).toHaveBeenCalledTimes(1) // healthy: the console works normally

		await settle(() => fake.emit({ kind: 'down', sidecar: 'daemon' }))
		await settle(() => void queryClient.invalidateQueries())

		// Invalidation made it stale and asked for a refetch; the refetch was PAUSED, not sent.
		expect(fetchSpy).toHaveBeenCalledTimes(1)
		expect(mounted()).not.toBeNull()
	})

	/** (b) Recovery costs the operator nothing: no reload, no interaction, no remount. */
	it('recovery refetches the stale work by itself', async () => {
		const { container, fake } = seeded({ kind: 'healthy' })
		const queryClient = render(container)
		await settle()
		await settle(() => fake.emit({ kind: 'down', sidecar: 'daemon' }))
		await settle(() => void queryClient.invalidateQueries())
		expect(fetchSpy).toHaveBeenCalledTimes(1)

		await settle(() => fake.emit({ kind: 'healthy' }))

		expect(fetchSpy).toHaveBeenCalledTimes(2)
		expect(onlineManager.isOnline()).toBe(true)
	})

	/**
	 * (c1) The console outside the desktop shell. `BrowserSupervisionService` reports `healthy` — a
	 * deliberate answer, not a shrug: a browser tab has no supervised children, so there is nothing
	 * this port could watch die. Pinned here because it is the contract this gate depends on; if that
	 * impl ever starts reporting a death it does not own, the web console goes inert and this fails.
	 */
	it('outside the desktop shell the console runs — a browser tab supervises nothing', async () => {
		render(containerWith(BrowserSupervisionService))
		await settle()

		expect(mounted()).not.toBeNull()
		expect(fetchSpy).toHaveBeenCalledTimes(1)
		expect(onlineManager.isOnline()).toBe(true)
	})

	/**
	 * (c2) THE DEFAULT, and the point of the whole design: supervision that cannot answer tells us
	 * NOTHING, and nothing is not a reason to stop working. Pausing on ignorance would turn "I don't
	 * know" into an app that does not work — strictly worse than the failure this component fixes.
	 */
	it('supervision that cannot answer leaves the console ONLINE', async () => {
		render(containerWith(UnavailableSupervisionService))
		await settle()

		expect(mounted()).not.toBeNull()
		expect(fetchSpy).toHaveBeenCalledTimes(1)
		expect(onlineManager.isOnline()).toBe(true)
	})
})

/** The policy, as a table — cheap enough to state every case the port can produce. */
describe('which deaths make server work pointless', () => {
	it('pauses on a dead daemon — it is the origin of every request, the gateway’s proxied ones included', () => {
		expect(queriesCanRun({ kind: 'down', sidecar: 'daemon' })).toBe(false)
	})

	it('keeps running on a dead gateway — the daemon still answers, and the banner owns that story', () => {
		expect(queriesCanRun({ kind: 'down', sidecar: 'gateway' })).toBe(true)
	})

	it('keeps running on degraded — a 503 is a live process reproving itself, and it usually clears', () => {
		expect(queriesCanRun({ kind: 'degraded', sidecar: 'daemon' })).toBe(true)
		expect(queriesCanRun({ kind: 'degraded', sidecar: 'gateway' })).toBe(true)
	})

	it('keeps running when healthy', () => {
		expect(queriesCanRun({ kind: 'healthy' })).toBe(true)
	})
})
