import { useEffect } from 'react'
import { getSession } from '@codm/client-typescript/typescript-cloud'
import { Config } from '@/lib/config'
import { CLOUD_DEVICE_TOKEN_SECRET_KEY, useAnalytics, useSecrets } from '@/services'
import { useCloudSessionStore } from '@/stores'

/**
 * PostHog `identify(userId)` wiring (SP4 spec Decision 7 / AC-3: "identify(userId) dispara
 * pós-login"). Reacts to `useCloudSessionStore`'s `status` — the SAME fact `CloudSessionGate` and
 * `useLoopbackAuth` already flip — so it covers BOTH a fresh login (`useLoopbackAuth`'s
 * `setAuthenticated()`) AND a warm boot with an existing device token (`CloudSessionGate`'s pull):
 * either way, once the console confirms "authenticated", every event captured from that point
 * needs to be attributable to a person, not an anonymous distinct_id — that is what makes the
 * landing→console funnel (Story 4) and the AC-3 masking/identity story possible at all.
 * `unauthenticated` (logout, or no token found at boot) resets PostHog back to anonymous.
 *
 * `userId` is not part of the exchange response (`ExchangeDeviceCode200` is `{ token }` only) — the
 * endpoint that resolves the stored session token into an account identity is `GET /session`
 * (SP2's entitlement: "does this install get to run"), so this hook reads the stored token and
 * calls it exactly the way `CloudAccountSection`'s logout calls `revokeDevice`: a PLAIN SDK
 * function against `Config.cloudUrl` with a Bearer header built at call time — not the generated
 * `useGetSession` hook, whose baseURL/headers would be fixed at render time, before the token
 * is known.
 *
 * Mounted ONCE at the root (`routes/__root.tsx`), same shape as `useLoopbackAuth` — the file lives
 * under `routes/(app)/-hooks/` by convention (this flow conceptually belongs to the authenticated
 * console) even though the CALL SITE is the root.
 */
export function useAnalyticsIdentity(): void {
	const analytics = useAnalytics()
	const secrets = useSecrets()
	const status = useCloudSessionStore(s => s.status)

	useEffect(() => {
		if (status === 'unauthenticated') {
			analytics.reset()
			return
		}
		if (status !== 'authenticated') return

		let cancelled = false
		void (async () => {
			const token = await secrets.get(CLOUD_DEVICE_TOKEN_SECRET_KEY)
			if (!token || cancelled) return
			try {
				const { session } = await getSession({ baseURL: Config.cloudUrl, headers: { Authorization: `Bearer ${token}` } })
				const userId = session.userId
				if (cancelled) return
				analytics.identify(userId)
			} catch (error) {
				// Best-effort — a failed identify must never block the console: autocapture keeps
				// running under an anonymous distinct_id, and the next successful boot re-identifies.
				console.warn('[useAnalyticsIdentity] session lookup failed (best-effort, tolerated)', error)
			}
		})()
		return () => {
			cancelled = true
		}
	}, [status, secrets, analytics])
}
