import { Text, View } from 'react-native'
import { DisplayTitle } from '@/components/ui/DisplayTitle'
import { cn } from '@/lib/utils'

/**
 * Honest empty state — a white card with a hairline border, a heavy uppercase
 * title and a plain-spoken body. No illustration, no fake CTA: when there's
 * nothing, it says so and explains what would fill it.
 */
export function EmptyBlock({ title, body, className }: { title: string; body?: string; className?: string }) {
	return (
		<View className={cn('items-center gap-2 rounded-xl border border-border bg-card px-6 py-12', className)}>
			<DisplayTitle fontSize={26} className="text-center">
				{title}
			</DisplayTitle>
			{body ? <Text className="max-w-[280px] text-center font-sans text-sm text-muted-foreground">{body}</Text> : null}
		</View>
	)
}
