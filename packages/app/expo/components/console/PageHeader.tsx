import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { DisplayTitle } from '@/components/ui/DisplayTitle'
import { cn } from '@/lib/utils'
import { fg } from '@/lib/tokens'

/**
 * The recurring in-screen masthead: an optional circular back button, a heavy
 * uppercase Anton title, an optional subtitle/stats line, and a right-aligned
 * action slot. Native headers stay hidden — the title lives in content so the
 * "DM YOUR CODEBASE" display voice reads at full weight.
 */
export function PageHeader({
	title,
	subtitle,
	action,
	back = false,
	titleSize = 34,
	className,
}: {
	title: string
	subtitle?: ReactNode
	action?: ReactNode
	back?: boolean
	titleSize?: number
	className?: string
}) {
	return (
		<View className={cn('gap-4', className)}>
			{back && (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Back"
					hitSlop={8}
					onPress={() => router.back()}
					className="h-10 w-10 items-center justify-center rounded-pill bg-secondary"
					style={({ pressed }) => (pressed ? { opacity: 0.8 } : undefined)}
				>
					<ChevronLeft size={20} color={fg.fg0} strokeWidth={2} />
				</Pressable>
			)}
			<View className="flex-row items-start justify-between gap-4">
				<View className="flex-1 gap-2">
					<DisplayTitle fontSize={titleSize}>{title}</DisplayTitle>
					{subtitle ? <View>{subtitle}</View> : null}
				</View>
				{action ? <View className="shrink-0">{action}</View> : null}
			</View>
		</View>
	)
}
