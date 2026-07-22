import type { ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cn } from '@/lib/utils'

/**
 * A scrollable operator surface on the light canvas. Native headers stay hidden
 * (the display title lives in content), so this pads the top for the notch and
 * the bottom for the native tab bar. Tab screens compose their sections inside.
 */
export function ScrollScreen({
	children,
	className,
	gap = 24,
}: {
	children: ReactNode
	className?: string
	gap?: number
}) {
	const insets = useSafeAreaInsets()
	return (
		<View className={cn('flex-1 bg-route-background', className)}>
			<ScrollView
				showsVerticalScrollIndicator={false}
				contentContainerStyle={{
					paddingTop: insets.top + 16,
					paddingBottom: insets.bottom + 96,
					paddingHorizontal: 20,
					gap,
				}}
			>
				{children}
			</ScrollView>
		</View>
	)
}
