import { Navigate } from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { CLOUD_DEVICE_TOKEN_SECRET_KEY, useSecrets } from '@/services'
import { useCloudSessionStore } from '@/stores'

/**
 * "Sem login os agentes param; console pede conta" (SP2 spec Decision 5, AC-3). Same shape as
 * `SupervisionGate` — a PULL on mount decides whether the children can render at all — but the
 * verdict here is a client-side navigation to `/login` rather than an inline overlay: login is a
 * real screen with its own URL (`routes/login`), not a transient technical state.
 *
 * Wraps `(app)`'s Outlet, one level inside `SupervisionGate` — the authenticated console's content,
 * never the sidebar/chrome around it (spec: "o console abre normalmente mas pede conta").
 *
 * Deliberately does NOT own the deep-link listener: `useLoopbackAuth` is mounted at the ROOT
 * (`routes/__root.tsx`), because the OS can hand the `codm://` callback back while the operator is
 * ALREADY on `/login` — i.e. exactly when this gate has redirected away and unmounted. A listener
 * scoped to this gate would miss the one event it exists to unblock.
 */
export function CloudSessionGate({ children }: { children: ReactNode }) {
	const secrets = useSecrets()
	const status = useCloudSessionStore(s => s.status)
	const setAuthenticated = useCloudSessionStore(s => s.setAuthenticated)
	const setUnauthenticated = useCloudSessionStore(s => s.setUnauthenticated)

	useEffect(() => {
		let cancelled = false
		secrets
			.get(CLOUD_DEVICE_TOKEN_SECRET_KEY)
			.then(token => {
				if (cancelled) return
				if (token) setAuthenticated()
				else setUnauthenticated()
			})
			.catch(() => {
				if (!cancelled) setUnauthenticated()
			})
		return () => {
			cancelled = true
		}
		// secrets (Container-cached singleton) and the two Zustand actions are referentially stable
		// across renders, so this effectively runs once per mount — status transitions after that come
		// from useLoopbackAuth/logout flipping the store directly, never from re-running this PULL.
	}, [secrets, setAuthenticated, setUnauthenticated])

	if (status === 'checking') return <div className="fixed inset-0 bg-background" data-cloud-session-gate="pending" />
	if (status === 'unauthenticated') return <Navigate to="/login" replace />
	return <>{children}</>
}
