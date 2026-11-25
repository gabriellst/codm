import { createContext, useContext, type ReactNode } from 'react'

/** `/panel/g/<token>` (optionally with a trailing slash) → the token; anything else → undefined. */
export function panelTokenOf(pathname: string): string | undefined {
	const [, panel, g, token, ...rest] = pathname.split('/')
	if (panel !== 'panel' || g !== 'g' || !token) return undefined
	if (rest.some(Boolean)) return undefined
	return decodeURIComponent(token)
}

const PanelTokenContext = createContext<string | null>(null)

/**
 * The group's panel token — the one thing every panel read and action is addressed by. `main.tsx` reads it from
 * the address (`/panel/g/<token>`) once and hands it here; stories and tests give their own.
 */
export function PanelTokenProvider({ token, children }: { token: string; children: ReactNode }) {
	return <PanelTokenContext.Provider value={token}>{children}</PanelTokenContext.Provider>
}

export function usePanelToken(): string {
	const token = useContext(PanelTokenContext)
	if (token === null) throw new Error('usePanelToken: no PanelTokenProvider above this component')
	return token
}
