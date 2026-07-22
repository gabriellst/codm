import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { auth } from './client'

/**
 * Lightweight authenticated user type used across the boilerplate. The SDK
 * doesn't yet ship a typed `GetSession` contract — when it does, point this
 * at the SDK's response schema (e.g. `getSessionQueryResponseSchema`).
 */
export type AuthUser = {
	id: string
	name?: string | null
	email?: string | null
	image?: string | null
}

export type AuthSession = {
	user: AuthUser
}

/**
 * Display initial derived from the user's name. Safe for nullable inputs.
 */
export function avatarInitialFor(user: { name?: string | null } | null | undefined): string {
	const name = user?.name ?? ''
	return (name[0] ?? 'M').toUpperCase()
}

/**
 * React hook returning the current session. After the operator collapse this is the constant
 * operator (founder decision 2) — always authenticated, never pending.
 */
export function useSession() {
	const query = auth.useSession()
	const user = (query.data?.user ?? null) as AuthUser | null
	return {
		data: query.data ?? null,
		user,
		isLoading: query.isPending,
		isFetched: !query.isPending,
		isAuthenticated: !!user,
		error: query.error,
		refetch: query.refetch,
	}
}

/** Convenience: just the authenticated user, or `null` while pending / signed out. */
export function useCurrentUser(): AuthUser | null {
	return useSession().user
}

/**
 * Sign-out handler. There are no accounts to sign out of (single operator), so this just drops
 * cached queries and returns to the home tab — kept so the profile CTA still compiles.
 */
export function useSignOut() {
	const queryClient = useQueryClient()
	return async () => {
		await auth.signOut()
		queryClient.clear()
		router.replace('/(tabs)/home')
	}
}
