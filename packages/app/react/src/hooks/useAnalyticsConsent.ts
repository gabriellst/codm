import { useEffect } from 'react'
import { useAnalytics } from '@/services'
import { useTelemetryConsentStore } from '@/stores'

/**
 * Applies the persisted `useTelemetryConsentStore` choice to the bound `AnalyticsService` — the ONE
 * place `optIn`/`optOut` actually gets called. Reacting to the store (rather than the Settings
 * toggle calling the service directly) covers BOTH cases with the same effect: the initial boot
 * (a returning user who previously opted out must stay opted out from the first paint of a fresh
 * session, before any Settings screen renders) AND a live toggle from `/settings` (a different
 * branch of the tree than this root listener).
 *
 * Mounted ONCE at the root (`routes/__root.tsx`), same shape as `useLoopbackAuth`/
 * `useAnalyticsPageview` — consent is process-wide, not scoped to `(app)`.
 */
export function useAnalyticsConsent(): void {
	const analytics = useAnalytics()
	const enabled = useTelemetryConsentStore(s => s.enabled)

	useEffect(() => {
		if (enabled) analytics.optIn()
		else analytics.optOut()
	}, [enabled, analytics])
}
