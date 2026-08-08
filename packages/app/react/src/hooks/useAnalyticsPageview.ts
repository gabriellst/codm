import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useAnalytics } from '@/services'

/**
 * `$pageview` per route (SP4 spec: "pageview por rota... use o evento de navegação dele [TanStack
 * Router], não o pushState cru"). `PostHogAnalyticsService.init` sets `capture_pageview: false` —
 * this hook is the manual replacement, driven by the ROUTER's own `onResolved` event rather than
 * posthog-js's own History-API monkeypatch, so a navigation the SPA drives through
 * `router.navigate`/`Link` is what defines "a new page", not a raw `pushState` call.
 *
 * Mounted ONCE at the root (`routes/__root.tsx`), same shape as `useDeepLinkAuth` — every route in
 * the tree (including `/login`, `/attach`, `/onboarding`) needs its pageview counted, not just
 * `(app)`.
 */
export function useAnalyticsPageview(): void {
	const router = useRouter()
	const analytics = useAnalytics()

	useEffect(() => {
		// TanStack Router's `onResolved` (Transitioner.tsx) only fires on a TRANSITION — it flips
		// `isAnyPending` true→false relative to the PREVIOUS render, so the very first load never
		// emits it. Capture the landing route once here; every SUBSEQUENT route gets its pageview
		// from the subscription below.
		analytics.capturePageview(router.state.location.href)

		return router.subscribe('onResolved', event => {
			// A search-param-only update (e.g. filters, pagination) resolves too but is not a new
			// page — `pathChanged` is the router's own signal for "the path actually changed".
			if (!event.pathChanged) return
			analytics.capturePageview(event.toLocation.href)
		})
	}, [router, analytics])
}
