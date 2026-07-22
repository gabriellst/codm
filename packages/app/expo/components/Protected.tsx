import type { ReactNode } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Redirect } from 'expo-router'
import { useSession } from '@/lib/auth'
import { fg } from '@/lib/tokens'

type ProtectedProps = {
	children: ReactNode
	/** Where to send unauthenticated users. Defaults to the login screen. */
	redirectTo?: '/(auth)/login'
	/** Render while the session query is still resolving. Defaults to a centered spinner. */
	fallback?: ReactNode
}

/**
 * Declarative session gate. Wrap any screen that must not render without an
 * authenticated user — `useSession()` is read once, the spinner shows during
 * boot hydration, and unauthenticated users are redirected to login.
 *
 * The root entry redirect in `app/index.tsx` decides the initial destination,
 * but `<Protected>` defends individual screens against mid-session expiry,
 * deep links into private routes, and direct navigations bypassing the index.
 *
 * @example
 *   export default function ProfileScreen() {
 *     return (
 *       <Protected>
 *         <ProfileContent />
 *       </Protected>
 *     )
 *   }
 */
export function Protected({ children, redirectTo = '/(auth)/login', fallback }: ProtectedProps) {
	const { isLoading, isAuthenticated } = useSession()

	if (isLoading) {
		return (
			<>
				{fallback ?? (
					<View className="flex-1 items-center justify-center bg-background">
						<ActivityIndicator color={fg.fg0} />
					</View>
				)}
			</>
		)
	}

	if (!isAuthenticated) return <Redirect href={redirectTo} />

	return <>{children}</>
}
