import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Container, ServicesProvider } from '@/services'
import { AnalyticsToken } from '@/services/tokens'
import testBindings, { type FakeAnalyticsService } from '@/services/registry/test'
import { useTelemetryConsentStore } from '@/stores'
import { useAnalyticsConsent } from './useAnalyticsConsent'

/**
 * AC-5 — "toggle de consentimento OFF zera exportação". This is the wiring proof the SP4 task asked
 * for: `TelemetrySection` only ever calls `useTelemetryConsentStore`'s `setEnabled` (see its own
 * file) — THIS hook is what turns that store write into a real `optIn`/`optOut` call on the bound
 * `AnalyticsService`, and the FAKE (not a spy on the hook's own internals) is what proves it actually
 * happened, the same posture `useLoopbackAuth.test.tsx` documents.
 */
describe('useAnalyticsConsent', () => {
	let root: Root | null = null
	let host: HTMLElement | null = null
	let container: Container
	let analytics: FakeAnalyticsService

	beforeEach(() => {
		useTelemetryConsentStore.setState({ enabled: true })
		container = new Container()
		container.load(testBindings)
		analytics = container.resolve(AnalyticsToken) as FakeAnalyticsService
	})

	afterEach(async () => {
		await act(async () => {
			root?.unmount()
			await new Promise(resolve => setTimeout(resolve, 10))
		})
		root = null
		host = null
	})

	function Probe() {
		useAnalyticsConsent()
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

	it('applies the default (opted IN) to the service on mount', async () => {
		await mount()
		expect(analytics.optedOut).toBe(false)
	})

	it('AC-5: turning the store OFF calls optOut on the bound service', async () => {
		await mount()
		act(() => useTelemetryConsentStore.getState().setEnabled(false))
		expect(analytics.optedOut).toBe(true)
	})

	it('a previously-opted-out choice is restored on mount, before any Settings screen renders', async () => {
		useTelemetryConsentStore.setState({ enabled: false })
		await mount()
		expect(analytics.optedOut).toBe(true)
	})

	it('turning it back ON calls optIn', async () => {
		useTelemetryConsentStore.setState({ enabled: false })
		await mount()
		expect(analytics.optedOut).toBe(true)

		act(() => useTelemetryConsentStore.getState().setEnabled(true))
		expect(analytics.optedOut).toBe(false)
	})
})
