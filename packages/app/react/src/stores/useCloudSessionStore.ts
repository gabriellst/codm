import { create } from 'zustand'

/**
 * Whether THIS install has a logged-in cloud account (SP2 spec Decision 5, AC-3/AC-4). Global
 * because the login gate (`CloudSessionGate`, wraps `(app)`'s Outlet) and the logout control
 * (`/settings/account`) are different branches of the tree and both need to flip the SAME fact
 * without a restart — the whole point of AC-3 ("destrava sem restart").
 *
 * NOT persisted: the keychain (via `SecretsService`) is the actual source of truth, and a stale
 * `localStorage` boolean surviving a logout on another device — or this one — would be a lie the
 * console tells itself. `CloudSessionGate` re-derives `status` from the keychain on every boot.
 */
export type CloudSessionStatus = 'checking' | 'authenticated' | 'unauthenticated'

interface CloudSessionState {
	status: CloudSessionStatus
}

interface CloudSessionActions {
	setAuthenticated: () => void
	setUnauthenticated: () => void
}

type CloudSessionStore = CloudSessionState & CloudSessionActions

export const useCloudSessionStore = create<CloudSessionStore>(set => ({
	status: 'checking',
	setAuthenticated: () => set({ status: 'authenticated' }),
	setUnauthenticated: () => set({ status: 'unauthenticated' }),
}))
