import { ActivityIndicator, View } from 'react-native'
import { cn } from '@/lib/utils'
import { fg } from '@/lib/tokens'

interface ScreenSkeletonProps {
	className?: string
}

/**
 * Lightweight loading state used while a screen-level SDK query is in flight.
 * Kept intentionally simple — feature components also render their own
 * inline skeleton blocks where they own data.
 */
export function ScreenSkeleton({ className }: ScreenSkeletonProps) {
	return (
		<View className={cn('flex-1 bg-background items-center justify-center', className)}>
			<ActivityIndicator size="large" color={fg.fg0} />
		</View>
	)
}
