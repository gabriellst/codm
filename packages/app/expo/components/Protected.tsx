import type { ReactNode } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useSession } from '@/lib/auth'
import { fg } from '@/lib/tokens'

type ProtectedProps = {
	children: ReactNode
	/** Render while the session query is still resolving. Defaults to a centered spinner. */
	fallback?: ReactNode
}

/**
 * Declarative session gate. After the operator collapse there is a single constant operator and no
 * login screen (founder decision 2), so this always resolves to an authenticated session — it stays
 * as the seam where a real auth gate would slot back in.
 */
export function Protected({ children, fallback }: ProtectedProps) {
	const { isLoading } = useSession()

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

	return <>{children}</>
}
