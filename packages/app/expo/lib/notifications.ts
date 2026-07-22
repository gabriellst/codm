import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import { useGetHomeDashboard } from '@codedm/client-typescript/typescript'
import { LIVE_REFETCH_MS } from './live'

/**
 * Native "needs you" surfacing via expo-notifications — LOCAL only, no push
 * service. The app mirrors the count of threads flagged NEEDS_ATTENTION onto
 * the app-icon badge so the operator sees a pending count without opening the
 * app. There is no remote token, no server round-trip: the daemon owns the
 * truth, the app polls it, and the badge reflects it.
 */

let permissionRequested = false

export async function ensureNotificationPermission(): Promise<boolean> {
	try {
		const current = await Notifications.getPermissionsAsync()
		if (current.granted) return true
		if (!current.canAskAgain) return false
		if (permissionRequested) return current.granted
		permissionRequested = true
		const asked = await Notifications.requestPermissionsAsync()
		return asked.granted
	} catch {
		return false
	}
}

export async function setNeedsYouBadge(count: number): Promise<void> {
	try {
		await Notifications.setBadgeCountAsync(Math.max(0, count))
	} catch {
		// Badge is best-effort — a platform without app-icon badges just no-ops.
	}
}

/**
 * Mounted once for the authenticated session (in the tabs layout). Requests
 * notification permission on first mount, then keeps the app-icon badge in
 * sync with how many threads currently need the operator.
 */
export function useNeedsYouBadge(): void {
	const { data } = useGetHomeDashboard({ query: { refetchInterval: LIVE_REFETCH_MS } })

	useEffect(() => {
		void ensureNotificationPermission()
	}, [])

	const needsYouCount = data?.activeSessions.filter(session => session.status === 'NEEDS_ATTENTION').length ?? 0

	useEffect(() => {
		void setNeedsYouBadge(needsYouCount)
	}, [needsYouCount])
}
