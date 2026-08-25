import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Toaster, toast } from 'sonner'
import { handleApiError } from './errors'

/**
 * WHAT THE CONSOLE DOES ABOUT A FAILURE — counted in the DOM, against the real `sonner`.
 *
 * REGRESSION (the founder's screenshot): both sidecars down, three identical red cards stacked in
 * the corner. Two separate defects put them there, and each gets its own describe:
 *
 *  1. SURFACE. NETWORK_ERROR / GATEWAY_UNAVAILABLE describe the state of the SYSTEM, not a rejected
 *     operator action — and the console has had a dedicated surface for that state since the
 *     supervision work landed (`SupervisionBanner` for the gateway, the shell's boot splash for the
 *     daemon). A toast on top of it is a second story about one fact, told worse: transient copy for
 *     a condition that lasts until someone restarts a process.
 *
 *  2. VOLUME. Both caches in `router.tsx` call `handleApiError` per failing query, so one dead
 *     backend arrives N times. Whatever still deserves a toast has to collapse per cause.
 *
 * Asserted by MOUNTING the same `<Toaster />` the app mounts and counting `[data-sonner-toast]`
 * nodes, not by intercepting the call: "three raises, one card" is the thing the operator sees, and
 * an id-string assertion would be taking the library's word for the exact behaviour that broke. The
 * spy rides along (calls through, does not replace) purely to name WHICH card was raised.
 *
 * Note the deliberate absence of `mock.module('sonner', …)`: bun's module registry is per-PROCESS
 * and the whole suite shares one, so mocking sonner here would break `Toaster` for every other file.
 */

describe('the console reacts to a dead backend', () => {
	let root: Root | null = null
	let toastError: ReturnType<typeof spyOn<typeof toast, 'error'>>
	let warnings: unknown[][]
	let restoreWarn: typeof console.warn

	beforeEach(() => {
		toastError = spyOn(toast, 'error')
		warnings = []
		restoreWarn = console.warn
		console.warn = (...args: unknown[]) => {
			warnings.push(args)
		}
	})

	// sonner's toast list is MODULE state, not component state — remounting the Toaster does not
	// clear it. Without the dismiss each case would inherit the previous case's cards.
	afterEach(async () => {
		await flush(() => toast.dismiss())
		act(() => root?.unmount())
		root = null
		document.body.innerHTML = ''
		toastError.mockRestore()
		console.warn = restoreWarn
	})

	// sonner publishes to its subscribers on a timer, outside React's batch, so the render that adds
	// a card lands a macrotask after the call — a microtask flush is NOT enough (measured: every
	// count reads 0, which would let the suppression cases pass for entirely the wrong reason).
	async function flush(fire: () => void) {
		await act(async () => {
			fire()
			await new Promise(resolve => setTimeout(resolve, 50))
		})
	}

	function mountToaster() {
		const host = document.createElement('div')
		document.body.appendChild(host)
		root = createRoot(host)
		act(() => {
			root!.render(<Toaster />)
		})
	}

	const cards = () => document.querySelectorAll('[data-sonner-toast]')

	describe('infrastructure failure is not a toast', () => {
		it('shows nothing when the daemon refused the connection — the boot splash owns that', async () => {
			mountToaster()

			await flush(() => handleApiError(new TypeError('Load failed')))

			expect(cards()).toHaveLength(0)
			expect(toastError).not.toHaveBeenCalled()
		})

		it('shows nothing when the gateway is unavailable — the banner owns that', async () => {
			mountToaster()

			await flush(() => handleApiError({ code: 'GATEWAY_UNAVAILABLE', status: 503, message: 'gateway down' }))

			expect(cards()).toHaveLength(0)
			expect(toastError).not.toHaveBeenCalled()
		})

		it('leaves a trace in the console, so a suppressed failure is not an invisible one', async () => {
			mountToaster()

			await flush(() => handleApiError(new TypeError('Load failed')))

			expect(warnings).toHaveLength(1)
			expect(String(warnings[0]?.[0])).toContain('NETWORK_ERROR')
		})

		it('does NOT suppress an error the operator caused', async () => {
			mountToaster()

			await flush(() => handleApiError({ code: 'THREAD_NOT_FOUND', status: 404 }))

			expect(cards()).toHaveLength(1)
			expect(toastError).toHaveBeenCalledTimes(1)
		})
	})

	describe('the toasts that remain collapse by cause', () => {
		it('renders ONE card for the three failures from the screenshot', async () => {
			mountToaster()

			await flush(() => {
				handleApiError(new Error('daemon is not there'))
				handleApiError(new Error('daemon is not there'))
				handleApiError(new Error('daemon is not there'))
			})

			// Raised three times — the count that regressed — and collapsed to one card by id.
			expect(toastError).toHaveBeenCalledTimes(3)
			expect(cards()).toHaveLength(1)
		})

		it('still shows two cards when two DIFFERENT things went wrong', async () => {
			mountToaster()

			await flush(() => {
				handleApiError({ code: 'THREAD_NOT_FOUND', status: 404 })
				handleApiError({ code: 'WORKSPACE_NOT_FOUND', status: 404 })
			})

			expect(cards()).toHaveLength(2)
		})

		it('keys the card on the error code, so the newest failure replaces rather than queues', async () => {
			mountToaster()

			await flush(() => handleApiError({ code: 'THREAD_NOT_FOUND', status: 404 }))

			expect(toastError.mock.calls[0]?.[1]).toMatchObject({ id: 'error:THREAD_NOT_FOUND' })
		})
	})
})
